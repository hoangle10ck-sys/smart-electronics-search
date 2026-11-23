import test, { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { EJSON, Int32, ObjectId } from 'bson';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  TechApiCatalogRecord,
  TechApiFullDatasetUpsert,
  TechApiImportCheckpoint,
  TechApiIndexUpsert,
} from '../repositories/techApiRepository';
import { serializeTechApiEjson, SqliteTechApiRepository } from '../repositories/sqliteTechApiRepository';
import { canSkipTechApiFile } from './techApiImportResume';

const firstSeen = new Date('2026-01-01T00:00:00.000Z');

function indexRecord(overrides: Partial<TechApiIndexUpsert> = {}): TechApiIndexUpsert {
  return {
    sourceKey: 'techapi:laptop:zenbook-14',
    sourceCategory: 'laptop',
    sourceSlug: 'zenbook-14',
    name: 'ASUS ZenBook 14',
    sourceRecordUrl: 'https://catalog.example.test/laptop/zenbook-14',
    sourceListUrl: 'https://catalog.example.test/laptops',
    dataAttribution: 'TechAPI fixture',
    dataSourceUrl: 'https://catalog.example.test',
    dataLicense: 'CC BY-SA 4.0',
    dataLicenseUrl: 'https://catalog.example.test/license',
    licenseTermsUrl: 'https://catalog.example.test/terms',
    workflowStatus: 'discovery_only',
    lastSeenAt: firstSeen,
    raw: { manufacturer: { name: 'ASUS' }, verified: false },
    searchText: 'portable office laptop',
    ...overrides,
  };
}

function fullRecord(overrides: Partial<TechApiFullDatasetUpsert> = {}): TechApiFullDatasetUpsert {
  const base = indexRecord();
  return {
    ...base,
    _id: new ObjectId(),
    detailsFetchedAt: null,
    detailsSha256: null,
    createdAt: firstSeen,
    updatedAt: firstSeen,
    ...overrides,
  };
}

function checkpoint(overrides: Partial<TechApiImportCheckpoint> = {}): TechApiImportCheckpoint {
  return {
    _id: new ObjectId('64b000000000000000000002'),
    fileKey: 'catalog/laptop.json',
    sourcePath: 'catalog/laptop.json',
    sourceCommit: 'fixture-commit',
    sha256: 'a'.repeat(64),
    recordCount: 1,
    importedAt: firstSeen,
    createdAt: firstSeen,
    updatedAt: firstSeen,
    ...overrides,
  };
}

async function createRepository(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'techapi-sqlite-test-'));
  const databasePath = join(directory, 'techapi_catalog.sqlite');
  const repository = new SqliteTechApiRepository(databasePath);
  t.after(async () => {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { repository, directory, databasePath };
}

test('creates versioned schema, unique keys and query indexes in a real temporary SQLite file', async (t) => {
  const { repository, databasePath } = await createRepository(t);
  const database = new Database(databasePath, { readonly: true });
  try {
    const versions = database.prepare('SELECT version FROM archive_schema_version').all() as Array<{ version: number }>;
    assert.deepEqual(versions, [{ version: 1 }]);
    const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>;
    assert.ok(indexes.some(({ name }) => name === 'sqlite_autoindex_techapi_catalog_records_2'));
    assert.ok(indexes.some(({ name }) => name === 'idx_techapi_catalog_enrich_all'));
    assert.ok(indexes.some(({ name }) => name === 'idx_techapi_catalog_soc_verified'));
    assert.equal(database.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(database.pragma('busy_timeout', { simple: true }), 5000);
  } finally {
    database.close();
  }
  await repository.initializeCatalog();
  await repository.initializeCheckpoints();
});

test('refuses a future archive schema version instead of mutating it', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'techapi-sqlite-version-test-'));
  const databasePath = join(directory, 'future.sqlite');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const database = new Database(databasePath);
  database.exec('CREATE TABLE archive_schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  database.prepare('INSERT INTO archive_schema_version(version, applied_at) VALUES (?, ?)').run(2, firstSeen.toISOString());
  database.close();
  assert.throws(() => new SqliteTechApiRepository(databasePath), /newer than this application supports/);
  const verify = new Database(databasePath, { readonly: true });
  try {
    assert.equal((verify.prepare('SELECT MAX(version) AS version FROM archive_schema_version').get() as { version: number }).version, 2);
    assert.equal(verify.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'techapi_catalog_records'").get(), undefined);
  } finally {
    verify.close();
  }
});

test('round-trips complete nested raw data, BSON ObjectIds and dates with Extended JSON', async (t) => {
  const { repository, directory } = await createRepository(t);
  const nestedId = new ObjectId('64b000000000000000000003');
  const observedAt = new Date('2025-12-30T12:34:56.789Z');
  const expected = fullRecord({
    raw: {
      manufacturer: { name: 'ASUS', ids: [nestedId] },
      unknownFutureField: { observedAt, nested: [{ id: nestedId, values: [1, true, null] }] },
    },
    detailsFetchedAt: observedAt,
  });
  await repository.upsertFullDatasetRecords([expected]);
  const actual = await repository.findCatalogRecordBySourceKey(expected.sourceKey);
  assert.ok(actual);
  assert.ok(actual._id instanceof ObjectId);
  assert.equal((actual._id as ObjectId).toHexString(), (expected._id as ObjectId).toHexString());
  assert.deepEqual(actual.raw, expected.raw);
  assert.ok(actual.detailsFetchedAt instanceof Date);
  assert.equal(actual.detailsFetchedAt.toISOString(), observedAt.toISOString());
  assert.equal(await repository.countCatalogRecords(), 1);
});

test('canonical Extended JSON sorts document keys but preserves BSON types and array order', () => {
  const objectId = new ObjectId('64b000000000000000000006');
  const date = new Date('2026-02-03T00:00:00Z');
  const left = serializeTechApiEjson({ z: 1, nested: { b: objectId, a: date }, values: [2, 1] });
  const right = serializeTechApiEjson({ values: [2, 1], nested: { a: date, b: objectId }, z: 1 });
  const reversedArray = serializeTechApiEjson({ values: [1, 2], nested: { a: date, b: objectId }, z: 1 });
  assert.equal(left, right);
  assert.notEqual(left, reversedArray);
});

test('archive batch insertion preserves the source document exactly, including absent optional fields', async (t) => {
  const { repository } = await createRepository(t);
  const source = {
    ...indexRecord(),
    _id: new ObjectId('64b000000000000000000007'),
    raw: { manufacturer: { name: 'ASUS' }, nested: { sourceOnly: true } },
    // Deliberately omit createdAt and updatedAt: migration must not synthesize them.
  } as Record<string, unknown>;
  await repository.insertSourceCatalogBatch([source]);
  const restored = await repository.findCatalogRecordBySourceKey(String(source.sourceKey));
  assert.ok(restored);
  assert.equal((restored._id as ObjectId).toHexString(), '64b000000000000000000007');
  assert.equal(restored.createdAt, undefined);
  assert.equal(restored.updatedAt, undefined);
  assert.deepEqual(restored.raw, source.raw);
});

test('checkpoint archive batch preserves source fields and reports the failing file key', async (t) => {
  const { repository, databasePath } = await createRepository(t);
  const source = {
    ...checkpoint(),
    _id: new ObjectId('64b000000000000000000008'),
    raw: { extra: ['kept', { value: new Int32(7) }] },
  } as Record<string, unknown>;
  delete source.createdAt;
  delete source.updatedAt;

  await repository.insertSourceCheckpointBatch([source]);
  const [restored] = await repository.findCheckpoints([String(source.fileKey)]);
  assert.equal((restored._id as ObjectId).toHexString(), '64b000000000000000000008');
  assert.equal(restored.createdAt, undefined);
  assert.equal(restored.updatedAt, undefined);
  assert.deepEqual((restored as unknown as Record<string, any>).raw, { extra: ['kept', { value: 7 }] });

  const inspectDatabase = new Database(databasePath, { readonly: true });
  let exactPayload: Record<string, any>;
  try {
    const row = inspectDatabase.prepare(
      'SELECT document_ejson FROM techapi_import_checkpoints WHERE file_key = ?',
    ).get(String(source.fileKey)) as { document_ejson: string };
    exactPayload = EJSON.parse(row.document_ejson, { relaxed: false }) as Record<string, any>;
  } finally {
    inspectDatabase.close();
  }
  assert.ok(exactPayload._id instanceof ObjectId);
  assert.ok(exactPayload.raw.extra[1].value instanceof Int32);
  assert.equal(exactPayload.raw.extra[1].value.valueOf(), 7);
  assert.equal(exactPayload.createdAt, undefined);
  assert.equal(exactPayload.updatedAt, undefined);

  await assert.rejects(
    repository.insertSourceCheckpointBatch([{ ...source }]),
    /catalog\/laptop\.json/,
  );
  assert.equal((await repository.findCheckpoints([String(source.fileKey)])).length, 1);
});

test('index importer insert generates an ObjectId and duplicate identities roll back safely', async (t) => {
  const { repository } = await createRepository(t);
  await repository.upsertIndexRecords([indexRecord()]);
  const inserted = await repository.findCatalogRecordBySourceKey('techapi:laptop:zenbook-14');
  assert.ok(inserted?._id instanceof ObjectId);

  await assert.rejects(repository.upsertIndexRecords([indexRecord({
    sourceKey: 'techapi:laptop:other-key',
  })]), /UNIQUE constraint failed/);
  assert.equal(await repository.countCatalogRecords(), 1);
});

test('index upsert refreshes index metadata but preserves existing raw, search text and enrichment', async (t) => {
  const { repository } = await createRepository(t);
  await repository.upsertIndexRecords([indexRecord()]);
  const enrichedAt = new Date('2026-01-03T00:00:00.000Z');
  await repository.updateEnrichedRecord({
    sourceKey: 'techapi:laptop:zenbook-14', onlyIfNotEnriched: false,
    raw: { manufacturer: 'Asus', detailedSpec: { memory: '32 GB' } },
    searchText: 'enriched memory 32GB', detailsFetchedAt: enrichedAt, detailsSha256: 'b'.repeat(64),
  });
  const reindexedAt = new Date('2026-01-04T00:00:00.000Z');
  await repository.upsertIndexRecords([indexRecord({
    name: 'Renamed from index', lastSeenAt: reindexedAt,
    raw: { manufacturer: 'Wrong overwrite' }, searchText: 'wrong overwrite',
  })]);
  const stored = await repository.findCatalogRecordBySourceKey('techapi:laptop:zenbook-14');
  assert.equal(stored?.name, 'Renamed from index');
  assert.deepEqual(stored?.raw, { manufacturer: 'Asus', detailedSpec: { memory: '32 GB' } });
  assert.equal(stored?.searchText, 'enriched memory 32GB');
  assert.equal(stored?.detailsSha256, 'b'.repeat(64));
  assert.equal(stored?.lastSeenAt.toISOString(), reindexedAt.toISOString());
});

test('full dataset upsert replaces complete dataset fields and preserves original id and creation time', async (t) => {
  const { repository } = await createRepository(t);
  const original = fullRecord();
  await repository.upsertFullDatasetRecords([original]);
  const laterId = new ObjectId('64b000000000000000000004');
  const updatedAt = new Date('2026-02-01T00:00:00.000Z');
  const result = await repository.upsertFullDatasetRecords([fullRecord({
    _id: laterId,
    name: 'Updated from fixture',
    raw: { manufacturer: 'ASUS', extra: { date: updatedAt } },
    searchText: 'changed fixture text',
    lastSeenAt: updatedAt,
    createdAt: new Date('2026-01-20T00:00:00.000Z'),
    updatedAt,
  })]);
  const stored = await repository.findCatalogRecordBySourceKey(original.sourceKey);
  assert.deepEqual(result, { created: 0, updated: 1 });
  assert.equal((stored?._id as ObjectId).toHexString(), (original._id as ObjectId).toHexString());
  assert.equal(stored?.createdAt?.toISOString(), firstSeen.toISOString());
  assert.equal(stored?.name, 'Updated from fixture');
  assert.equal((stored?.raw.extra.date as Date).toISOString(), updatedAt.toISOString());
});

test('enrichment honors only-if-empty guard and returns the Mongo sort order fields', async (t) => {
  const { repository } = await createRepository(t);
  await repository.upsertFullDatasetRecords([
    fullRecord({ sourceKey: 'techapi:laptop:a', sourceSlug: 'a', name: 'A', lastSeenAt: new Date('2026-01-01T00:00:00Z') }),
    fullRecord({ sourceKey: 'techapi:laptop:b', sourceSlug: 'b', name: 'B', lastSeenAt: new Date('2026-01-02T00:00:00Z') }),
    fullRecord({ sourceKey: 'techapi:phone:c', sourceCategory: 'phone', sourceSlug: 'c', name: 'C' }),
  ]);
  const detailDate = new Date('2026-01-05T00:00:00Z');
  assert.equal(await repository.updateEnrichedRecord({
    sourceKey: 'techapi:laptop:a', onlyIfNotEnriched: true, raw: { specs: ['RAM'] },
    searchText: 'ram detail', detailsFetchedAt: detailDate, detailsSha256: 'c'.repeat(64),
  }), 1);
  assert.equal(await repository.updateEnrichedRecord({
    sourceKey: 'techapi:laptop:a', onlyIfNotEnriched: true, raw: { specs: ['overwrite'] },
    searchText: 'overwrite', detailsFetchedAt: new Date(), detailsSha256: 'd'.repeat(64),
  }), 0);
  assert.equal(await repository.updateEnrichedRecord({
    sourceKey: 'techapi:laptop:a', onlyIfNotEnriched: false, raw: { specs: ['refresh'] },
    searchText: 'refresh', detailsFetchedAt: detailDate, detailsSha256: 'e'.repeat(64),
  }), 1);
  const references = await repository.findCatalogReferencesForEnrichment({ refresh: false, limit: 10 });
  assert.deepEqual(references.map((row) => row.sourceKey), ['techapi:laptop:b', 'techapi:phone:c']);
  assert.deepEqual(await repository.findCatalogReferencesForEnrichment({ category: 'laptop', refresh: true, limit: 10 }), [
    { sourceKey: 'techapi:laptop:a', sourceCategory: 'laptop', sourceSlug: 'a', name: 'A', sourceRecordUrl: 'https://catalog.example.test/laptop/zenbook-14' },
    { sourceKey: 'techapi:laptop:b', sourceCategory: 'laptop', sourceSlug: 'b', name: 'B', sourceRecordUrl: 'https://catalog.example.test/laptop/zenbook-14' },
  ]);
});

test('discovery filters category, ANDed substrings, brand paths, Unicode and literal regex metacharacters', async (t) => {
  const { repository } = await createRepository(t);
  await repository.upsertFullDatasetRecords([
    fullRecord({ sourceKey: 'techapi:laptop:lenovo', sourceSlug: 'lenovo', name: 'ThinkPad Pro', raw: { manufacturer: 'Lenovo' }, searchText: 'portable office work' }),
    fullRecord({ sourceKey: 'techapi:laptop:asus', sourceSlug: 'asus', name: 'ZenBook', raw: { manufacturer: { name: 'ASUS' } }, searchText: 'portable creative' }),
    fullRecord({ sourceKey: 'techapi:laptop:cpp', sourceSlug: 'cpp', name: 'C++ Dev Workstation', raw: { brand: 'BoardCo' }, searchText: 'developer workstation' }),
    fullRecord({ sourceKey: 'techapi:camera:camera', sourceCategory: 'camera', sourceSlug: 'camera', name: 'Máy ảnh không gương lật', raw: { manufacturer: { name: 'Ảnh Việt' } }, searchText: 'máy ảnh mirrorless' }),
  ]);

  const brandAndTerms = await repository.findDiscoveryCandidates({
    categories: ['laptop'], queryTerms: ['portable', 'office'], brandTerms: ['lenovo'], limit: 20,
  });
  assert.deepEqual(brandAndTerms.map((row) => row.sourceSlug), ['lenovo']);
  const nestedManufacturer = await repository.findDiscoveryCandidates({
    categories: ['laptop'], queryTerms: [], brandTerms: ['asus'], limit: 20,
  });
  assert.deepEqual(nestedManufacturer.map((row) => row.sourceSlug), ['asus']);
  const rawBrand = await repository.findDiscoveryCandidates({
    categories: ['laptop'], queryTerms: [], brandTerms: ['boardco'], limit: 20,
  });
  assert.deepEqual(rawBrand.map((row) => row.sourceSlug), ['cpp']);
  const literalPlus = await repository.findDiscoveryCandidates({
    categories: ['laptop'], queryTerms: ['C++'], brandTerms: [], limit: 20,
  });
  assert.deepEqual(literalPlus.map((row) => row.sourceSlug), ['cpp']);
  const unicode = await repository.findDiscoveryCandidates({
    categories: ['camera'], queryTerms: ['MÁY ẢNH'], brandTerms: ['ẢNH VIỆT'], limit: 20,
  });
  assert.deepEqual(unicode.map((row) => row.sourceSlug), ['camera']);
  assert.equal((await repository.findDiscoveryCandidates({ categories: ['phone'], queryTerms: [], brandTerms: [], limit: 20 })).length, 0);
});

test('discovery pagination uses offset and limit without claiming stable ordering', async (t) => {
  const { repository } = await createRepository(t);
  await repository.upsertIndexRecords(Array.from({ length: 7 }, (_, index) => indexRecord({
    sourceKey: `techapi:laptop:page-${index}`, sourceSlug: `page-${index}`, name: `Laptop page ${index}`,
  })));
  const firstPage = await repository.findDiscoveryCandidates({ categories: ['laptop'], queryTerms: [], brandTerms: [], limit: 3 });
  const secondPage = await repository.findDiscoveryCandidates({ categories: ['laptop'], queryTerms: [], brandTerms: [], limit: 3, offset: 3 });
  const lastPage = await repository.findDiscoveryCandidates({ categories: ['laptop'], queryTerms: [], brandTerms: [], limit: 3, offset: 6 });
  assert.equal(firstPage.length, 3);
  assert.equal(secondPage.length, 3);
  assert.equal(lastPage.length, 1);
  const pageSlugs = [...firstPage, ...secondPage, ...lastPage].map((row) => row.sourceSlug);
  assert.equal(new Set(pageSlugs).size, 7);
});

test('stable_v1 discovery orders candidate IDs by sourceKey and count uses matching predicates', async (t) => {
  const { repository } = await createRepository(t);
  await repository.upsertIndexRecords([
    indexRecord({ sourceKey: 'techapi:laptop:z', sourceSlug: 'z', name: 'Laptop Z' }),
    indexRecord({ sourceKey: 'techapi:laptop:a', sourceSlug: 'a', name: 'Laptop A' }),
    indexRecord({ sourceKey: 'techapi:laptop:m', sourceSlug: 'm', name: 'Laptop M' }),
  ]);
  const query = { categories: ['laptop'], queryTerms: ['laptop'], brandTerms: [] };
  assert.equal(await repository.countDiscoveryCandidates(query), 3);
  const rows = await repository.findDiscoveryCandidates({ ...query, limit: 500, candidateOrdering: 'stable_v1' });
  assert.deepEqual(rows.map((row) => row.sourceKey), [
    'techapi:laptop:a', 'techapi:laptop:m', 'techapi:laptop:z',
  ]);
  assert.equal(await repository.countDiscoveryCandidates({ ...query, categories: [] }), 0);
});

test('discovery stays capped at 500 records when more matching records exist', async (t) => {
  const { repository } = await createRepository(t);
  await repository.upsertIndexRecords(Array.from({ length: 510 }, (_, index) => indexRecord({
    sourceKey: `techapi:laptop:many-${index}`, sourceSlug: `many-${index}`, name: `Laptop many ${index}`,
  })));
  assert.equal((await repository.findDiscoveryCandidates({ categories: ['laptop'], queryTerms: [], brandTerms: [], limit: 500 })).length, 500);
  assert.equal((await repository.findDiscoveryCandidates({ categories: ['laptop'], queryTerms: [], brandTerms: [], limit: 500, offset: 508 })).length, 2);
});

test('verified SoC filtering, identity lookup and category counts use stored payload fields', async (t) => {
  const { repository } = await createRepository(t);
  await repository.upsertFullDatasetRecords([
    fullRecord({ sourceKey: 'techapi:soc:verified', sourceCategory: 'soc', sourceSlug: 'verified', name: 'SoC Verified', raw: { verified: true } }),
    fullRecord({ sourceKey: 'techapi:soc:unverified', sourceCategory: 'soc', sourceSlug: 'unverified', name: 'SoC Unverified', raw: { verified: false } }),
    fullRecord({ sourceKey: 'techapi:laptop:second', sourceSlug: 'second', name: 'Second laptop' }),
  ]);
  const socRecords = await repository.findVerifiedSocRecords();
  assert.deepEqual(socRecords.map((row) => row.sourceSlug), ['verified']);
  assert.deepEqual(await repository.findExistingCatalogIdentities([
    { sourceCategory: 'soc', sourceSlug: 'verified' },
    { sourceCategory: 'laptop', sourceSlug: 'missing' },
  ]), new Set([JSON.stringify(['soc', 'verified'])]));
  assert.deepEqual(await repository.countCatalogRecordsByCategory(), [
    { category: 'laptop', records: 1 }, { category: 'soc', records: 2 },
  ]);
});

test('checkpoint insert and update preserve its id and original creation timestamp', async (t) => {
  const { repository } = await createRepository(t);
  await repository.upsertCheckpoints([checkpoint()]);
  const laterId = new ObjectId('64b000000000000000000005');
  const importedAt = new Date('2026-02-01T00:00:00Z');
  await repository.upsertCheckpoints([checkpoint({
    _id: laterId, sha256: 'f'.repeat(64), recordCount: 42, importedAt,
    createdAt: new Date('2026-01-20T00:00:00Z'), updatedAt: importedAt,
  })]);
  const [stored] = await repository.findCheckpoints(['catalog/laptop.json']);
  assert.equal(stored.sha256, 'f'.repeat(64));
  assert.equal(stored.recordCount, 42);
  assert.equal(stored.importedAt.toISOString(), importedAt.toISOString());
  assert.equal(stored.createdAt?.toISOString(), firstSeen.toISOString());
  assert.equal((stored._id as ObjectId).toHexString(), '64b000000000000000000002');
  assert.deepEqual(await repository.findCheckpoints([]), []);
});

test('resume states require matching checkpoint hash and an extant catalog record', async (t) => {
  const { repository } = await createRepository(t);
  await repository.upsertFullDatasetRecords([fullRecord()]);
  await repository.upsertCheckpoints([checkpoint()]);
  const states = await repository.findImportResumeStates([
    { fileKey: 'catalog/laptop.json', sourceKey: 'techapi:laptop:zenbook-14' },
    { fileKey: 'catalog/missing.json', sourceKey: 'techapi:laptop:missing' },
  ]);
  assert.equal(canSkipTechApiFile({ fileKey: 'catalog/laptop.json', sourceKey: 'techapi:laptop:zenbook-14', sha256: 'a'.repeat(64) }, states), true);
  assert.equal(canSkipTechApiFile({ fileKey: 'catalog/laptop.json', sourceKey: 'techapi:laptop:zenbook-14', sha256: 'b'.repeat(64) }, states), false);
  assert.equal(canSkipTechApiFile({ fileKey: 'catalog/missing.json', sourceKey: 'techapi:laptop:missing', sha256: 'a'.repeat(64) }, states), false);
});

test('full dataset record and checkpoint writes roll back together if checkpoint insertion fails', async (t) => {
  const { repository } = await createRepository(t);
  const invalidCheckpoint = checkpoint({ recordCount: null as unknown as number });
  await assert.rejects(repository.saveFullDatasetRecordsWithCheckpoints([fullRecord()], [invalidCheckpoint]), /NOT NULL constraint failed/);
  assert.equal(await repository.countCatalogRecords(), 0);
  assert.deepEqual(await repository.findCheckpoints(['catalog/laptop.json']), []);
});

test('database close and reopen preserves records and checkpoints', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'techapi-sqlite-reopen-test-'));
  const databasePath = join(directory, 'techapi_catalog.sqlite');
  const repository = new SqliteTechApiRepository(databasePath);
  let reopened: SqliteTechApiRepository | undefined;
  t.after(async () => {
    await repository.close();
    await reopened?.close();
    await rm(directory, { recursive: true, force: true });
  });
  const fixture = fullRecord({ raw: { nested: { bytes: [1, 2, 3], capturedAt: firstSeen } } });
  await repository.saveFullDatasetRecordsWithCheckpoints([fixture], [checkpoint()]);
  await repository.close();
  reopened = new SqliteTechApiRepository(databasePath);
  const stored = await reopened.findCatalogRecordBySourceKey(fixture.sourceKey);
  assert.deepEqual(stored?.raw, fixture.raw);
  assert.equal(await reopened.countCatalogRecords(), 1);
  assert.equal((await reopened.findCheckpoints(['catalog/laptop.json'])).length, 1);
});

test('factory defaults to Mongo and opens only an existing SQLite archive read-only', async (t) => {
  const { directory } = await createRepository(t);
  const originalStorage = process.env.TECHAPI_STORAGE;
  const originalArchiveDir = process.env.TECHAPI_ARCHIVE_DIR;
  process.env.TECHAPI_STORAGE = 'mongo';
  delete process.env.TECHAPI_ARCHIVE_DIR;
  try {
    const factory = await import('../repositories/techApiRepositoryFactory');
    assert.deepEqual(factory.resolveTechApiStorageConfig({}), { storage: 'mongo' });
    assert.throws(() => factory.resolveTechApiStorageConfig({ TECHAPI_STORAGE: 'sqlite' }), /TECHAPI_ARCHIVE_DIR is required/);
    assert.throws(() => factory.resolveTechApiStorageConfig({ TECHAPI_STORAGE: 'other' }), /must be either/);
    assert.deepEqual(factory.resolveTechApiStorageConfig({ TECHAPI_STORAGE: 'sqlite', TECHAPI_ARCHIVE_DIR: directory }).sqliteAccess, 'readonly');
    assert.throws(() => factory.resolveTechApiStorageConfig({ TECHAPI_STORAGE: 'sqlite', TECHAPI_ARCHIVE_DIR: directory, TECHAPI_SQLITE_ACCESS: 'write' }), /TECHAPI_SQLITE_ACCESS must be either/);
    assert.throws(() => factory.validateTechApiArchiveDirectory('relative/archive'), /absolute/);
    assert.throws(() => factory.validateTechApiArchiveDirectory(process.cwd()), /outside the Git repository/);
    await assert.rejects(async () => factory.validateTechApiArchiveDirectory(join(tmpdir(), 'missing-techapi-archive-dir')), /existing readable directory/);
    const temporaryFile = join(directory, 'not-a-directory');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(temporaryFile, 'fixture');
    assert.throws(() => factory.validateTechApiArchiveDirectory(temporaryFile), /existing readable directory/);
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'techapi-factory-test-'));
    try {
      assert.throws(() => factory.createTechApiRepository({ storage: 'sqlite', archiveDir: temporaryDirectory }), /existing readable file/);
      assert.equal((await readdir(temporaryDirectory)).length, 0, 'missing runtime archive must not be created');
      const writableSetup = new SqliteTechApiRepository(join(temporaryDirectory, 'techapi_catalog.sqlite'));
      await writableSetup.close();
      const repository = factory.createTechApiRepository({ storage: 'sqlite', archiveDir: temporaryDirectory, sqliteAccess: 'readwrite' });
      assert.equal(await repository.countCatalogRecords(), 0);
      await assert.rejects(() => repository.upsertIndexRecords([indexRecord()]), /read-only/);
      await repository.close();
      assert.ok((await readdir(temporaryDirectory)).includes('techapi_catalog.sqlite'));
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  } finally {
    if (originalStorage === undefined) delete process.env.TECHAPI_STORAGE;
    else process.env.TECHAPI_STORAGE = originalStorage;
    if (originalArchiveDir === undefined) delete process.env.TECHAPI_ARCHIVE_DIR;
    else process.env.TECHAPI_ARCHIVE_DIR = originalArchiveDir;
  }
});

test('controlled writer factory requires explicit SQLite readwrite and never falls back', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'techapi-controlled-writer-test-'));
  const databasePath = join(directory, 'techapi_catalog.sqlite');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const setup = new SqliteTechApiRepository(databasePath);
  await setup.close();
  const factory = await import('../repositories/techApiRepositoryFactory');

  await assert.rejects(factory.createTechApiImporterRepository({
    writeTechApi: true,
    environment: { TECHAPI_STORAGE: 'sqlite', TECHAPI_ARCHIVE_DIR: directory, TECHAPI_SQLITE_ACCESS: 'readonly' },
  }), /TECHAPI_SQLITE_ACCESS=readwrite explicitly/);
  assert.equal((await readdir(directory)).includes('techapi_catalog.sqlite.writer-lock'), false);

  const repository = await factory.createTechApiImporterRepository({
    writeTechApi: true,
    environment: { TECHAPI_STORAGE: 'sqlite', TECHAPI_ARCHIVE_DIR: directory, TECHAPI_SQLITE_ACCESS: 'readwrite' },
  });
  await repository.upsertIndexRecords([indexRecord({ sourceKey: 'techapi:laptop:controlled-write' })]);
  assert.ok(await repository.findCatalogRecordBySourceKey('techapi:laptop:controlled-write'));
  await repository.close();
  assert.equal((await readdir(directory)).some((name) => name.endsWith('.writer-lock')), false);

  await assert.rejects(factory.createTechApiImporterRepository({
    writeTechApi: true,
    environment: { TECHAPI_STORAGE: 'sqlite', TECHAPI_ARCHIVE_DIR: join(directory, 'missing'), TECHAPI_SQLITE_ACCESS: 'readwrite' },
  }), /TECHAPI_ARCHIVE_DIR must name an existing readable directory/);
});

test('controlled writer refuses an invalid existing archive without initializing schema', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'techapi-invalid-writer-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const archivePath = join(directory, 'techapi_catalog.sqlite');
  const empty = new Database(archivePath);
  empty.close();
  const factory = await import('../repositories/techApiRepositoryFactory');
  await assert.rejects(factory.createTechApiImporterRepository({
    writeTechApi: true,
    environment: { TECHAPI_STORAGE: 'sqlite', TECHAPI_ARCHIVE_DIR: directory, TECHAPI_SQLITE_ACCESS: 'readwrite' },
  }), /missing required table|incompatible with version/);
  const inspect = new Database(archivePath, { readonly: true });
  try {
    const tableCount = inspect.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table'").get() as { count: number };
    assert.equal(tableCount.count, 0);
  } finally {
    inspect.close();
  }
  assert.equal((await readdir(directory)).some((name) => name.endsWith('.writer-lock')), false);
});

test('factory fails clearly when SQLite database directory cannot be opened', async (t) => {
  const { directory } = await createRepository(t);
  assert.throws(() => new SqliteTechApiRepository(join(directory, 'missing', 'archive.sqlite')), /directory does not exist/i);
});
