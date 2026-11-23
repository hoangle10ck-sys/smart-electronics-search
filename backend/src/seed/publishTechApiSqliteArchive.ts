import { createHash } from 'node:crypto';
import { createReadStream, existsSync, fsyncSync, openSync, closeSync, renameSync, statSync, statfsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { EJSON } from 'bson';
import { serializeTechApiEjson } from '../repositories/sqliteTechApiRepository';
import {
  assertSqliteNotNullKeys,
  assertSqliteUniqueKeys,
} from './techApiSqliteArchiveVerification';

const DATA_DIRECTORY = 'D:\\SmartElectronicsData';
const STAGING_PATH = join(DATA_DIRECTORY, 'techapi_catalog.staging.sqlite');
const ARCHIVE_PATH = join(DATA_DIRECTORY, 'techapi_catalog.sqlite');
const MANIFEST_PATH = join(DATA_DIRECTORY, 'techapi_catalog.manifest.json');
const EXPECTED_COUNTS = { catalog: 131_064, checkpoints: 104_666, total: 235_730 };
const EXPECTED_SCHEMA_VERSION = 1;
const EXPECTED_PAYLOAD_CHECKSUMS = {
  catalog: 'b20cdf4fb4cee938bd6f541441dd54a4a3f612dd069a0354864eacba6bdcf7e0',
  checkpoints: '900d25dadc65bb9d0184d795fb49d04362ef8cd6273c44c48c343cf347d4151d',
  combined: '5c4ee45fe145c687e9f633a2e8f2c095a333006f06dc26d6cf32a0b6379a7bb1',
};
const PUBLISHER_VERSION = 'phase3.3-archive-publisher-1.0.0';
const MIGRATION_TOOL_VERSION = 'phase3-1.0.0';
const VERIFICATION_TOOL_VERSION = 'phase3.2-verify-only-1.0.0';

type Counts = { catalog: number; checkpoints: number; total: number };
type PayloadDigest = { checksum: string; documents: number };

class ArchivePublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchivePublishError';
  }
}

function count(database: Database.Database, sql: string): number {
  return (database.prepare(sql).get() as { count: number }).count;
}

function distribution(database: Database.Database, sql: string, keyName: string) {
  const rows = database.prepare(sql).all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({ key: (row[keyName] as string | null) ?? null, count: row.count as number }));
}

function duplicateGroups(database: Database.Database, sql: string) {
  return database.prepare(sql).all();
}

function payloadDigest(database: Database.Database, table: 'techapi_catalog_records' | 'techapi_import_checkpoints', keyColumn: 'source_key' | 'file_key'): PayloadDigest {
  const hash = createHash('sha256');
  const rows = database.prepare(`SELECT ${keyColumn} AS stable_key, document_ejson FROM ${table} ORDER BY ${keyColumn} COLLATE BINARY`).iterate() as IterableIterator<{
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

function summarizeDatabase(database: Database.Database) {
  const integrity = (database.pragma('integrity_check') as Array<{ integrity_check: string }>).map((row) => row.integrity_check);
  const schemaVersion = (database.prepare('SELECT MAX(version) AS version FROM archive_schema_version').get() as { version: number | null }).version;
  const counts: Counts = {
    catalog: count(database, 'SELECT COUNT(*) AS count FROM techapi_catalog_records'),
    checkpoints: count(database, 'SELECT COUNT(*) AS count FROM techapi_import_checkpoints'),
    total: 0,
  };
  counts.total = counts.catalog + counts.checkpoints;

  const categoryDistribution = distribution(database,
    'SELECT source_category AS category, COUNT(*) AS count FROM techapi_catalog_records GROUP BY source_category ORDER BY source_category', 'category');
  const workflowDistribution = distribution(database,
    'SELECT workflow_status AS status, COUNT(*) AS count FROM techapi_catalog_records GROUP BY workflow_status ORDER BY workflow_status', 'status');
  const detailsFetchedCount = count(database, 'SELECT COUNT(*) AS count FROM techapi_catalog_records WHERE details_fetched_at IS NOT NULL');
  const detailsFetchedDistribution = [
    { key: 'non_null', count: detailsFetchedCount },
    { key: 'null_or_missing', count: counts.catalog - detailsFetchedCount },
  ];
  const verifiedSocCount = count(database, "SELECT COUNT(*) AS count FROM techapi_catalog_records WHERE source_category = 'soc' AND raw_verified = 1");
  const checkpointSourceCommitDistribution = distribution(database,
    'SELECT source_commit, COUNT(*) AS count FROM techapi_import_checkpoints GROUP BY source_commit ORDER BY source_commit', 'source_commit');

  const uniqueIndexes = {
    catalog: assertSqliteUniqueKeys(database, 'techapi_catalog_records'),
    checkpoints: assertSqliteUniqueKeys(database, 'techapi_import_checkpoints'),
  };
  const notNullKeys = {
    catalog: assertSqliteNotNullKeys(database, 'techapi_catalog_records'),
    checkpoints: assertSqliteNotNullKeys(database, 'techapi_import_checkpoints'),
  };
  const duplicateKeyGroups = {
    catalogMongoId: duplicateGroups(database, 'SELECT mongo_id, COUNT(*) AS count FROM techapi_catalog_records GROUP BY mongo_id HAVING COUNT(*) > 1 LIMIT 10'),
    sourceKey: duplicateGroups(database, 'SELECT source_key, COUNT(*) AS count FROM techapi_catalog_records GROUP BY source_key HAVING COUNT(*) > 1 LIMIT 10'),
    categorySlug: duplicateGroups(database, 'SELECT source_category, source_slug, COUNT(*) AS count FROM techapi_catalog_records GROUP BY source_category, source_slug HAVING COUNT(*) > 1 LIMIT 10'),
    checkpointMongoId: duplicateGroups(database, 'SELECT mongo_id, COUNT(*) AS count FROM techapi_import_checkpoints GROUP BY mongo_id HAVING COUNT(*) > 1 LIMIT 10'),
    fileKey: duplicateGroups(database, 'SELECT file_key, COUNT(*) AS count FROM techapi_import_checkpoints GROUP BY file_key HAVING COUNT(*) > 1 LIMIT 10'),
  };
  const nullOrEmptyKeys = {
    catalog: count(database, `SELECT COUNT(*) AS count FROM techapi_catalog_records
      WHERE mongo_id IS NULL OR mongo_id = '' OR source_key IS NULL OR source_key = ''
      OR source_category IS NULL OR source_category = '' OR source_slug IS NULL OR source_slug = ''`),
    checkpoints: count(database, `SELECT COUNT(*) AS count FROM techapi_import_checkpoints
      WHERE mongo_id IS NULL OR mongo_id = '' OR file_key IS NULL OR file_key = ''`),
  };
  const journalMode = database.pragma('journal_mode', { simple: true }) as string;
  return {
    integrity,
    schemaVersion,
    counts,
    categoryDistribution,
    workflowDistribution,
    detailsFetchedCount,
    detailsFetchedDistribution,
    verifiedSocCount,
    checkpointSourceCommitDistribution,
    uniqueIndexes,
    notNullKeys,
    duplicateKeyGroups,
    nullOrEmptyKeys,
    journalMode,
  };
}

function combinedPayloadChecksum(catalog: string, checkpoints: string): string {
  return createHash('sha256').update(`${catalog}\n${checkpoints}\n`, 'utf8').digest('hex');
}

function assertPreflight(
  summary: ReturnType<typeof summarizeDatabase>,
  payloads: { catalog: string; checkpoints: string },
  expectedPayloads: typeof EXPECTED_PAYLOAD_CHECKSUMS,
) {
  if (summary.counts.catalog !== EXPECTED_COUNTS.catalog
    || summary.counts.checkpoints !== EXPECTED_COUNTS.checkpoints
    || summary.counts.total !== EXPECTED_COUNTS.total) {
    throw new ArchivePublishError('Staging counts do not match the approved Phase 3.2 snapshot.');
  }
  if (summary.schemaVersion !== EXPECTED_SCHEMA_VERSION) throw new ArchivePublishError('Staging schema version is unexpected.');
  if (summary.integrity.length !== 1 || summary.integrity[0] !== 'ok') throw new ArchivePublishError('Staging integrity_check did not return ok.');
  if (!summary.uniqueIndexes.catalog.allSatisfied || !summary.uniqueIndexes.checkpoints.allSatisfied) {
    throw new ArchivePublishError('Staging unique key constraints are incomplete.');
  }
  if (!summary.notNullKeys.catalog.allSatisfied || !summary.notNullKeys.checkpoints.allSatisfied) {
    throw new ArchivePublishError('Staging key columns are missing NOT NULL constraints.');
  }
  if (Object.values(summary.duplicateKeyGroups).some((groups) => groups.length > 0)) {
    throw new ArchivePublishError('Staging contains a duplicate key group.');
  }
  if (summary.nullOrEmptyKeys.catalog || summary.nullOrEmptyKeys.checkpoints) {
    throw new ArchivePublishError('Staging contains null or empty required keys.');
  }
  if (payloads.catalog !== expectedPayloads.catalog || payloads.checkpoints !== expectedPayloads.checkpoints
    || combinedPayloadChecksum(payloads.catalog, payloads.checkpoints) !== expectedPayloads.combined) {
    throw new ArchivePublishError('Staging payload checksum differs from Phase 3.2 verification.');
  }
}

async function fileSha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function getSidecarMetadata(databasePath: string) {
  return [`${databasePath}-wal`, `${databasePath}-shm`].map((path) => {
    try {
      const stat = statSync(path);
      return { path, exists: true, bytes: stat.size };
    } catch {
      return { path, exists: false, bytes: 0 };
    }
  });
}

function checkpointAndMakeCopyStandalone(path: string) {
  const database = new Database(path);
  let modeBefore: string;
  let modeAfter: string;
  let walCheckpoint: unknown = null;
  try {
    modeBefore = database.pragma('journal_mode', { simple: true }) as string;
    if (modeBefore.toLowerCase() === 'wal') {
      const checkpointRows = database.pragma('wal_checkpoint(TRUNCATE)') as Array<{ busy: number; log: number; checkpointed: number }>;
      walCheckpoint = checkpointRows;
      if (checkpointRows.some((row) => row.busy !== 0)) throw new ArchivePublishError('Could not checkpoint WAL on the temporary archive copy.');
      const modeResult = database.pragma('journal_mode = DELETE') as Array<{ journal_mode: string }>;
      modeAfter = modeResult[0]?.journal_mode ?? '';
    } else {
      modeAfter = modeBefore;
    }
    if (modeAfter.toLowerCase() !== 'delete') {
      throw new ArchivePublishError(`Temporary archive copy is not standalone; journal_mode=${modeAfter}.`);
    }
  } finally {
    database.close();
  }
  const sidecars = getSidecarMetadata(path);
  if (sidecars.some((sidecar) => sidecar.exists)) {
    throw new ArchivePublishError('Temporary archive copy still has WAL/SHM sidecars after close; preserving the copy for investigation.');
  }
  return { modeBefore, modeAfter, walCheckpoint, sidecarsAfterClose: sidecars };
}

function writeAtomicManifestTemp(path: string, manifest: Record<string, unknown>) {
  const descriptor = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

async function runPublish() {
  let stage = 'preflight';
  let source: Database.Database | undefined;
  let copyPath: string | undefined;
  let manifestTempPath: string | undefined;
  let archivePublished = false;
  const report: Record<string, unknown> = {
    mode: 'verified-staging-copy-and-publish',
    stagingPath: STAGING_PATH,
    archivePath: ARCHIVE_PATH,
    manifestPath: MANIFEST_PATH,
    atlasConnected: false,
    mongoConnected: false,
    applicationCutover: false,
  };

  try {
    if (process.platform !== 'win32') throw new ArchivePublishError('Archive publication is pinned to the requested Windows D: directory.');
    if (!existsSync(STAGING_PATH)) throw new ArchivePublishError('Verified staging database is missing.');
    if (existsSync(ARCHIVE_PATH)) throw new ArchivePublishError('Archive destination already exists; refusing to overwrite.');
    if (existsSync(MANIFEST_PATH)) throw new ArchivePublishError('Manifest destination already exists; refusing to overwrite.');
    const stagingStat = statSync(STAGING_PATH);
    const fs = statfsSync(DATA_DIRECTORY);
    const availableBytes = Number(fs.bavail) * Number(fs.bsize);
    const reserveBytes = stagingStat.size;
    const requiredBytes = stagingStat.size + reserveBytes;
    report.preflight = {
      stagingBytes: stagingStat.size,
      stagingModifiedAt: stagingStat.mtime.toISOString(),
      stagingSidecarsBefore: getSidecarMetadata(STAGING_PATH),
      availableBytes,
      requiredCopyPlusReserveBytes: requiredBytes,
      reserveBytes,
      archiveAbsent: true,
      manifestAbsent: true,
    };
    if (availableBytes < requiredBytes) throw new ArchivePublishError('Insufficient free space for one complete archive copy plus an equal-size safety reserve.');

    stage = 'staging_read_only_preflight';
    source = new Database(STAGING_PATH, { readonly: true, fileMustExist: true });
    const stagingSummary = summarizeDatabase(source);
    const stagingCatalogDigest = payloadDigest(source, 'techapi_catalog_records', 'source_key');
    const stagingCheckpointDigest = payloadDigest(source, 'techapi_import_checkpoints', 'file_key');
    assertPreflight(stagingSummary, {
      catalog: stagingCatalogDigest.checksum,
      checkpoints: stagingCheckpointDigest.checksum,
    }, EXPECTED_PAYLOAD_CHECKSUMS);
    if (stagingCatalogDigest.documents !== EXPECTED_COUNTS.catalog || stagingCheckpointDigest.documents !== EXPECTED_COUNTS.checkpoints) {
      throw new ArchivePublishError('Staging checksum scan document totals do not match expected counts.');
    }
    report.stagingVerification = {
      counts: stagingSummary.counts,
      schemaVersion: stagingSummary.schemaVersion,
      sqliteVersion: (source.prepare('SELECT sqlite_version() AS version').get() as { version: string }).version,
      journalMode: stagingSummary.journalMode,
      integrityCheck: stagingSummary.integrity,
      categoryDistribution: stagingSummary.categoryDistribution,
      workflowDistribution: stagingSummary.workflowDistribution,
      detailsFetchedCount: stagingSummary.detailsFetchedCount,
      detailsFetchedDistribution: stagingSummary.detailsFetchedDistribution,
      verifiedSocCount: stagingSummary.verifiedSocCount,
      checkpointSourceCommitDistribution: stagingSummary.checkpointSourceCommitDistribution,
      uniqueIndexes: {
        catalog: stagingSummary.uniqueIndexes.catalog,
        checkpoints: stagingSummary.uniqueIndexes.checkpoints,
      },
      notNullKeys: {
        catalog: stagingSummary.notNullKeys.catalog.checks,
        checkpoints: stagingSummary.notNullKeys.checkpoints.checks,
      },
      payloadChecksums: {
        catalog: stagingCatalogDigest,
        checkpoints: stagingCheckpointDigest,
        combined: combinedPayloadChecksum(stagingCatalogDigest.checksum, stagingCheckpointDigest.checksum),
      },
    };
    source.close();
    source = undefined;

    stage = 'backup_api_copy';
    const token = `${process.pid}.${Date.now()}`;
    copyPath = join(DATA_DIRECTORY, `techapi_catalog.publish.${token}.tmp`);
    manifestTempPath = join(DATA_DIRECTORY, `techapi_catalog.manifest.${token}.tmp`);
    if (existsSync(copyPath) || existsSync(`${copyPath}-wal`) || existsSync(`${copyPath}-shm`) || existsSync(manifestTempPath)) {
      throw new ArchivePublishError('A temporary publication path already exists; refusing to overwrite it.');
    }
    source = new Database(STAGING_PATH, { readonly: true, fileMustExist: true });
    const backupProgress = await source.backup(copyPath);
    source.close();
    source = undefined;
    report.backupApi = { completed: true, remainingPages: backupProgress.remainingPages, totalPages: backupProgress.totalPages };

    stage = 'copy_wal_and_sidecar_handling';
    const copyJournal = checkpointAndMakeCopyStandalone(copyPath);
    report.copyJournal = copyJournal;

    stage = 'copy_read_only_verification';
    const copied = new Database(copyPath, { readonly: true, fileMustExist: true });
    let copySummary: ReturnType<typeof summarizeDatabase>;
    let copyCatalogDigest: PayloadDigest;
    let copyCheckpointDigest: PayloadDigest;
    try {
      copySummary = summarizeDatabase(copied);
      copyCatalogDigest = payloadDigest(copied, 'techapi_catalog_records', 'source_key');
      copyCheckpointDigest = payloadDigest(copied, 'techapi_import_checkpoints', 'file_key');
    } finally {
      copied.close();
    }
    assertPreflight(copySummary!, {
      catalog: copyCatalogDigest!.checksum,
      checkpoints: copyCheckpointDigest!.checksum,
    }, EXPECTED_PAYLOAD_CHECKSUMS);
    if (JSON.stringify(copySummary!.counts) !== JSON.stringify(stagingSummary.counts)
      || JSON.stringify(copySummary!.categoryDistribution) !== JSON.stringify(stagingSummary.categoryDistribution)
      || JSON.stringify(copySummary!.workflowDistribution) !== JSON.stringify(stagingSummary.workflowDistribution)
      || copySummary!.detailsFetchedCount !== stagingSummary.detailsFetchedCount
      || copySummary!.verifiedSocCount !== stagingSummary.verifiedSocCount
      || JSON.stringify(copySummary!.checkpointSourceCommitDistribution) !== JSON.stringify(stagingSummary.checkpointSourceCommitDistribution)
      || copyCatalogDigest!.checksum !== stagingCatalogDigest.checksum
      || copyCheckpointDigest!.checksum !== stagingCheckpointDigest.checksum) {
      throw new ArchivePublishError('Temporary archive copy does not exactly match the verified staging snapshot.');
    }
    const reopen = new Database(copyPath, { readonly: true, fileMustExist: true });
    let reopenedIntegrity: string[];
    let reopenedCounts: Counts;
    let reopenedSchemaVersion: number | null;
    try {
      reopenedIntegrity = (reopen.pragma('integrity_check') as Array<{ integrity_check: string }>).map((row) => row.integrity_check);
      reopenedCounts = {
        catalog: count(reopen, 'SELECT COUNT(*) AS count FROM techapi_catalog_records'),
        checkpoints: count(reopen, 'SELECT COUNT(*) AS count FROM techapi_import_checkpoints'),
        total: 0,
      };
      reopenedCounts.total = reopenedCounts.catalog + reopenedCounts.checkpoints;
      reopenedSchemaVersion = (reopen.prepare('SELECT MAX(version) AS version FROM archive_schema_version').get() as { version: number | null }).version;
    } finally {
      reopen.close();
    }
    if (reopenedIntegrity.length !== 1 || reopenedIntegrity[0] !== 'ok'
      || JSON.stringify(reopenedCounts!) !== JSON.stringify(EXPECTED_COUNTS)
      || reopenedSchemaVersion !== EXPECTED_SCHEMA_VERSION) {
      throw new ArchivePublishError('Temporary archive failed read-only reopen checks.');
    }
    const temporarySidecars = getSidecarMetadata(copyPath);
    if (temporarySidecars.some((sidecar) => sidecar.exists)) {
      throw new ArchivePublishError('Temporary archive acquired sidecars after read-only reopen; preserving it for investigation.');
    }
    report.copyVerification = {
      counts: copySummary!.counts,
      schemaVersion: copySummary!.schemaVersion,
      journalMode: copySummary!.journalMode,
      integrityCheck: copySummary!.integrity,
      reopenedReadOnly: { succeeded: true, integrityCheck: reopenedIntegrity!, counts: reopenedCounts!, schemaVersion: reopenedSchemaVersion },
      uniqueIndexes: { catalog: copySummary!.uniqueIndexes.catalog, checkpoints: copySummary!.uniqueIndexes.checkpoints },
      notNullKeys: { catalog: copySummary!.notNullKeys.catalog.checks, checkpoints: copySummary!.notNullKeys.checkpoints.checks },
      payloadChecksums: {
        catalog: copyCatalogDigest!,
        checkpoints: copyCheckpointDigest!,
        combined: combinedPayloadChecksum(copyCatalogDigest!.checksum, copyCheckpointDigest!.checksum),
      },
      sidecarsAfterClose: temporarySidecars,
    };

    stage = 'hash_archive_file';
    const copyDescriptor = openSync(copyPath, 'r+');
    try { fsyncSync(copyDescriptor); } finally { closeSync(copyDescriptor); }
    const archiveSize = statSync(copyPath).size;
    const archiveFileSha256 = await fileSha256(copyPath);
    report.archiveFile = { sizeBytes: archiveSize, sha256: archiveFileSha256 };

    const verifiedAt = new Date().toISOString();
    const manifest = {
      archiveName: 'techapi_catalog.sqlite',
      sourceStagingName: 'techapi_catalog.staging.sqlite',
      schemaVersion: EXPECTED_SCHEMA_VERSION,
      sqliteVersion: report.stagingVerification && (report.stagingVerification as any).sqliteVersion,
      tableCounts: copySummary!.counts,
      categoryDistribution: copySummary!.categoryDistribution,
      workflowStatusDistribution: copySummary!.workflowDistribution,
      detailsFetchedAtDistribution: copySummary!.detailsFetchedDistribution,
      verifiedSocCount: copySummary!.verifiedSocCount,
      checkpointSourceCommitDistribution: copySummary!.checkpointSourceCommitDistribution,
      sourcePayloadChecksums: {
        catalog: stagingCatalogDigest.checksum,
        checkpoints: stagingCheckpointDigest.checksum,
        combined: combinedPayloadChecksum(stagingCatalogDigest.checksum, stagingCheckpointDigest.checksum),
      },
      archivePayloadChecksums: {
        catalog: copyCatalogDigest!.checksum,
        checkpoints: copyCheckpointDigest!.checksum,
        combined: combinedPayloadChecksum(copyCatalogDigest!.checksum, copyCheckpointDigest!.checksum),
      },
      archiveFileSha256,
      archiveFileSizeBytes: archiveSize,
      integrityCheck: copySummary!.integrity[0],
      uniqueIndexVerification: {
        catalog: copySummary!.uniqueIndexes.catalog.checks,
        checkpoints: copySummary!.uniqueIndexes.checkpoints.checks,
      },
      notNullVerification: {
        catalog: copySummary!.notNullKeys.catalog.checks,
        checkpoints: copySummary!.notNullKeys.checkpoints.checks,
      },
      searchParity: 'LIMITED_UNSORTED_500_CAP',
      searchParityNote: 'Brand/manufacturer exceeded 500 candidates and MongoDB result ordering is not stable; C++ positive match was not tested.',
      cppPositiveCase: 'NOT_TESTED',
      dataIntegrity: 'PASS',
      overallStatus: 'PASS_WITH_LIMITATIONS',
      cutoverEligible: false,
      verificationTimestamp: verifiedAt,
      toolVersions: {
        migration: MIGRATION_TOOL_VERSION,
        verification: VERIFICATION_TOOL_VERSION,
        archivePublisher: PUBLISHER_VERSION,
      },
      atlasConnected: false,
      mongoWritePerformed: false,
    };
    writeAtomicManifestTemp(manifestTempPath, manifest);

    stage = 'publish_archive';
    if (existsSync(ARCHIVE_PATH)) throw new ArchivePublishError('Archive destination appeared before publish; refusing to overwrite.');
    if (existsSync(MANIFEST_PATH)) throw new ArchivePublishError('Manifest destination appeared before publish; refusing to overwrite.');
    renameSync(copyPath, ARCHIVE_PATH);
    archivePublished = true;
    copyPath = undefined;
    report.archivePublished = true;

    stage = 'publish_manifest';
    renameSync(manifestTempPath, MANIFEST_PATH);
    manifestTempPath = undefined;
    report.manifestPublished = true;
    report.manifest = manifest;
    report.overallStatus = 'PASS_WITH_LIMITATIONS';
  } catch (error) {
    report.failure = {
      stage,
      message: error instanceof ArchivePublishError
        ? error.message
        : `Unexpected ${error instanceof Error ? error.name : 'Error'}; sensitive details are suppressed.`,
    };
    report.archivePublished = archivePublished;
    report.manifestPublished = existsSync(MANIFEST_PATH);
    report.temporaryCopyPath = copyPath && existsSync(copyPath) ? copyPath : null;
    report.temporaryManifestPath = manifestTempPath && existsSync(manifestTempPath) ? manifestTempPath : null;
    report.overallStatus = 'BLOCKED';
    process.exitCode = 1;
  } finally {
    if (source?.open) source.close();
  }
  report.finalFiles = {
    archiveExists: existsSync(ARCHIVE_PATH),
    manifestExists: existsSync(MANIFEST_PATH),
    stagingExists: existsSync(STAGING_PATH),
    stagingSizeBytes: existsSync(STAGING_PATH) ? statSync(STAGING_PATH).size : null,
    stagingModifiedAt: existsSync(STAGING_PATH) ? statSync(STAGING_PATH).mtime.toISOString() : null,
    stagingSidecars: getSidecarMetadata(STAGING_PATH),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) void runPublish();
