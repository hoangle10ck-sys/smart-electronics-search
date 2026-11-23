import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, statSync, statfsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import Database from 'better-sqlite3';
import { EJSON, ObjectId } from 'bson';
import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { Offer } from '../models/Offer';
import { TechApiCatalogRecord as TechApiCatalogModel } from '../models/TechApiCatalogRecord';
import { TechApiImportCheckpoint as TechApiCheckpointModel } from '../models/TechApiImportCheckpoint';
import { MongoTechApiRepository } from '../repositories/mongoTechApiRepository';
import { SqliteTechApiRepository, serializeTechApiEjson } from '../repositories/sqliteTechApiRepository';
import {
  TechApiCatalogRecord,
  TechApiCatalogReference,
  TechApiDiscoveryQuery,
  TechApiDiscoveryRecord,
  TechApiFullDatasetUpsert,
  TechApiImportCheckpoint,
  TechApiIndexUpsert,
} from '../repositories/techApiRepository';
import { assertSqliteNotNullKeys, assertSqliteUniqueKeys } from './techApiSqliteArchiveVerification';
import { canSkipTechApiFile } from '../services/techApiImportResume';
import { BRANDS } from '../services/dictionary';
import { normalize } from '../utils/text';

const DATA_DIR = 'D:\\SmartElectronicsData';
const ARCHIVE_PATH = join(DATA_DIR, 'techapi_catalog.sqlite');
const MANIFEST_PATH = join(DATA_DIR, 'techapi_catalog.manifest.json');
const STAGING_PATH = join(DATA_DIR, 'techapi_catalog.staging.sqlite');
const TEST_COPY_PATH = join(DATA_DIR, 'techapi_catalog.phase4-test.sqlite');
const RESTORE_COPY_PATH = join(DATA_DIR, 'techapi_catalog.phase4-restore-test.sqlite');
const RUNTIME_DIR = join(DATA_DIR, 'techapi_phase4_runtime');
const RUNTIME_COPY_PATH = join(RUNTIME_DIR, 'techapi_catalog.sqlite');
const LOCAL_MONGO_URI = 'mongodb://127.0.0.1:27017/?directConnection=true';
const SOURCE_DATABASE = 'smart_electronics_restore_test';
const PHASE4_DATABASE = 'smart_electronics_phase4_test';
const PHASE4_URI = `mongodb://127.0.0.1:27017/${PHASE4_DATABASE}?directConnection=true`;
const EXPECTED_COUNTS = { catalog: 131_064, checkpoints: 104_666 };
const EXPECTED_ARCHIVE_SHA256 = '0710c2e9a993dd740c8917a8735d0c2690bf6b33e56c248e5eabec5040c45314';
const RESUME_OWNED_COPIES = process.env.PHASE4_RESUME_OWNED_COPIES === 'true';
const RESUME_AFTER_CPP_INSERT = process.env.PHASE4_RESUME_AFTER_CPP_INSERT === 'true';
const RESUME_AFTER_CPP_INDEX_UPDATE = process.env.PHASE4_RESUME_AFTER_CPP_INDEX_UPDATE === 'true';
const RESUME_AFTER_WRITE_BEHAVIOR = process.env.PHASE4_RESUME_AFTER_WRITE_BEHAVIOR === 'true';
const CPP_FIXTURE_SOURCE_KEY = 'phase4:test:cpp-development-tool';
const CPP_FIXTURE_UPDATED_AT = new Date('2026-11-14T00:01:00.000Z');

type QueryPlan = {
  name: string;
  categories: string[];
  queryTerms: string[];
  brandTerms: string[];
  rankingKeywords?: string[];
  rankingBrands?: string[];
  rankingCategory?: string;
};

const QUERY_PLANS: QueryPlan[] = [
  { name: 'category_only_cpu', categories: ['cpu'], queryTerms: [], brandTerms: [] },
  { name: 'keyword_ryzen', categories: ['cpu'], queryTerms: ['Ryzen'], brandTerms: [], rankingKeywords: ['ryzen'], rankingCategory: 'cpu' },
  { name: 'manufacturer_amd', categories: ['cpu', 'gpu'], queryTerms: [], brandTerms: ['AMD'], rankingBrands: ['amd'] },
  { name: 'brand_plus_category_amd_cpu', categories: ['cpu'], queryTerms: [], brandTerms: ['AMD'], rankingBrands: ['amd'], rankingCategory: 'cpu' },
  { name: 'unicode_case_fuer', categories: ['brand'], queryTerms: ['FÜR'], brandTerms: [], rankingKeywords: ['für'] },
  { name: 'case_insensitive_nvidia', categories: ['gpu'], queryTerms: ['NVIDIA'], brandTerms: [], rankingKeywords: ['nvidia'], rankingCategory: 'gpu' },
  { name: 'no_result', categories: ['laptop'], queryTerms: ['phase4-guaranteed-no-match'], brandTerms: [], rankingKeywords: ['phase4-guaranteed-no-match'], rankingCategory: 'laptop' },
  { name: 'over_500_smartphones', categories: ['smartphone'], queryTerms: [], brandTerms: [] },
];

const report: Record<string, any> = {
  phase: '4',
  mode: 'local runtime validation, query parity, isolated writes, and backup/restore',
  atlasConnected: false,
  productionCutover: false,
  restoreDatabaseWritten: false,
  archiveWritten: false,
  stagingWritten: false,
  stages: {},
};

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function payloadDigest(database: Database.Database, table: 'techapi_catalog_records' | 'techapi_import_checkpoints', keyColumn: 'source_key' | 'file_key', excludedKey?: string) {
  const hash = createHash('sha256');
  const rows = database.prepare(`SELECT ${keyColumn} AS stable_key, document_ejson FROM ${table} ${excludedKey ? `WHERE ${keyColumn} <> ?` : ''} ORDER BY ${keyColumn} COLLATE BINARY`).iterate(...(excludedKey ? [excludedKey] : [])) as IterableIterator<{
    stable_key: string;
    document_ejson: string;
  }>;
  let documents = 0;
  for (const row of rows) {
    const canonical = serializeTechApiEjson(EJSON.parse(row.document_ejson, { relaxed: false }));
    const documentChecksum = createHash('sha256').update(canonical, 'utf8').digest('hex');
    hash.update(`${JSON.stringify(row.stable_key)}:${documentChecksum}\n`, 'utf8');
    documents += 1;
  }
  return { checksum: hash.digest('hex'), documents };
}

type SqliteVerificationExpectation = {
  catalog: number;
  checkpoints: number;
  checksums?: { catalog: string; checkpoints: string };
  excludeCatalogSourceKey?: string;
  excludeCheckpointFileKey?: string;
};

function verifySqlite(
  path: string,
  expected?: SqliteVerificationExpectation,
  options: { integrity: 'full' | 'quick'; payloadChecksums: boolean } = { integrity: 'full', payloadChecksums: true },
) {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  database.pragma('query_only = ON');
  try {
    const integrityPragma = options.integrity === 'full' ? 'integrity_check' : 'quick_check';
    const integrity = database.pragma(integrityPragma) as Array<Record<string, string>>;
    assert.deepEqual(integrity.map((row) => row[integrityPragma]), ['ok'], `${path}: ${integrityPragma}`);
    const version = (database.prepare('SELECT MAX(version) AS version FROM archive_schema_version').get() as { version: number }).version;
    assert.equal(version, 1, `${path}: schema version`);
    const catalog = (database.prepare('SELECT COUNT(*) AS count FROM techapi_catalog_records').get() as { count: number }).count;
    const checkpoints = (database.prepare('SELECT COUNT(*) AS count FROM techapi_import_checkpoints').get() as { count: number }).count;
    const catalogUnique = assertSqliteUniqueKeys(database, 'techapi_catalog_records');
    const checkpointUnique = assertSqliteUniqueKeys(database, 'techapi_import_checkpoints');
    const catalogNotNull = assertSqliteNotNullKeys(database, 'techapi_catalog_records');
    const checkpointNotNull = assertSqliteNotNullKeys(database, 'techapi_import_checkpoints');
    const catalogDigest = options.payloadChecksums
      ? payloadDigest(database, 'techapi_catalog_records', 'source_key', expected?.excludeCatalogSourceKey)
      : undefined;
    const checkpointDigest = options.payloadChecksums
      ? payloadDigest(database, 'techapi_import_checkpoints', 'file_key', expected?.excludeCheckpointFileKey)
      : undefined;
    if (expected) {
      assert.equal(catalog, expected.catalog, `${path}: catalog count`);
      assert.equal(checkpoints, expected.checkpoints, `${path}: checkpoint count`);
      if (expected.excludeCatalogSourceKey) {
        assert.equal(catalogDigest?.documents, expected.catalog - 1, `${path}: catalog payload count excluding the known Phase 4 fixture`);
      }
      if (expected.excludeCheckpointFileKey) {
        assert.equal(checkpointDigest?.documents, expected.checkpoints - 1, `${path}: checkpoint payload count excluding the known Phase 4 checkpoint`);
      }
      if (expected.checksums) {
        assert.ok(catalogDigest && checkpointDigest, `${path}: expected payload checksums but checksum calculation is disabled`);
        assert.equal(catalogDigest.checksum, expected.checksums.catalog, `${path}: catalog payload checksum`);
        assert.equal(checkpointDigest.checksum, expected.checksums.checkpoints, `${path}: checkpoint payload checksum`);
      }
    }
    return {
      counts: { catalog, checkpoints, total: catalog + checkpoints },
      schemaVersion: version,
      integrityCheck: 'ok',
      integrityCheckMode: integrityPragma,
      uniqueKeys: { catalog: catalogUnique.checks, checkpoints: checkpointUnique.checks },
      notNullKeys: { catalog: catalogNotNull.checks, checkpoints: checkpointNotNull.checks },
      payloadChecksums: catalogDigest && checkpointDigest
        ? { catalog: catalogDigest.checksum, checkpoints: checkpointDigest.checksum }
        : null,
      categories: database.prepare('SELECT source_category AS category, COUNT(*) AS count FROM techapi_catalog_records GROUP BY source_category ORDER BY source_category').all(),
      workflows: database.prepare('SELECT workflow_status AS status, COUNT(*) AS count FROM techapi_catalog_records GROUP BY workflow_status ORDER BY workflow_status').all(),
    };
  } finally {
    database.close();
  }
}

function sqliteCounts(path: string): { catalog: number; checkpoints: number } {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  database.pragma('query_only = ON');
  try {
    return {
      catalog: (database.prepare('SELECT COUNT(*) AS count FROM techapi_catalog_records').get() as { count: number }).count,
      checkpoints: (database.prepare('SELECT COUNT(*) AS count FROM techapi_import_checkpoints').get() as { count: number }).count,
    };
  } finally {
    database.close();
  }
}

function logPhase4Progress(stage: string): void {
  process.stdout.write(`[PHASE4] ${stage}\n`);
}

function assertCppFixtureInSqlite(path: string, expectedName: string, expectedSearchText = 'C++ compiler development tool'): void {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const matches = database.prepare(`
      SELECT source_key AS sourceKey, source_category AS sourceCategory, source_slug AS sourceSlug, name, search_text AS searchText
      FROM techapi_catalog_records WHERE source_key = ?
    `).all(CPP_FIXTURE_SOURCE_KEY);
    assert.deepEqual(matches, [{
      sourceKey: CPP_FIXTURE_SOURCE_KEY,
      sourceCategory: 'cpu',
      sourceSlug: 'phase4-cpp-development-tool',
      name: expectedName,
      searchText: expectedSearchText,
    }], `${path}: exact isolated C++ fixture`);
  } finally {
    database.close();
  }
}

async function createBackup(sourcePath: string, destinationPath: string): Promise<void> {
  assert.equal(existsSync(destinationPath), false, `refusing to overwrite ${destinationPath}`);
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(destinationPath);
  } finally {
    source.close();
  }
}

function ids(rows: TechApiDiscoveryRecord[]): string[] {
  return rows.map((row) => row.sourceKey);
}

async function testSpecialCharacterQueryParity(
  mongo: MongoTechApiRepository,
  sqlite: SqliteTechApiRepository,
  fixtureSourceKey: string,
): Promise<any[]> {
  const results: any[] = [];
  for (const term of ['C', 'C+', 'C++', 'C#', '++', '.', '*']) {
    const query: TechApiDiscoveryQuery = { categories: ['cpu'], queryTerms: [term], brandTerms: [], limit: 10_000, candidateOrdering: 'stable_v1' };
    const [mongoRows, sqliteRows] = await Promise.all([
      mongo.findDiscoveryCandidates(query),
      sqlite.findDiscoveryCandidates(query),
    ]);
    const mongoFixtureIds = ids(mongoRows).filter((sourceKey) => sourceKey === fixtureSourceKey);
    const sqliteFixtureIds = ids(sqliteRows).filter((sourceKey) => sourceKey === fixtureSourceKey);
    assert.deepEqual(mongoFixtureIds, sqliteFixtureIds, `special-character query ${term}: fixture candidate ID parity`);
    const fixtureFound = mongoFixtureIds.length === 1;
    assert.equal(fixtureFound, sqliteFixtureIds.length === 1, `special-character query ${term}: fixture membership parity`);
    if (['C', 'C+', 'C++', '++'].includes(term)) assert.equal(fixtureFound, true, `literal ${term} should find C++ fixture`);
    else assert.equal(fixtureFound, false, `literal ${term} must not act as a regex wildcard`);
    results.push({ term, fixtureFound, fixtureCandidateIdParity: true, mongoCandidateCount: mongoRows.length, sqliteCandidateCount: sqliteRows.length, fullCandidateSetsCompared: false });
  }
  return results;
}

function setDifference(left: string[], right: string[]) {
  const rightSet = new Set(right);
  const leftSet = new Set(left);
  return {
    onlyLeft: left.filter((key) => !rightSet.has(key)).length,
    onlyRight: right.filter((key) => !leftSet.has(key)).length,
    examples: [
      ...left.filter((key) => !rightSet.has(key)).slice(0, 5).map((key) => `mongo:${key}`),
      ...right.filter((key) => !leftSet.has(key)).slice(0, 5).map((key) => `sqlite:${key}`),
    ],
  };
}

function rankedTop8(plan: QueryPlan, candidates: TechApiDiscoveryRecord[]): string[] {
  const keywords = (plan.rankingKeywords ?? []).map(normalize);
  const brands = plan.rankingBrands ?? [];
  if (!keywords.length && !brands.length) return [];
  const ranked = candidates.map((item) => {
    const name = normalize(item.name);
    const searchable = normalize([item.name, item.searchText].filter(Boolean).join(' '));
    const keywordHits = keywords.filter((term) => searchable.includes(term));
    const rawManufacturer = typeof item.raw?.manufacturer === 'string'
      ? item.raw.manufacturer
      : item.raw?.manufacturer?.name ?? item.raw?.brand?.name ?? item.raw?.brand;
    const manufacturer = normalize(String(rawManufacturer ?? ''));
    const brandHits = brands.filter((brand) => [brand, ...(BRANDS[brand] ?? [])].map(normalize)
      .some((term) => term && (` ${name} `.includes(` ${term} `) || ` ${manufacturer} `.includes(` ${term} `))));
    if ((keywords.length && keywordHits.length !== keywords.length) || (brands.length && !brandHits.length)) return null;
    const score = keywordHits.length * 5 + brandHits.length * 4 + (plan.rankingCategory ? 3 : 0) + (item.raw?.verified === true ? 0.25 : 0);
    return { item, score };
  }).filter((row): row is { item: TechApiDiscoveryRecord; score: number } => row !== null)
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name) || left.item.sourceKey.localeCompare(right.item.sourceKey));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of ranked) {
    const identity = normalize(row.item.name);
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(row.item.sourceKey);
    if (result.length === 8) break;
  }
  return result;
}

function indexFixture(overrides: Partial<TechApiIndexUpsert> = {}): TechApiIndexUpsert {
  const created = new Date('2026-11-14T00:00:00.000Z');
  return {
    sourceKey: 'phase4:test:cpp-development-tool',
    sourceCategory: 'cpu',
    sourceSlug: 'phase4-cpp-development-tool',
    name: 'C++ Development Tool',
    sourceRecordUrl: 'https://phase4.example.test/cpu/cpp-development-tool',
    sourceListUrl: 'https://phase4.example.test/cpu',
    dataAttribution: 'Phase 4 isolated test fixture',
    dataSourceUrl: 'https://phase4.example.test',
    dataLicense: 'CC BY-SA 4.0',
    dataLicenseUrl: 'https://phase4.example.test/license',
    licenseTermsUrl: 'https://phase4.example.test/terms',
    workflowStatus: 'discovery_only',
    lastSeenAt: created,
    raw: { manufacturer: { name: 'Phase4 Test Lab' }, verified: false, capturedAt: created, evidenceId: new ObjectId() },
    searchText: 'C++ compiler development tool',
    ...overrides,
  };
}

function fullFixture(overrides: Partial<TechApiFullDatasetUpsert> = {}): TechApiFullDatasetUpsert {
  const index = indexFixture();
  const now = new Date('2026-11-14T00:00:00.000Z');
  return {
    ...index,
    _id: new ObjectId(),
    detailsFetchedAt: null,
    detailsSha256: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function checkpointFixture(overrides: Partial<TechApiImportCheckpoint> = {}): TechApiImportCheckpoint {
  const now = new Date('2026-11-14T00:00:00.000Z');
  return {
    _id: new ObjectId(),
    fileKey: 'phase4/fixture/cpp-development-tool.json',
    sourcePath: 'phase4/fixture/cpp-development-tool.json',
    sourceCommit: 'phase4-test-only',
    sha256: 'a'.repeat(64),
    recordCount: 1,
    importedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function run() {
  let stage = 'preflight';
  let rootConnection: mongoose.Connection | undefined;
  let sqliteReadRepository: SqliteTechApiRepository | undefined;
  let sqliteWriteRepository: SqliteTechApiRepository | undefined;
  let phase4Database: mongoose.Connection | undefined;
  let phase4DatabaseCreated = false;
  let phase4DatabaseExistedBeforeRun = false;
  let preflightCopyVerification: {
    testCopy: ReturnType<typeof verifySqlite>;
    runtimeCopy: ReturnType<typeof verifySqlite>;
    restoreCopy?: ReturnType<typeof verifySqlite>;
  } | undefined;
  let runtimeServer: { server: any; close: () => Promise<void> } | undefined;
  let dotenvDirectory: string | undefined;
  let phase4Succeeded = false;

  try {
    assert.equal(process.platform, 'win32', 'Phase 4 paths are pinned to the requested Windows D: volume.');
    assert.equal(RESUME_AFTER_CPP_INSERT && !RESUME_OWNED_COPIES, false, 'resume-after-fixture requires verified pre-existing Phase 4 copies');
    assert.equal(RESUME_AFTER_CPP_INDEX_UPDATE && !RESUME_AFTER_CPP_INSERT, false, 'resume-after-index-update requires resume-after-fixture');
    assert.equal(RESUME_AFTER_WRITE_BEHAVIOR && !RESUME_AFTER_CPP_INDEX_UPDATE, false, 'resume-after-write requires the verified C++ index-update state');
    logPhase4Progress('preflight');
    for (const path of [ARCHIVE_PATH, MANIFEST_PATH, STAGING_PATH]) assert.equal(existsSync(path), true, `required file missing: ${path}`);
    if (RESUME_OWNED_COPIES) {
      assert.equal(existsSync(TEST_COPY_PATH), true, 'resume mode requires the already-created Phase 4 test copy');
      assert.equal(existsSync(RUNTIME_COPY_PATH), true, 'resume mode requires the already-created Phase 4 runtime copy');
      assert.equal(existsSync(RESTORE_COPY_PATH), RESUME_AFTER_WRITE_BEHAVIOR, RESUME_AFTER_WRITE_BEHAVIOR
        ? 'resume-after-write requires the previously created Phase 4 restore copy'
        : `restore destination already exists; refusing overwrite: ${RESTORE_COPY_PATH}`);
    } else {
      for (const path of [TEST_COPY_PATH, RESTORE_COPY_PATH, RUNTIME_DIR]) assert.equal(existsSync(path), false, `Phase 4 destination already exists; refusing overwrite: ${path}`);
    }

    const manifest = JSON.parse(await (await import('node:fs/promises')).readFile(MANIFEST_PATH, 'utf8'));
    assert.equal(manifest.overallStatus, 'PASS_WITH_LIMITATIONS');
    assert.equal(manifest.cutoverEligible, false);
    assert.equal(manifest.archiveFileSha256, EXPECTED_ARCHIVE_SHA256);
    assert.equal(await sha256File(ARCHIVE_PATH), manifest.archiveFileSha256, 'official archive file hash');
    if (RESUME_OWNED_COPIES) {
      preflightCopyVerification = {
        testCopy: verifySqlite(TEST_COPY_PATH, {
          catalog: EXPECTED_COUNTS.catalog + (RESUME_AFTER_CPP_INSERT ? 1 : 0),
          checkpoints: EXPECTED_COUNTS.checkpoints + (RESUME_AFTER_WRITE_BEHAVIOR ? 1 : 0),
          checksums: manifest.archivePayloadChecksums,
          ...(RESUME_AFTER_CPP_INSERT ? { excludeCatalogSourceKey: CPP_FIXTURE_SOURCE_KEY } : {}),
          ...(RESUME_AFTER_WRITE_BEHAVIOR ? { excludeCheckpointFileKey: 'phase4/fixture/cpp-development-tool.json' } : {}),
        }, { integrity: 'quick', payloadChecksums: true }),
        runtimeCopy: verifySqlite(RUNTIME_COPY_PATH, {
          catalog: EXPECTED_COUNTS.catalog,
          checkpoints: EXPECTED_COUNTS.checkpoints,
          checksums: manifest.archivePayloadChecksums,
        }, { integrity: 'quick', payloadChecksums: true }),
      };
      if (RESUME_AFTER_CPP_INSERT) assertCppFixtureInSqlite(
        TEST_COPY_PATH,
        RESUME_AFTER_CPP_INDEX_UPDATE ? 'C++ Development Tool Updated' : 'C++ Development Tool',
        RESUME_AFTER_WRITE_BEHAVIOR ? 'C++ compiler development tool full dataset' : 'C++ compiler development tool',
      );
      if (RESUME_AFTER_WRITE_BEHAVIOR) {
        preflightCopyVerification = {
          ...preflightCopyVerification,
          restoreCopy: verifySqlite(RESTORE_COPY_PATH, {
            catalog: EXPECTED_COUNTS.catalog + 1,
            checkpoints: EXPECTED_COUNTS.checkpoints + 1,
          }, { integrity: 'quick', payloadChecksums: false }),
        };
      }
    }
    const archiveStat = statSync(ARCHIVE_PATH);
    const stagingStat = statSync(STAGING_PATH);
    const manifestHashBefore = await sha256File(MANIFEST_PATH);
    const archiveHashBefore = manifest.archiveFileSha256;
    const stagingHashBefore = await sha256File(STAGING_PATH);
    const freeBytes = Number(statfsSync(DATA_DIR).bavail) * Number(statfsSync(DATA_DIR).bsize);
    const reserveBytes = archiveStat.size;
    const requiredBytes = archiveStat.size * 4;
    assert.ok(freeBytes >= requiredBytes, 'insufficient free space for test copy, runtime copy, restore copy, and safety reserve');
    report.stages.preflight = {
      officialArchiveBytes: archiveStat.size,
      officialArchiveSha256: archiveHashBefore,
      stagingBytes: stagingStat.size,
      stagingSha256Before: stagingHashBefore,
      manifestSha256Before: manifestHashBefore,
      testCopyPhysicalSha256: null,
      runtimeCopyPhysicalSha256: null,
      testCopyExists: existsSync(TEST_COPY_PATH),
      restoreCopyExists: existsSync(RESTORE_COPY_PATH),
      runtimeDirectoryAbsent: !existsSync(RUNTIME_DIR),
      usingPreviouslyCreatedVerifiedCopies: RESUME_OWNED_COPIES,
      resumingAfterCppFixtureInsert: RESUME_AFTER_CPP_INSERT,
      resumingAfterCppIndexUpdate: RESUME_AFTER_CPP_INDEX_UPDATE,
      resumingAfterCompletedWriteBehavior: RESUME_AFTER_WRITE_BEHAVIOR,
      freeBytes,
      requiredBytes,
      reserveBytes,
    };

    stage = 'verify_official_archive_read_only';
    logPhase4Progress(stage);
    const officialVerification = verifySqlite(ARCHIVE_PATH, {
      catalog: EXPECTED_COUNTS.catalog,
      checkpoints: EXPECTED_COUNTS.checkpoints,
      checksums: manifest.archivePayloadChecksums,
    });
    report.stages.officialArchive = officialVerification;

    stage = 'connect_local_mongo_read_only';
    logPhase4Progress(stage);
    rootConnection = mongoose.createConnection(LOCAL_MONGO_URI, { serverSelectionTimeoutMS: 4000 });
    await rootConnection.asPromise();
    const allDatabases = await rootConnection.db!.admin().listDatabases({ nameOnly: true });
    const databaseNames = allDatabases.databases.map((item) => item.name);
    phase4DatabaseExistedBeforeRun = databaseNames.includes(PHASE4_DATABASE);
    if (RESUME_AFTER_CPP_INSERT) {
      assert.equal(phase4DatabaseExistedBeforeRun, true, 'resume mode requires the known Phase 4 Mongo test DB');
      phase4Database = rootConnection.useDb(PHASE4_DATABASE, { useCache: true });
      const existingCollections = (await phase4Database.db!.listCollections({}, { nameOnly: true }).toArray()).map((row) => row.name).sort();
      const expectedCollections = RESUME_AFTER_WRITE_BEHAVIOR
        ? [
          'advisorconversations', 'advisorfeedback', 'datasources', 'offers', 'pendingproducts',
          'products', 'productsearchvectors', 'searchfeedback', 'syncruns',
          'techapicatalogrecords', 'techapiimportcheckpoints',
        ]
        : ['techapicatalogrecords', 'techapiimportcheckpoints'];
      assert.deepEqual(existingCollections, expectedCollections, 'resume database may contain only collections initialized by the interrupted Phase 4 backend runtime');
      const expectedCatalogCount = RESUME_AFTER_WRITE_BEHAVIOR ? 2 : 1;
      const expectedCheckpointCount = RESUME_AFTER_WRITE_BEHAVIOR ? 2 : 0;
      assert.equal(await phase4Database.db!.collection('techapicatalogrecords').countDocuments({}), expectedCatalogCount);
      assert.equal(await phase4Database.db!.collection('techapiimportcheckpoints').countDocuments({}), expectedCheckpointCount);
      const existingFixture = await phase4Database.db!.collection('techapicatalogrecords').find(
        { sourceKey: CPP_FIXTURE_SOURCE_KEY },
        { projection: { _id: 0, sourceKey: 1, sourceCategory: 1, sourceSlug: 1, name: 1, searchText: 1 } },
      ).toArray();
      assert.deepEqual(existingFixture, [{
        sourceKey: CPP_FIXTURE_SOURCE_KEY,
        sourceCategory: 'cpu',
        sourceSlug: 'phase4-cpp-development-tool',
        name: RESUME_AFTER_CPP_INDEX_UPDATE ? 'C++ Development Tool Updated' : 'C++ Development Tool',
        searchText: RESUME_AFTER_WRITE_BEHAVIOR ? 'C++ compiler development tool full dataset' : 'C++ compiler development tool',
      }], 'existing Mongo DB must contain only the exact known Phase 4 C++ fixture');
      if (RESUME_AFTER_WRITE_BEHAVIOR) {
        const phase4Records = await phase4Database.db!.collection('techapicatalogrecords').find(
          { sourceKey: /^phase4:/ },
          { projection: { _id: 0, sourceKey: 1, sourceCategory: 1, sourceSlug: 1, name: 1, searchText: 1 } },
        ).sort({ sourceKey: 1 }).toArray();
        assert.deepEqual(phase4Records.map((record) => record.sourceKey), [CPP_FIXTURE_SOURCE_KEY, 'phase4:test:mongo-retry-record']);
        const phase4Checkpoints = await phase4Database.db!.collection('techapiimportcheckpoints').find(
          { fileKey: /^phase4\// },
          { projection: { _id: 0, fileKey: 1, sha256: 1, recordCount: 1 } },
        ).sort({ fileKey: 1 }).toArray();
        assert.deepEqual(phase4Checkpoints, [
          { fileKey: 'phase4/fixture/cpp-development-tool.json', sha256: 'd'.repeat(64), recordCount: 1 },
          { fileKey: 'phase4/fixture/mongo-retry.json', sha256: 'a'.repeat(64), recordCount: 1 },
        ]);
        const runtimeProducts = await phase4Database.db!.collection('products').find(
          { dedupeKey: 'phase4-test:runtime-product' },
          { projection: { _id: 1, dedupeKey: 1, name: 1, category: 1 } },
        ).toArray();
        assert.equal(runtimeProducts.length, 1, 'resume DB must contain the exact isolated backend runtime product fixture');
        assert.equal(runtimeProducts[0].name, 'AMD Phase 4 Runtime Fixture CPU');
        assert.equal(runtimeProducts[0].category, 'cpu');
        assert.equal(await phase4Database.db!.collection('products').countDocuments({}), 1, 'resume DB must not contain unrelated Product documents');
        const runtimeOffers = await phase4Database.db!.collection('offers').find(
          { source: 'phase4_test', sellerName: 'Phase 4 isolated test seller' },
          { projection: { _id: 1, productId: 1, price: 1, currency: 1 } },
        ).toArray();
        assert.equal(runtimeOffers.length, 1, 'resume DB must contain the exact isolated backend runtime Offer fixture');
        assert.equal(runtimeOffers[0].productId.toString(), runtimeProducts[0]._id.toString(), 'runtime Offer must reference the fixture Product');
        assert.equal(await phase4Database.db!.collection('offers').countDocuments({}), 1, 'resume DB must not contain unrelated Offer documents');
        for (const collectionName of ['advisorconversations', 'advisorfeedback', 'datasources', 'pendingproducts', 'productsearchvectors', 'searchfeedback', 'syncruns']) {
          assert.equal(
            await phase4Database.db!.collection(collectionName).countDocuments({}),
            0,
            `resume DB collection ${collectionName} must be empty before Phase 4 continues`,
          );
        }
      }
      phase4DatabaseCreated = true; // This exact database was created by the interrupted Phase 4 run and is safe to clean after a successful rerun.
    } else {
      assert.equal(phase4DatabaseExistedBeforeRun, false, 'Phase 4 Mongo test DB exists already; its origin is not assumed');
    }
    const sourceDatabase = rootConnection.useDb(SOURCE_DATABASE, { useCache: true });
    const sourceCollectionNames = (await sourceDatabase.db!.listCollections({}, { nameOnly: true }).toArray()).map((row) => row.name);
    assert.ok(sourceCollectionNames.includes('techapicatalogrecords'));
    assert.ok(sourceCollectionNames.includes('techapiimportcheckpoints'));
    const sourceCatalogModel = sourceDatabase.model('Phase4ReadonlyCatalog', TechApiCatalogModel.schema, 'techapicatalogrecords') as any;
    const sourceCheckpointModel = sourceDatabase.model('Phase4ReadonlyCheckpoint', TechApiCheckpointModel.schema, 'techapiimportcheckpoints') as any;
    const mongoSource = new MongoTechApiRepository(sourceCatalogModel, sourceCheckpointModel);
    const sourceCatalogCount = await mongoSource.countCatalogRecords();
    const sourceCheckpointCount = await sourceDatabase.db!.collection('techapiimportcheckpoints').countDocuments({});
    assert.deepEqual({ catalog: sourceCatalogCount, checkpoints: sourceCheckpointCount }, EXPECTED_COUNTS);
    assert.deepEqual(await mongoSource.countCatalogRecordsByCategory(), officialVerification.categories.map((row: any) => ({ category: row.category, records: row.count })));
    report.stages.localMongoSource = {
      host: '127.0.0.1',
      database: SOURCE_DATABASE,
      readOnlyOperationsOnly: true,
      writesPerformed: false,
      counts: { catalog: sourceCatalogCount, checkpoints: sourceCheckpointCount },
    };

    stage = 'create_independent_test_copies';
    logPhase4Progress(stage);
    if (!RESUME_OWNED_COPIES) {
      await createBackup(ARCHIVE_PATH, TEST_COPY_PATH);
      await mkdir(RUNTIME_DIR);
      await createBackup(ARCHIVE_PATH, RUNTIME_COPY_PATH);
    }
    const testCopyVerification = preflightCopyVerification?.testCopy ?? verifySqlite(TEST_COPY_PATH, {
      catalog: EXPECTED_COUNTS.catalog + (RESUME_AFTER_CPP_INSERT ? 1 : 0),
      checkpoints: EXPECTED_COUNTS.checkpoints + (RESUME_AFTER_WRITE_BEHAVIOR ? 1 : 0),
      checksums: manifest.archivePayloadChecksums,
      ...(RESUME_AFTER_CPP_INSERT ? { excludeCatalogSourceKey: CPP_FIXTURE_SOURCE_KEY } : {}),
      ...(RESUME_AFTER_WRITE_BEHAVIOR ? { excludeCheckpointFileKey: 'phase4/fixture/cpp-development-tool.json' } : {}),
    }, { integrity: 'quick', payloadChecksums: true });
    if (RESUME_AFTER_CPP_INSERT) assertCppFixtureInSqlite(
      TEST_COPY_PATH,
      RESUME_AFTER_CPP_INDEX_UPDATE ? 'C++ Development Tool Updated' : 'C++ Development Tool',
      RESUME_AFTER_WRITE_BEHAVIOR ? 'C++ compiler development tool full dataset' : 'C++ compiler development tool',
    );
    const runtimeCopyVerification = preflightCopyVerification?.runtimeCopy ?? verifySqlite(RUNTIME_COPY_PATH, {
      catalog: EXPECTED_COUNTS.catalog,
      checkpoints: EXPECTED_COUNTS.checkpoints,
      checksums: manifest.archivePayloadChecksums,
    }, { integrity: 'quick', payloadChecksums: true });
    report.stages.independentCopies = { testCopy: testCopyVerification, runtimeCopy: runtimeCopyVerification };

    stage = 'create_isolated_phase4_mongo_models';
    logPhase4Progress(stage);
    phase4Database = phase4Database ?? rootConnection.useDb(PHASE4_DATABASE, { useCache: true });
    if (!RESUME_AFTER_CPP_INSERT) phase4DatabaseCreated = true;
    const phase4CatalogModel = phase4Database.model('Phase4TechApiCatalog', TechApiCatalogModel.schema, 'techapicatalogrecords') as any;
    const phase4CheckpointModel = phase4Database.model('Phase4TechApiCheckpoint', TechApiCheckpointModel.schema, 'techapiimportcheckpoints') as any;
    const mongoTest = new MongoTechApiRepository(phase4CatalogModel, phase4CheckpointModel);
    await Promise.all([mongoTest.initializeCatalog(), mongoTest.initializeCheckpoints()]);
    const catalogIndexes = await phase4CatalogModel.collection.indexes();
    const checkpointIndexes = await phase4CheckpointModel.collection.indexes();
    const hasUniqueIndex = (indexes: any[], fields: string[]) => indexes.some((index) => index.unique === true && JSON.stringify(Object.keys(index.key ?? {})) === JSON.stringify(fields));
    assert.ok(hasUniqueIndex(catalogIndexes, ['sourceKey']));
    assert.ok(hasUniqueIndex(catalogIndexes, ['sourceCategory', 'sourceSlug']));
    assert.ok(hasUniqueIndex(checkpointIndexes, ['fileKey']));

    stage = 'compare_search_candidates';
    logPhase4Progress(stage);
    sqliteReadRepository = new SqliteTechApiRepository(ARCHIVE_PATH, { readOnly: true });
    const queryReports: any[] = [];
    const rssBeforeQueries = process.memoryUsage().rss;
    for (const plan of QUERY_PLANS) {
      logPhase4Progress(`search parity query: ${plan.name}`);
      const queryBase = { categories: plan.categories, queryTerms: plan.queryTerms, brandTerms: plan.brandTerms };
      let started = performance.now();
      const mongoCount = await mongoSource.countDiscoveryCandidates(queryBase);
      const mongoCountMs = Number((performance.now() - started).toFixed(2));
      started = performance.now();
      const sqliteCount = await sqliteReadRepository.countDiscoveryCandidates(queryBase);
      const sqliteCountMs = Number((performance.now() - started).toFixed(2));
      assert.equal(mongoCount, sqliteCount, `${plan.name}: matching candidate count`);

      const strategies: Record<string, any> = {};
      let stableRefs: { mongo: TechApiDiscoveryRecord[]; sqlite: TechApiDiscoveryRecord[] } | undefined;
      for (const strategy of ['legacy', 'stable_v1'] as const) {
        const query: TechApiDiscoveryQuery = { ...queryBase, limit: 500, candidateOrdering: strategy };
        started = performance.now();
        const mongoRefs = await mongoSource.findDiscoveryCandidates(query);
        const mongoMs = Number((performance.now() - started).toFixed(2));
        started = performance.now();
        const sqliteRefs = await sqliteReadRepository.findDiscoveryCandidates(query);
        const sqliteMs = Number((performance.now() - started).toFixed(2));
        const mongoIds = ids(mongoRefs);
        const sqliteIds = ids(sqliteRefs);
        const diffs = setDifference(mongoIds, sqliteIds);
        const orderEqual = JSON.stringify(mongoIds) === JSON.stringify(sqliteIds);
        const setEqual = diffs.onlyLeft === 0 && diffs.onlyRight === 0;
        if (strategy === 'stable_v1') {
          assert.equal(orderEqual, true, `${plan.name}: stable_v1 candidate IDs/order`);
          assert.equal(setEqual, true, `${plan.name}: stable_v1 candidate ID set`);
          stableRefs = { mongo: mongoRefs, sqlite: sqliteRefs };
        }
        strategies[strategy] = {
          returnedCandidateCount: mongoIds.length,
          mongoCandidateCount: mongoIds.length,
          sqliteCandidateCount: sqliteIds.length,
          mongoMs,
          sqliteMs,
          orderEqual,
          candidateIdSetEqual: setEqual,
          differingIds: diffs,
        };
      }
      assert.ok(stableRefs);
      const mongoTop8 = rankedTop8(plan, stableRefs.mongo);
      const sqliteTop8 = rankedTop8(plan, stableRefs.sqlite);
      if ((plan.rankingKeywords?.length ?? 0) + (plan.rankingBrands?.length ?? 0) > 0) {
        assert.deepEqual(mongoTop8, sqliteTop8, `${plan.name}: stable_v1 ranked top 8`);
      }
      queryReports.push({
        query: plan.name,
        totalMatchingBeforeCap: mongoCount,
        countMs: { mongo: mongoCountMs, sqlite: sqliteCountMs },
        strategies,
        top8CandidateKeys: mongoTop8,
      });
    }
    report.stages.searchParity = {
      strategy: 'stable_v1 = sourceKey ASC (unique deterministic tie-break); legacy leaves ordering unspecified',
      stableV1ExactParity: true,
      queries: queryReports,
      rssBeforeBytes: rssBeforeQueries,
      rssAfterBytes: process.memoryUsage().rss,
    };

    stage = 'verify_enrichment_soc_statistics_and_checkpoints';
    logPhase4Progress(stage);
    const enrichmentCases = [
      { name: 'unenriched_global', options: { refresh: false, limit: 25 } },
      { name: 'unenriched_cpu', options: { category: 'cpu', refresh: false, limit: 25 } },
      { name: 'refresh_sorted', options: { refresh: true, limit: 25 } },
    ];
    const enrichmentParity = [] as any[];
    for (const item of enrichmentCases) {
      const enrichmentRows: [TechApiCatalogReference[], TechApiCatalogReference[]] = await Promise.all([
        mongoSource.findCatalogReferencesForEnrichment(item.options),
        sqliteReadRepository.findCatalogReferencesForEnrichment(item.options),
      ]);
      const [mongoRows, sqliteRows] = enrichmentRows;
      assert.deepEqual(mongoRows.map((row) => row.sourceKey), sqliteRows.map((row) => row.sourceKey), `${item.name}: enrichment ordering`);
      enrichmentParity.push({ name: item.name, count: mongoRows.length, candidateIdsEqual: true, firstFive: mongoRows.slice(0, 5).map((row) => row.sourceKey) });
    }
    const [mongoSoc, sqliteSoc] = await Promise.all([mongoSource.findVerifiedSocRecords(), sqliteReadRepository.findVerifiedSocRecords()]);
    const mongoSocKeys = mongoSoc.map((row) => row.sourceKey).sort();
    const sqliteSocKeys = sqliteSoc.map((row) => row.sourceKey).sort();
    assert.deepEqual(mongoSocKeys, sqliteSocKeys, 'verified SoC source keys');
    const mongoWorkflow = await sourceDatabase.db!.collection('techapicatalogrecords').aggregate([
      { $group: { _id: '$workflowStatus', count: { $sum: 1 } } }, { $sort: { _id: 1 } },
    ]).toArray();
    const archiveDb = new Database(ARCHIVE_PATH, { readonly: true, fileMustExist: true });
    let sqliteWorkflow: any[];
    let sampleKeys: string[];
    let sampleCheckpointKeys: string[];
    try {
      sqliteWorkflow = archiveDb.prepare('SELECT workflow_status AS _id, COUNT(*) AS count FROM techapi_catalog_records GROUP BY workflow_status ORDER BY workflow_status').all() as any[];
      sampleKeys = (archiveDb.prepare('SELECT source_key FROM techapi_catalog_records ORDER BY source_key COLLATE BINARY LIMIT 5').all() as Array<{ source_key: string }>).map((row) => row.source_key);
      sampleCheckpointKeys = (archiveDb.prepare('SELECT file_key FROM techapi_import_checkpoints ORDER BY file_key COLLATE BINARY LIMIT 3').all() as Array<{ file_key: string }>).map((row) => row.file_key);
    } finally { archiveDb.close(); }
    assert.deepEqual(mongoWorkflow, sqliteWorkflow, 'workflow statistics');
    const mongoStats = { total: await mongoSource.countCatalogRecords(), byCategory: await mongoSource.countCatalogRecordsByCategory(), workflow: mongoWorkflow };
    const sqliteStats = { total: officialVerification.counts.catalog, byCategory: officialVerification.categories.map((row: any) => ({ category: row.category, records: row.count })), workflow: sqliteWorkflow };
    assert.deepEqual(mongoStats, sqliteStats, 'catalog statistics');

    const [mongoCheckpoints, sqliteCheckpoints] = await Promise.all([
      mongoSource.findCheckpoints(sampleCheckpointKeys),
      sqliteReadRepository.findCheckpoints(sampleCheckpointKeys),
    ]);
    const normalizeCheckpoints = (rows: TechApiImportCheckpoint[]) => rows.map((row) => ({ fileKey: row.fileKey, sourcePath: row.sourcePath, sourceCommit: row.sourceCommit, sha256: row.sha256, recordCount: row.recordCount, importedAt: new Date(row.importedAt).toISOString() })).sort((a, b) => a.fileKey.localeCompare(b.fileKey));
    assert.deepEqual(normalizeCheckpoints(mongoCheckpoints), normalizeCheckpoints(sqliteCheckpoints), 'checkpoint lookup fields');
    const resumeCandidates = [
      { fileKey: sampleCheckpointKeys[0], sourceKey: sampleKeys[0] },
      { fileKey: sampleCheckpointKeys[1], sourceKey: 'phase4:missing:source-key' },
      { fileKey: 'phase4/missing-checkpoint.json', sourceKey: sampleKeys[0] },
      { fileKey: 'phase4/missing-both.json', sourceKey: 'phase4:missing:both' },
    ];
    const [mongoResume, sqliteResume] = await Promise.all([
      mongoSource.findImportResumeStates(resumeCandidates),
      sqliteReadRepository.findImportResumeStates(resumeCandidates),
    ]);
    assert.deepEqual(Object.fromEntries(mongoResume), Object.fromEntries(sqliteResume), 'checkpoint resume state parity');
    const goodCheckpoint = mongoResume.get(sampleCheckpointKeys[0])!;
    const matchedHashCandidate = { fileKey: sampleCheckpointKeys[0], sourceKey: sampleKeys[0], sha256: goodCheckpoint.checkpointSha256! };
    const changedHashCandidate = { ...matchedHashCandidate, sha256: '0'.repeat(64) };
    const resumeCases = {
      matchingHashAndCatalogRow: canSkipTechApiFile(matchedHashCandidate, mongoResume),
      changedHash: canSkipTechApiFile(changedHashCandidate, mongoResume),
      missingCatalogRow: canSkipTechApiFile({ fileKey: sampleCheckpointKeys[1], sourceKey: 'phase4:missing:source-key', sha256: mongoResume.get(sampleCheckpointKeys[1])!.checkpointSha256! }, mongoResume),
      missingCheckpoint: canSkipTechApiFile({ fileKey: 'phase4/missing-checkpoint.json', sourceKey: sampleKeys[0], sha256: '0'.repeat(64) }, mongoResume),
    };
    assert.deepEqual(resumeCases, { matchingHashAndCatalogRow: true, changedHash: false, missingCatalogRow: false, missingCheckpoint: false });
    report.stages.readSemantics = {
      enrichmentParity,
      verifiedSocCount: mongoSoc.length,
      verifiedSocIdsEqual: true,
      statisticsEqual: true,
      checkpointSamples: normalizeCheckpoints(mongoCheckpoints),
      checkpointResumeCases: resumeCases,
    };

    stage = 'write_behavior_on_phase4_copies';
    logPhase4Progress(stage);
    sqliteWriteRepository = new SqliteTechApiRepository(TEST_COPY_PATH, RESUME_AFTER_WRITE_BEHAVIOR ? { readOnly: true } : {});
    if (RESUME_AFTER_WRITE_BEHAVIOR) {
      const [mongoFixture, sqliteFixture, mongoRetryRecord, sqliteRollbackRecord, mongoRollbackRecord] = await Promise.all([
        mongoTest.findCatalogRecordBySourceKey(CPP_FIXTURE_SOURCE_KEY),
        sqliteWriteRepository.findCatalogRecordBySourceKey(CPP_FIXTURE_SOURCE_KEY),
        mongoTest.findCatalogRecordBySourceKey('phase4:test:mongo-retry-record'),
        sqliteWriteRepository.findCatalogRecordBySourceKey('phase4:test:rollback-record'),
        mongoTest.findCatalogRecordBySourceKey('phase4:test:rollback-record'),
      ]);
      assert.ok(mongoFixture && sqliteFixture && mongoRetryRecord);
      assert.equal(mongoFixture.name, 'C++ Development Tool Updated');
      assert.equal(sqliteFixture.name, 'C++ Development Tool Updated');
      assert.equal(mongoFixture.searchText, 'C++ compiler development tool full dataset');
      assert.equal(sqliteFixture.searchText, 'C++ compiler development tool full dataset');
      assert.equal(serializeTechApiEjson(mongoFixture.raw), serializeTechApiEjson(sqliteFixture.raw), 'persisted fixture raw payload parity');
      assert.equal(mongoFixture.raw.capturedAt instanceof Date, true);
      assert.equal(sqliteFixture.raw.capturedAt instanceof Date, true);
      assert.equal(mongoFixture.raw.objectRef instanceof ObjectId, true);
      assert.equal(sqliteFixture.raw.objectRef instanceof ObjectId, true);
      assert.equal(sqliteRollbackRecord, null);
      assert.equal(mongoRollbackRecord, null);
      assert.equal(await mongoTest.findCatalogRecordBySourceKey('phase4:test:duplicate-identity'), null);
      assert.equal(await sqliteWriteRepository.findCatalogRecordBySourceKey('phase4:test:duplicate-identity'), null);
      const [mongoFixtureCheckpoints, sqliteFixtureCheckpoints, mongoRetryCheckpoints] = await Promise.all([
        mongoTest.findCheckpoints(['phase4/fixture/cpp-development-tool.json']),
        sqliteWriteRepository.findCheckpoints(['phase4/fixture/cpp-development-tool.json']),
        mongoTest.findCheckpoints(['phase4/fixture/mongo-retry.json']),
      ]);
      assert.deepEqual(normalizeCheckpoints(mongoFixtureCheckpoints), normalizeCheckpoints(sqliteFixtureCheckpoints));
      assert.equal(mongoFixtureCheckpoints[0]?.sha256, 'd'.repeat(64));
      assert.equal(mongoRetryCheckpoints.length, 1, 'Mongo catalog-first retry persisted its checkpoint');
      assert.equal((await sqliteWriteRepository.findCheckpoints(['phase4/fixture/rollback.json'])).length, 0);
      const [mongoResume, sqliteResume] = await Promise.all([
        mongoTest.findImportResumeStates([{ fileKey: 'phase4/fixture/cpp-development-tool.json', sourceKey: CPP_FIXTURE_SOURCE_KEY }]),
        sqliteWriteRepository.findImportResumeStates([{ fileKey: 'phase4/fixture/cpp-development-tool.json', sourceKey: CPP_FIXTURE_SOURCE_KEY }]),
      ]);
      assert.deepEqual(Object.fromEntries(mongoResume), Object.fromEntries(sqliteResume));
      assert.equal(canSkipTechApiFile({ fileKey: 'phase4/fixture/cpp-development-tool.json', sourceKey: CPP_FIXTURE_SOURCE_KEY, sha256: 'd'.repeat(64) }, mongoResume), true);
      const specialCharacterResults = await testSpecialCharacterQueryParity(mongoTest, sqliteWriteRepository, CPP_FIXTURE_SOURCE_KEY);
      report.stages.writeBehavior = {
        writeAssertionsCompletedBeforeResume: true,
        persistedWriteStateRevalidated: true,
        upsertAndRetryIdempotent: true,
        indexUpsertPreservesRawAndSearchText: true,
        fullDatasetUpsertReplacesRawAndRoundTripsDatesObjectIds: true,
        enrichmentConditionalUpdateAndSkip: true,
        checkpointLookupHashChangeAndResume: true,
        uniqueIdentityConstraint: true,
        sqliteNotNullConstraint: true,
        mongooseRequiredValidationNoWrite: true,
        sqliteCatalogAndCheckpointRollbackSameTransaction: true,
        mongoCatalogFirstFailureRetryVerified: true,
        specialCharacterQueries: specialCharacterResults,
        mongoTestCounts: { catalog: await mongoTest.countCatalogRecords(), checkpoints: await phase4Database.db!.collection('techapiimportcheckpoints').countDocuments({}) },
        sqliteTestCounts: sqliteCounts(TEST_COPY_PATH),
      };
    } else {
    const fixture = indexFixture(RESUME_AFTER_CPP_INDEX_UPDATE ? {
      name: 'C++ Development Tool Updated',
      lastSeenAt: CPP_FIXTURE_UPDATED_AT,
    } : {});
    if (RESUME_AFTER_CPP_INSERT) {
      if (RESUME_AFTER_CPP_INDEX_UPDATE) {
        const [mongoPreexistingFixture, sqlitePreexistingFixture] = await Promise.all([
          mongoTest.findCatalogRecordBySourceKey(fixture.sourceKey),
          sqliteWriteRepository.findCatalogRecordBySourceKey(fixture.sourceKey),
        ]);
        assert.ok(mongoPreexistingFixture && sqlitePreexistingFixture);
        assert.equal(serializeTechApiEjson(mongoPreexistingFixture.raw), serializeTechApiEjson(sqlitePreexistingFixture.raw), 'resumed C++ fixture raw payload parity');
        assert.equal(mongoPreexistingFixture.searchText, sqlitePreexistingFixture.searchText, 'resumed C++ fixture search text parity');
        assert.equal(mongoPreexistingFixture.name, 'C++ Development Tool Updated');
      }
      const [mongoResumeUpsert, sqliteResumeUpsert] = await Promise.all([
        mongoTest.upsertIndexRecords([fixture]),
        sqliteWriteRepository.upsertIndexRecords([fixture]),
      ]);
      assert.deepEqual(mongoResumeUpsert, { created: 0, updated: 0 });
      assert.deepEqual(sqliteResumeUpsert, { created: 0, updated: 0 });
    } else {
      const [mongoInsert, sqliteInsert] = await Promise.all([
        mongoTest.upsertIndexRecords([fixture]),
        sqliteWriteRepository.upsertIndexRecords([fixture]),
      ]);
      assert.deepEqual(mongoInsert, { created: 1, updated: 0 });
      assert.deepEqual(sqliteInsert, { created: 1, updated: 0 });
    }
    const [mongoRetry, sqliteRetry] = await Promise.all([
      mongoTest.upsertIndexRecords([fixture]),
      sqliteWriteRepository.upsertIndexRecords([fixture]),
    ]);
    assert.deepEqual(mongoRetry, { created: 0, updated: 0 });
    assert.deepEqual(sqliteRetry, { created: 0, updated: 0 });

    const specialCharacterResults = await testSpecialCharacterQueryParity(mongoTest, sqliteWriteRepository, fixture.sourceKey);

    const [mongoBeforeIndexUpdate, sqliteBeforeIndexUpdate] = await Promise.all([
      mongoTest.findCatalogRecordBySourceKey(fixture.sourceKey),
      sqliteWriteRepository.findCatalogRecordBySourceKey(fixture.sourceKey),
    ]);
    assert.ok(mongoBeforeIndexUpdate && sqliteBeforeIndexUpdate);
    const mongoRawBeforeIndexUpdate = serializeTechApiEjson(mongoBeforeIndexUpdate.raw);
    const sqliteRawBeforeIndexUpdate = serializeTechApiEjson(sqliteBeforeIndexUpdate.raw);
    const mongoSearchTextBeforeIndexUpdate = mongoBeforeIndexUpdate.searchText;
    const sqliteSearchTextBeforeIndexUpdate = sqliteBeforeIndexUpdate.searchText;
    assert.equal(mongoRawBeforeIndexUpdate, sqliteRawBeforeIndexUpdate, 'raw payload parity before index-only update');
    const indexUpdate = indexFixture({
      name: 'C++ Development Tool Updated',
      lastSeenAt: CPP_FIXTURE_UPDATED_AT,
      raw: { manufacturer: 'Should not replace raw during index-only upsert' },
      searchText: 'Should not replace search text during index-only upsert',
    });
    await Promise.all([mongoTest.upsertIndexRecords([indexUpdate]), sqliteWriteRepository.upsertIndexRecords([indexUpdate])]);
    const [mongoAfterIndex, sqliteAfterIndex] = await Promise.all([
      mongoTest.findCatalogRecordBySourceKey(fixture.sourceKey),
      sqliteWriteRepository.findCatalogRecordBySourceKey(fixture.sourceKey),
    ]);
    assert.ok(mongoAfterIndex && sqliteAfterIndex);
    assert.equal(serializeTechApiEjson(mongoAfterIndex.raw), mongoRawBeforeIndexUpdate, 'Mongo index-only upsert must preserve existing raw');
    assert.equal(serializeTechApiEjson(sqliteAfterIndex.raw), sqliteRawBeforeIndexUpdate, 'SQLite index-only upsert must preserve existing raw');
    assert.equal(mongoAfterIndex.searchText, mongoSearchTextBeforeIndexUpdate, 'Mongo index-only upsert must preserve existing search text');
    assert.equal(sqliteAfterIndex.searchText, sqliteSearchTextBeforeIndexUpdate, 'SQLite index-only upsert must preserve existing search text');

    const fullRecord = fullFixture({
      sourceKey: fixture.sourceKey,
      sourceCategory: fixture.sourceCategory,
      sourceSlug: fixture.sourceSlug,
      name: indexUpdate.name,
      sourceRecordUrl: fixture.sourceRecordUrl,
      sourceListUrl: fixture.sourceListUrl,
      raw: { manufacturer: { name: 'Phase4 Test Lab' }, verified: false, release_date: '2026', capturedAt: new Date('2026-11-13T12:00:00.000Z'), objectRef: new ObjectId() },
      searchText: 'C++ compiler development tool full dataset',
    });
    await Promise.all([mongoTest.upsertFullDatasetRecords([fullRecord]), sqliteWriteRepository.upsertFullDatasetRecords([fullRecord])]);
    const [mongoAfterFull, sqliteAfterFull] = await Promise.all([
      mongoTest.findCatalogRecordBySourceKey(fixture.sourceKey),
      sqliteWriteRepository.findCatalogRecordBySourceKey(fixture.sourceKey),
    ]);
    assert.ok(mongoAfterFull?.raw.capturedAt instanceof Date);
    assert.ok(sqliteAfterFull?.raw.capturedAt instanceof Date);
    assert.ok(mongoAfterFull?.raw.objectRef instanceof ObjectId);
    assert.ok(sqliteAfterFull?.raw.objectRef instanceof ObjectId);
    assert.deepEqual(mongoAfterFull?.raw, sqliteAfterFull?.raw);

    const enrichedAt = new Date('2026-11-14T00:02:00.000Z');
    const enrichment = {
      sourceKey: fixture.sourceKey,
      onlyIfNotEnriched: true,
      raw: { ...fullRecord.raw, enrichment: { observedAt: enrichedAt } },
      searchText: 'C++ compiler development tool enriched',
      detailsFetchedAt: enrichedAt,
      detailsSha256: 'c'.repeat(64),
    };
    const [mongoEnriched, sqliteEnriched] = await Promise.all([
      mongoTest.updateEnrichedRecord(enrichment),
      sqliteWriteRepository.updateEnrichedRecord(enrichment),
    ]);
    assert.deepEqual([mongoEnriched, sqliteEnriched], [1, 1]);
    const [mongoSkippedEnrichment, sqliteSkippedEnrichment] = await Promise.all([
      mongoTest.updateEnrichedRecord(enrichment),
      sqliteWriteRepository.updateEnrichedRecord(enrichment),
    ]);
    assert.deepEqual([mongoSkippedEnrichment, sqliteSkippedEnrichment], [0, 0]);

    const checkpoint = checkpointFixture();
    const [mongoSave, sqliteSave] = await Promise.all([
      mongoTest.saveFullDatasetRecordsWithCheckpoints([fullRecord], [checkpoint]),
      sqliteWriteRepository.saveFullDatasetRecordsWithCheckpoints([fullRecord], [checkpoint]),
    ]);
    assert.deepEqual(mongoSave, sqliteSave);
    const [mongoSaveRetry, sqliteSaveRetry] = await Promise.all([
      mongoTest.saveFullDatasetRecordsWithCheckpoints([fullRecord], [checkpoint]),
      sqliteWriteRepository.saveFullDatasetRecordsWithCheckpoints([fullRecord], [checkpoint]),
    ]);
    assert.deepEqual(mongoSaveRetry, { created: 0, updated: 0 });
    assert.deepEqual(sqliteSaveRetry, { created: 0, updated: 0 });
    const [mongoResumeWrite, sqliteResumeWrite] = await Promise.all([
      mongoTest.findImportResumeStates([{ fileKey: checkpoint.fileKey, sourceKey: fixture.sourceKey }]),
      sqliteWriteRepository.findImportResumeStates([{ fileKey: checkpoint.fileKey, sourceKey: fixture.sourceKey }]),
    ]);
    assert.deepEqual(Object.fromEntries(mongoResumeWrite), Object.fromEntries(sqliteResumeWrite));
    assert.equal(canSkipTechApiFile({ fileKey: checkpoint.fileKey, sourceKey: fixture.sourceKey, sha256: checkpoint.sha256 }, mongoResumeWrite), true);
    const changedCheckpoint = { ...checkpoint, sha256: 'd'.repeat(64), importedAt: new Date('2026-11-14T00:03:00.000Z') };
    await Promise.all([mongoTest.upsertCheckpoints([changedCheckpoint]), sqliteWriteRepository.upsertCheckpoints([changedCheckpoint])]);
    const [mongoUpdatedCheckpoint, sqliteUpdatedCheckpoint] = await Promise.all([
      mongoTest.findCheckpoints([checkpoint.fileKey]),
      sqliteWriteRepository.findCheckpoints([checkpoint.fileKey]),
    ]);
    assert.deepEqual(normalizeCheckpoints(mongoUpdatedCheckpoint), normalizeCheckpoints(sqliteUpdatedCheckpoint));
    assert.equal(mongoUpdatedCheckpoint[0].sha256, changedCheckpoint.sha256);

    const duplicateIdentity = indexFixture({ sourceKey: 'phase4:test:duplicate-identity', name: 'Duplicate identity', searchText: 'duplicate', sourceSlug: fixture.sourceSlug });
    await assert.rejects(sqliteWriteRepository.upsertIndexRecords([duplicateIdentity]));
    await assert.rejects(mongoTest.upsertIndexRecords([duplicateIdentity]));
    assert.equal(await sqliteWriteRepository.findCatalogRecordBySourceKey(duplicateIdentity.sourceKey), null);
    assert.equal(await mongoTest.findCatalogRecordBySourceKey(duplicateIdentity.sourceKey), null);

    const invalidCatalogRecord = indexFixture({ sourceKey: 'phase4:test:null-required-key', sourceCategory: null as any, sourceSlug: 'null-required-key' });
    await assert.rejects(sqliteWriteRepository.upsertIndexRecords([invalidCatalogRecord]), /NOT NULL/i);
    assert.equal(await sqliteWriteRepository.findCatalogRecordBySourceKey(invalidCatalogRecord.sourceKey), null);
    const invalidMongooseDocument = new phase4CatalogModel({ sourceKey: 'phase4:test:validation-only', sourceCategory: null, sourceSlug: 'validation-only' });
    await assert.rejects(invalidMongooseDocument.validate());

    const rollbackRecord = fullFixture({ sourceKey: 'phase4:test:rollback-record', sourceSlug: 'phase4-rollback-record' });
    const rollbackCheckpoint = checkpointFixture({ _id: checkpoint._id, fileKey: 'phase4/fixture/rollback.json' });
    await assert.rejects(sqliteWriteRepository.saveFullDatasetRecordsWithCheckpoints([rollbackRecord], [rollbackCheckpoint]));
    assert.equal(await sqliteWriteRepository.findCatalogRecordBySourceKey(rollbackRecord.sourceKey), null, 'SQLite rollback must remove catalog write after checkpoint failure');
    assert.equal((await sqliteWriteRepository.findCheckpoints([rollbackCheckpoint.fileKey])).length, 0);

    const mongoRetryRecord = fullFixture({ sourceKey: 'phase4:test:mongo-retry-record', sourceSlug: 'phase4-mongo-retry-record' });
    const mongoRetryCheckpoint = checkpointFixture({ fileKey: 'phase4/fixture/mongo-retry.json' });
    const originalCheckpointBulkWrite = phase4CheckpointModel.collection.bulkWrite;
    (phase4CheckpointModel.collection as any).bulkWrite = async () => { throw new Error('phase4 injected checkpoint failure'); };
    try {
      await assert.rejects(mongoTest.saveFullDatasetRecordsWithCheckpoints([mongoRetryRecord], [mongoRetryCheckpoint]), /injected checkpoint failure/);
    } finally {
      (phase4CheckpointModel.collection as any).bulkWrite = originalCheckpointBulkWrite;
    }
    assert.ok(await mongoTest.findCatalogRecordBySourceKey(mongoRetryRecord.sourceKey), 'Mongo adapter persists catalog first; retry must be safe');
    assert.equal((await mongoTest.findCheckpoints([mongoRetryCheckpoint.fileKey])).length, 0);
    await mongoTest.saveFullDatasetRecordsWithCheckpoints([mongoRetryRecord], [mongoRetryCheckpoint]);
    assert.equal((await mongoTest.findCheckpoints([mongoRetryCheckpoint.fileKey])).length, 1);

    const mongoCheckpointCount = await phase4Database.db!.collection('techapiimportcheckpoints').countDocuments({});
    report.stages.writeBehavior = {
      testCollections: ['techapicatalogrecords', 'techapiimportcheckpoints'],
      upsertAndRetryIdempotent: true,
      indexUpsertPreservesRawAndSearchText: true,
      fullDatasetUpsertReplacesRawAndRoundTripsDatesObjectIds: true,
      enrichmentConditionalUpdateAndSkip: true,
      checkpointLookupHashChangeAndResume: true,
      uniqueIdentityConstraint: true,
      sqliteNotNullConstraint: true,
      mongooseRequiredValidationNoWrite: true,
      sqliteCatalogAndCheckpointRollbackSameTransaction: true,
      mongoCatalogFirstFailureRetryVerified: true,
      specialCharacterQueries: specialCharacterResults,
      mongoTestCounts: { catalog: await mongoTest.countCatalogRecords(), checkpoints: mongoCheckpointCount },
      sqliteTestCounts: sqliteCounts(TEST_COPY_PATH),
    };
    }

    stage = 'backup_restore_test_copy';
    logPhase4Progress(stage);
    await sqliteWriteRepository.close();
    sqliteWriteRepository = undefined;
    if (!RESUME_AFTER_WRITE_BEHAVIOR) await createBackup(TEST_COPY_PATH, RESTORE_COPY_PATH);
    else logPhase4Progress('reusing previously created Phase 4 restore copy; refusing overwrite');
    const testCopyAfterWrites = verifySqlite(TEST_COPY_PATH, undefined, { integrity: 'quick', payloadChecksums: true });
    assert.ok(testCopyAfterWrites.payloadChecksums, 'post-write SQLite checksum must be calculated before backup');
    const restoredCopyVerification = verifySqlite(RESTORE_COPY_PATH, {
      catalog: testCopyAfterWrites.counts.catalog,
      checkpoints: testCopyAfterWrites.counts.checkpoints,
      checksums: testCopyAfterWrites.payloadChecksums!,
    }, { integrity: 'quick', payloadChecksums: true });
    assert.deepEqual(restoredCopyVerification.counts, testCopyAfterWrites.counts);
    assert.deepEqual(restoredCopyVerification.payloadChecksums, testCopyAfterWrites.payloadChecksums);
    report.stages.backupRestore = {
      backupPath: TEST_COPY_PATH,
      restoredPath: RESTORE_COPY_PATH,
      backupCopyReusedFromInterruptedPhase4Run: RESUME_AFTER_WRITE_BEHAVIOR,
      counts: restoredCopyVerification.counts,
      integrityCheck: restoredCopyVerification.integrityCheck,
      integrityCheckMode: restoredCopyVerification.integrityCheckMode,
      payloadChecksumsEqual: true,
      schemaVersion: restoredCopyVerification.schemaVersion,
      uniqueAndNotNullConstraintsVerified: true,
    };

    stage = 'isolated_backend_runtime';
    logPhase4Progress(stage);
    const apiProductModel = phase4Database.model('Phase4RuntimeProduct', Product.schema, 'products') as any;
    const apiOfferModel = phase4Database.model('Phase4RuntimeOffer', Offer.schema, 'offers') as any;
    await Promise.all([apiProductModel.init(), apiOfferModel.init()]);
    const now = new Date();
    const evidenceTypes = ['identity', 'product_page', 'specifications', 'description', 'image', 'image_rights'];
    const runtimeProductFixture = {
      name: 'AMD Phase 4 Runtime Fixture CPU',
      slug: 'phase4-runtime-fixture-cpu',
      brand: 'AMD',
      model: 'PHASE4-TEST-CPU',
      category: 'cpu',
      description: 'Isolated Phase 4 integration fixture; not a catalog product.',
      specifications: { cpu: 'Phase 4 test fixture only' },
      specs: { cpu: 'Phase 4 test fixture only' },
      sourceEvidence: evidenceTypes.map((evidenceType) => ({ evidenceType, sourceName: 'Phase 4 test fixture', sourceUrl: 'https://phase4.example.test/evidence', retrievedAt: now, verifiedAt: now })),
      productUrl: 'https://phase4.example.test/product',
      specificationSourceUrl: 'https://phase4.example.test/specifications',
      imageUrl: '/catalog-images/phase4-fixture.png',
      imageVerificationStatus: 'verified',
      imageUsagePermission: 'granted',
      imageSource: 'https://phase4.example.test/image',
      imageLicense: 'CC0 test fixture',
      imageLicenseUrl: 'https://phase4.example.test/license',
      imageAttribution: 'Phase 4 integration test only',
      imagePermissionEvidence: 'isolated test fixture',
      imageVisualIdentityChecked: true,
      imageVerificationBasis: 'isolated test fixture',
      verified: true,
      verifiedAt: now,
      productVerificationStatus: 'verified',
      urlVerificationStatus: 'verified',
      publicationStatus: 'published',
      electronicStatus: 'approved',
      source: 'curated',
      dedupeKey: 'phase4-test:runtime-product',
      searchText: 'amd phase 4 runtime fixture cpu',
    };
    const product = await apiProductModel.findOneAndUpdate(
      { dedupeKey: runtimeProductFixture.dedupeKey },
      { $setOnInsert: runtimeProductFixture },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await apiOfferModel.findOneAndUpdate(
      { productId: product._id, source: 'phase4_test', sellerName: 'Phase 4 isolated test seller' },
      { $set: {
      productId: product._id,
      sellerName: 'Phase 4 isolated test seller',
      source: 'phase4_test',
      price: 1_000_000,
      originalPrice: 1_100_000,
      currency: 'VND',
      productUrl: 'https://example.com/phase4-test-offer',
      verified: true,
      priceVerificationStatus: 'verified',
      verifiedAt: now,
      sourceRetrievedAt: now,
      lastUpdated: now,
      } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    dotenvDirectory = await mkdtemp(join(tmpdir(), 'phase4-empty-dotenv-'));
    const emptyDotenvPath = join(dotenvDirectory, 'empty.env');
    await writeFile(emptyDotenvPath, '', { flag: 'wx' });
    const originalEnvironment = new Map<string, string | undefined>();
    const testEnvironment: Record<string, string> = {
      DOTENV_CONFIG_PATH: emptyDotenvPath,
      MONGODB_URI: PHASE4_URI,
      TECHAPI_STORAGE: 'sqlite',
      TECHAPI_ARCHIVE_DIR: RUNTIME_DIR,
      TECHAPI_CANDIDATE_ORDERING: 'stable_v1',
      SEARCH_PROVIDER: 'none',
      SEARCH_EVAL_SKIP_DISCOVERY: 'false',
      MONGODB_VECTOR_SEARCH_ENABLED: 'false',
      PORT: '0',
    };
    for (const [key, value] of Object.entries(testEnvironment)) {
      originalEnvironment.set(key, process.env[key]);
      process.env[key] = value;
    }
    const protectedKeys = ['TAVILY_API_KEY', 'BRAVE_SEARCH_API_KEY'];
    for (const key of protectedKeys) {
      originalEnvironment.set(key, process.env[key]);
      delete process.env[key];
    }
    try {
      const runtimeArchiveStatBefore = statSync(RUNTIME_COPY_PATH);
      const { createTechApiRepository } = await import('../repositories/techApiRepositoryFactory');
      const readOnlyRuntimeRepository = createTechApiRepository({ storage: 'sqlite', archiveDir: RUNTIME_DIR }) as SqliteTechApiRepository;
      await assert.rejects(readOnlyRuntimeRepository.upsertIndexRecords([indexFixture()]), /read-only/);
      await readOnlyRuntimeRepository.close();

      const missingRuntimeDir = join(DATA_DIR, 'techapi_phase4_missing_runtime');
      assert.equal(existsSync(missingRuntimeDir), false, 'missing-runtime test directory must not pre-exist');
      await mkdir(missingRuntimeDir);
      try {
        assert.throws(() => createTechApiRepository({ storage: 'sqlite', archiveDir: missingRuntimeDir }), /existing readable file/);
        assert.equal(existsSync(join(missingRuntimeDir, 'techapi_catalog.sqlite')), false, 'runtime must not create a missing official archive');
      } finally { await rm(missingRuntimeDir, { recursive: true, force: true }); }

      const corruptRuntimeDir = join(DATA_DIR, 'techapi_phase4_corrupt_runtime');
      assert.equal(existsSync(corruptRuntimeDir), false, 'corrupt-runtime test directory must not pre-exist');
      await mkdir(corruptRuntimeDir);
      await writeFile(join(corruptRuntimeDir, 'techapi_catalog.sqlite'), 'not a SQLite archive', { flag: 'wx' });
      try {
        assert.throws(() => createTechApiRepository({ storage: 'sqlite', archiveDir: corruptRuntimeDir }));
      } finally { await rm(corruptRuntimeDir, { recursive: true, force: true }); }

      const { startServer } = await import('../server');
      runtimeServer = await startServer(0, '127.0.0.1');
      const address = runtimeServer.server.address();
      assert.ok(address && typeof address === 'object');
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const healthResponse = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(30_000) });
      assert.equal(healthResponse.status, 200, 'isolated backend health endpoint');
      const searchResponse = await fetch(`${baseUrl}/api/products/search?q=AMD%20CPU&limit=8`, { signal: AbortSignal.timeout(30_000) });
      assert.equal(searchResponse.status, 200, 'isolated backend product search endpoint');
      const searchBody = await searchResponse.json() as any;
      assert.ok(Array.isArray(searchBody.catalogDiscovery));
      const detailResponse = await fetch(`${baseUrl}/api/products/${product._id.toString()}`, { signal: AbortSignal.timeout(30_000) });
      assert.equal(detailResponse.status, 200, 'isolated backend product detail endpoint');
      const detailBody = await detailResponse.json() as any;
      assert.equal(detailBody._id, product._id.toString(), 'detail endpoint returns the fixture Product');
      assert.equal(detailBody.offers?.length, 1, 'detail endpoint returns the fixture Offer with an acceptable verified HTTPS URL');
      const listResponse = await fetch(`${baseUrl}/api/products?category=cpu&pageSize=10`, { signal: AbortSignal.timeout(30_000) });
      assert.equal(listResponse.status, 200, 'isolated backend product list endpoint');
      const listBody = await listResponse.json() as any;
      assert.ok(listBody.items.some((item: any) => item._id === product._id.toString()));
      const suggestResponse = await fetch(`${baseUrl}/api/products/suggest?q=AMD`, { signal: AbortSignal.timeout(30_000) });
      assert.equal(suggestResponse.status, 200, 'isolated backend product suggestions endpoint');
      const suggestions = await suggestResponse.json() as any[];
      assert.ok(suggestions.some((item) => item.name === product.name));
      await runtimeServer.close();
      runtimeServer = undefined;
      const runtimeArchiveStatAfter = statSync(RUNTIME_COPY_PATH);
      assert.equal(runtimeArchiveStatAfter.size, runtimeArchiveStatBefore.size, 'runtime must not change the SQLite archive copy size');
      assert.equal(runtimeArchiveStatAfter.mtime.toISOString(), runtimeArchiveStatBefore.mtime.toISOString(), 'runtime must not change the SQLite archive copy timestamp');
      report.stages.backendRuntime = {
        status: 'PASS',
        mongodb: PHASE4_DATABASE,
        techApiStorage: 'sqlite read-only test archive copy',
        stableCandidateOrdering: 'stable_v1',
        endpoints: { health: healthResponse.status, search: searchResponse.status, productDetail: detailResponse.status, productList: listResponse.status, suggestions: suggestResponse.status },
        productReadCount: listBody.items.length,
        offerReturnedWithDetail: detailBody.offers.length === 1,
        catalogDiscoveryCount: searchBody.catalogDiscovery.length,
        runtimeArchiveUnchangedByReadOnlyRuntime: true,
        runtimeArchiveSizeBytes: runtimeArchiveStatAfter.size,
        runtimeArchiveMtimeUnchanged: true,
        missingArchiveDoesNotCreateEmptyDatabase: true,
        corruptArchiveFailsStartup: true,
        readOnlyWriteRejected: true,
        gracefulShutdownClosedSqliteAndMongo: true,
        osPermissionDeniedCase: 'NOT_SIMULATED; Windows ACL denial was not altered on test files',
      };
    } finally {
      await runtimeServer?.close();
      for (const [key, value] of originalEnvironment) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    stage = 'verify_final_artifacts';
    logPhase4Progress(stage);
    const finalArchiveHash = await sha256File(ARCHIVE_PATH);
    const finalStagingHash = await sha256File(STAGING_PATH);
    const finalManifestHash = await sha256File(MANIFEST_PATH);
    assert.equal(finalArchiveHash, archiveHashBefore);
    assert.equal(finalStagingHash, stagingHashBefore);
    assert.equal(finalManifestHash, manifestHashBefore);
    assert.equal(statSync(ARCHIVE_PATH).mtime.toISOString(), archiveStat.mtime.toISOString());
    assert.equal(statSync(STAGING_PATH).mtime.toISOString(), stagingStat.mtime.toISOString());
    assert.equal(existsSync(`${ARCHIVE_PATH}-wal`), false);
    assert.equal(existsSync(`${ARCHIVE_PATH}-shm`), false);
    assert.equal(existsSync(`${STAGING_PATH}-wal`), true);
    assert.equal(existsSync(`${STAGING_PATH}-shm`), true);
    report.stages.finalProtection = {
      officialArchiveSha256Unchanged: true,
      manifestSha256Unchanged: true,
      stagingSha256Unchanged: true,
      archiveMainMtimeUnchanged: true,
      stagingMainMtimeUnchanged: true,
      archiveSidecars: { wal: false, shm: false },
      stagingSidecarsRetained: { wal: true, shm: true },
      stagingSidecarBytes: {
        wal: statSync(`${STAGING_PATH}-wal`).size,
        shm: statSync(`${STAGING_PATH}-shm`).size,
      },
    };
    report.stages.phase4MongoCleanup = {
      database: PHASE4_DATABASE,
      databaseExistedBeforeRun: phase4DatabaseExistedBeforeRun,
      databaseOwnedByPhase4: phase4DatabaseCreated,
      droppedAfterSuccessfulTest: false,
      pendingCleanupAfterVerification: phase4DatabaseCreated,
    };
    report.overallStatus = 'PASS_WITH_LIMITATIONS';
    report.cutoverEligible = false;
    report.productionCutover = false;
    phase4Succeeded = true;
  } catch (error) {
    logPhase4Progress(`failed at ${stage}`);
    report.failure = {
      stage,
      errorName: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : 'Unknown Phase 4 failure',
    };
    report.overallStatus = 'FAIL';
    process.exitCode = 1;
  } finally {
    try { await runtimeServer?.close(); } catch { /* Preserve the original phase result. */ }
    try { await sqliteReadRepository?.close(); } catch { /* Read-only close only. */ }
    try { await sqliteWriteRepository?.close(); } catch { /* This is the isolated Phase 4 copy. */ }
    if (phase4Succeeded && phase4DatabaseCreated) {
      let cleanupConnection: mongoose.Connection | undefined;
      try {
        // Runtime shutdown may disconnect every Mongoose connection. Reconnect only to loopback
        // for cleanup, and re-verify ownership and exact fixture contents before dropping the DB.
        cleanupConnection = mongoose.createConnection(LOCAL_MONGO_URI, { serverSelectionTimeoutMS: 4_000 });
        await cleanupConnection.asPromise();
        const cleanupDatabase = cleanupConnection.useDb(PHASE4_DATABASE, { useCache: true });
        assert.equal(cleanupDatabase.db?.databaseName, PHASE4_DATABASE, 'cleanup target must be the exact Phase 4 test database');
        const collectionNames = (await cleanupDatabase.db!.listCollections({}, { nameOnly: true }).toArray())
          .map((row) => row.name).sort();
        assert.deepEqual(collectionNames, [
          'advisorconversations', 'advisorfeedback', 'datasources', 'offers', 'pendingproducts',
          'products', 'productsearchvectors', 'searchfeedback', 'syncruns',
          'techapicatalogrecords', 'techapiimportcheckpoints',
        ], 'cleanup database must still contain only the isolated Phase 4 runtime collections');
        const catalogKeys = await cleanupDatabase.db!.collection('techapicatalogrecords')
          .find({}, { projection: { _id: 0, sourceKey: 1 } }).sort({ sourceKey: 1 }).toArray();
        assert.deepEqual(catalogKeys.map((row) => row.sourceKey), [CPP_FIXTURE_SOURCE_KEY, 'phase4:test:mongo-retry-record']);
        const checkpointKeys = await cleanupDatabase.db!.collection('techapiimportcheckpoints')
          .find({}, { projection: { _id: 0, fileKey: 1 } }).sort({ fileKey: 1 }).toArray();
        assert.deepEqual(checkpointKeys.map((row) => row.fileKey), [
          'phase4/fixture/cpp-development-tool.json', 'phase4/fixture/mongo-retry.json',
        ]);
        const runtimeProducts = await cleanupDatabase.db!.collection('products')
          .find({ dedupeKey: 'phase4-test:runtime-product' }, { projection: { _id: 1 } }).toArray();
        assert.equal(runtimeProducts.length, 1);
        assert.equal(await cleanupDatabase.db!.collection('products').countDocuments({}), 1);
        const runtimeOffers = await cleanupDatabase.db!.collection('offers')
          .find({ source: 'phase4_test', sellerName: 'Phase 4 isolated test seller' }, { projection: { productId: 1 } }).toArray();
        assert.equal(runtimeOffers.length, 1);
        assert.equal(runtimeOffers[0].productId.toString(), runtimeProducts[0]._id.toString());
        assert.equal(await cleanupDatabase.db!.collection('offers').countDocuments({}), 1);
        for (const collectionName of ['advisorconversations', 'advisorfeedback', 'datasources', 'pendingproducts', 'productsearchvectors', 'searchfeedback', 'syncruns']) {
          assert.equal(await cleanupDatabase.db!.collection(collectionName).countDocuments({}), 0, `cleanup collection ${collectionName} must remain empty`);
        }
        await cleanupDatabase.db!.dropDatabase();
        const remainingDatabaseNames = (await cleanupConnection.db!.admin().listDatabases({ nameOnly: true })).databases
          .map((database) => database.name);
        assert.equal(remainingDatabaseNames.includes(PHASE4_DATABASE), false, 'Phase 4 test database must be absent after cleanup');
        report.stages.phase4MongoCleanup.droppedAfterSuccessfulTest = true;
        report.stages.phase4MongoCleanup.pendingCleanupAfterVerification = false;
      } catch (error) {
        report.stages.phase4MongoCleanup.droppedAfterSuccessfulTest = false;
        report.stages.phase4MongoCleanup.cleanupError = error instanceof Error ? error.message : 'Unknown cleanup error';
        report.overallStatus = 'FAIL';
        report.failure = {
          stage: 'phase4_mongo_cleanup',
          errorName: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : 'Unknown Phase 4 cleanup failure',
        };
        process.exitCode = 1;
      } finally {
        try { await cleanupConnection?.close(); } catch { /* The test DB cleanup outcome is already recorded. */ }
      }
    }
    try { await rootConnection?.close(); } catch { /* Local test connection only. */ }
    if (dotenvDirectory) try { await rm(dotenvDirectory, { recursive: true, force: true }); } catch { /* Exact temp directory created by this run. */ }
    if (phase4Succeeded) {
      report.retainedArtifacts = [TEST_COPY_PATH, RESTORE_COPY_PATH, RUNTIME_COPY_PATH];
    }
    if (process.exitCode !== 1) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}

if (require.main === module) void run();
