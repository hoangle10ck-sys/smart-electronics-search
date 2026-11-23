import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { hostname } from 'node:os';
import Database from 'better-sqlite3';
import { ObjectId } from 'bson';
import {
  TechApiFullDatasetUpsert,
  TechApiImportCheckpoint,
  TechApiIndexUpsert,
} from '../repositories/techApiRepository';
import { SqliteTechApiRepository } from '../repositories/sqliteTechApiRepository';
import { acquireTechApiWriterLock } from '../repositories/sqliteTechApiWriterLock';
import { canSkipTechApiFile } from '../services/techApiImportResume';

const ARCHIVE_PATH = 'D:\\SmartElectronicsData\\techapi_catalog.sqlite';
const TEST_COPY_PATH = 'D:\\SmartElectronicsData\\techapi_catalog.phase5b-test.sqlite';
const EXPECTED_SOURCE_COUNTS = { catalog: 131_064, checkpoints: 104_666 };
const FIXTURE_PREFIX = 'phase5b-test:controlled-writer';

type TableCounts = { catalog: number; checkpoints: number };

function tableCounts(database: Database.Database): TableCounts {
  return {
    catalog: (database.prepare('SELECT COUNT(*) AS count FROM techapi_catalog_records').get() as { count: number }).count,
    checkpoints: (database.prepare('SELECT COUNT(*) AS count FROM techapi_import_checkpoints').get() as { count: number }).count,
  };
}

function schemaFingerprint(database: Database.Database): string {
  const rows = database.prepare(`
    SELECT type, name, tbl_name, sql FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name
  `).all();
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function payloadChecksum(database: Database.Database, table: 'techapi_catalog_records' | 'techapi_import_checkpoints', key: 'source_key' | 'file_key'): string {
  const digest = createHash('sha256');
  const statement = database.prepare(`SELECT ${key}, document_ejson FROM ${table} ORDER BY ${key}`);
  for (const row of statement.iterate() as Iterable<{ [key: string]: string }>) {
    digest.update(row[key]);
    digest.update('\0');
    digest.update(row.document_ejson);
    digest.update('\n');
  }
  return digest.digest('hex');
}

async function fileSha256(filePath: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) digest.update(chunk as Buffer);
  return digest.digest('hex');
}

async function backupDatabase(sourcePath: string, destinationPath: string): Promise<void> {
  try {
    await access(destinationPath);
    throw new Error(`Refusing to overwrite an existing test/backup database: ${destinationPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(destinationPath);
  } finally {
    source.close();
  }
}

function indexFixture(): TechApiIndexUpsert {
  return {
    sourceKey: `${FIXTURE_PREFIX}:index`,
    sourceCategory: 'phase5b_test',
    sourceSlug: 'controlled-index',
    name: 'Phase 5B controlled SQLite writer fixture',
    sourceRecordUrl: 'https://fixture.invalid/phase5b/index',
    sourceListUrl: 'https://fixture.invalid/phase5b',
    dataAttribution: 'Phase 5B isolated local test fixture',
    dataSourceUrl: 'https://fixture.invalid',
    dataLicense: 'test-only',
    dataLicenseUrl: 'https://fixture.invalid/license',
    licenseTermsUrl: 'https://fixture.invalid/terms',
    workflowStatus: 'discovery_only',
    lastSeenAt: new Date(),
    raw: { phase5bFixture: true, runHost: hostname() },
    searchText: 'phase5b controlled writer fixture',
  };
}

function fullFixture(): TechApiFullDatasetUpsert {
  const now = new Date();
  return {
    ...indexFixture(),
    sourceKey: `${FIXTURE_PREFIX}:full`,
    sourceSlug: 'controlled-full',
    name: 'Phase 5B controlled full dataset fixture',
    raw: { phase5bFixture: true, release: { id: new ObjectId(), capturedAt: now } },
    _id: new ObjectId(),
    detailsFetchedAt: now,
    detailsSha256: 'a'.repeat(64),
    createdAt: now,
    updatedAt: now,
  };
}

function checkpointFixture(fileKey = `${FIXTURE_PREFIX}:file`): TechApiImportCheckpoint {
  const now = new Date();
  return {
    _id: new ObjectId(),
    fileKey,
    sourcePath: 'phase5b/controlled-fixture.json',
    sourceCommit: 'phase5b-test-only',
    sha256: 'b'.repeat(64),
    recordCount: 1,
    importedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

async function exerciseControlledWriter(): Promise<{ before: TableCounts; after: TableCounts; fileKey: string }> {
  const releaseLock = await acquireTechApiWriterLock(TEST_COPY_PATH, { timeoutMs: 2_000 });
  let repository: SqliteTechApiRepository | undefined;
  let lockReleased = false;
  try {
    repository = new SqliteTechApiRepository(TEST_COPY_PATH, { requireExistingSchema: true, onClose: releaseLock });
    const before = await readCounts(TEST_COPY_PATH);

    const index = indexFixture();
    const existingIndex = await repository.findCatalogRecordBySourceKey(index.sourceKey);
    if (existingIndex && (existingIndex.raw as Record<string, unknown>)?.phase5bFixture !== true) {
      throw new Error('The reserved Phase 5B index key exists with unexpected content; refusing to overwrite it.');
    }
    await repository.upsertIndexRecords([index]);
    await repository.updateEnrichedRecord({
      sourceKey: index.sourceKey,
      onlyIfNotEnriched: false,
      raw: { phase5bFixture: true, enrichedBy: 'controlled-writer-test' },
      searchText: 'phase5b enriched fixture',
      detailsFetchedAt: new Date(),
      detailsSha256: 'c'.repeat(64),
    });
    await repository.upsertIndexRecords([{ ...index, name: `${index.name} updated` }]);
    const indexed = await repository.findCatalogRecordBySourceKey(index.sourceKey);
    assert.equal(indexed?.name, `${index.name} updated`);
    assert.equal((indexed?.raw as Record<string, unknown>)?.enrichedBy, 'controlled-writer-test', 'index refresh must preserve enrichment payload');
    assert.equal(indexed?.searchText, 'phase5b enriched fixture');

    const full = fullFixture();
    const checkpoint = checkpointFixture();
    const existingFull = await repository.findCatalogRecordBySourceKey(full.sourceKey);
    if (existingFull && (existingFull.raw as Record<string, unknown>)?.phase5bFixture !== true) {
      throw new Error('The reserved Phase 5B full-record key exists with unexpected content; refusing to overwrite it.');
    }
    await repository.saveFullDatasetRecordsWithCheckpoints([full], [checkpoint]);
    const storedFull = await repository.findCatalogRecordBySourceKey(full.sourceKey);
    const [storedCheckpoint] = await repository.findCheckpoints([checkpoint.fileKey]);
    assert.ok(storedFull?._id instanceof ObjectId);
    assert.ok((storedFull?.raw as any).release.capturedAt instanceof Date);
    assert.equal(storedCheckpoint.sha256, checkpoint.sha256);
    assert.ok(storedCheckpoint.importedAt instanceof Date);

    const mismatchedState = await repository.findImportResumeStates([{ fileKey: checkpoint.fileKey, sourceKey: full.sourceKey }]);
    assert.equal(canSkipTechApiFile({ fileKey: checkpoint.fileKey, sourceKey: full.sourceKey, sha256: checkpoint.sha256 }, mismatchedState), true);
    assert.equal(canSkipTechApiFile({ fileKey: checkpoint.fileKey, sourceKey: full.sourceKey, sha256: 'd'.repeat(64) }, mismatchedState), false);
    const missingRecordState = await repository.findImportResumeStates([{ fileKey: checkpoint.fileKey, sourceKey: `${FIXTURE_PREFIX}:missing` }]);
    assert.equal(canSkipTechApiFile({ fileKey: checkpoint.fileKey, sourceKey: `${FIXTURE_PREFIX}:missing`, sha256: checkpoint.sha256 }, missingRecordState), false);

    const beforeFailedTransaction = {
      catalog: await repository.countCatalogRecords(),
      checkpoints: (await readCounts(TEST_COPY_PATH)).checkpoints,
    };
    const invalidCheckpoint = { ...checkpointFixture(`${FIXTURE_PREFIX}:rollback`), recordCount: null as unknown as number };
    await assertRejects(repository.saveFullDatasetRecordsWithCheckpoints([
      { ...fullFixture(), sourceKey: `${FIXTURE_PREFIX}:rollback`, sourceSlug: 'controlled-rollback' },
    ], [invalidCheckpoint]), /NOT NULL constraint failed/);
    assert.deepEqual({
      catalog: await repository.countCatalogRecords(),
      checkpoints: (await readCounts(TEST_COPY_PATH)).checkpoints,
    }, beforeFailedTransaction, 'failed catalog/checkpoint transaction must roll back both tables');

    const rollbackRecord = { ...fullFixture(), sourceKey: `${FIXTURE_PREFIX}:rollback`, sourceSlug: 'controlled-rollback' };
    const retryCheckpoint = checkpointFixture(`${FIXTURE_PREFIX}:rollback`);
    await repository.saveFullDatasetRecordsWithCheckpoints([rollbackRecord], [retryCheckpoint]);
    assert.ok(await repository.findCatalogRecordBySourceKey(rollbackRecord.sourceKey), 'a retry after rollback must succeed');

    await assertRejects(repository.upsertIndexRecords([{
      ...indexFixture(),
      sourceKey: `${FIXTURE_PREFIX}:duplicate-source-identity`,
      sourceSlug: index.sourceSlug,
    }]), /UNIQUE constraint failed/);
    await assertRejects(repository.upsertCheckpoints([{
      ...checkpointFixture(`${FIXTURE_PREFIX}:not-null`), sha256: null as unknown as string,
    }]), /NOT NULL constraint failed/);

    await repository.close();
    lockReleased = true;
    repository = undefined;
    const after = await readCounts(TEST_COPY_PATH);
    return { before, after, fileKey: checkpoint.fileKey };
  } finally {
    if (repository) {
      try { await repository.close(); } finally { lockReleased = true; }
    } else if (!lockReleased) await releaseLock();
  }
}

async function assertRejects(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await promise;
  } catch (error) {
    assert.match(error instanceof Error ? error.message : String(error), pattern);
    return;
  }
  assert.fail(`Expected rejection matching ${pattern}`);
}

async function readCounts(path: string): Promise<TableCounts> {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try { return tableCounts(database); } finally { database.close(); }
}

async function main() {
  const initialArchive = await stat(ARCHIVE_PATH);
  const initialArchiveHash = await fileSha256(ARCHIVE_PATH);
  const archive = new Database(ARCHIVE_PATH, { readonly: true, fileMustExist: true });
  try {
    assert.equal(archive.pragma('integrity_check', { simple: true }), 'ok');
    assert.deepEqual(tableCounts(archive), EXPECTED_SOURCE_COUNTS);
  } finally {
    archive.close();
  }

  let createdTestCopy = false;
  try {
    await access(TEST_COPY_PATH);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await backupDatabase(ARCHIVE_PATH, TEST_COPY_PATH);
    createdTestCopy = true;
  }

  const source = new Database(ARCHIVE_PATH, { readonly: true, fileMustExist: true });
  const testCopy = new Database(TEST_COPY_PATH, { readonly: true, fileMustExist: true });
  let beforeWriteCounts: TableCounts;
  try {
    assert.equal(testCopy.pragma('integrity_check', { simple: true }), 'ok');
    beforeWriteCounts = tableCounts(testCopy);
    if (createdTestCopy) assert.deepEqual(beforeWriteCounts, EXPECTED_SOURCE_COUNTS);
    else if (beforeWriteCounts.catalog < EXPECTED_SOURCE_COUNTS.catalog || beforeWriteCounts.checkpoints < EXPECTED_SOURCE_COUNTS.checkpoints) {
      throw new Error('Existing Phase 5B test copy has fewer records than the verified source archive. It was left untouched.');
    }
    assert.equal(schemaFingerprint(source), schemaFingerprint(testCopy), 'fresh backup schema must match official archive');
  } finally {
    source.close();
    testCopy.close();
  }

  const writerResult = await exerciseControlledWriter();
  const verify = new Database(TEST_COPY_PATH, { readonly: true, fileMustExist: true });
  let expectedAfterWrite: TableCounts;
  let testSchema: string;
  let testPayloadChecksums: { catalog: string; checkpoints: string };
  try {
    assert.equal(verify.pragma('integrity_check', { simple: true }), 'ok');
    expectedAfterWrite = tableCounts(verify);
    testSchema = schemaFingerprint(verify);
    testPayloadChecksums = {
      catalog: payloadChecksum(verify, 'techapi_catalog_records', 'source_key'),
      checkpoints: payloadChecksum(verify, 'techapi_import_checkpoints', 'file_key'),
    };
  } finally {
    verify.close();
  }

  const restorePath = `D:\\SmartElectronicsData\\techapi_catalog.phase5b-restore-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.sqlite`;
  await backupDatabase(TEST_COPY_PATH, restorePath);
  const restored = new Database(restorePath, { readonly: true, fileMustExist: true });
  let restoredHash: { catalog: string; checkpoints: string };
  try {
    assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
    assert.deepEqual(tableCounts(restored), expectedAfterWrite);
    assert.equal(schemaFingerprint(restored), testSchema!);
    restoredHash = {
      catalog: payloadChecksum(restored, 'techapi_catalog_records', 'source_key'),
      checkpoints: payloadChecksum(restored, 'techapi_import_checkpoints', 'file_key'),
    };
    assert.deepEqual(restoredHash, testPayloadChecksums);
    assert.equal((restored.prepare('SELECT version FROM archive_schema_version').get() as { version: number }).version, 1);
  } finally {
    restored.close();
  }

  const finalArchiveHash = await fileSha256(ARCHIVE_PATH);
  assert.equal(finalArchiveHash, initialArchiveHash, 'official archive file checksum must remain unchanged');
  const finalArchive = await stat(ARCHIVE_PATH);
  assert.equal(finalArchive.size, initialArchive.size, 'official archive size must remain unchanged');
  const resume = await readCounts(TEST_COPY_PATH);
  console.log(JSON.stringify({
    status: 'PASS',
    mode: 'local SQLite Backup API; no MongoDB, Atlas, network, or .env access',
    archivePath: ARCHIVE_PATH,
    officialArchiveSha256: finalArchiveHash,
    officialArchiveUnchanged: true,
    testCopyPath: TEST_COPY_PATH,
    testCopyCreatedDuringRun: createdTestCopy,
    countsBeforeWrites: writerResult.before,
    countsAfterWrites: writerResult.after,
    countsAfterReopen: resume,
    restorePath,
    restoreCounts: expectedAfterWrite,
    payloadSha256: restoredHash,
    schemaFingerprint: testSchema,
    checks: [
      'Backup API copy; read-only rejects writes (covered by unit tests)',
      'Index upsert preserves enrichment and updates metadata',
      'Full dataset upsert and checkpoint commit atomically',
      'Checkpoint SHA mismatch and missing catalog row do not resume-skip',
      'Rollback and retry; unique and NOT NULL constraints',
      'BSON ObjectId and Date round-trip; close/reopen',
      'Single writer lock used and released',
      'Backup restore count/schema/payload checksums and integrity_check',
    ],
    fixtureSourceKeyPrefix: FIXTURE_PREFIX,
    retryFileKey: writerResult.fileKey,
    hostname: hostname(),
    testCopyName: basename(TEST_COPY_PATH),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Phase 5B isolated SQLite validation failed.');
  process.exitCode = 1;
});
