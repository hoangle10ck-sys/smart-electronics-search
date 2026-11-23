import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import Database from 'better-sqlite3';
import { EJSON } from 'bson';
import mongoose from 'mongoose';
import { serializeTechApiEjson } from '../repositories/sqliteTechApiRepository';
import { TechApiDiscoveryQuery } from '../repositories/techApiRepository';
import {
  assessSqliteNotNullKeys,
  assessSqliteUniqueKeys,
  assertSqliteNotNullKeys,
  assertSqliteUniqueKeys,
} from './techApiSqliteArchiveVerification';

const SOURCE_URI = 'mongodb://127.0.0.1:27017/smart_electronics_restore_test?directConnection=true';
const SOURCE_DATABASE = 'smart_electronics_restore_test';
const SOURCE_COLLECTIONS = {
  catalog: 'techapicatalogrecords',
  checkpoints: 'techapiimportcheckpoints',
} as const;
const STAGING_PATH = 'D:\\SmartElectronicsData\\techapi_catalog.staging.sqlite';
const EXPECTED_COUNTS = { catalog: 131_064, checkpoints: 104_666 };
const BATCH_SIZE = 250;
const MAX_EXAMPLES = 10;
const SCHEMA_VERSION = 1;

type DistributionRow = { key: string | null; count: number };
type DuplicateGroup = { key: unknown; count: number };
type CollectionChecksumResult = {
  sourceChecksum: string;
  sqliteChecksum: string;
  sourceDocuments: number;
  sqliteDocuments: number;
  matchingKeys: number;
  missingInSqlite: number;
  extraInSqlite: number;
  payloadMismatches: number;
  mongoIdMismatches: number;
  extractedKeyMismatches: number;
  mismatchExamples: Array<{ type: string; key: string }>;
};

function validateSourceUri(uri: string) {
  const parsed = new URL(uri);
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  const port = parsed.port ? Number(parsed.port) : 27017;
  if (parsed.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error('Verification source must be a loopback MongoDB host.');
  }
  if (parsed.username || parsed.password) throw new Error('Credential-bearing MongoDB source URIs are prohibited.');
  if (database !== SOURCE_DATABASE || port !== 27017 || parsed.searchParams.get('directConnection') !== 'true') {
    throw new Error('Verification source must be the approved local restore database and port.');
  }
  return { host, port, database };
}

function hasUniqueMongoIndex(indexes: any[], fields: string[]): boolean {
  return indexes.some((index) => index.unique === true
    && !index.sparse
    && JSON.stringify(Object.keys(index.key ?? {})) === JSON.stringify(fields));
}

function hasBuiltinMongoIdIndex(indexes: any[]): boolean {
  return indexes.some((index) => index.name === '_id_'
    && JSON.stringify(Object.keys(index.key ?? {})) === JSON.stringify(['_id']));
}

async function duplicateMongoGroups(collection: any, idExpression: unknown): Promise<DuplicateGroup[]> {
  const rows = await collection.aggregate([
    { $group: { _id: idExpression, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: MAX_EXAMPLES },
  ]).toArray();
  return rows.map((row: any) => ({ key: row._id, count: row.count }));
}

async function readMongoMetrics(db: any) {
  const catalog = db.collection(SOURCE_COLLECTIONS.catalog);
  const checkpoints = db.collection(SOURCE_COLLECTIONS.checkpoints);
  const [catalogCount, checkpointCount, catalogIndexes, checkpointIndexes] = await Promise.all([
    catalog.countDocuments({}),
    checkpoints.countDocuments({}),
    catalog.indexes(),
    checkpoints.indexes(),
  ]);
  const [categoryCounts, detailsFetchedCount, workflowCounts, verifiedSocCount, checkpointSourceCommits] = await Promise.all([
    catalog.aggregate([{ $group: { _id: '$sourceCategory', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray(),
    catalog.countDocuments({ detailsFetchedAt: { $ne: null } }),
    catalog.aggregate([{ $group: { _id: '$workflowStatus', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray(),
    catalog.countDocuments({ sourceCategory: 'soc', 'raw.verified': true }),
    checkpoints.aggregate([{ $group: { _id: '$sourceCommit', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray(),
  ]);
  const [duplicateSourceKey, duplicateCatalogIdentity, duplicateFileKey, duplicateMongoCatalogId, duplicateMongoCheckpointId] = await Promise.all([
    duplicateMongoGroups(catalog, '$sourceKey'),
    duplicateMongoGroups(catalog, { sourceCategory: '$sourceCategory', sourceSlug: '$sourceSlug' }),
    duplicateMongoGroups(checkpoints, '$fileKey'),
    duplicateMongoGroups(catalog, '$_id'),
    duplicateMongoGroups(checkpoints, '$_id'),
  ]);
  const [nullCatalogKeys, nullCheckpointKeys] = await Promise.all([
    catalog.countDocuments({ $or: [
      { _id: null }, { sourceKey: null }, { sourceKey: '' },
      { sourceCategory: null }, { sourceCategory: '' }, { sourceSlug: null }, { sourceSlug: '' },
    ] }),
    checkpoints.countDocuments({ $or: [{ _id: null }, { fileKey: null }, { fileKey: '' }] }),
  ]);

  return {
    counts: { catalog: catalogCount, checkpoints: checkpointCount, total: catalogCount + checkpointCount },
    categoryCounts: categoryCounts.map((row: any) => ({ key: row._id ?? null, count: row.count })) as DistributionRow[],
    detailsFetchedCount,
    workflowCounts: workflowCounts.map((row: any) => ({ key: row._id ?? null, count: row.count })) as DistributionRow[],
    verifiedSocCount,
    checkpointSourceCommits: checkpointSourceCommits.map((row: any) => ({ key: row._id ?? null, count: row.count })) as DistributionRow[],
    indexes: {
      catalogUniqueIndexesPresent: {
        mongoId: hasBuiltinMongoIdIndex(catalogIndexes),
        sourceKey: hasUniqueMongoIndex(catalogIndexes, ['sourceKey']),
        categorySlug: hasUniqueMongoIndex(catalogIndexes, ['sourceCategory', 'sourceSlug']),
      },
      checkpointUniqueIndexesPresent: {
        mongoId: hasBuiltinMongoIdIndex(checkpointIndexes),
        fileKey: hasUniqueMongoIndex(checkpointIndexes, ['fileKey']),
      },
    },
    duplicateKeys: {
      sourceKey: duplicateSourceKey,
      categorySlug: duplicateCatalogIdentity,
      fileKey: duplicateFileKey,
      catalogMongoId: duplicateMongoCatalogId,
      checkpointMongoId: duplicateMongoCheckpointId,
    },
    nullOrEmptyKeyCounts: { catalog: nullCatalogKeys, checkpoints: nullCheckpointKeys },
  };
}

function sqlDistribution(database: Database.Database, sql: string, keyColumn: string): DistributionRow[] {
  const rows = database.prepare(sql).all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({ key: (row[keyColumn] as string | null) ?? null, count: row.count as number }));
}

function duplicateSqlGroups(database: Database.Database, sql: string, keyColumns: string[]): DuplicateGroup[] {
  const rows = database.prepare(sql).all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    key: keyColumns.length === 1 ? row[keyColumns[0]] : Object.fromEntries(keyColumns.map((column) => [column, row[column]])),
    count: row.count as number,
  }));
}

function readSqliteMetrics(database: Database.Database) {
  const catalogCount = (database.prepare('SELECT COUNT(*) AS count FROM techapi_catalog_records').get() as { count: number }).count;
  const checkpointCount = (database.prepare('SELECT COUNT(*) AS count FROM techapi_import_checkpoints').get() as { count: number }).count;
  const schemaRows = database.prepare('SELECT version, applied_at FROM archive_schema_version ORDER BY version').all();
  const categoryCounts = sqlDistribution(database,
    'SELECT source_category AS category, COUNT(*) AS count FROM techapi_catalog_records GROUP BY source_category ORDER BY source_category', 'category');
  const workflowCounts = sqlDistribution(database,
    'SELECT workflow_status AS status, COUNT(*) AS count FROM techapi_catalog_records GROUP BY workflow_status ORDER BY workflow_status', 'status');
  const checkpointSourceCommits = sqlDistribution(database,
    'SELECT source_commit, COUNT(*) AS count FROM techapi_import_checkpoints GROUP BY source_commit ORDER BY source_commit', 'source_commit');
  const detailsFetchedCount = (database.prepare('SELECT COUNT(*) AS count FROM techapi_catalog_records WHERE details_fetched_at IS NOT NULL').get() as { count: number }).count;
  const verifiedSocCount = (database.prepare("SELECT COUNT(*) AS count FROM techapi_catalog_records WHERE source_category = 'soc' AND raw_verified = 1").get() as { count: number }).count;
  const duplicateKeys = {
    sourceKey: duplicateSqlGroups(database,
      'SELECT source_key, COUNT(*) AS count FROM techapi_catalog_records GROUP BY source_key HAVING COUNT(*) > 1 ORDER BY count DESC LIMIT 10', ['source_key']),
    categorySlug: duplicateSqlGroups(database,
      'SELECT source_category, source_slug, COUNT(*) AS count FROM techapi_catalog_records GROUP BY source_category, source_slug HAVING COUNT(*) > 1 ORDER BY count DESC LIMIT 10', ['source_category', 'source_slug']),
    fileKey: duplicateSqlGroups(database,
      'SELECT file_key, COUNT(*) AS count FROM techapi_import_checkpoints GROUP BY file_key HAVING COUNT(*) > 1 ORDER BY count DESC LIMIT 10', ['file_key']),
    catalogMongoId: duplicateSqlGroups(database,
      'SELECT mongo_id, COUNT(*) AS count FROM techapi_catalog_records GROUP BY mongo_id HAVING COUNT(*) > 1 ORDER BY count DESC LIMIT 10', ['mongo_id']),
    checkpointMongoId: duplicateSqlGroups(database,
      'SELECT mongo_id, COUNT(*) AS count FROM techapi_import_checkpoints GROUP BY mongo_id HAVING COUNT(*) > 1 ORDER BY count DESC LIMIT 10', ['mongo_id']),
  };
  const nullOrEmptyKeyCounts = {
    catalog: (database.prepare(`SELECT COUNT(*) AS count FROM techapi_catalog_records
      WHERE mongo_id IS NULL OR mongo_id = '' OR source_key IS NULL OR source_key = ''
      OR source_category IS NULL OR source_category = '' OR source_slug IS NULL OR source_slug = ''`).get() as { count: number }).count,
    checkpoints: (database.prepare(`SELECT COUNT(*) AS count FROM techapi_import_checkpoints
      WHERE mongo_id IS NULL OR mongo_id = '' OR file_key IS NULL OR file_key = ''`).get() as { count: number }).count,
  };
  const uniqueIndexes = {
    catalog: assessSqliteUniqueKeys(database, 'techapi_catalog_records'),
    checkpoints: assessSqliteUniqueKeys(database, 'techapi_import_checkpoints'),
  };
  const notNullKeys = {
    catalog: assessSqliteNotNullKeys(database, 'techapi_catalog_records'),
    checkpoints: assessSqliteNotNullKeys(database, 'techapi_import_checkpoints'),
  };
  return {
    counts: { catalog: catalogCount, checkpoints: checkpointCount, total: catalogCount + checkpointCount },
    schemaRows,
    categoryCounts,
    detailsFetchedCount,
    workflowCounts,
    verifiedSocCount,
    checkpointSourceCommits,
    duplicateKeys,
    nullOrEmptyKeyCounts,
    uniqueIndexes,
    notNullKeys,
  };
}

function addDocumentHash(hash: ReturnType<typeof createHash>, key: string, documentEjson: string) {
  const checksum = createHash('sha256').update(documentEjson, 'utf8').digest('hex');
  hash.update(`${JSON.stringify(key)}:${checksum}\n`, 'utf8');
}

async function compareCollectionPayloads(
  mongoCollection: any,
  sqlite: Database.Database,
  collectionName: string,
  keyField: 'sourceKey' | 'fileKey',
  tableName: 'techapi_catalog_records' | 'techapi_import_checkpoints',
  keyColumn: 'source_key' | 'file_key',
): Promise<CollectionChecksumResult> {
  const mongoCursor = mongoCollection.find({}).sort({ [keyField]: 1 }).batchSize(BATCH_SIZE);
  const sqliteCursor = sqlite.prepare(`SELECT ${keyColumn} AS stable_key, mongo_id, document_ejson FROM ${tableName} ORDER BY ${keyColumn} COLLATE BINARY`).iterate() as IterableIterator<{
    stable_key: string;
    mongo_id: string;
    document_ejson: string;
  }>;
  const sourceIterator = mongoCursor[Symbol.asyncIterator]();
  const sqliteIterator = sqliteCursor[Symbol.iterator]();
  const sourceHash = createHash('sha256');
  const sqliteHash = createHash('sha256');
  let sourceNext = await sourceIterator.next();
  let sqliteNext = sqliteIterator.next();
  let sourceDocuments = 0;
  let sqliteDocuments = 0;
  let matchingKeys = 0;
  let missingInSqlite = 0;
  let extraInSqlite = 0;
  let payloadMismatches = 0;
  let mongoIdMismatches = 0;
  let extractedKeyMismatches = 0;
  const mismatchExamples: Array<{ type: string; key: string }> = [];
  const sample = (type: string, key: string) => {
    if (mismatchExamples.length < MAX_EXAMPLES) mismatchExamples.push({ type, key });
  };

  try {
    while (!sourceNext.done || !sqliteNext.done) {
      const sourceDocument = sourceNext.done ? undefined : sourceNext.value as Record<string, any>;
      const sqliteRow = sqliteNext.done ? undefined : sqliteNext.value;
      const sourceKey = sourceDocument ? String(sourceDocument[keyField] ?? '') : undefined;
      const sqliteKey = sqliteRow?.stable_key;
      if (sourceDocument) {
        sourceHash.update('');
        sourceDocuments += 1;
      }
      if (sqliteRow) sqliteDocuments += 1;

      if (!sourceDocument) {
        extraInSqlite += 1;
        sample('extra_in_sqlite', sqliteKey ?? '<unknown>');
        addDocumentHash(sqliteHash, sqliteKey ?? '', serializeTechApiEjson(EJSON.parse(sqliteRow!.document_ejson, { relaxed: false })));
        sqliteNext = sqliteIterator.next();
        continue;
      }
      const sourceEjson = serializeTechApiEjson(sourceDocument);
      addDocumentHash(sourceHash, sourceKey!, sourceEjson);
      if (!sqliteRow) {
        missingInSqlite += 1;
        sample('missing_in_sqlite', sourceKey!);
        sourceNext = await sourceIterator.next();
        continue;
      }
      const targetDocument = EJSON.parse(sqliteRow.document_ejson, { relaxed: false }) as Record<string, any>;
      const targetEjson = serializeTechApiEjson(targetDocument);
      addDocumentHash(sqliteHash, sqliteKey!, targetEjson);
      if (sourceKey === sqliteKey) {
        matchingKeys += 1;
        if (sourceEjson !== targetEjson) {
          payloadMismatches += 1;
          sample('payload_mismatch', sourceKey!);
        }
        const expectedMongoId = serializeTechApiEjson(sourceDocument._id);
        if (expectedMongoId !== sqliteRow.mongo_id || expectedMongoId !== serializeTechApiEjson(targetDocument._id)) {
          mongoIdMismatches += 1;
          sample('mongo_id_mismatch', sourceKey!);
        }
        if (String(targetDocument[keyField] ?? '') !== sqliteKey) {
          extractedKeyMismatches += 1;
          sample('payload_key_column_mismatch', sqliteKey!);
        }
        sourceNext = await sourceIterator.next();
        sqliteNext = sqliteIterator.next();
      } else if (sourceKey! < sqliteKey!) {
        missingInSqlite += 1;
        sample('missing_in_sqlite', sourceKey!);
        sourceNext = await sourceIterator.next();
      } else {
        extraInSqlite += 1;
        sample('extra_in_sqlite', sqliteKey!);
        sqliteNext = sqliteIterator.next();
      }
    }
  } finally {
    await mongoCursor.close();
  }

  return {
    sourceChecksum: sourceHash.digest('hex'),
    sqliteChecksum: sqliteHash.digest('hex'),
    sourceDocuments,
    sqliteDocuments,
    matchingKeys,
    missingInSqlite,
    extraInSqlite,
    payloadMismatches,
    mongoIdMismatches,
    extractedKeyMismatches,
    mismatchExamples,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function discoveryFilter(query: TechApiDiscoveryQuery): Record<string, any> {
  const filter: Record<string, any> = { sourceCategory: { $in: query.categories } };
  if (query.queryTerms.length) {
    filter.$and = query.queryTerms.map((term) => ({ $or: [
      { name: { $regex: escapeRegex(term), $options: 'i' } },
      { searchText: { $regex: escapeRegex(term), $options: 'i' } },
    ] }));
  }
  if (query.brandTerms.length) {
    const pattern = query.brandTerms.map(escapeRegex).join('|');
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

async function compareDiscoveryQuery(source: any, sqlite: Database.Database, label: string, query: TechApiDiscoveryQuery) {
  const filter = discoveryFilter(query);
  const sourceCount = await source.countDocuments(filter);
  const projection = {
    sourceCategory: 1, sourceSlug: 1, name: 1, sourceRecordUrl: 1,
    dataAttribution: 1, dataSourceUrl: 1, dataLicense: 1, dataLicenseUrl: 1, searchText: 1, raw: 1,
  };
  let cursor = source.find(filter, { projection });
  if (query.offset && query.offset > 0) cursor = cursor.skip(query.offset);
  const sourceRows = await cursor.limit(query.limit).toArray();

  const conditions = [`source_category IN (${query.categories.map(() => '?').join(', ')})`];
  const parameters: Array<string | number> = [...query.categories];
  for (const term of query.queryTerms) {
    conditions.push('(instr(name_lower, ?) > 0 OR instr(search_text_lower, ?) > 0)');
    const normalized = term.toLowerCase();
    parameters.push(normalized, normalized);
  }
  if (query.brandTerms.length) {
    const brandConditions: string[] = [];
    for (const term of query.brandTerms) {
      const normalized = term.toLowerCase();
      for (const column of ['name_lower', 'raw_manufacturer_lower', 'raw_manufacturer_name_lower', 'raw_brand_lower']) {
        brandConditions.push(`instr(${column}, ?) > 0`);
        parameters.push(normalized);
      }
    }
    conditions.push(`(${brandConditions.join(' OR ')})`);
  }
  parameters.push(query.limit, query.offset ?? 0);
  const sqlRows = sqlite.prepare(`SELECT source_category, source_slug FROM techapi_catalog_records WHERE ${conditions.join(' AND ')} LIMIT ? OFFSET ?`).all(...parameters) as Array<{
    source_category: string;
    source_slug: string;
  }>;
  const sourceKeys = sourceRows.map((row: any) => JSON.stringify([row.sourceCategory, row.sourceSlug])).sort();
  const sqliteKeys = sqlRows.map((row) => JSON.stringify([row.source_category, row.source_slug])).sort();
  const exactSetMatch = JSON.stringify(sourceKeys) === JSON.stringify(sqliteKeys);
  const status = sourceCount > query.limit
    ? 'LIMITED_UNSORTED_500_CAP'
    : exactSetMatch ? (sourceCount === 0 ? 'PASS_EMPTY_MATCH' : 'PASS') : 'FAIL';
  return { label, sourceMatches: sourceCount, sourceReturned: sourceRows.length, sqliteReturned: sqlRows.length, exactSetMatch, status };
}

async function verifySearchParity(db: any, sqlite: Database.Database) {
  const sourceCatalog = db.collection(SOURCE_COLLECTIONS.catalog);
  const sourceCategoryRows = await sourceCatalog.aggregate([
    { $group: { _id: '$sourceCategory', count: { $sum: 1 } } }, { $sort: { _id: 1 } },
  ]).toArray();
  const sqliteCategoryRows = sqlDistribution(sqlite,
    'SELECT source_category AS category, COUNT(*) AS count FROM techapi_catalog_records GROUP BY source_category ORDER BY source_category', 'category');
  const categoryStatisticsExact = JSON.stringify(sourceCategoryRows.map((row: any) => ({ key: row._id ?? null, count: row.count })))
    === JSON.stringify(sqliteCategoryRows);

  const monitor = await compareDiscoveryQuery(sourceCatalog, sqlite, 'category_filter_monitor', {
    categories: ['monitor'], queryTerms: [], brandTerms: [], limit: 500,
  });
  const keywordSample = await sourceCatalog.findOne({ sourceCategory: 'laptop', name: { $type: 'string', $ne: '' } }, { projection: { name: 1 } });
  const keyword = keywordSample?.name ? await compareDiscoveryQuery(sourceCatalog, sqlite, 'keyword_source_name', {
    categories: ['laptop'], queryTerms: [keywordSample.name], brandTerms: [], limit: 500,
  }) : { label: 'keyword_source_name', status: 'NOT_VERIFIED_NO_FIXTURE' };
  const brandSample = await sourceCatalog.findOne({
    $or: [
      { 'raw.manufacturer': { $type: 'string', $ne: '' } },
      { 'raw.manufacturer.name': { $type: 'string', $ne: '' } },
      { 'raw.brand': { $type: 'string', $ne: '' } },
      { 'raw.brand.name': { $type: 'string', $ne: '' } },
    ],
  }, { projection: { sourceCategory: 1, raw: 1 } });
  const brandValue = typeof brandSample?.raw?.manufacturer === 'string'
    ? brandSample.raw.manufacturer
    : typeof brandSample?.raw?.manufacturer?.name === 'string'
      ? brandSample.raw.manufacturer.name
      : typeof brandSample?.raw?.brand === 'string' ? brandSample.raw.brand : brandSample?.raw?.brand?.name;
  const brand = typeof brandValue === 'string' && brandValue
    ? await compareDiscoveryQuery(sourceCatalog, sqlite, 'brand_manufacturer', {
      categories: [brandSample.sourceCategory], queryTerms: [], brandTerms: [brandValue], limit: 500,
    })
    : { label: 'brand_manufacturer', status: 'NOT_VERIFIED_NO_FIXTURE' };

  const unicodeSample = await sourceCatalog.findOne({
    sourceCategory: 'device_catalog',
    $or: [{ name: { $regex: '[^\\x00-\\x7F]' } }, { searchText: { $regex: '[^\\x00-\\x7F]' } }],
  }, { projection: { name: 1, searchText: 1 } });
  const unicodeText = typeof unicodeSample?.name === 'string' && /[^\x00-\x7F]/.test(unicodeSample.name)
    ? unicodeSample.name
    : typeof unicodeSample?.searchText === 'string' ? unicodeSample.searchText : 'máy ảnh';
  const unicode = await compareDiscoveryQuery(sourceCatalog, sqlite, 'unicode_accented_query', {
    categories: ['device_catalog'], queryTerms: [unicodeText], brandTerms: [], limit: 500,
  });
  const cPlusPlus = await compareDiscoveryQuery(sourceCatalog, sqlite, 'literal_C_plus_plus', {
    categories: ['device_catalog'], queryTerms: ['C++'], brandTerms: [], limit: 500,
  });

  const verifiedSocSource = await sourceCatalog.find({ sourceCategory: 'soc', 'raw.verified': true }, { projection: { sourceCategory: 1, sourceSlug: 1 } }).toArray();
  const verifiedSocTarget = sqlite.prepare("SELECT source_category, source_slug FROM techapi_catalog_records WHERE source_category = 'soc' AND raw_verified = 1 ORDER BY source_category, source_slug").all() as Array<{ source_category: string; source_slug: string }>;
  const verifiedSocSourceKeys = verifiedSocSource.map((row: any) => JSON.stringify([row.sourceCategory, row.sourceSlug])).sort();
  const verifiedSocSqliteKeys = verifiedSocTarget.map((row) => JSON.stringify([row.source_category, row.source_slug])).sort();
  const verifiedSocExact = JSON.stringify(verifiedSocSourceKeys) === JSON.stringify(verifiedSocSqliteKeys);

  const enrichmentSource = await sourceCatalog.find({ detailsFetchedAt: null }, { projection: { sourceKey: 1 } })
    .sort({ lastSeenAt: -1, sourceCategory: 1, sourceSlug: 1 }).limit(100).toArray();
  const enrichmentSqlite = sqlite.prepare(`SELECT source_key FROM techapi_catalog_records WHERE details_fetched_at IS NULL
    ORDER BY last_seen_at DESC, source_category ASC, source_slug ASC LIMIT 100`).all() as Array<{ source_key: string }>;
  const enrichmentSelectionExact = JSON.stringify(enrichmentSource.map((row: any) => row.sourceKey))
    === JSON.stringify(enrichmentSqlite.map((row) => row.source_key));

  const sourceCheckpointCollection = db.collection(SOURCE_COLLECTIONS.checkpoints);
  const checkpointKeys = await sourceCheckpointCollection.find({}, { projection: { fileKey: 1 } }).sort({ fileKey: 1 }).limit(25).map((row: any) => row.fileKey).toArray();
  const sourceCheckpoints = await sourceCheckpointCollection.find({ fileKey: { $in: checkpointKeys } }).toArray();
  const placeholders = checkpointKeys.map(() => '?').join(', ');
  const targetCheckpointEjson = checkpointKeys.length
    ? sqlite.prepare(`SELECT document_ejson FROM techapi_import_checkpoints WHERE file_key IN (${placeholders})`).all(...checkpointKeys) as Array<{ document_ejson: string }>
    : [];
  const canonicalCheckpointRows = (rows: any[]) => rows.map((row) => serializeTechApiEjson(row)).sort();
  const checkpointLookupExact = JSON.stringify(canonicalCheckpointRows(sourceCheckpoints))
    === JSON.stringify(canonicalCheckpointRows(targetCheckpointEjson.map((row) => EJSON.parse(row.document_ejson, { relaxed: false }))));

  const discoveryQueries = [monitor, keyword, brand, unicode, cPlusPlus];
  const hardFailures = discoveryQueries.filter((result) => result.status === 'FAIL');
  const limitedQueries = discoveryQueries.filter((result) => result.status === 'LIMITED_UNSORTED_500_CAP');
  return {
    categoryStatisticsExact,
    discoveryQueries,
    verifiedSocExact,
    verifiedSocSourceCount: verifiedSocSource.length,
    verifiedSocSqliteCount: verifiedSocTarget.length,
    enrichmentSelectionExact,
    checkpointLookupExact,
    checkpointLookupRows: checkpointKeys.length,
    limitedQueries: limitedQueries.map((result) => result.label),
    candidateOrderingNote: 'For query results over 500, MongoDB has no stable sort in this repository query; those cases are reported as LIMITED_UNSORTED_500_CAP, not as exact parity.',
    allDefinitiveChecksPassed: categoryStatisticsExact && verifiedSocExact && enrichmentSelectionExact && checkpointLookupExact && hardFailures.length === 0,
  };
}

function readFileMetadata() {
  const filePaths = [STAGING_PATH, `${STAGING_PATH}-wal`, `${STAGING_PATH}-shm`];
  return filePaths.map((path) => {
    try {
      const stat = statSync(path);
      return { path, exists: true, bytes: stat.size, modifiedAt: stat.mtime.toISOString() };
    } catch (error) {
      return { path, exists: false, errorCode: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown' };
    }
  });
}

function readIntegrity(database: Database.Database) {
  return (database.pragma('integrity_check') as Array<{ integrity_check: string }>).map((row) => row.integrity_check);
}

async function runVerification() {
  let stage = 'validate_local_source';
  let connection: mongoose.Connection | undefined;
  let sqlite: Database.Database | undefined;
  const report: Record<string, any> = {
    mode: 'verify-only',
    stagingPath: STAGING_PATH,
    filesBeforeOpen: readFileMetadata(),
    atlasConnected: false,
    sourceOperations: 'read-only queries only',
    sqliteOpenedReadOnly: false,
  };
  try {
    const source = validateSourceUri(SOURCE_URI);
    if (!existsSync(STAGING_PATH)) throw new Error('Required existing staging SQLite file is missing.');
    stage = 'open_read_only';
    sqlite = new Database(STAGING_PATH, { readonly: true, fileMustExist: true });
    report.sqliteOpenedReadOnly = true;
    report.sqliteVersion = (sqlite.prepare('SELECT sqlite_version() AS version').get() as { version: string }).version;
    report.integrityCheck = readIntegrity(sqlite);

    stage = 'connect_local_mongodb_read_only';
    connection = await mongoose.createConnection(SOURCE_URI, {
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 5_000,
      readPreference: 'primary',
    }).asPromise();
    const mongo = connection.db;
    if (!mongo) throw new Error('Local MongoDB connection did not provide a database handle.');
    report.source = source;

    stage = 'read_counts_distributions_and_keys';
    const [mongoMetrics, sqliteMetrics] = await Promise.all([
      readMongoMetrics(mongo),
      Promise.resolve(readSqliteMetrics(sqlite)),
    ]);
    report.mongo = mongoMetrics;
    report.mongo.mongoIdNote = 'MongoDB enforces _id uniqueness through its built-in _id_ index; listIndexes does not expose unique:true for that built-in index.';
    report.sqlite = sqliteMetrics;
    report.distributionParity = {
      categoryCounts: JSON.stringify(mongoMetrics.categoryCounts) === JSON.stringify(sqliteMetrics.categoryCounts),
      workflowStatus: JSON.stringify(mongoMetrics.workflowCounts) === JSON.stringify(sqliteMetrics.workflowCounts),
      detailsFetchedCount: mongoMetrics.detailsFetchedCount === sqliteMetrics.detailsFetchedCount,
      verifiedSocCount: mongoMetrics.verifiedSocCount === sqliteMetrics.verifiedSocCount,
      checkpointSourceCommit: JSON.stringify(mongoMetrics.checkpointSourceCommits) === JSON.stringify(sqliteMetrics.checkpointSourceCommits),
    };

    stage = 'compare_payload_checksums';
    const [catalogChecksum, checkpointChecksum] = await Promise.all([
      compareCollectionPayloads(mongo.collection(SOURCE_COLLECTIONS.catalog), sqlite,
        SOURCE_COLLECTIONS.catalog, 'sourceKey', 'techapi_catalog_records', 'source_key'),
      compareCollectionPayloads(mongo.collection(SOURCE_COLLECTIONS.checkpoints), sqlite,
        SOURCE_COLLECTIONS.checkpoints, 'fileKey', 'techapi_import_checkpoints', 'file_key'),
    ]);
    report.payloadComparison = { catalog: catalogChecksum, checkpoints: checkpointChecksum };
    report.combinedChecksums = {
      source: createHash('sha256').update(`${catalogChecksum.sourceChecksum}\n${checkpointChecksum.sourceChecksum}\n`).digest('hex'),
      sqlite: createHash('sha256').update(`${catalogChecksum.sqliteChecksum}\n${checkpointChecksum.sqliteChecksum}\n`).digest('hex'),
      documentsCompared: catalogChecksum.matchingKeys + checkpointChecksum.matchingKeys,
    };

    stage = 'repository_query_parity';
    report.searchParity = await verifySearchParity(mongo, sqlite);

    stage = 'close_and_reopen_read_only';
    sqlite.close();
    sqlite = undefined;
    sqlite = new Database(STAGING_PATH, { readonly: true, fileMustExist: true });
    report.reopenReadOnly = {
      succeeded: true,
      integrityCheck: readIntegrity(sqlite),
      counts: {
        catalog: (sqlite.prepare('SELECT COUNT(*) AS count FROM techapi_catalog_records').get() as { count: number }).count,
        checkpoints: (sqlite.prepare('SELECT COUNT(*) AS count FROM techapi_import_checkpoints').get() as { count: number }).count,
      },
      schemaVersion: sqlite.prepare('SELECT MAX(version) AS version FROM archive_schema_version').get(),
    };

    const exactPayloads = [catalogChecksum, checkpointChecksum].every((result) =>
      result.sourceChecksum === result.sqliteChecksum
      && result.missingInSqlite === 0 && result.extraInSqlite === 0
      && result.payloadMismatches === 0 && result.mongoIdMismatches === 0 && result.extractedKeyMismatches === 0);
    const noDuplicates = Object.values(mongoMetrics.duplicateKeys).every((groups) => groups.length === 0)
      && Object.values(sqliteMetrics.duplicateKeys).every((groups) => groups.length === 0);
    const sourceUniqueIndexes = Object.values(mongoMetrics.indexes.catalogUniqueIndexesPresent).every(Boolean)
      && Object.values(mongoMetrics.indexes.checkpointUniqueIndexesPresent).every(Boolean);
    const noNullKeys = mongoMetrics.nullOrEmptyKeyCounts.catalog === 0 && mongoMetrics.nullOrEmptyKeyCounts.checkpoints === 0
      && sqliteMetrics.nullOrEmptyKeyCounts.catalog === 0 && sqliteMetrics.nullOrEmptyKeyCounts.checkpoints === 0;
    const indexAndNotNull = sqliteMetrics.uniqueIndexes.catalog.allSatisfied
      && sqliteMetrics.uniqueIndexes.checkpoints.allSatisfied
      && sqliteMetrics.notNullKeys.catalog.allSatisfied
      && sqliteMetrics.notNullKeys.checkpoints.allSatisfied;
    const expectedCountsMatch = mongoMetrics.counts.catalog === EXPECTED_COUNTS.catalog
      && mongoMetrics.counts.checkpoints === EXPECTED_COUNTS.checkpoints
      && sqliteMetrics.counts.catalog === EXPECTED_COUNTS.catalog
      && sqliteMetrics.counts.checkpoints === EXPECTED_COUNTS.checkpoints;
    const distributionParity = Object.values(report.distributionParity).every(Boolean);
    const reopenIntegrity = report.reopenReadOnly.integrityCheck.length === 1 && report.reopenReadOnly.integrityCheck[0] === 'ok';
    const queryParity = report.searchParity.allDefinitiveChecksPassed;
    report.summary = {
      countsMatchExpected: expectedCountsMatch,
      uniqueKeysAndNotNullPass: sourceUniqueIndexes && indexAndNotNull && noDuplicates && noNullKeys,
      distributionsMatch: distributionParity,
      payloadAndMongoIdMatch: exactPayloads,
      queryParity: queryParity
        ? report.searchParity.limitedQueries.length ? 'PASS_WITH_LIMITED_UNSORTED_CASES' : 'PASS'
        : 'FAIL',
      reopenAndIntegrityPass: reopenIntegrity
        && report.reopenReadOnly.counts.catalog === EXPECTED_COUNTS.catalog
        && report.reopenReadOnly.counts.checkpoints === EXPECTED_COUNTS.checkpoints,
      verificationStatus: expectedCountsMatch && indexAndNotNull && noDuplicates && noNullKeys
        && distributionParity && exactPayloads && queryParity && reopenIntegrity
        ? report.searchParity.limitedQueries.length ? 'PASS_WITH_LIMITATIONS' : 'PASS'
        : 'FAIL',
    };
    if (!String(report.summary.verificationStatus).startsWith('PASS')) process.exitCode = 1;
  } catch (error) {
    report.failure = {
      stage,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error && error.message.startsWith('Required existing staging')
        ? error.message
        : 'Verification failed; detailed connection and filesystem error text is suppressed.',
    };
    report.summary = { verificationStatus: 'BLOCKED' };
    process.exitCode = 1;
  } finally {
    if (sqlite?.open) sqlite.close();
    if (connection) await connection.close().catch(() => undefined);
    report.filesAfterOpen = readFileMetadata();
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) void runVerification();
