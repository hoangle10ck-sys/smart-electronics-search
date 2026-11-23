import { createHash } from 'node:crypto';
import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  openSync,
  realpathSync,
  renameSync,
  statSync,
  statfsSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import { EJSON } from 'bson';
import mongoose from 'mongoose';
import { serializeTechApiEjson, SqliteTechApiRepository } from '../repositories/sqliteTechApiRepository';
import { TechApiDiscoveryQuery } from '../repositories/techApiRepository';
import {
  assertSqliteNotNullKeys,
  assertSqliteUniqueKeys,
} from './techApiSqliteArchiveVerification';

const SOURCE_URI = 'mongodb://127.0.0.1:27017/smart_electronics_restore_test?directConnection=true';
const SOURCE_HOST = '127.0.0.1';
const SOURCE_PORT = 27017;
const SOURCE_DATABASE = 'smart_electronics_restore_test';
const CATALOG_COLLECTION = 'techapicatalogrecords';
const CHECKPOINT_COLLECTION = 'techapiimportcheckpoints';
const EXPECTED_CATALOG_COUNT = 131_064;
const EXPECTED_CHECKPOINT_COUNT = 104_666;
const DATA_DIRECTORY = 'D:\\SmartElectronicsData';
const STAGING_PATH = join(DATA_DIRECTORY, 'techapi_catalog.staging.sqlite');
const ARCHIVE_PATH = join(DATA_DIRECTORY, 'techapi_catalog.sqlite');
const MANIFEST_PATH = join(DATA_DIRECTORY, 'techapi_catalog.manifest.json');
const BATCH_SIZE = 250;
const SCHEMA_VERSION = 1;
const MIGRATION_TOOL_VERSION = 'phase3-1.0.0';
const EXPECTED_UNIQUE_KEYS = {
  catalog: [['sourceKey'], ['sourceCategory', 'sourceSlug']],
  checkpoints: [['fileKey']],
};

type SafeSource = { host: string; port: number; database: string };
type DistributionRow = { key: string | null; count: number };
type MigrationMetrics = {
  counts: { catalog: number; checkpoints: number; total: number };
  categoryCounts: DistributionRow[];
  detailsFetchedCount: number;
  workflowCounts: DistributionRow[];
  verifiedSocCount: number;
  checkpointSourceCommits: DistributionRow[];
  uniqueKeys: { sourceKeyDuplicates: number; categorySlugDuplicates: number; fileKeyDuplicates: number };
  indexes: { catalog: string[]; checkpoints: string[] };
  bsonBytes: { catalog: number; checkpoints: number; indexBytes: number };
};
type ChecksumResult = {
  sourceChecksum: string;
  sqliteChecksum: string;
  sourceDocuments: number;
  sqliteDocuments: number;
  matchedDocuments: number;
  missingInSqlite: number;
  extraInSqlite: number;
  differentDocuments: number;
  mismatchSamples: string[];
};

class SafeMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeMigrationError';
  }
}

function isWithinDirectory(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);
  return relativePath === '' || (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !relativePath.startsWith('../') && !isAbsolutePath(relativePath));
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('\\\\') || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/');
}

export function assertSafeLocalRestoreUri(uri: string): SafeSource {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new SafeMigrationError('Source URI is malformed.');
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  const port = parsed.port ? Number(parsed.port) : SOURCE_PORT;
  const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (parsed.protocol !== 'mongodb:' || !allowedHosts.has(hostname)) {
    throw new SafeMigrationError('Source host must be a loopback MongoDB endpoint.');
  }
  if (parsed.username || parsed.password) throw new SafeMigrationError('Credential-bearing source URIs are not accepted by this migration tool.');
  if (database !== SOURCE_DATABASE) throw new SafeMigrationError(`Source database must be ${SOURCE_DATABASE}.`);
  if (port !== SOURCE_PORT) throw new SafeMigrationError(`Source port must be ${SOURCE_PORT}.`);
  if (parsed.searchParams.get('directConnection') !== 'true') {
    throw new SafeMigrationError('Source must use a direct local MongoDB connection.');
  }
  return { host: hostname, port, database };
}

function preflightDestination(): { realDirectory: string; freeBytes: number } {
  if (process.platform !== 'win32') throw new SafeMigrationError('This staging migration is pinned to the requested Windows D: destination.');
  if (!existsSync(DATA_DIRECTORY)) {
    throw new SafeMigrationError(`Required destination directory does not exist: ${DATA_DIRECTORY}. It will not be created automatically.`);
  }
  const directoryStat = statSync(DATA_DIRECTORY);
  if (!directoryStat.isDirectory()) throw new SafeMigrationError('The requested staging destination is not a directory.');
  const realDirectory = realpathSync(DATA_DIRECTORY);
  const projectRoot = realpathSync(resolve(__dirname, '../../..'));
  if (isWithinDirectory(projectRoot, realDirectory)) throw new SafeMigrationError('Staging destination must be outside the Git repository.');
  accessSync(realDirectory, constants.R_OK | constants.W_OK);

  for (const path of [STAGING_PATH, ARCHIVE_PATH, MANIFEST_PATH]) {
    if (existsSync(path)) throw new SafeMigrationError(`Refusing to overwrite existing migration output: ${path}`);
  }

  const probePath = join(realDirectory, `.techapi-staging-preflight-${process.pid}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(probePath, 'wx');
    closeSync(descriptor);
    descriptor = undefined;
    unlinkSync(probePath);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    throw new SafeMigrationError(`Staging destination is not writable (code ${getErrorCode(error)}).`);
  }
  let freeBytes: number;
  try {
    const disk = statfsSync(realDirectory);
    freeBytes = Number(disk.bavail) * Number(disk.bsize);
  } catch (error) {
    throw new SafeMigrationError(`Could not determine free space on the staging volume (code ${getErrorCode(error)}).`);
  }
  return { realDirectory, freeBytes };
}

function getErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code;
  return error instanceof Error ? error.name : 'unknown';
}

function orderedIndexFields(index: any): string[] {
  return Object.keys(index.key ?? {});
}

function hasUniqueIndex(indexes: any[], expectedFields: string[]): boolean {
  return indexes.some((index) => index.unique === true && JSON.stringify(orderedIndexFields(index)) === JSON.stringify(expectedFields));
}

async function duplicateKeys(collection: any, keyExpression: unknown): Promise<number> {
  const rows = await collection.aggregate([
    { $group: { _id: keyExpression, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 5 },
  ]).toArray();
  return rows.length;
}

async function readSourceMetrics(db: any): Promise<MigrationMetrics> {
  const catalog = db.collection(CATALOG_COLLECTION);
  const checkpoints = db.collection(CHECKPOINT_COLLECTION);
  const [catalogCount, checkpointCount, catalogIndexes, checkpointIndexes] = await Promise.all([
    catalog.countDocuments({}), checkpoints.countDocuments({}), catalog.indexes(), checkpoints.indexes(),
  ]);
  if (catalogCount !== EXPECTED_CATALOG_COUNT || checkpointCount !== EXPECTED_CHECKPOINT_COUNT) {
    throw new SafeMigrationError(`Source counts differ from the approved snapshot (catalog=${catalogCount}, checkpoints=${checkpointCount}).`);
  }
  if (!EXPECTED_UNIQUE_KEYS.catalog.every((fields) => hasUniqueIndex(catalogIndexes, fields))) {
    throw new SafeMigrationError('Source catalog is missing a required unique index.');
  }
  if (!EXPECTED_UNIQUE_KEYS.checkpoints.every((fields) => hasUniqueIndex(checkpointIndexes, fields))) {
    throw new SafeMigrationError('Source checkpoints are missing the unique fileKey index.');
  }

  const [sourceKeyDuplicates, identityDuplicates, fileKeyDuplicates] = await Promise.all([
    duplicateKeys(catalog, '$sourceKey'),
    duplicateKeys(catalog, { sourceCategory: '$sourceCategory', sourceSlug: '$sourceSlug' }),
    duplicateKeys(checkpoints, '$fileKey'),
  ]);
  if (sourceKeyDuplicates || identityDuplicates || fileKeyDuplicates) {
    throw new SafeMigrationError(`Source has duplicate unique keys (sourceKey=${sourceKeyDuplicates}, categorySlug=${identityDuplicates}, fileKey=${fileKeyDuplicates}).`);
  }

  const validCatalogCount = await catalog.countDocuments({
    _id: { $exists: true },
    sourceKey: { $type: 'string', $ne: '' },
    sourceCategory: { $type: 'string', $ne: '' },
    sourceSlug: { $type: 'string', $ne: '' },
    name: { $type: 'string', $ne: '' },
    sourceRecordUrl: { $type: 'string', $ne: '' },
    sourceListUrl: { $type: 'string', $ne: '' },
    dataAttribution: { $type: 'string', $ne: '' },
    dataSourceUrl: { $type: 'string', $ne: '' },
    dataLicense: { $type: 'string', $ne: '' },
    dataLicenseUrl: { $type: 'string', $ne: '' },
    licenseTermsUrl: { $type: 'string', $ne: '' },
    workflowStatus: 'discovery_only',
    raw: { $type: 'object' },
    lastSeenAt: { $type: 'date' },
  });
  const validCheckpointCount = await checkpoints.countDocuments({
    _id: { $exists: true },
    fileKey: { $type: 'string', $ne: '' },
    sourcePath: { $type: 'string', $ne: '' },
    sourceCommit: { $type: 'string', $ne: '' },
    sha256: { $type: 'string', $ne: '' },
    recordCount: { $type: 'number' },
    importedAt: { $type: 'date' },
  });
  if (validCatalogCount !== catalogCount || validCheckpointCount !== checkpointCount) {
    throw new SafeMigrationError(`Source contains documents incompatible with the staging schema (catalog invalid=${catalogCount - validCatalogCount}, checkpoint invalid=${checkpointCount - validCheckpointCount}).`);
  }

  const [categoryCounts, detailsFetchedCount, workflowCounts, verifiedSocCount, checkpointSourceCommits, catalogStats, checkpointStats] = await Promise.all([
    catalog.aggregate([{ $group: { _id: '$sourceCategory', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray(),
    catalog.countDocuments({ detailsFetchedAt: { $ne: null } }),
    catalog.aggregate([{ $group: { _id: '$workflowStatus', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray(),
    catalog.countDocuments({ sourceCategory: 'soc', 'raw.verified': true }),
    checkpoints.aggregate([{ $group: { _id: '$sourceCommit', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray(),
    db.command({ collStats: CATALOG_COLLECTION }),
    db.command({ collStats: CHECKPOINT_COLLECTION }),
  ]);

  return {
    counts: { catalog: catalogCount, checkpoints: checkpointCount, total: catalogCount + checkpointCount },
    categoryCounts: categoryCounts.map((row: any) => ({ key: row._id ?? null, count: row.count })),
    detailsFetchedCount,
    workflowCounts: workflowCounts.map((row: any) => ({ key: row._id ?? null, count: row.count })),
    verifiedSocCount,
    checkpointSourceCommits: checkpointSourceCommits.map((row: any) => ({ key: row._id ?? null, count: row.count })),
    uniqueKeys: { sourceKeyDuplicates, categorySlugDuplicates: identityDuplicates, fileKeyDuplicates },
    indexes: {
      catalog: catalogIndexes.filter((index: any) => index.unique).map((index: any) => index.name).sort(),
      checkpoints: checkpointIndexes.filter((index: any) => index.unique).map((index: any) => index.name).sort(),
    },
    bsonBytes: {
      catalog: catalogStats.size,
      checkpoints: checkpointStats.size,
      indexBytes: catalogStats.totalIndexSize + checkpointStats.totalIndexSize,
    },
  };
}

function estimateRequiredBytes(metrics: MigrationMetrics): number {
  // Canonical Extended JSON expands BSON; reserve 2.5x source BSON size plus index and WAL headroom.
  const sourceData = metrics.bsonBytes.catalog + metrics.bsonBytes.checkpoints;
  return Math.ceil(sourceData * 2.5 + metrics.bsonBytes.indexBytes * 2 + 64 * 1024 * 1024);
}

function addDocumentToHash(hash: ReturnType<typeof createHash>, key: string, canonicalEjson: string): void {
  const documentHash = createHash('sha256').update(canonicalEjson, 'utf8').digest('hex');
  hash.update(`${JSON.stringify(key)}:${documentHash}\n`, 'utf8');
}

async function importCollectionBatches(
  collection: any,
  collectionName: string,
  keyField: 'sourceKey' | 'fileKey',
  insertBatch: (records: Array<Record<string, unknown>>) => Promise<void>,
): Promise<number> {
  const cursor = collection.find({}).sort({ [keyField]: 1 }).batchSize(BATCH_SIZE);
  const batch: Array<Record<string, unknown>> = [];
  let batchNumber = 0;
  let imported = 0;
  let firstKey: string | undefined;
  try {
    for await (const sourceDocument of cursor) {
      const document = sourceDocument as Record<string, unknown>;
      const key = document[keyField];
      if (typeof key !== 'string') throw new SafeMigrationError(`${collectionName} contains a document without a string ${keyField}.`);
      if (batch.length === 0) firstKey = key;
      batch.push(document);
      if (batch.length < BATCH_SIZE) continue;
      batchNumber += 1;
      await writeBatch(batch, insertBatch, collectionName, batchNumber, keyField, firstKey!, key);
      imported += batch.length;
      console.log(JSON.stringify({ event: 'migration_batch', collection: collectionName, batch: batchNumber, imported, expected: collectionName === CATALOG_COLLECTION ? EXPECTED_CATALOG_COUNT : EXPECTED_CHECKPOINT_COUNT }));
      batch.length = 0;
      firstKey = undefined;
    }
    if (batch.length) {
      batchNumber += 1;
      const lastKey = String(batch[batch.length - 1][keyField]);
      await writeBatch(batch, insertBatch, collectionName, batchNumber, keyField, firstKey!, lastKey);
      imported += batch.length;
      console.log(JSON.stringify({ event: 'migration_batch', collection: collectionName, batch: batchNumber, imported, expected: collectionName === CATALOG_COLLECTION ? EXPECTED_CATALOG_COUNT : EXPECTED_CHECKPOINT_COUNT }));
    }
  } finally {
    await cursor.close();
  }
  return imported;
}

async function writeBatch(
  batch: Array<Record<string, unknown>>,
  insertBatch: (records: Array<Record<string, unknown>>) => Promise<void>,
  collectionName: string,
  batchNumber: number,
  keyField: 'sourceKey' | 'fileKey',
  firstKey: string,
  lastKey: string,
): Promise<void> {
  try {
    await insertBatch(batch);
  } catch (error) {
    const reason = error instanceof Error ? error.message : getErrorCode(error);
    throw new SafeMigrationError(`${collectionName} batch ${batchNumber} (${firstKey}..${lastKey}) failed at ${keyField}: ${reason}`);
  }
}

async function compareCollectionPayloads(
  sourceCollection: any,
  sqlite: Database.Database,
  collectionName: string,
  keyField: 'sourceKey' | 'fileKey',
  tableName: 'techapi_catalog_records' | 'techapi_import_checkpoints',
): Promise<ChecksumResult> {
  const sourceCursor = sourceCollection.find({}).sort({ [keyField]: 1 }).batchSize(BATCH_SIZE);
  const sqliteRows = sqlite.prepare(`SELECT ${keyField === 'sourceKey' ? 'source_key' : 'file_key'} AS record_key, document_ejson FROM ${tableName} ORDER BY ${keyField === 'sourceKey' ? 'source_key' : 'file_key'} COLLATE BINARY`).iterate() as IterableIterator<{ record_key: string; document_ejson: string }>;
  const sourceHash = createHash('sha256');
  const sqliteHash = createHash('sha256');
  const sourceIterator = sourceCursor[Symbol.asyncIterator]();
  const targetIterator = sqliteRows[Symbol.iterator]();
  let sourceNext = await sourceIterator.next();
  let targetNext = targetIterator.next();
  let sourceDocuments = 0;
  let sqliteDocuments = 0;
  let matchedDocuments = 0;
  let missingInSqlite = 0;
  let extraInSqlite = 0;
  let differentDocuments = 0;
  const mismatchSamples: string[] = [];

  while (!sourceNext.done || !targetNext.done) {
    const sourceDocument = sourceNext.done ? undefined : sourceNext.value as Record<string, unknown>;
    const targetRow = targetNext.done ? undefined : targetNext.value;
    const sourceKey = sourceDocument ? String(sourceDocument[keyField]) : undefined;
    const targetKey = targetRow?.record_key;
    const sourceCanonical = sourceDocument ? serializeTechApiEjson(sourceDocument) : undefined;
    const targetDocument = targetRow ? EJSON.parse(targetRow.document_ejson, { relaxed: false }) : undefined;
    const targetCanonical = targetDocument ? serializeTechApiEjson(targetDocument) : undefined;

    if (sourceDocument && sourceCanonical !== undefined) {
      addDocumentToHash(sourceHash, sourceKey!, sourceCanonical);
      sourceDocuments += 1;
    }
    if (targetRow && targetCanonical !== undefined) {
      addDocumentToHash(sqliteHash, targetKey!, targetCanonical);
      sqliteDocuments += 1;
    }

    if (sourceKey === undefined) {
      extraInSqlite += 1;
      if (mismatchSamples.length < 20) mismatchSamples.push(`extra:${targetKey}`);
      targetNext = targetIterator.next();
      continue;
    }
    if (targetKey === undefined) {
      missingInSqlite += 1;
      if (mismatchSamples.length < 20) mismatchSamples.push(`missing:${sourceKey}`);
      sourceNext = await sourceIterator.next();
      continue;
    }
    if (sourceKey === targetKey) {
      if (sourceCanonical !== targetCanonical) {
        differentDocuments += 1;
        if (mismatchSamples.length < 20) mismatchSamples.push(`different:${sourceKey}`);
      } else {
        matchedDocuments += 1;
      }
      sourceNext = await sourceIterator.next();
      targetNext = targetIterator.next();
      continue;
    }
    if (sourceKey < targetKey) {
      missingInSqlite += 1;
      if (mismatchSamples.length < 20) mismatchSamples.push(`missing:${sourceKey}`);
      sourceNext = await sourceIterator.next();
    } else {
      extraInSqlite += 1;
      if (mismatchSamples.length < 20) mismatchSamples.push(`extra:${targetKey}`);
      targetNext = targetIterator.next();
    }
  }
  await sourceCursor.close();

  return {
    sourceChecksum: sourceHash.digest('hex'),
    sqliteChecksum: sqliteHash.digest('hex'),
    sourceDocuments,
    sqliteDocuments,
    matchedDocuments,
    missingInSqlite,
    extraInSqlite,
    differentDocuments,
    mismatchSamples,
  };
}

function sourceRegex(term: string): RegExp {
  return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function discoveryFilter(query: TechApiDiscoveryQuery): Record<string, unknown> {
  const filter: Record<string, any> = { sourceCategory: { $in: query.categories } };
  if (query.queryTerms.length) {
    filter.$and = query.queryTerms.map((term) => ({ $or: [
      { name: { $regex: sourceRegex(term) } },
      { searchText: { $regex: sourceRegex(term) } },
    ] }));
  }
  if (query.brandTerms.length) {
    const pattern = query.brandTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    filter.$and ??= [];
    filter.$and.push({ $or: [
      { name: { $regex: pattern, $options: 'i' } },
      { 'raw.manufacturer': { $regex: pattern, $options: 'i' } },
      { 'raw.manufacturer.name': { $regex: pattern, $options: 'i' } },
      { 'raw.brand': { $regex: pattern, $options: 'i' } },
    ] });
  }
  return filter;
}

async function compareDiscoveryQuery(sourceCatalog: any, sqliteRepository: SqliteTechApiRepository, name: string, query: TechApiDiscoveryQuery) {
  const filter = discoveryFilter(query);
  const sourceCount = await sourceCatalog.countDocuments(filter);
  let sourceCursor = sourceCatalog.find(filter, { projection: {
    sourceCategory: 1, sourceSlug: 1, name: 1, sourceRecordUrl: 1, dataAttribution: 1,
    dataSourceUrl: 1, dataLicense: 1, dataLicenseUrl: 1, searchText: 1, raw: 1,
  } });
  if (query.offset && query.offset > 0) sourceCursor = sourceCursor.skip(query.offset);
  const sourceRows = await sourceCursor.limit(query.limit).toArray();
  const sqliteRows = await sqliteRepository.findDiscoveryCandidates(query);
  const identity = (row: any) => JSON.stringify([row.sourceCategory, row.sourceSlug]);
  const sourceIdentities = sourceRows.map(identity).sort();
  const sqliteIdentities = sqliteRows.map(identity).sort();
  const exactSetMatch = JSON.stringify(sourceIdentities) === JSON.stringify(sqliteIdentities);
  return {
    name,
    totalMatchingSourceRows: sourceCount,
    sourceReturned: sourceRows.length,
    sqliteReturned: sqliteRows.length,
    exactSetMatch,
    status: sourceCount > query.limit ? 'LIMITED_UNSORTED_500_CAP' : exactSetMatch ? 'PASS' : 'FAIL',
  };
}

async function verifyRepositoryQueries(db: any, sqliteRepository: SqliteTechApiRepository) {
  const catalog = db.collection(CATALOG_COLLECTION);
  const categoryCountsSource = await catalog.aggregate([
    { $group: { _id: '$sourceCategory', count: { $sum: 1 } } }, { $sort: { _id: 1 } },
  ]).toArray();
  const categoryCountsTarget = await sqliteRepository.countCatalogRecordsByCategory();
  const categoriesExact = JSON.stringify(categoryCountsSource.map((row: any) => ({ category: row._id, records: row.count })))
    === JSON.stringify(categoryCountsTarget);

  const monitorQuery: TechApiDiscoveryQuery = { categories: ['monitor'], queryTerms: [], brandTerms: [], limit: 500 };
  const monitorResult = await compareDiscoveryQuery(catalog, sqliteRepository, 'category:monitor', monitorQuery);
  const keywordSample = await catalog.findOne({ sourceCategory: 'laptop', name: { $type: 'string', $ne: '' } }, { projection: { name: 1 } });
  if (!keywordSample?.name) throw new SafeMigrationError('Could not select a source fixture for keyword query verification.');
  const keywordResult = await compareDiscoveryQuery(catalog, sqliteRepository, 'keyword:exact-source-name', {
    categories: ['laptop'], queryTerms: [keywordSample.name], brandTerms: [], limit: 500,
  });
  const brandSample = await catalog.findOne({
    sourceCategory: 'laptop',
    $or: [
      { 'raw.manufacturer': { $type: 'string', $ne: '' } },
      { 'raw.manufacturer.name': { $type: 'string', $ne: '' } },
    ],
  }, { projection: { raw: 1 } });
  const brand = typeof brandSample?.raw?.manufacturer === 'string'
    ? brandSample.raw.manufacturer
    : brandSample?.raw?.manufacturer?.name;
  if (typeof brand !== 'string' || !brand) throw new SafeMigrationError('Could not select a source fixture for manufacturer query verification.');
  const brandResult = await compareDiscoveryQuery(catalog, sqliteRepository, 'brand:source-manufacturer', {
    categories: ['laptop'], queryTerms: [], brandTerms: [brand], limit: 500,
  });
  const unicodeResult = await compareDiscoveryQuery(catalog, sqliteRepository, 'unicode:accented-query', {
    categories: ['device_catalog'], queryTerms: ['máy ảnh'], brandTerms: [], limit: 500,
  });
  const metacharacterResult = await compareDiscoveryQuery(catalog, sqliteRepository, 'literal:C++', {
    categories: ['device_catalog'], queryTerms: ['C++'], brandTerms: [], limit: 500,
  });

  const verifiedSocSource = await catalog.find({ sourceCategory: 'soc', 'raw.verified': true }, { projection: { sourceCategory: 1, sourceSlug: 1 } }).toArray();
  const verifiedSocTarget = await sqliteRepository.findVerifiedSocRecords();
  const socIdentity = (row: any) => JSON.stringify([row.sourceCategory, row.sourceSlug]);
  const verifiedSocExact = JSON.stringify(verifiedSocSource.map(socIdentity).sort()) === JSON.stringify(verifiedSocTarget.map(socIdentity).sort());

  const sourceEnrichment = await catalog.find({ detailsFetchedAt: null }, { projection: { sourceKey: 1, sourceCategory: 1, sourceSlug: 1, name: 1, sourceRecordUrl: 1 } })
    .sort({ lastSeenAt: -1, sourceCategory: 1, sourceSlug: 1 }).limit(100).toArray();
  const targetEnrichment = await sqliteRepository.findCatalogReferencesForEnrichment({ refresh: false, limit: 100 });
  const enrichmentExact = JSON.stringify(sourceEnrichment.map((row: any) => row.sourceKey)) === JSON.stringify(targetEnrichment.map((row) => row.sourceKey));

  const checkpointKeys = await db.collection(CHECKPOINT_COLLECTION).find({}, { projection: { fileKey: 1 } }).sort({ fileKey: 1 }).limit(25).map((row: any) => row.fileKey).toArray();
  const sourceCheckpoints = await db.collection(CHECKPOINT_COLLECTION).find({ fileKey: { $in: checkpointKeys } }).toArray();
  const targetCheckpoints = await sqliteRepository.findCheckpoints(checkpointKeys);
  const checkpointCanonical = (rows: any[]) => rows.map((row) => serializeTechApiEjson(row)).sort();
  const checkpointLookupExact = JSON.stringify(checkpointCanonical(sourceCheckpoints)) === JSON.stringify(checkpointCanonical(targetCheckpoints));

  const discovery = [monitorResult, keywordResult, brandResult, unicodeResult, metacharacterResult];
  const definitiveFailures = discovery.filter((result) => result.status === 'FAIL');
  if (!categoriesExact || !verifiedSocExact || !enrichmentExact || !checkpointLookupExact || definitiveFailures.length) {
    throw new SafeMigrationError('One or more repository query verification comparisons failed.');
  }
  return {
    categoryStatisticsExact: categoriesExact,
    discoveryQueries: discovery,
    verifiedSocExact,
    enrichmentSelectionExact: enrichmentExact,
    checkpointLookupExact,
    searchParityNote: 'Queries with more matches than the 500-row cap are recorded as limited because MongoDB has no stable discovery sort; candidate identity sets are not guaranteed to match.',
  };
}

function verifySqliteStructure(database: Database.Database, sourceMetrics: MigrationMetrics) {
  const integrityRows = database.pragma('integrity_check') as Array<{ integrity_check: string }>;
  const integrity = integrityRows.map((row) => row.integrity_check);
  if (integrity.length !== 1 || integrity[0] !== 'ok') throw new SafeMigrationError(`SQLite integrity_check failed: ${integrity.join(',')}`);
  const schemaVersion = (database.prepare('SELECT MAX(version) AS version FROM archive_schema_version').get() as { version: number | null }).version;
  if (schemaVersion !== SCHEMA_VERSION) throw new SafeMigrationError(`Unexpected SQLite archive schema version ${schemaVersion}.`);
  const catalogCount = (database.prepare('SELECT COUNT(*) AS count FROM techapi_catalog_records').get() as { count: number }).count;
  const checkpointCount = (database.prepare('SELECT COUNT(*) AS count FROM techapi_import_checkpoints').get() as { count: number }).count;
  const categoryCounts = database.prepare('SELECT source_category AS category, COUNT(*) AS records FROM techapi_catalog_records GROUP BY source_category ORDER BY source_category').all();
  const detailsFetchedCount = (database.prepare('SELECT COUNT(*) AS count FROM techapi_catalog_records WHERE details_fetched_at IS NOT NULL').get() as { count: number }).count;
  const workflowCounts = database.prepare('SELECT workflow_status AS status, COUNT(*) AS count FROM techapi_catalog_records GROUP BY workflow_status ORDER BY workflow_status').all();
  const verifiedSocCount = (database.prepare("SELECT COUNT(*) AS count FROM techapi_catalog_records WHERE source_category = 'soc' AND raw_verified = 1").get() as { count: number }).count;
  const checkpointSourceCommits = database.prepare('SELECT source_commit AS source_commit, COUNT(*) AS count FROM techapi_import_checkpoints GROUP BY source_commit ORDER BY source_commit').all();
  let catalogUniqueIndexes: ReturnType<typeof assertSqliteUniqueKeys>;
  let checkpointUniqueIndexes: ReturnType<typeof assertSqliteUniqueKeys>;
  let catalogNotNullKeys: ReturnType<typeof assertSqliteNotNullKeys>;
  let checkpointNotNullKeys: ReturnType<typeof assertSqliteNotNullKeys>;
  try {
    catalogUniqueIndexes = assertSqliteUniqueKeys(database, 'techapi_catalog_records');
    checkpointUniqueIndexes = assertSqliteUniqueKeys(database, 'techapi_import_checkpoints');
    catalogNotNullKeys = assertSqliteNotNullKeys(database, 'techapi_catalog_records');
    checkpointNotNullKeys = assertSqliteNotNullKeys(database, 'techapi_import_checkpoints');
  } catch (error) {
    throw new SafeMigrationError(error instanceof Error ? error.message : 'SQLite key constraints are incomplete.');
  }
  if (catalogCount !== sourceMetrics.counts.catalog || checkpointCount !== sourceMetrics.counts.checkpoints) throw new SafeMigrationError('SQLite table counts differ from MongoDB source counts.');
  if (detailsFetchedCount !== sourceMetrics.detailsFetchedCount || verifiedSocCount !== sourceMetrics.verifiedSocCount) throw new SafeMigrationError('SQLite detailsFetchedAt or verified SoC distribution differs from MongoDB.');
  if (JSON.stringify(categoryCounts) !== JSON.stringify(sourceMetrics.categoryCounts.map(({ key, count }) => ({ category: key, records: count })))) throw new SafeMigrationError('SQLite category distribution differs from MongoDB.');
  if (JSON.stringify(workflowCounts) !== JSON.stringify(sourceMetrics.workflowCounts.map(({ key, count }) => ({ status: key, count })))) throw new SafeMigrationError('SQLite workflowStatus distribution differs from MongoDB.');
  if (JSON.stringify(checkpointSourceCommits) !== JSON.stringify(sourceMetrics.checkpointSourceCommits.map(({ key, count }) => ({ source_commit: key, count })))) throw new SafeMigrationError('SQLite checkpoint sourceCommit distribution differs from MongoDB.');
  return {
    integrityCheck: integrity[0], schemaVersion,
    counts: { catalog: catalogCount, checkpoints: checkpointCount, total: catalogCount + checkpointCount },
    categoryCounts, detailsFetchedCount, workflowCounts, verifiedSocCount, checkpointSourceCommits,
    uniqueIndexes: { catalog: catalogUniqueIndexes, checkpoints: checkpointUniqueIndexes },
    notNullKeyChecks: { catalog: catalogNotNullKeys.checks, checkpoints: checkpointNotNullKeys.checks },
  };
}

async function runMigration(): Promise<void> {
  let stage = 'source_guard';
  let connection: mongoose.Connection | undefined;
  let sqliteRepository: SqliteTechApiRepository | undefined;
  try {
    const safeSource = assertSafeLocalRestoreUri(SOURCE_URI);
    stage = 'destination_preflight';
    const destination = preflightDestination();

    stage = 'connect_local_source';
    connection = await mongoose.createConnection(SOURCE_URI, {
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 5_000,
      readPreference: 'primary',
    }).asPromise();
    const db = connection.db;
    if (!db) throw new SafeMigrationError('Connected source does not expose a MongoDB database handle.');

    stage = 'source_preflight';
    const sourceMetrics = await readSourceMetrics(db);
    const requiredBytes = estimateRequiredBytes(sourceMetrics);
    if (destination.freeBytes < requiredBytes) {
      throw new SafeMigrationError(`Insufficient free space for SQLite staging (available=${destination.freeBytes}, estimatedRequired=${requiredBytes}).`);
    }
    console.log(JSON.stringify({ event: 'source_preflight_passed', source: safeSource, counts: sourceMetrics.counts, categoryCounts: sourceMetrics.categoryCounts, estimatedRequiredBytes: requiredBytes, availableBytes: destination.freeBytes }));

    stage = 'create_staging_database';
    sqliteRepository = new SqliteTechApiRepository(STAGING_PATH);
    const catalogCollection = db.collection(CATALOG_COLLECTION);
    const checkpointCollection = db.collection(CHECKPOINT_COLLECTION);

    stage = 'import_catalog';
    const importedCatalog = await importCollectionBatches(
      catalogCollection,
      CATALOG_COLLECTION,
      'sourceKey',
      (records) => sqliteRepository!.insertSourceCatalogBatch(records),
    );
    if (importedCatalog !== EXPECTED_CATALOG_COUNT) throw new SafeMigrationError(`Catalog import count ${importedCatalog} does not equal ${EXPECTED_CATALOG_COUNT}.`);

    stage = 'import_checkpoints';
    const importedCheckpoints = await importCollectionBatches(
      checkpointCollection,
      CHECKPOINT_COLLECTION,
      'fileKey',
      (records) => sqliteRepository!.insertSourceCheckpointBatch(records),
    );
    if (importedCheckpoints !== EXPECTED_CHECKPOINT_COUNT) throw new SafeMigrationError(`Checkpoint import count ${importedCheckpoints} does not equal ${EXPECTED_CHECKPOINT_COUNT}.`);

    stage = 'close_before_verification';
    await sqliteRepository.close();
    sqliteRepository = undefined;

    stage = 'integrity_and_structure';
    const verificationDb = new Database(STAGING_PATH, { readonly: true });
    let structure: ReturnType<typeof verifySqliteStructure>;
    let catalogChecksum: ChecksumResult;
    let checkpointChecksum: ChecksumResult;
    try {
      structure = verifySqliteStructure(verificationDb, sourceMetrics);
      catalogChecksum = await compareCollectionPayloads(catalogCollection, verificationDb, CATALOG_COLLECTION, 'sourceKey', 'techapi_catalog_records');
      checkpointChecksum = await compareCollectionPayloads(checkpointCollection, verificationDb, CHECKPOINT_COLLECTION, 'fileKey', 'techapi_import_checkpoints');
    } finally {
      verificationDb.close();
    }
    for (const result of [catalogChecksum!, checkpointChecksum!]) {
      if (result.sourceChecksum !== result.sqliteChecksum || result.missingInSqlite || result.extraInSqlite || result.differentDocuments) {
        throw new SafeMigrationError(`Payload checksum mismatch (${JSON.stringify({ sourceChecksum: result.sourceChecksum, sqliteChecksum: result.sqliteChecksum, missing: result.missingInSqlite, extra: result.extraInSqlite, different: result.differentDocuments, samples: result.mismatchSamples })}).`);
      }
    }

    stage = 'reopen_and_repository_queries';
    sqliteRepository = new SqliteTechApiRepository(STAGING_PATH);
    const reopenedCounts = {
      catalog: await sqliteRepository.countCatalogRecords(),
      checkpoints: (verificationDbCount(STAGING_PATH, 'techapi_import_checkpoints')),
    };
    if (reopenedCounts.catalog !== EXPECTED_CATALOG_COUNT || reopenedCounts.checkpoints !== EXPECTED_CHECKPOINT_COUNT) {
      throw new SafeMigrationError('Reopened SQLite staging database counts differ from expected source counts.');
    }
    const queryVerification = await verifyRepositoryQueries(db, sqliteRepository);
    await sqliteRepository.close();
    sqliteRepository = undefined;

    stage = 'publish_archive';
    if (existsSync(ARCHIVE_PATH) || existsSync(MANIFEST_PATH)) throw new SafeMigrationError('Archive or manifest appeared after preflight; refusing to overwrite.');
    const sqliteVersionDb = new Database(STAGING_PATH, { readonly: true });
    const sqliteVersion = (sqliteVersionDb.prepare('SELECT sqlite_version() AS version').get() as { version: string }).version;
    sqliteVersionDb.close();
    const combinedSourceChecksum = createHash('sha256').update(`${catalogChecksum!.sourceChecksum}\n${checkpointChecksum!.sourceChecksum}\n`).digest('hex');
    const combinedSqliteChecksum = createHash('sha256').update(`${catalogChecksum!.sqliteChecksum}\n${checkpointChecksum!.sqliteChecksum}\n`).digest('hex');
    const migrationTimestamp = new Date().toISOString();
    const stagingBytes = statSync(STAGING_PATH).size;
    const manifest = {
      source: { host: safeSource.host, port: safeSource.port, database: SOURCE_DATABASE, collections: [CATALOG_COLLECTION, CHECKPOINT_COLLECTION] },
      stagingDatabasePath: STAGING_PATH,
      archivePath: ARCHIVE_PATH,
      collectionCounts: sourceMetrics.counts,
      categoryDistribution: sourceMetrics.categoryCounts,
      workflowDistribution: sourceMetrics.workflowCounts,
      detailsFetchedCount: sourceMetrics.detailsFetchedCount,
      verifiedSocCount: sourceMetrics.verifiedSocCount,
      checkpointSourceCommitDistribution: sourceMetrics.checkpointSourceCommits,
      uniqueKeyCheck: { ...sourceMetrics.uniqueKeys, sourceUniqueIndexesPresent: true, sqliteUniqueIndexesVerified: true },
      payloadChecksums: {
        algorithm: 'SHA-256 over sorted [document key, SHA-256(canonical BSON Extended JSON)] lines',
        source: { catalog: catalogChecksum!.sourceChecksum, checkpoints: checkpointChecksum!.sourceChecksum, combined: combinedSourceChecksum },
        sqlite: { catalog: catalogChecksum!.sqliteChecksum, checkpoints: checkpointChecksum!.sqliteChecksum, combined: combinedSqliteChecksum },
        comparedDocuments: catalogChecksum!.matchedDocuments + checkpointChecksum!.matchedDocuments,
        catalog: catalogChecksum,
        checkpoints: checkpointChecksum,
      },
      schemaVersion: SCHEMA_VERSION,
      sqliteVersion,
      stagingFileBytes: stagingBytes,
      migrationToolVersion: MIGRATION_TOOL_VERSION,
      migrationTimestamp,
      verificationStatus: 'VERIFIED',
      sqliteIntegrityCheck: structure!.integrityCheck,
      repositoryQueryVerification: queryVerification,
      sourceReadOnly: true,
      atlasConnected: false,
    };

    const temporaryManifestPath = join(DATA_DIRECTORY, `.techapi_catalog.manifest.${process.pid}.tmp`);
    const manifestDescriptor = openSync(temporaryManifestPath, 'wx');
    try {
      writeFileSync(manifestDescriptor, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    } finally {
      closeSync(manifestDescriptor);
    }
    renameSync(STAGING_PATH, ARCHIVE_PATH);
    renameSync(temporaryManifestPath, MANIFEST_PATH);
    console.log(JSON.stringify({ event: 'migration_verified_and_published', archivePath: ARCHIVE_PATH, manifestPath: MANIFEST_PATH, counts: sourceMetrics.counts, checksums: manifest.payloadChecksums, sqliteIntegrityCheck: structure!.integrityCheck, fileBytes: statSync(ARCHIVE_PATH).size }));
  } catch (error) {
    const safeMessage = error instanceof SafeMigrationError
      ? error.message
      : `Unexpected ${error instanceof Error ? error.name : getErrorCode(error)} (code ${getErrorCode(error)}); sensitive connection details are suppressed.`;
    console.error(JSON.stringify({ status: 'BLOCKED', stage, message: safeMessage, stagingFilePreserved: existsSync(STAGING_PATH) }));
    process.exitCode = 1;
  } finally {
    if (sqliteRepository) {
      try { await sqliteRepository.close(); } catch { /* preserve the primary failure and staging data */ }
    }
    if (connection) {
      try { await connection.close(); } catch { /* no sensitive connection error details are logged */ }
    }
  }
}

function verificationDbCount(path: string, table: 'techapi_import_checkpoints'): number {
  const database = new Database(path, { readonly: true });
  try {
    return (database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
  } finally {
    database.close();
  }
}

if (require.main === module) void runMigration();
