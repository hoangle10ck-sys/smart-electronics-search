import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { Binary, Decimal128, Long, ObjectId } from 'bson';
import type { Document as MongoDocument } from 'mongodb';
import {
  AuditDeadline,
  FreshnessAuditError,
  hasNoWritersConfirmation,
  hashFileWithDeadline,
  openVerifiedArchive,
  readAuditUriFromEnvironment,
  runTechApiFreshnessAudit,
  validateTechApiAuditUri,
} from '../seed/auditTechApiSqliteFreshness';
import { serializeTechApiEjson } from '../repositories/sqliteTechApiRepository';
import { assessSqliteNotNullKeys, assessSqliteUniqueKeys } from '../seed/techApiSqliteArchiveVerification';

const ARCHIVE_PATH = 'D:\\SmartElectronicsData\\techapi_catalog.sqlite';
const MANIFEST_PATH = 'D:\\SmartElectronicsData\\techapi_catalog.manifest.json';
const TEST_URI = 'mongodb+srv://techapi_freshness_audit_ro:credential-sentinel@cluster0.wapbjwc.mongodb.net/?authSource=admin&tls=true';
const CATALOG_DDL = `CREATE TABLE techapi_catalog_records (
  mongo_id TEXT NOT NULL UNIQUE, source_key TEXT NOT NULL UNIQUE,
  source_category TEXT NOT NULL, source_slug TEXT NOT NULL, name TEXT NOT NULL, name_lower TEXT NOT NULL,
  source_record_url TEXT NOT NULL, source_list_url TEXT NOT NULL, data_attribution TEXT NOT NULL,
  data_source_url TEXT NOT NULL, data_license TEXT NOT NULL, data_license_url TEXT NOT NULL,
  license_terms_url TEXT NOT NULL, workflow_status TEXT NOT NULL CHECK(workflow_status = 'discovery_only'),
  document_ejson TEXT NOT NULL, search_text TEXT NOT NULL DEFAULT '', search_text_lower TEXT NOT NULL DEFAULT '',
  raw_manufacturer_lower TEXT, raw_manufacturer_name_lower TEXT, raw_brand_lower TEXT,
  raw_verified INTEGER NOT NULL DEFAULT 0 CHECK(raw_verified IN (0, 1)), details_fetched_at TEXT,
  details_sha256 TEXT, last_seen_at TEXT, created_at TEXT, updated_at TEXT,
  UNIQUE(source_category, source_slug)
) STRICT;`;
const CHECKPOINT_DDL = `CREATE TABLE techapi_import_checkpoints (
  mongo_id TEXT NOT NULL UNIQUE, file_key TEXT PRIMARY KEY, source_path TEXT NOT NULL,
  source_commit TEXT NOT NULL, sha256 TEXT NOT NULL, record_count INTEGER NOT NULL,
  imported_at TEXT NOT NULL, created_at TEXT, updated_at TEXT, document_ejson TEXT NOT NULL
) STRICT;`;

type Fixture = { directory: string; archivePath: string; manifestPath: string; catalog: Record<string, unknown>[]; checkpoints: Record<string, unknown>[] };

function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function digestDocuments(documents: Record<string, unknown>[], keyField: string): string {
  const hash = createHash('sha256');
  for (const document of [...documents].sort((left, right) => String(left[keyField]).localeCompare(String(right[keyField]), 'en')) ) {
    const payloadHash = createHash('sha256').update(serializeTechApiEjson(document), 'utf8').digest('hex');
    hash.update(`${JSON.stringify(document[keyField])}:${payloadHash}\n`, 'utf8');
  }
  return hash.digest('hex');
}

function makeCatalogDocument(key = 'catalog:one', overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date('2026-11-14T10:00:00.000Z');
  return {
    _id: new ObjectId('650000000000000000000001'),
    sourceKey: key,
    sourceCategory: 'gpu',
    sourceSlug: key.replace(':', '-'),
    name: 'Fixture GPU',
    sourceRecordUrl: 'https://catalog.invalid/item',
    sourceListUrl: 'https://catalog.invalid/list',
    dataAttribution: 'fixture',
    dataSourceUrl: 'https://catalog.invalid',
    dataLicense: 'test',
    dataLicenseUrl: 'https://catalog.invalid/license',
    licenseTermsUrl: 'https://catalog.invalid/terms',
    workflowStatus: 'discovery_only',
    raw: {
      model: 'Fixture GPU',
      observedAt: now,
      decimal: Decimal128.fromString('1234.500'),
      long: Long.fromString('9007199254740993'),
      binary: new Binary(Buffer.from([0, 1, 254, 255]), 0x80),
      ordered: ['first', 'second'],
    },
    searchText: 'Fixture GPU',
    detailsFetchedAt: null,
    detailsSha256: null,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeCheckpointDocument(key = 'file:one'): Record<string, unknown> {
  const now = new Date('2026-11-14T10:00:00.000Z');
  return {
    _id: new ObjectId('650000000000000000000002'),
    fileKey: key,
    sourcePath: 'fixture/catalog.json',
    sourceCommit: 'fixture-commit',
    sha256: 'a'.repeat(64),
    recordCount: 1,
    importedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function makeFixture(catalog = [makeCatalogDocument()], checkpoints = [makeCheckpointDocument()]): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'techapi-freshness-'));
  const archivePath = join(directory, 'techapi_catalog.sqlite');
  const manifestPath = join(directory, 'techapi_catalog.manifest.json');
  const database = new Database(archivePath);
  database.exec(`CREATE TABLE archive_schema_version(version INTEGER PRIMARY KEY CHECK(version > 0), applied_at TEXT NOT NULL) STRICT;
    INSERT INTO archive_schema_version(version, applied_at) VALUES (1, '2026-11-14T10:00:00.000Z');
    ${CATALOG_DDL}
    ${CHECKPOINT_DDL}`);
  const insertCatalog = database.prepare(`INSERT INTO techapi_catalog_records (
    mongo_id, source_key, source_category, source_slug, name, name_lower, source_record_url, source_list_url,
    data_attribution, data_source_url, data_license, data_license_url, license_terms_url, workflow_status,
    document_ejson, search_text, search_text_lower, raw_manufacturer_lower, raw_manufacturer_name_lower,
    raw_brand_lower, raw_verified, details_fetched_at, details_sha256, last_seen_at, created_at, updated_at
  ) VALUES (${new Array(26).fill('?').join(',')})`);
  for (const document of catalog) {
    const values = [
      serializeTechApiEjson(document._id), document.sourceKey, document.sourceCategory, document.sourceSlug,
      document.name, String(document.name).toLowerCase(), document.sourceRecordUrl, document.sourceListUrl,
      document.dataAttribution, document.dataSourceUrl, document.dataLicense, document.dataLicenseUrl,
      document.licenseTermsUrl, document.workflowStatus, serializeTechApiEjson(document), document.searchText ?? '',
      String(document.searchText ?? '').toLowerCase(), null, null, null, 0, null, null,
      new Date(document.lastSeenAt as Date).toISOString(), new Date(document.createdAt as Date).toISOString(),
      new Date(document.updatedAt as Date).toISOString(),
    ];
    insertCatalog.run(...values);
  }
  const insertCheckpoint = database.prepare(`INSERT INTO techapi_import_checkpoints (
    mongo_id, file_key, source_path, source_commit, sha256, record_count, imported_at, created_at, updated_at, document_ejson
  ) VALUES (${new Array(10).fill('?').join(',')})`);
  for (const document of checkpoints) {
    insertCheckpoint.run(
      serializeTechApiEjson(document._id), document.fileKey, document.sourcePath, document.sourceCommit,
      document.sha256, document.recordCount, new Date(document.importedAt as Date).toISOString(),
      new Date(document.createdAt as Date).toISOString(), new Date(document.updatedAt as Date).toISOString(),
      serializeTechApiEjson(document),
    );
  }

  const catalogUnique = assessSqliteUniqueKeys(database, 'techapi_catalog_records');
  const checkpointUnique = assessSqliteUniqueKeys(database, 'techapi_import_checkpoints');
  const catalogNotNull = assessSqliteNotNullKeys(database, 'techapi_catalog_records');
  const checkpointNotNull = assessSqliteNotNullKeys(database, 'techapi_import_checkpoints');
  const catalogChecksum = digestDocuments(catalog, 'sourceKey');
  const checkpointChecksum = digestDocuments(checkpoints, 'fileKey');
  const combinedChecksum = createHash('sha256').update(`${catalogChecksum}\n${checkpointChecksum}\n`, 'utf8').digest('hex');
  database.close();

  writeFileSync(manifestPath, JSON.stringify({
    archiveName: 'techapi_catalog.sqlite',
    schemaVersion: 1,
    tableCounts: { catalog: catalog.length, checkpoints: checkpoints.length, total: catalog.length + checkpoints.length },
    archivePayloadChecksums: { catalog: catalogChecksum, checkpoints: checkpointChecksum, combined: combinedChecksum },
    archiveFileSha256: hashFile(archivePath),
    archiveFileSizeBytes: readFileSync(archivePath).byteLength,
    integrityCheck: 'ok',
    uniqueIndexVerification: { catalog: catalogUnique.checks, checkpoints: checkpointUnique.checks },
    notNullVerification: { catalog: catalogNotNull.checks, checkpoints: checkpointNotNull.checks },
  }));
  return { directory, archivePath, manifestPath, catalog, checkpoints };
}

type FakeHooks = {
  delayMs?: number;
  afterYield?: (collectionName: string, pass: number, index: number) => void;
  connectError?: Error;
  hasNextError?: { collectionName: string; error: Error };
  nextError?: { collectionName: string; error: Error };
  cursorCloseFails?: boolean;
  clientCloseFails?: boolean;
};

function fakeClient(
  catalogProvider: (pass: number) => Record<string, unknown>[],
  checkpointProvider: (pass: number) => Record<string, unknown>[] = () => [makeCheckpointDocument()],
  onScope?: (databaseName: string, collectionName: string, options: Record<string, unknown>) => void,
  hooks: FakeHooks = {},
) {
  let databaseName = '';
  const calls = new Map<string, number>();
  let closed = false;
  let closedCursors = 0;
  let activeIterators = 0;
  const client = {
    async connect() {
      if (hooks.connectError) throw hooks.connectError;
      return undefined;
    },
    db(name: string, options?: Record<string, unknown>) {
      databaseName = name;
      assert.deepEqual(options, { readConcern: { level: 'majority' } });
      return {
        collection(collectionName: string) {
          return {
            find(filter: Record<string, unknown>, findOptions: Record<string, unknown>) {
              assert.ok(['techapicatalogrecords', 'techapiimportcheckpoints'].includes(collectionName));
              assert.deepEqual(filter, {});
              const expected = collectionName === 'techapicatalogrecords' ? 'sourceKey' : 'fileKey';
              assert.deepEqual(findOptions.sort, { [expected]: 1, _id: 1 });
              assert.deepEqual(findOptions.collation, { locale: 'simple' });
              assert.ok(findOptions.signal instanceof AbortSignal);
              onScope?.(databaseName, collectionName, findOptions);
              const pass = (calls.get(collectionName) ?? 0) + 1;
              calls.set(collectionName, pass);
              const documents = (collectionName === 'techapicatalogrecords'
                ? catalogProvider(pass)
                : checkpointProvider(pass))
                .sort((left, right) => String(left[expected]).localeCompare(String(right[expected]))
                  || String(left._id).localeCompare(String(right._id))) as unknown as MongoDocument[];
              let index = 0;
              let cursorClosed = false;
              activeIterators += 1;

              const delayForSignal = async () => {
                if (!hooks.delayMs) return;
                await new Promise<void>((resolve, reject) => {
                  const signal = findOptions.signal as AbortSignal;
                  const timer = setTimeout(() => {
                    signal.removeEventListener('abort', onAbort);
                    resolve();
                  }, hooks.delayMs);
                  const onAbort = () => {
                    clearTimeout(timer);
                    signal.removeEventListener('abort', onAbort);
                    reject(new Error('fake cursor aborted with credential-sentinel and payload-sentinel'));
                  };
                  signal.addEventListener('abort', onAbort, { once: true });
                  if (signal.aborted) onAbort();
                });
              };

              return {
                async hasNext() {
                  await delayForSignal();
                  if (hooks.hasNextError?.collectionName === collectionName) throw hooks.hasNextError.error;
                  return index < documents.length;
                },
                async next() {
                  await delayForSignal();
                  if (hooks.nextError?.collectionName === collectionName) throw hooks.nextError.error;
                  const document = documents[index];
                  if (document) {
                    hooks.afterYield?.(collectionName, pass, index);
                    index += 1;
                  }
                  return document ?? null;
                },
                async close() {
                  closedCursors += 1;
                  if (!cursorClosed) {
                    cursorClosed = true;
                    activeIterators -= 1;
                  }
                  if (hooks.cursorCloseFails) throw new Error('fake cursor close failed');
                },
              };
            },
          };
        },
      };
    },
    async close() {
      closed = true;
      if (hooks.clientCloseFails) throw new Error('remote credential-sentinel client close failed');
    },
  };
  return { client, calls, wasClosed: () => closed, closedCursors: () => closedCursors, activeIterators: () => activeIterators };
}

async function runFixtureAudit(
  fixture: Fixture,
  catalogProvider: (pass: number) => Record<string, unknown>[],
  onScope?: (databaseName: string, collectionName: string, options: Record<string, unknown>) => void,
  checkpointProvider: (pass: number) => Record<string, unknown>[] = () => fixture.checkpoints,
  hooks: FakeHooks = {},
  auditOptions: {
    timeoutMs?: number;
    deadlineFactory?: (timeoutMs: number) => AuditDeadline;
    fingerprintHashFactory?: () => ReturnType<typeof createHash>;
  } = {},
) {
  const mock = fakeClient(catalogProvider, checkpointProvider, onScope, hooks);
  const report = await runTechApiFreshnessAudit({
    uri: TEST_URI,
    archivePath: fixture.archivePath,
    manifestPath: fixture.manifestPath,
    confirmNoWriters: true,
    clientFactory: () => mock.client,
    ...auditOptions,
  });
  return { report, mock };
}

function syntheticMongoError(
  name: string,
  message = 'synthetic password-sentinel URI-sentinel payload-sentinel',
  properties: Record<string, unknown> = {},
): Error {
  const error = new Error(message);
  Object.defineProperty(error, 'cause', {
    value: new Error('nested cause password-sentinel URI-sentinel'),
    configurable: true,
  });
  error.name = name;
  Object.assign(error, properties);
  return error;
}

function thrownAuditError(error: unknown): FreshnessAuditError {
  assert.ok(error instanceof FreshnessAuditError);
  return error;
}

function assertSafeDiagnosticSerialization(error: FreshnessAuditError): void {
  const serialized = JSON.stringify({
    status: error.status,
    message: error.message,
    diagnostic: error.diagnostic,
    cleanupDiagnostics: error.cleanupDiagnostics,
  });
  for (const secret of ['password-sentinel', 'URI-sentinel', 'payload-sentinel', TEST_URI, ATLAS_USERNAME_FOR_TEST]) {
    assert.equal(serialized.includes(secret), false, `Diagnostic output leaked ${secret}`);
  }
  assert.equal(serialized.includes('synthetic '), false);
  assert.equal(serialized.includes('nested cause'), false);
}

test('requires only the dedicated URI and never falls back to generic Mongo URI names', () => {
  assert.equal(readAuditUriFromEnvironment({ MONGODB_URI: 'do-not-use' } as NodeJS.ProcessEnv), undefined);
  assert.equal(readAuditUriFromEnvironment({ MONGO_URI: 'do-not-use' } as NodeJS.ProcessEnv), undefined);
  assert.equal(readAuditUriFromEnvironment({ TECHAPI_SOURCE_READONLY_URI: TEST_URI } as NodeJS.ProcessEnv), TEST_URI);
  assert.equal(hasNoWritersConfirmation(['node', 'runner.js']), false);
  assert.equal(hasNoWritersConfirmation(['node', 'runner.js', '--confirm-no-writers']), true);
});

test('validates Atlas hostname, audit identity, URI syntax, and verified TLS requirements without echoing credentials', () => {
  assert.equal(validateTechApiAuditUri(TEST_URI), true);
  const cases = [
    undefined,
    'not a uri credential-sentinel',
    'mongodb+srv://wrong:credential-sentinel@cluster0.wapbjwc.mongodb.net/?tls=true',
    'mongodb+srv://techapi_freshness_audit_ro:credential-sentinel@wrong.example/?tls=true',
    'mongodb+srv://techapi_freshness_audit_ro:credential-sentinel@cluster0.wapbjwc.mongodb.net/?tls=false',
    'mongodb+srv://techapi_freshness_audit_ro:credential-sentinel@cluster0.wapbjwc.mongodb.net/?tlsInsecure=true',
    'mongodb+srv://techapi_freshness_audit_ro:credential-sentinel@cluster0.wapbjwc.mongodb.net/?tlsAllowInvalidCertificates=true',
    'mongodb+srv://techapi_freshness_audit_ro:credential-sentinel@cluster0.wapbjwc.mongodb.net/?tlsAllowInvalidHostnames=true',
    'mongodb+srv://techapi_freshness_audit_ro:credential-sentinel@cluster0.wapbjwc.mongodb.net/?sslValidate=false',
    'mongodb+srv://techapi_freshness_audit_ro:credential-sentinel@cluster0.wapbjwc.mongodb.net/?ssl=false',
    'mongodb+srv://techapi_freshness_audit_ro:@cluster0.wapbjwc.mongodb.net/?tls=true',
    'mongodb+srv://techapi_freshness_audit_ro:credential-sentinel@cluster0.wapbjwc.mongodb.net/other_database?tls=true',
    'mongodb://techapi_freshness_audit_ro:credential-sentinel@cluster0.wapbjwc.mongodb.net/?tls=true',
  ];
  for (const value of cases) {
    assert.throws(() => validateTechApiAuditUri(value), (error: unknown) => {
      assert.ok(error instanceof FreshnessAuditError);
      assert.equal(error.status, 'BLOCKED');
      assert.equal(error.message.includes('credential-sentinel'), false);
      assert.equal(error.message.includes(ATLAS_USERNAME_FOR_TEST), false);
      return true;
    });
  }
});

const ATLAS_USERNAME_FOR_TEST = 'techapi_freshness_audit_ro';

test('compares exact database and collection allowlist with read concern and primary fingerprints', async (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  const scopes: string[] = [];
  const before = hashFile(fixture.archivePath);
  const { report, mock } = await runFixtureAudit(fixture, () => fixture.catalog, (databaseName, collectionName) => {
    scopes.push(`${databaseName}/${collectionName}`);
  });
  assert.equal(report.status, 'PASS');
  assert.equal(report.operatorConfirmedNoWriters, true);
  assert.deepEqual([...new Set(scopes)].sort(), [
    'smart_electronics/techapicatalogrecords',
    'smart_electronics/techapiimportcheckpoints',
  ]);
  assert.equal(scopes.length, 6);
  assert.equal(report.sourceRead.server, 'Atlas primary');
  assert.equal(report.sourceRead.readConcern, 'majority');
  assert.equal(report.sourceRead.snapshotClaimed, false);
  assert.equal(JSON.stringify(report).includes('credential-sentinel'), false);
  assert.equal(JSON.stringify(report).includes(TEST_URI), false);
  assert.equal(JSON.stringify(report).includes(ATLAS_USERNAME_FOR_TEST), false);
  assert.equal(report.comparisons.techapicatalogrecords.atlasFreshness.lastSeenAt, '2026-11-14T10:00:00.000Z');
  assert.equal(report.comparisons.techapicatalogrecords.archiveFreshness.lastSeenAt, '2026-11-14T10:00:00.000Z');
  assert.equal(report.comparisons.techapiimportcheckpoints.atlasFreshness.importedAt, '2026-11-14T10:00:00.000Z');
  assert.equal(report.comparisons.techapiimportcheckpoints.archiveFreshness.importedAt, '2026-11-14T10:00:00.000Z');
  assert.equal(mock.wasClosed(), true);
  assert.equal(hashFile(fixture.archivePath), before);
});

test('classifies Atlas-only additions, archive-only records, and same-key payload updates', async (context) => {
  const additionFixture = makeFixture();
  context.after(() => rmSync(additionFixture.directory, { recursive: true, force: true }));
  const addition = makeCatalogDocument('catalog:two', { _id: new ObjectId('650000000000000000000003'), sourceSlug: 'catalog-two' });
  const added = await runFixtureAudit(additionFixture, () => [...additionFixture.catalog, addition]);
  assert.equal(added.report.status, 'PASS_WITH_ADDITIONS');
  assert.equal(added.report.comparisons.techapicatalogrecords.atlasOnly, 1);

  const updateFixture = makeFixture();
  context.after(() => rmSync(updateFixture.directory, { recursive: true, force: true }));
  const updatedDocument = makeCatalogDocument('catalog:one', { name: 'Updated Fixture GPU' });
  const updated = await runFixtureAudit(updateFixture, () => [updatedDocument]);
  assert.equal(updated.report.status, 'PASS_WITH_UPDATES');
  assert.equal(updated.report.comparisons.techapicatalogrecords.payloadMismatch, 1);

  const missingFixture = makeFixture([makeCatalogDocument(), makeCatalogDocument('catalog:two', { _id: new ObjectId('650000000000000000000003'), sourceSlug: 'catalog-two' })]);
  context.after(() => rmSync(missingFixture.directory, { recursive: true, force: true }));
  const missing = await runFixtureAudit(missingFixture, () => missingFixture.catalog.slice(0, 1));
  assert.equal(missing.report.comparisons.techapicatalogrecords.archiveOnly, 1);
  assert.equal(missing.report.status, 'FAIL');

  const idMismatchFixture = makeFixture();
  context.after(() => rmSync(idMismatchFixture.directory, { recursive: true, force: true }));
  const differentId = makeCatalogDocument('catalog:one', { _id: new ObjectId('650000000000000000000004') });
  const idMismatch = await runFixtureAudit(idMismatchFixture, () => [differentId]);
  assert.equal(idMismatch.report.status, 'FAIL');
  assert.equal(idMismatch.report.comparisons.techapicatalogrecords.mongoIdMismatch, 1);
});

test('marks a catalog mutation during the final checkpoint fingerprint scan inconsistent', async (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  let catalogChangedDuringCheckpointTail = false;
  const changed = makeCatalogDocument('catalog:one', { updatedAt: new Date('2026-11-15T10:00:00.000Z') });
  const { report } = await runFixtureAudit(
    fixture,
    (pass) => pass >= 3 && catalogChangedDuringCheckpointTail ? [changed] : fixture.catalog,
    undefined,
    () => fixture.checkpoints,
    {
      afterYield(collectionName, pass) {
        if (collectionName === 'techapiimportcheckpoints' && pass === 3) catalogChangedDuringCheckpointTail = true;
      },
    },
  );
  assert.equal(report.status, 'INCONSISTENT_SOURCE');
  assert.equal(report.sourceRead.stableAcrossObservedScans, false);
  assert.equal(report.sourceRead.snapshotClaimed, false);
  assert.equal(catalogChangedDuringCheckpointTail, true);
});

test('marks a checkpoint mutation between fingerprint scans inconsistent', async (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  const changed = { ...fixture.checkpoints[0], sha256: 'b'.repeat(64), updatedAt: new Date('2026-11-15T10:00:00.000Z') };
  const { report } = await runFixtureAudit(
    fixture,
    () => fixture.catalog,
    undefined,
    (pass) => pass >= 2 ? [changed] : fixture.checkpoints,
  );
  assert.equal(report.status, 'INCONSISTENT_SOURCE');
  assert.equal(report.sourceRead.stableAcrossObservedScans, false);
});

test('distinguishes valid, empty, null, and missing identifiers in both source collections', async (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.directory, { recursive: true, force: true }));

  const catalogMissing = makeCatalogDocument('ignored', { _id: new ObjectId('650000000000000000000011') });
  delete catalogMissing.sourceKey;
  const catalogNull = makeCatalogDocument('ignored', { _id: new ObjectId('650000000000000000000012'), sourceKey: null });
  const catalogEmpty = makeCatalogDocument('', { _id: new ObjectId('650000000000000000000013') });
  const checkpointMissing = makeCheckpointDocument('ignored') as Record<string, unknown>;
  checkpointMissing._id = new ObjectId('650000000000000000000021');
  delete checkpointMissing.fileKey;
  const checkpointNull = { ...makeCheckpointDocument('ignored'), _id: new ObjectId('650000000000000000000022'), fileKey: null };
  const checkpointEmpty = { ...makeCheckpointDocument(''), _id: new ObjectId('650000000000000000000023') };

  const { report } = await runFixtureAudit(
    fixture,
    () => [...fixture.catalog, catalogMissing, catalogNull, catalogEmpty],
    undefined,
    () => [...fixture.checkpoints, checkpointMissing, checkpointNull, checkpointEmpty],
  );

  assert.equal(report.status, 'FAIL');
  assert.equal(report.sourceRead.stableAcrossObservedScans, true);
  assert.equal(report.comparisons.techapicatalogrecords.invalidAtlasIdentifiers, 3);
  assert.equal(report.comparisons.techapiimportcheckpoints.invalidAtlasIdentifiers, 3);
  assert.equal(report.comparisons.techapicatalogrecords.matched, 1);
  assert.equal(report.comparisons.techapiimportcheckpoints.matched, 1);
  assert.deepEqual(report.comparisons.techapicatalogrecords.samples.invalidIdentifiers.map((sample) => sample.reason).sort(), ['empty', 'missing', 'null']);
  assert.deepEqual(report.comparisons.techapiimportcheckpoints.samples.invalidIdentifiers.map((sample) => sample.reason).sort(), ['empty', 'missing', 'null']);
  assert.equal(new Set(report.comparisons.techapicatalogrecords.samples.invalidIdentifiers.map((sample) => sample.identifierSha256)).size, 3);
});

test('fails and fingerprints duplicate valid Atlas identifiers without syncing them', async (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  const duplicate = makeCatalogDocument('catalog:one', { _id: new ObjectId('650000000000000000000014') });
  const { report } = await runFixtureAudit(fixture, () => [...fixture.catalog, duplicate]);
  const comparison = report.comparisons.techapicatalogrecords;
  assert.equal(report.status, 'FAIL');
  assert.equal(comparison.duplicateAtlasKeys, 1);
  assert.equal(comparison.samples.duplicateKeys.length, 1);
  assert.equal(comparison.archiveOnly, 0);
  assert.equal(comparison.atlasOnly, 0);
});

test('keeps Extended JSON BSON types and array order significant during comparison', async (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  const identical = await runFixtureAudit(fixture, () => fixture.catalog);
  assert.equal(identical.report.status, 'PASS');

  const reordered = makeCatalogDocument('catalog:one', {
    raw: {
      model: 'Fixture GPU',
      observedAt: new Date('2026-11-14T10:00:00.000Z'),
      decimal: Decimal128.fromString('1234.500'),
      long: Long.fromString('9007199254740993'),
      binary: new Binary(Buffer.from([0, 1, 254, 255]), 0x80),
      ordered: ['second', 'first'],
    },
  });
  const changed = await runFixtureAudit(fixture, () => [reordered]);
  assert.equal(changed.report.status, 'PASS_WITH_UPDATES');
  assert.equal(changed.report.comparisons.techapicatalogrecords.payloadMismatch, 1);
});

test('refuses to start without operator writer confirmation and does not leak credentials on remote errors', async (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  let factoryCalls = 0;
  const nonexistentArchivePath = join(fixture.directory, 'must-not-open.sqlite');
  const nonexistentManifestPath = join(fixture.directory, 'must-not-open.manifest.json');
  await assert.rejects(() => runTechApiFreshnessAudit({
    uri: TEST_URI,
    archivePath: nonexistentArchivePath,
    manifestPath: nonexistentManifestPath,
    confirmNoWriters: false,
    clientFactory: () => {
      factoryCalls += 1;
      return fakeClient(() => fixture.catalog).client;
    },
  }), (error: unknown) => error instanceof FreshnessAuditError
    && error.status === 'BLOCKED' && error.message.includes('Confirm that no TechAPI importer'));
  assert.equal(factoryCalls, 0);
  assert.equal(existsSync(nonexistentArchivePath), false);
  assert.equal(existsSync(nonexistentManifestPath), false);

  await assert.rejects(() => runTechApiFreshnessAudit({
    uri: 'mongodb+srv://wrong:credential-sentinel@wrong.example/?tls=true',
    archivePath: nonexistentArchivePath,
    manifestPath: nonexistentManifestPath,
    confirmNoWriters: true,
  }), (error: unknown) => error instanceof FreshnessAuditError && error.status === 'BLOCKED');

  const mock = fakeClient(() => fixture.catalog);
  mock.client.connect = async () => { throw new Error(`remote credential-sentinel ${TEST_URI}`); };
  await assert.rejects(() => runTechApiFreshnessAudit({
    uri: TEST_URI,
    archivePath: fixture.archivePath,
    manifestPath: fixture.manifestPath,
    confirmNoWriters: true,
    clientFactory: () => mock.client,
  }), (error: unknown) => {
    assert.ok(error instanceof FreshnessAuditError);
    assert.equal(error.message.includes('credential-sentinel'), false);
    assert.equal(error.message.includes(TEST_URI), false);
    return true;
  });
  assert.equal(mock.wasClosed(), true);
});

test('reports safe connection diagnostics when client.connect fails', async (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  const mock = fakeClient(() => fixture.catalog, () => fixture.checkpoints, undefined, {
    connectError: syntheticMongoError('MongoServerError', 'password-sentinel URI-sentinel payload-sentinel', {
      code: 13,
      codeName: 'Unauthorized',
      errorLabels: ['RetryableReadError', 'password-sentinel'],
    }),
  });
  await assert.rejects(() => runTechApiFreshnessAudit({
    uri: TEST_URI,
    archivePath: fixture.archivePath,
    manifestPath: fixture.manifestPath,
    confirmNoWriters: true,
    clientFactory: () => mock.client,
  }), (error: unknown) => {
    const auditError = thrownAuditError(error);
    assert.equal(auditError.status, 'BLOCKED');
    assert.deepEqual(auditError.diagnostic, {
      phase: 'mongo_connect',
      classification: 'unauthorized',
      errorName: 'MongoServerError',
      code: 13,
      codeName: 'Unauthorized',
      errorLabels: ['RetryableReadError'],
      deadlineExceeded: false,
      aborted: false,
    });
    assertSafeDiagnosticSerialization(auditError);
    return true;
  });
  assert.equal(mock.wasClosed(), true);
});

test('separates cursor.hasNext and cursor.next failures and reports only allowlisted collection names', async (context) => {
  const hasNextFixture = makeFixture();
  const nextFixture = makeFixture();
  context.after(() => {
    rmSync(hasNextFixture.directory, { recursive: true, force: true });
    rmSync(nextFixture.directory, { recursive: true, force: true });
  });

  const hasNextMock = fakeClient(() => hasNextFixture.catalog, () => hasNextFixture.checkpoints, undefined, {
    hasNextError: {
      collectionName: 'techapicatalogrecords',
      error: syntheticMongoError('MongoServerSelectionError'),
    },
  });
  await assert.rejects(() => runTechApiFreshnessAudit({
    uri: TEST_URI,
    archivePath: hasNextFixture.archivePath,
    manifestPath: hasNextFixture.manifestPath,
    confirmNoWriters: true,
    clientFactory: () => hasNextMock.client,
  }), (error: unknown) => {
    const diagnostic = thrownAuditError(error).diagnostic;
    assert.equal(diagnostic?.phase, 'cursor_has_next');
    assert.equal(diagnostic?.collection, 'techapicatalogrecords');
    assert.equal(diagnostic?.classification, 'server_selection');
    return true;
  });

  const nextMock = fakeClient(() => nextFixture.catalog, () => nextFixture.checkpoints, undefined, {
    nextError: {
      collectionName: 'techapiimportcheckpoints',
      error: syntheticMongoError('MongoNetworkError'),
    },
  });
  await assert.rejects(() => runTechApiFreshnessAudit({
    uri: TEST_URI,
    archivePath: nextFixture.archivePath,
    manifestPath: nextFixture.manifestPath,
    confirmNoWriters: true,
    clientFactory: () => nextMock.client,
  }), (error: unknown) => {
    const auditError = thrownAuditError(error);
    assert.equal(auditError.diagnostic?.phase, 'cursor_next');
    assert.equal(auditError.diagnostic?.collection, 'techapiimportcheckpoints');
    assert.equal(auditError.diagnostic?.classification, 'network');
    assertSafeDiagnosticSerialization(auditError);
    return true;
  });
});

test('classifies authentication, network timeout, and mismatched codeName without guessing', async (context) => {
  const authenticationFixture = makeFixture();
  const timeoutFixture = makeFixture();
  const mismatchFixture = makeFixture();
  const sanitizedFixture = makeFixture();
  context.after(() => {
    rmSync(authenticationFixture.directory, { recursive: true, force: true });
    rmSync(timeoutFixture.directory, { recursive: true, force: true });
    rmSync(mismatchFixture.directory, { recursive: true, force: true });
    rmSync(sanitizedFixture.directory, { recursive: true, force: true });
  });

  const authenticationMock = fakeClient(() => authenticationFixture.catalog, () => authenticationFixture.checkpoints, undefined, {
    connectError: syntheticMongoError('MongoServerError', 'auth secret password-sentinel', {
      code: 18,
      codeName: 'AuthenticationFailed',
    }),
  });
  await assert.rejects(() => runTechApiFreshnessAudit({
    uri: TEST_URI,
    archivePath: authenticationFixture.archivePath,
    manifestPath: authenticationFixture.manifestPath,
    confirmNoWriters: true,
    clientFactory: () => authenticationMock.client,
  }), (error: unknown) => {
    const diagnostic = thrownAuditError(error).diagnostic;
    assert.equal(diagnostic?.classification, 'authentication_failed');
    assert.equal(diagnostic?.code, 18);
    return true;
  });

  const timeoutMock = fakeClient(() => timeoutFixture.catalog, () => timeoutFixture.checkpoints, undefined, {
    hasNextError: {
      collectionName: 'techapicatalogrecords',
      error: syntheticMongoError('MongoNetworkTimeoutError'),
    },
  });
  await assert.rejects(() => runTechApiFreshnessAudit({
    uri: TEST_URI,
    archivePath: timeoutFixture.archivePath,
    manifestPath: timeoutFixture.manifestPath,
    confirmNoWriters: true,
    clientFactory: () => timeoutMock.client,
  }), (error: unknown) => {
    assert.equal(thrownAuditError(error).diagnostic?.classification, 'timeout');
    return true;
  });

  const mismatchMock = fakeClient(() => mismatchFixture.catalog, () => mismatchFixture.checkpoints, undefined, {
    hasNextError: {
      collectionName: 'techapicatalogrecords',
      error: syntheticMongoError('MongoServerError', 'hidden secret', { code: 13, codeName: 'AuthenticationFailed' }),
    },
  });
  await assert.rejects(() => runTechApiFreshnessAudit({
    uri: TEST_URI,
    archivePath: mismatchFixture.archivePath,
    manifestPath: mismatchFixture.manifestPath,
    confirmNoWriters: true,
    clientFactory: () => mismatchMock.client,
  }), (error: unknown) => {
    const diagnostic = thrownAuditError(error).diagnostic;
    assert.equal(diagnostic?.classification, 'unknown');
    assert.equal(diagnostic?.code, 13);
    assert.equal(diagnostic?.codeName, 'AuthenticationFailed');
    return true;
  });

  const sanitizedMock = fakeClient(() => sanitizedFixture.catalog, () => sanitizedFixture.checkpoints, undefined, {
    hasNextError: {
      collectionName: 'techapicatalogrecords',
      error: syntheticMongoError('password-sentinel-name-too-long', 'secret in error fields', {
        code: '13',
        codeName: 'Unauthorized password-sentinel',
        errorLabels: ['password-sentinel', 'Unauthorized'],
      }),
    },
  });
  await assert.rejects(() => runTechApiFreshnessAudit({
    uri: TEST_URI,
    archivePath: sanitizedFixture.archivePath,
    manifestPath: sanitizedFixture.manifestPath,
    confirmNoWriters: true,
    clientFactory: () => sanitizedMock.client,
  }), (error: unknown) => {
    const auditError = thrownAuditError(error);
    assert.equal(auditError.diagnostic?.errorName, 'OtherError');
    assert.equal(auditError.diagnostic?.code, undefined);
    assert.equal(auditError.diagnostic?.codeName, undefined);
    assert.deepEqual(auditError.diagnostic?.errorLabels, []);
    assert.equal(auditError.diagnostic?.classification, 'cursor_read');
    assertSafeDiagnosticSerialization(auditError);
    return true;
  });
});

test('identifies identifier and document canonicalization failures without logging payloads', async (context) => {
  const identifierFixture = makeFixture();
  const documentFixture = makeFixture();
  context.after(() => {
    rmSync(identifierFixture.directory, { recursive: true, force: true });
    rmSync(documentFixture.directory, { recursive: true, force: true });
  });

  const cyclicIdentifier: Record<string, unknown> = {};
  cyclicIdentifier.self = cyclicIdentifier;
  const identifierMock = fakeClient(
    () => [makeCatalogDocument('ignored', { sourceKey: cyclicIdentifier })],
    () => identifierFixture.checkpoints,
  );
  await assert.rejects(() => runTechApiFreshnessAudit({
    uri: TEST_URI,
    archivePath: identifierFixture.archivePath,
    manifestPath: identifierFixture.manifestPath,
    confirmNoWriters: true,
    clientFactory: () => identifierMock.client,
  }), (error: unknown) => {
    const auditError = thrownAuditError(error);
    assert.equal(auditError.diagnostic?.phase, 'canonicalize_identifier');
    assert.equal(auditError.diagnostic?.classification, 'bson_canonicalization');
    assertSafeDiagnosticSerialization(auditError);
    return true;
  });

  const cyclicRaw: Record<string, unknown> = { field: 'payload-sentinel' };
  cyclicRaw.self = cyclicRaw;
  const documentMock = fakeClient(
    () => [makeCatalogDocument('catalog:one', { raw: cyclicRaw })],
    () => documentFixture.checkpoints,
  );
  await assert.rejects(() => runTechApiFreshnessAudit({
    uri: TEST_URI,
    archivePath: documentFixture.archivePath,
    manifestPath: documentFixture.manifestPath,
    confirmNoWriters: true,
    clientFactory: () => documentMock.client,
  }), (error: unknown) => {
    const auditError = thrownAuditError(error);
    assert.equal(auditError.diagnostic?.phase, 'canonicalize_document');
    assert.equal(auditError.diagnostic?.classification, 'bson_canonicalization');
    assertSafeDiagnosticSerialization(auditError);
    return true;
  });
});

test('captures fingerprint update failures and retains the primary error when cursor cleanup also fails', async (context) => {
  const fingerprintFixture = makeFixture();
  const cleanupFixture = makeFixture();
  context.after(() => {
    rmSync(fingerprintFixture.directory, { recursive: true, force: true });
    rmSync(cleanupFixture.directory, { recursive: true, force: true });
  });

  const failingHash = {
    update() { throw syntheticMongoError('Error', 'hash password-sentinel URI-sentinel payload-sentinel'); },
    digest() { return '0'.repeat(64); },
  } as unknown as ReturnType<typeof createHash>;
  const fingerprintMock = fakeClient(() => fingerprintFixture.catalog, () => fingerprintFixture.checkpoints);
  await assert.rejects(() => runTechApiFreshnessAudit({
    uri: TEST_URI,
    archivePath: fingerprintFixture.archivePath,
    manifestPath: fingerprintFixture.manifestPath,
    confirmNoWriters: true,
    clientFactory: () => fingerprintMock.client,
    fingerprintHashFactory: () => failingHash,
  }), (error: unknown) => {
    const auditError = thrownAuditError(error);
    assert.equal(auditError.diagnostic?.phase, 'fingerprint_update');
    assert.equal(auditError.diagnostic?.classification, 'unknown');
    assertSafeDiagnosticSerialization(auditError);
    return true;
  });

  const cleanupMock = fakeClient(() => cleanupFixture.catalog, () => cleanupFixture.checkpoints, undefined, {
    nextError: {
      collectionName: 'techapicatalogrecords',
      error: syntheticMongoError('MongoNetworkError', 'root password-sentinel', { code: 91, codeName: 'ShutdownInProgress' }),
    },
    cursorCloseFails: true,
  });
  await assert.rejects(() => runTechApiFreshnessAudit({
    uri: TEST_URI,
    archivePath: cleanupFixture.archivePath,
    manifestPath: cleanupFixture.manifestPath,
    confirmNoWriters: true,
    clientFactory: () => cleanupMock.client,
  }), (error: unknown) => {
    const auditError = thrownAuditError(error);
    assert.equal(auditError.status, 'BLOCKED');
    assert.equal(auditError.diagnostic?.phase, 'cursor_next');
    assert.equal(auditError.diagnostic?.classification, 'network');
    assert.equal(auditError.cleanupDiagnostics[0]?.phase, 'cursor_close');
    assert.equal(auditError.cleanupDiagnostics[0]?.classification, 'cursor_read');
    assertSafeDiagnosticSerialization(auditError);
    return true;
  });
  assert.equal(cleanupMock.closedCursors(), 1);
});

test('aborts a delayed Atlas cursor on deadline, closes cursor and client, then waits for iterator completion', async (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  const mock = fakeClient(() => fixture.catalog, () => fixture.checkpoints, undefined, { delayMs: 10_000 });
  await assert.rejects(() => runTechApiFreshnessAudit({
    uri: TEST_URI,
    archivePath: fixture.archivePath,
    manifestPath: fixture.manifestPath,
    confirmNoWriters: true,
    timeoutMs: 1_000,
    clientFactory: () => mock.client,
  }), (error: unknown) => {
    const auditError = thrownAuditError(error);
    assert.equal(auditError.status, 'BLOCKED');
    assert.equal(auditError.diagnostic?.phase, 'cursor_has_next');
    assert.equal(auditError.diagnostic?.deadlineExceeded, true);
    assert.equal(auditError.diagnostic?.aborted, true);
    assert.equal(auditError.diagnostic?.classification, 'timeout');
    assertSafeDiagnosticSerialization(auditError);
    return true;
  });
  assert.equal(mock.wasClosed(), true);
  assert.ok(mock.closedCursors() >= 1);
  assert.equal(mock.activeIterators(), 0);
});

test('deadline is checked inside SQLite payload iteration and file hashing', async (context) => {
  const fixture = makeFixture();
  const hashDirectory = mkdtempSync(join(tmpdir(), 'techapi-hash-deadline-'));
  const hashPath = join(hashDirectory, 'large-fixture.bin');
  writeFileSync(hashPath, Buffer.alloc(128 * 1024, 7));
  context.after(() => {
    rmSync(fixture.directory, { recursive: true, force: true });
    rmSync(hashDirectory, { recursive: true, force: true });
  });

  let fileClock = 0;
  let fileDeadline!: AuditDeadline;
  fileDeadline = new AuditDeadline(10, () => fileClock, (stage) => {
    if (stage === 'archive.sha256.chunk') fileClock = fileDeadline.expiresAt;
  });
  await assert.rejects(() => hashFileWithDeadline(hashPath, fileDeadline), (error: unknown) =>
    error instanceof FreshnessAuditError && error.status === 'BLOCKED' && error.message.includes('deadline'));
  assert.equal(hashFile(hashPath).length, 64, 'The interrupted stream must be closed and leave its source readable.');

  const before = hashFile(fixture.archivePath);
  let sqliteClock = 0;
  let sqliteDeadline!: AuditDeadline;
  sqliteDeadline = new AuditDeadline(10, () => sqliteClock, (stage) => {
    if (stage === 'sqlite.payload.techapi_catalog_records.row') sqliteClock = sqliteDeadline.expiresAt;
  });
  await assert.rejects(() => openVerifiedArchive(fixture.archivePath, fixture.manifestPath, sqliteDeadline), (error: unknown) =>
    error instanceof FreshnessAuditError && error.status === 'BLOCKED' && error.message.includes('deadline'));
  assert.equal(hashFile(fixture.archivePath), before);
});

test('cleanup failures are BLOCKED and never suppressed into a successful report', async (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.directory, { recursive: true, force: true }));

  for (const hooks of [{ cursorCloseFails: true }, { clientCloseFails: true }]) {
    const mock = fakeClient(() => fixture.catalog, () => fixture.checkpoints, undefined, hooks);
    await assert.rejects(() => runTechApiFreshnessAudit({
      uri: TEST_URI,
      archivePath: fixture.archivePath,
      manifestPath: fixture.manifestPath,
      confirmNoWriters: true,
      clientFactory: () => mock.client,
    }), (error: unknown) => error instanceof FreshnessAuditError
      && error.status === 'BLOCKED'
      && !error.message.includes('credential-sentinel') && !error.message.includes(TEST_URI));
    assert.equal(mock.wasClosed(), true);
    assert.equal(mock.activeIterators(), 0);
  }
});

test('opens the archive readonly, validates its manifest checksums, and leaves the file unchanged', async (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  const before = hashFile(fixture.archivePath);
  const opened = await openVerifiedArchive(fixture.archivePath, fixture.manifestPath, new AuditDeadline(60_000));
  assert.equal(opened.counts.total, 2);
  assert.equal(opened.schemaVersion, 1);
  assert.throws(() => opened.database.prepare('DELETE FROM techapi_catalog_records').run());
  opened.database.exec('ROLLBACK');
  opened.database.close();
  assert.equal(hashFile(fixture.archivePath), before);
});

test('validates compatibility with the official archive manifest and archive without writing', { timeout: 180_000 }, async (context) => {
  if (!existsSync(ARCHIVE_PATH) || !existsSync(MANIFEST_PATH)) {
    context.skip('Official local archive and manifest are not present in this environment.');
    return;
  }
  const before = hashFile(ARCHIVE_PATH);
  const opened = await openVerifiedArchive(ARCHIVE_PATH, MANIFEST_PATH, new AuditDeadline(180_000));
  assert.equal(opened.counts.catalog, opened.manifest.tableCounts.catalog);
  assert.equal(opened.counts.checkpoints, opened.manifest.tableCounts.checkpoints);
  opened.database.exec('ROLLBACK');
  opened.database.close();
  assert.equal(hashFile(ARCHIVE_PATH), before);
});

test('actual manifest carries the supported checksum, count, and constraint contract when available', (context) => {
  if (!existsSync(MANIFEST_PATH)) {
    context.skip('Official local manifest is not present in this environment.');
    return;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, any>;
  assert.equal(manifest.archiveName, 'techapi_catalog.sqlite');
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(Number.isInteger(manifest.tableCounts.catalog), true);
  assert.equal(Number.isInteger(manifest.tableCounts.checkpoints), true);
  assert.match(manifest.archiveFileSha256, /^[a-f0-9]{64}$/i);
  assert.match(manifest.archivePayloadChecksums.catalog, /^[a-f0-9]{64}$/i);
  assert.match(manifest.archivePayloadChecksums.checkpoints, /^[a-f0-9]{64}$/i);
  assert.ok(Array.isArray(manifest.uniqueIndexVerification.catalog));
  assert.ok(Array.isArray(manifest.notNullVerification.checkpoints));
});
