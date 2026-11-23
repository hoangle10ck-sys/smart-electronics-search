import Database from 'better-sqlite3';
import { Double, EJSON, Int32, ObjectId } from 'bson';
import { isDeepStrictEqual } from 'node:util';
import {
  TechApiCatalogIdentity,
  TechApiCatalogRecord,
  TechApiCatalogReference,
  TechApiDiscoveryQuery,
  TechApiDiscoveryRecord,
  TechApiEnrichedUpdate,
  TechApiFullDatasetUpsert,
  TechApiImportCheckpoint,
  TechApiImportResumeState,
  TechApiIndexUpsert,
  TechApiRepository,
  TechApiSocRecord,
  TechApiWriteCounts,
} from './techApiRepository';

const ARCHIVE_SCHEMA_VERSION = 1;
const BUSY_TIMEOUT_MS = 5000;
type PlainDocument = Record<string, any>;

function sortEjsonObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortEjsonObjectKeys);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [
      key,
      sortEjsonObjectKeys((value as Record<string, unknown>)[key]),
    ]));
  }
  return value;
}

export function serializeTechApiEjson(value: unknown): string {
  return EJSON.stringify(sortEjsonObjectKeys(value), { relaxed: false });
}

function buildSqliteDiscoveryPredicate(query: Pick<TechApiDiscoveryQuery, 'categories' | 'queryTerms' | 'brandTerms'>) {
  if (!query.categories.length) return { where: '0', parameters: [] as Array<string | number | null> };
  const conditions = [`source_category IN (${query.categories.map(() => '?').join(', ')})`];
  const parameters: Array<string | number | null> = [...query.categories];
  for (const term of query.queryTerms) {
    conditions.push('(instr(name_lower, ?) > 0 OR instr(search_text_lower, ?) > 0)');
    const loweredTerm = term.toLowerCase();
    parameters.push(loweredTerm, loweredTerm);
  }
  if (query.brandTerms.length) {
    const brandMatches: string[] = [];
    for (const term of query.brandTerms) {
      const loweredTerm = term.toLowerCase();
      for (const column of ['name_lower', 'raw_manufacturer_lower', 'raw_manufacturer_name_lower', 'raw_brand_lower']) {
        brandMatches.push(`instr(${column}, ?) > 0`);
        parameters.push(loweredTerm);
      }
    }
    conditions.push(`(${brandMatches.join(' OR ')})`);
  }
  return { where: conditions.join(' AND '), parameters };
}

function parseEjson<T>(value: string): T {
  return normalizeEjsonNumbers(EJSON.parse(value, { relaxed: false })) as T;
}

function normalizeEjsonNumbers(value: unknown): unknown {
  if (value instanceof Int32 || value instanceof Double) return value.valueOf();
  if (Array.isArray(value)) return value.map(normalizeEjsonNumbers);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, normalizeEjsonNumbers(nested)]));
  }
  return value;
}

function assertCatalogArchiveDocument(document: Record<string, unknown>): void {
  const stringFields = [
    'sourceKey', 'sourceCategory', 'sourceSlug', 'name', 'sourceRecordUrl', 'sourceListUrl',
    'dataAttribution', 'dataSourceUrl', 'dataLicense', 'dataLicenseUrl', 'licenseTermsUrl',
  ];
  if (!document._id) throw new Error('Catalog source document is missing _id.');
  for (const field of stringFields) {
    if (typeof document[field] !== 'string' || !(document[field] as string).length) {
      throw new Error(`Catalog source document has an invalid ${field}.`);
    }
  }
  if (document.workflowStatus !== 'discovery_only') {
    throw new Error(`Catalog source document ${String(document.sourceKey)} has unsupported workflowStatus.`);
  }
  if (!Object.prototype.hasOwnProperty.call(document, 'raw') || !document.raw || typeof document.raw !== 'object' || Array.isArray(document.raw)) {
    throw new Error(`Catalog source document ${String(document.sourceKey)} has invalid raw payload.`);
  }
}

function assertCheckpointArchiveDocument(document: Record<string, unknown>): void {
  const stringFields = ['fileKey', 'sourcePath', 'sourceCommit', 'sha256'];
  if (!document._id) throw new Error('Checkpoint source document is missing _id.');
  for (const field of stringFields) {
    if (typeof document[field] !== 'string' || !(document[field] as string).length) {
      throw new Error(`Checkpoint source document has an invalid ${field}.`);
    }
  }
  if (!Number.isSafeInteger(document.recordCount) || (document.recordCount as number) < 0) {
    throw new Error(`Checkpoint ${String(document.fileKey)} has an invalid recordCount.`);
  }
  if (dateToSql(document.importedAt) === null) {
    throw new Error(`Checkpoint ${String(document.fileKey)} has an invalid importedAt.`);
  }
}

function lowerString(value: unknown): string | null {
  return typeof value === 'string' ? value.toLowerCase() : null;
}

function dateToSql(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function dateOrNull(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function ensureDocumentId(document: PlainDocument): PlainDocument {
  return document._id ? document : { ...document, _id: new ObjectId() };
}

function indexInsertDocument(record: TechApiIndexUpsert): PlainDocument {
  return ensureDocumentId({
    sourceKey: record.sourceKey,
    sourceCategory: record.sourceCategory,
    sourceSlug: record.sourceSlug,
    name: record.name,
    sourceRecordUrl: record.sourceRecordUrl,
    sourceListUrl: record.sourceListUrl,
    dataAttribution: record.dataAttribution,
    dataSourceUrl: record.dataSourceUrl,
    dataLicense: record.dataLicense,
    dataLicenseUrl: record.dataLicenseUrl,
    licenseTermsUrl: record.licenseTermsUrl,
    workflowStatus: record.workflowStatus,
    lastSeenAt: record.lastSeenAt,
    createdAt: record.lastSeenAt,
    raw: record.raw,
    searchText: record.searchText,
    detailsFetchedAt: null,
    detailsSha256: null,
  });
}

function applyIndexUpdate(existing: PlainDocument, record: TechApiIndexUpsert): PlainDocument {
  return {
    ...existing,
    sourceKey: record.sourceKey,
    sourceCategory: record.sourceCategory,
    sourceSlug: record.sourceSlug,
    name: record.name,
    sourceRecordUrl: record.sourceRecordUrl,
    sourceListUrl: record.sourceListUrl,
    dataAttribution: record.dataAttribution,
    dataSourceUrl: record.dataSourceUrl,
    dataLicense: record.dataLicense,
    dataLicenseUrl: record.dataLicenseUrl,
    licenseTermsUrl: record.licenseTermsUrl,
    workflowStatus: record.workflowStatus,
    lastSeenAt: record.lastSeenAt,
  };
}

function fullDatasetInsertDocument(record: TechApiFullDatasetUpsert): PlainDocument {
  return ensureDocumentId({
    ...record,
    createdAt: record.createdAt ?? record.lastSeenAt,
  });
}

function applyFullDatasetUpdate(existing: PlainDocument, record: TechApiFullDatasetUpsert): PlainDocument {
  const { _id: _ignoredId, createdAt: _ignoredCreatedAt, ...setFields } = record;
  return { ...existing, ...setFields };
}

function checkpointInsertDocument(checkpoint: TechApiImportCheckpoint): PlainDocument {
  return ensureDocumentId({ ...checkpoint, createdAt: checkpoint.createdAt ?? checkpoint.importedAt });
}

function applyCheckpointUpdate(existing: PlainDocument, checkpoint: TechApiImportCheckpoint): PlainDocument {
  const { _id: _ignoredId, createdAt: _ignoredCreatedAt, ...setFields } = checkpoint;
  return { ...existing, ...setFields, updatedAt: checkpoint.updatedAt ?? checkpoint.importedAt };
}

export class SqliteTechApiRepository implements TechApiRepository {
  readonly catalogCollectionName = 'techapi_catalog_records';
  readonly checkpointCollectionName = 'techapi_import_checkpoints';
  private readonly database: Database.Database;
  private readonly readOnly: boolean;
  private readonly findCatalogDocumentStatement: Database.Statement;
  private readonly catalogWriteStatement: Database.Statement;
  private readonly findCheckpointDocumentStatement: Database.Statement;
  private readonly checkpointWriteStatement: Database.Statement;
  private readonly onClose?: () => Promise<void> | void;
  private closePromise: Promise<void> | null = null;

  constructor(databasePath: string, options: {
    readOnly?: boolean;
    requireExistingSchema?: boolean;
    onClose?: () => Promise<void> | void;
  } = {}) {
    this.readOnly = options.readOnly === true;
    this.onClose = options.onClose;
    const databaseOptions: Database.Options = this.readOnly
      ? { readonly: true, fileMustExist: true }
      : options.requireExistingSchema ? { readonly: false, fileMustExist: true } : {};
    this.database = new Database(databasePath, databaseOptions);
    try {
      this.database.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
      this.database.pragma('foreign_keys = ON');
      if (this.readOnly) this.assertExistingSchema();
      else if (options.requireExistingSchema) {
        // A controlled importer must never turn a missing/invalid archive into
        // a newly initialized database as a side effect of selecting readwrite.
        this.assertExistingSchema();
        this.database.pragma('journal_mode = WAL');
      } else {
        this.database.pragma('journal_mode = WAL');
        this.initializeSchema();
      }

      this.findCatalogDocumentStatement = this.database.prepare(
        'SELECT document_ejson FROM techapi_catalog_records WHERE source_key = ?',
      );
      this.catalogWriteStatement = this.database.prepare(`
      INSERT INTO techapi_catalog_records (
        mongo_id, source_key, source_category, source_slug, name, name_lower,
        source_record_url, source_list_url, data_attribution, data_source_url,
        data_license, data_license_url, license_terms_url, workflow_status,
        document_ejson, search_text, search_text_lower, raw_manufacturer_lower,
        raw_manufacturer_name_lower, raw_brand_lower, raw_verified,
        details_fetched_at, details_sha256, last_seen_at, created_at, updated_at
      ) VALUES (
        @mongo_id, @source_key, @source_category, @source_slug, @name, @name_lower,
        @source_record_url, @source_list_url, @data_attribution, @data_source_url,
        @data_license, @data_license_url, @license_terms_url, @workflow_status,
        @document_ejson, @search_text, @search_text_lower, @raw_manufacturer_lower,
        @raw_manufacturer_name_lower, @raw_brand_lower, @raw_verified,
        @details_fetched_at, @details_sha256, @last_seen_at, @created_at, @updated_at
      ) ON CONFLICT(source_key) DO UPDATE SET
        source_category = excluded.source_category,
        source_slug = excluded.source_slug,
        name = excluded.name,
        name_lower = excluded.name_lower,
        source_record_url = excluded.source_record_url,
        source_list_url = excluded.source_list_url,
        data_attribution = excluded.data_attribution,
        data_source_url = excluded.data_source_url,
        data_license = excluded.data_license,
        data_license_url = excluded.data_license_url,
        license_terms_url = excluded.license_terms_url,
        workflow_status = excluded.workflow_status,
        document_ejson = excluded.document_ejson,
        search_text = excluded.search_text,
        search_text_lower = excluded.search_text_lower,
        raw_manufacturer_lower = excluded.raw_manufacturer_lower,
        raw_manufacturer_name_lower = excluded.raw_manufacturer_name_lower,
        raw_brand_lower = excluded.raw_brand_lower,
        raw_verified = excluded.raw_verified,
        details_fetched_at = excluded.details_fetched_at,
        details_sha256 = excluded.details_sha256,
        last_seen_at = excluded.last_seen_at,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
      `);
      this.findCheckpointDocumentStatement = this.database.prepare(
        'SELECT document_ejson FROM techapi_import_checkpoints WHERE file_key = ?',
      );
      this.checkpointWriteStatement = this.database.prepare(`
      INSERT INTO techapi_import_checkpoints (
        mongo_id, file_key, source_path, source_commit, sha256, record_count,
        imported_at, created_at, updated_at, document_ejson
      ) VALUES (
        @mongo_id, @file_key, @source_path, @source_commit, @sha256, @record_count,
        @imported_at, @created_at, @updated_at, @document_ejson
      ) ON CONFLICT(file_key) DO UPDATE SET
        source_path = excluded.source_path,
        source_commit = excluded.source_commit,
        sha256 = excluded.sha256,
        record_count = excluded.record_count,
        imported_at = excluded.imported_at,
        updated_at = excluded.updated_at,
        document_ejson = excluded.document_ejson
      `);
    } catch (error) {
      if (this.database.open) this.database.close();
      throw error;
    }
  }

  async initializeCatalog(): Promise<void> {
    this.assertOpen();
  }

  async initializeCheckpoints(): Promise<void> {
    this.assertOpen();
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closePromise = (async () => {
      let closeError: unknown;
      try {
        if (this.database.open && !this.readOnly) this.database.pragma('wal_checkpoint(TRUNCATE)');
      } catch (error) {
        closeError = error;
      } finally {
        try {
          if (this.database.open) this.database.close();
        } catch (error) {
          closeError ??= error;
        }
        try {
          await this.onClose?.();
        } catch (error) {
          closeError ??= error;
        }
      }
      if (closeError) throw closeError;
    })();
    return this.closePromise;
  }

  /** Exact source-document insertion used only by the guarded archive migration utility. */
  async insertSourceCatalogBatch(records: Array<Record<string, unknown>>): Promise<void> {
    this.assertOpen();
    this.assertWritable();
    this.database.transaction((batch: Array<Record<string, unknown>>) => {
      for (const record of batch) {
        const sourceKey = typeof record.sourceKey === 'string' ? record.sourceKey : '<missing-sourceKey>';
        try {
          assertCatalogArchiveDocument(record);
          if (this.findCatalogDocumentStatement.get(sourceKey)) {
            throw new Error('Duplicate sourceKey in SQLite staging batch.');
          }
          this.writeCatalogDocument(record as PlainDocument);
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'unknown SQLite archive error';
          throw new Error(`Catalog archive record ${sourceKey} failed: ${reason}`);
        }
      }
    }).immediate(records);
  }

  /** Exact source-document insertion used only by the guarded archive migration utility. */
  async insertSourceCheckpointBatch(records: Array<Record<string, unknown>>): Promise<void> {
    this.assertOpen();
    this.assertWritable();
    this.database.transaction((batch: Array<Record<string, unknown>>) => {
      for (const record of batch) {
        const fileKey = typeof record.fileKey === 'string' ? record.fileKey : '<missing-fileKey>';
        try {
          assertCheckpointArchiveDocument(record);
          if (this.findCheckpointDocumentStatement.get(fileKey)) {
            throw new Error('Duplicate fileKey in SQLite staging batch.');
          }
          this.writeCheckpointDocument(record as PlainDocument);
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'unknown SQLite archive error';
          throw new Error(`Checkpoint archive record ${fileKey} failed: ${reason}`);
        }
      }
    }).immediate(records);
  }

  async findCatalogRecordBySourceKey(sourceKey: string): Promise<TechApiCatalogRecord | null> {
    this.assertOpen();
    const row = this.findCatalogDocumentStatement.get(sourceKey) as { document_ejson: string } | undefined;
    return row ? parseEjson<TechApiCatalogRecord>(row.document_ejson) : null;
  }

  async findDiscoveryCandidates(query: TechApiDiscoveryQuery): Promise<TechApiDiscoveryRecord[]> {
    this.assertOpen();
    const predicate = buildSqliteDiscoveryPredicate(query);
    if (predicate.where === '0') return [];
    const parameters = [...predicate.parameters];
    parameters.push(query.limit, query.offset ?? 0);
    const statement = this.database.prepare(`
      SELECT document_ejson FROM techapi_catalog_records
      WHERE ${predicate.where}
      ${query.candidateOrdering === 'stable_v1' ? 'ORDER BY source_key COLLATE BINARY ASC' : ''}
      LIMIT ? OFFSET ?
    `);
    const rows = statement.all(...parameters) as Array<{ document_ejson: string }>;
    return rows.map(({ document_ejson }) => {
      const record = parseEjson<TechApiCatalogRecord>(document_ejson);
      return {
        sourceKey: record.sourceKey,
        sourceCategory: record.sourceCategory,
        sourceSlug: record.sourceSlug,
        name: record.name,
        sourceRecordUrl: record.sourceRecordUrl,
        dataAttribution: record.dataAttribution,
        dataSourceUrl: record.dataSourceUrl,
        dataLicense: record.dataLicense,
        dataLicenseUrl: record.dataLicenseUrl,
        searchText: record.searchText,
        raw: record.raw,
      };
    });
  }

  async countDiscoveryCandidates(query: Pick<TechApiDiscoveryQuery, 'categories' | 'queryTerms' | 'brandTerms'>): Promise<number> {
    this.assertOpen();
    const predicate = buildSqliteDiscoveryPredicate(query);
    if (predicate.where === '0') return 0;
    return (this.database.prepare(`SELECT COUNT(*) AS count FROM techapi_catalog_records WHERE ${predicate.where}`)
      .get(...predicate.parameters) as { count: number }).count;
  }

  async upsertIndexRecords(records: TechApiIndexUpsert[]): Promise<TechApiWriteCounts> {
    this.assertOpen();
    this.assertWritable();
    return this.database.transaction((batch: TechApiIndexUpsert[]) => this.upsertIndexRecordsInternal(batch)).immediate(records);
  }

  async upsertFullDatasetRecords(records: TechApiFullDatasetUpsert[]): Promise<TechApiWriteCounts> {
    this.assertOpen();
    this.assertWritable();
    return this.database.transaction((batch: TechApiFullDatasetUpsert[]) => this.upsertFullDatasetRecordsInternal(batch)).immediate(records);
  }

  async saveFullDatasetRecordsWithCheckpoints(
    records: TechApiFullDatasetUpsert[],
    checkpoints: TechApiImportCheckpoint[],
  ): Promise<TechApiWriteCounts> {
    this.assertOpen();
    this.assertWritable();
    return this.database.transaction((catalogBatch: TechApiFullDatasetUpsert[], checkpointBatch: TechApiImportCheckpoint[]) => {
      const result = this.upsertFullDatasetRecordsInternal(catalogBatch);
      this.upsertCheckpointsInternal(checkpointBatch);
      return result;
    }).immediate(records, checkpoints);
  }

  async findCatalogReferencesForEnrichment(options: { category?: string; refresh: boolean; limit: number }): Promise<TechApiCatalogReference[]> {
    this.assertOpen();
    const conditions: string[] = [];
    const parameters: Array<string | number> = [];
    if (!options.refresh) conditions.push('details_fetched_at IS NULL');
    if (options.category) {
      conditions.push('source_category = ?');
      parameters.push(options.category);
    }
    parameters.push(options.limit);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.database.prepare(`
      SELECT source_key, source_category, source_slug, name, source_record_url
      FROM techapi_catalog_records ${where}
      ORDER BY last_seen_at DESC, source_category ASC, source_slug ASC
      LIMIT ?
    `).all(...parameters) as Array<{
      source_key: string; source_category: string; source_slug: string; name: string; source_record_url: string;
    }>;
    return rows.map((row) => ({
      sourceKey: row.source_key,
      sourceCategory: row.source_category,
      sourceSlug: row.source_slug,
      name: row.name,
      sourceRecordUrl: row.source_record_url,
    }));
  }

  async updateEnrichedRecord(update: TechApiEnrichedUpdate): Promise<number> {
    this.assertOpen();
    this.assertWritable();
    return this.database.transaction((input: TechApiEnrichedUpdate) => {
      const existing = this.getCatalogDocument(input.sourceKey);
      if (!existing || (input.onlyIfNotEnriched && existing.detailsFetchedAt != null)) return 0;
      const next: PlainDocument = {
        ...existing,
        raw: input.raw,
        searchText: input.searchText,
        detailsFetchedAt: input.detailsFetchedAt,
        detailsSha256: input.detailsSha256,
        lastSeenAt: input.detailsFetchedAt,
        updatedAt: new Date(),
      };
      if (isDeepStrictEqual(existing, next)) return 0;
      this.writeCatalogDocument(next);
      return 1;
    }).immediate(update);
  }

  async findVerifiedSocRecords(): Promise<TechApiSocRecord[]> {
    this.assertOpen();
    const rows = this.database.prepare(`
      SELECT document_ejson FROM techapi_catalog_records
      WHERE source_category = 'soc' AND raw_verified = 1
    `).all() as Array<{ document_ejson: string }>;
    return rows.map(({ document_ejson }) => {
      const record = parseEjson<TechApiCatalogRecord>(document_ejson);
      return {
        sourceKey: record.sourceKey,
        sourceCategory: record.sourceCategory,
        sourceSlug: record.sourceSlug,
        name: record.name,
        sourceRecordUrl: record.sourceRecordUrl,
        raw: record.raw,
        lastSeenAt: record.lastSeenAt,
      };
    });
  }

  async findExistingCatalogIdentities(identities: TechApiCatalogIdentity[]): Promise<Set<string>> {
    this.assertOpen();
    if (!identities.length) return new Set();
    const conditions = identities.map(() => '(source_category = ? AND source_slug = ?)');
    const parameters = identities.flatMap((identity) => [identity.sourceCategory, identity.sourceSlug]);
    const rows = this.database.prepare(`
      SELECT source_category, source_slug FROM techapi_catalog_records
      WHERE ${conditions.join(' OR ')}
    `).all(...parameters) as Array<{ source_category: string; source_slug: string }>;
    return new Set(rows.map((row) => JSON.stringify([row.source_category, row.source_slug])));
  }

  async countCatalogRecords(): Promise<number> {
    this.assertOpen();
    return (this.database.prepare('SELECT COUNT(*) AS records FROM techapi_catalog_records').get() as { records: number }).records;
  }

  async countCatalogRecordsByCategory(): Promise<Array<{ category: string; records: number }>> {
    this.assertOpen();
    const rows = this.database.prepare(`
      SELECT source_category AS category, COUNT(*) AS records
      FROM techapi_catalog_records GROUP BY source_category ORDER BY source_category ASC
    `).all() as Array<{ category: string; records: number }>;
    return rows;
  }

  async findCheckpoints(fileKeys: string[]): Promise<TechApiImportCheckpoint[]> {
    this.assertOpen();
    if (!fileKeys.length) return [];
    const rows = this.database.prepare(`
      SELECT document_ejson FROM techapi_import_checkpoints
      WHERE file_key IN (${fileKeys.map(() => '?').join(', ')})
    `).all(...fileKeys) as Array<{ document_ejson: string }>;
    return rows.map(({ document_ejson }) => parseEjson<TechApiImportCheckpoint>(document_ejson));
  }

  async findExistingCatalogSourceKeys(sourceKeys: string[]): Promise<Set<string>> {
    this.assertOpen();
    if (!sourceKeys.length) return new Set();
    const rows = this.database.prepare(`
      SELECT source_key FROM techapi_catalog_records
      WHERE source_key IN (${sourceKeys.map(() => '?').join(', ')})
    `).all(...sourceKeys) as Array<{ source_key: string }>;
    return new Set(rows.map((row) => row.source_key));
  }

  async findImportResumeStates(candidates: Array<{ fileKey: string; sourceKey: string }>): Promise<Map<string, TechApiImportResumeState>> {
    this.assertOpen();
    const states = new Map<string, TechApiImportResumeState>();
    if (!candidates.length) return states;
    const checkpoints = await this.findCheckpoints(candidates.map((candidate) => candidate.fileKey));
    const checkpointByFileKey = new Map(checkpoints.map((checkpoint) => [checkpoint.fileKey, checkpoint]));
    const candidatesWithCheckpoint = candidates.filter((candidate) => checkpointByFileKey.has(candidate.fileKey));
    const existingSourceKeys = await this.findExistingCatalogSourceKeys(candidatesWithCheckpoint.map((candidate) => candidate.sourceKey));
    for (const candidate of candidates) {
      const checkpoint = checkpointByFileKey.get(candidate.fileKey);
      states.set(candidate.fileKey, {
        ...(checkpoint ? { checkpointSha256: checkpoint.sha256 } : {}),
        catalogRecordExists: existingSourceKeys.has(candidate.sourceKey),
      });
    }
    return states;
  }

  async upsertCheckpoints(checkpoints: TechApiImportCheckpoint[]): Promise<void> {
    this.assertOpen();
    this.assertWritable();
    this.database.transaction((batch: TechApiImportCheckpoint[]) => this.upsertCheckpointsInternal(batch)).immediate(checkpoints);
  }

  private initializeSchema(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS archive_schema_version (
        version INTEGER PRIMARY KEY CHECK (version > 0),
        applied_at TEXT NOT NULL
      ) STRICT;
    `);
    this.database.transaction(() => {
      const current = this.database.prepare('SELECT MAX(version) AS version FROM archive_schema_version').get() as { version: number | null };
      if (current.version !== null && current.version > ARCHIVE_SCHEMA_VERSION) {
        throw new Error(`TechAPI archive schema version ${current.version} is newer than this application supports (${ARCHIVE_SCHEMA_VERSION}).`);
      }
      if (current.version !== null && current.version < ARCHIVE_SCHEMA_VERSION) {
        throw new Error(`TechAPI archive schema version ${current.version} requires an explicit migration before this application version (${ARCHIVE_SCHEMA_VERSION}) can open it.`);
      }
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS techapi_catalog_records (
          mongo_id TEXT NOT NULL UNIQUE,
          source_key TEXT NOT NULL UNIQUE,
          source_category TEXT NOT NULL,
          source_slug TEXT NOT NULL,
          name TEXT NOT NULL,
          name_lower TEXT NOT NULL,
          source_record_url TEXT NOT NULL,
          source_list_url TEXT NOT NULL,
          data_attribution TEXT NOT NULL,
          data_source_url TEXT NOT NULL,
          data_license TEXT NOT NULL,
          data_license_url TEXT NOT NULL,
          license_terms_url TEXT NOT NULL,
          workflow_status TEXT NOT NULL CHECK (workflow_status = 'discovery_only'),
          document_ejson TEXT NOT NULL,
          search_text TEXT NOT NULL DEFAULT '',
          search_text_lower TEXT NOT NULL DEFAULT '',
          raw_manufacturer_lower TEXT,
          raw_manufacturer_name_lower TEXT,
          raw_brand_lower TEXT,
          raw_verified INTEGER NOT NULL DEFAULT 0 CHECK (raw_verified IN (0, 1)),
          details_fetched_at TEXT,
          details_sha256 TEXT,
          last_seen_at TEXT,
          created_at TEXT,
          updated_at TEXT,
          UNIQUE (source_category, source_slug)
        ) STRICT;
        CREATE TABLE IF NOT EXISTS techapi_import_checkpoints (
          mongo_id TEXT NOT NULL UNIQUE,
          file_key TEXT PRIMARY KEY,
          source_path TEXT NOT NULL,
          source_commit TEXT NOT NULL,
          sha256 TEXT NOT NULL,
          record_count INTEGER NOT NULL,
          imported_at TEXT NOT NULL,
          created_at TEXT,
          updated_at TEXT,
          document_ejson TEXT NOT NULL
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_techapi_catalog_category ON techapi_catalog_records(source_category);
        CREATE INDEX IF NOT EXISTS idx_techapi_catalog_workflow ON techapi_catalog_records(workflow_status);
        CREATE INDEX IF NOT EXISTS idx_techapi_catalog_details_fetched ON techapi_catalog_records(details_fetched_at);
        CREATE INDEX IF NOT EXISTS idx_techapi_catalog_enrich_all ON techapi_catalog_records(details_fetched_at, last_seen_at DESC, source_category ASC, source_slug ASC);
        CREATE INDEX IF NOT EXISTS idx_techapi_catalog_enrich_category ON techapi_catalog_records(details_fetched_at, source_category, last_seen_at DESC, source_slug ASC);
        CREATE INDEX IF NOT EXISTS idx_techapi_catalog_soc_verified ON techapi_catalog_records(source_category, raw_verified);
      `);
      if (current.version === null) {
        this.database.prepare('INSERT INTO archive_schema_version(version, applied_at) VALUES (?, ?)')
          .run(ARCHIVE_SCHEMA_VERSION, new Date().toISOString());
      }
    }).immediate();
  }

  private upsertIndexRecordsInternal(records: TechApiIndexUpsert[]): TechApiWriteCounts {
    let created = 0;
    let updated = 0;
    for (const record of records) {
      const existing = this.getCatalogDocument(record.sourceKey);
      const next = existing ? applyIndexUpdate(existing, record) : indexInsertDocument(record);
      if (existing && isDeepStrictEqual(existing, next)) continue;
      this.writeCatalogDocument(next);
      if (existing) updated += 1;
      else created += 1;
    }
    return { created, updated };
  }

  private upsertFullDatasetRecordsInternal(records: TechApiFullDatasetUpsert[]): TechApiWriteCounts {
    let created = 0;
    let updated = 0;
    for (const record of records) {
      const existing = this.getCatalogDocument(record.sourceKey);
      const next = existing ? applyFullDatasetUpdate(existing, record) : fullDatasetInsertDocument(record);
      if (existing && isDeepStrictEqual(existing, next)) continue;
      this.writeCatalogDocument(next);
      if (existing) updated += 1;
      else created += 1;
    }
    return { created, updated };
  }

  private upsertCheckpointsInternal(checkpoints: TechApiImportCheckpoint[]): void {
    for (const checkpoint of checkpoints) {
      const existing = this.getCheckpointDocument(checkpoint.fileKey);
      const next = existing ? applyCheckpointUpdate(existing, checkpoint) : checkpointInsertDocument(checkpoint);
      if (existing && isDeepStrictEqual(existing, next)) continue;
      this.writeCheckpointDocument(next);
    }
  }

  private getCatalogDocument(sourceKey: string): PlainDocument | undefined {
    const row = this.findCatalogDocumentStatement.get(sourceKey) as { document_ejson: string } | undefined;
    return row ? parseEjson<PlainDocument>(row.document_ejson) : undefined;
  }

  private getCheckpointDocument(fileKey: string): PlainDocument | undefined {
    const row = this.findCheckpointDocumentStatement.get(fileKey) as { document_ejson: string } | undefined;
    return row ? parseEjson<PlainDocument>(row.document_ejson) : undefined;
  }

  private writeCatalogDocument(document: PlainDocument): void {
    const raw = document.raw ?? {};
    const manufacturer = typeof raw.manufacturer === 'string' ? raw.manufacturer : null;
    const manufacturerName = raw.manufacturer && typeof raw.manufacturer === 'object' && !Array.isArray(raw.manufacturer)
      ? raw.manufacturer.name
      : null;
    const brand = typeof raw.brand === 'string' ? raw.brand : null;
    this.catalogWriteStatement.run({
      mongo_id: serializeTechApiEjson(document._id),
      source_key: document.sourceKey,
      source_category: document.sourceCategory,
      source_slug: document.sourceSlug,
      name: document.name,
      name_lower: String(document.name).toLowerCase(),
      source_record_url: document.sourceRecordUrl,
      source_list_url: document.sourceListUrl,
      data_attribution: document.dataAttribution,
      data_source_url: document.dataSourceUrl,
      data_license: document.dataLicense,
      data_license_url: document.dataLicenseUrl,
      license_terms_url: document.licenseTermsUrl,
      workflow_status: document.workflowStatus,
      document_ejson: serializeTechApiEjson(document),
      search_text: typeof document.searchText === 'string' ? document.searchText : '',
      search_text_lower: typeof document.searchText === 'string' ? document.searchText.toLowerCase() : '',
      raw_manufacturer_lower: lowerString(manufacturer),
      raw_manufacturer_name_lower: lowerString(manufacturerName),
      raw_brand_lower: lowerString(brand),
      raw_verified: raw.verified === true ? 1 : 0,
      details_fetched_at: dateToSql(document.detailsFetchedAt),
      details_sha256: typeof document.detailsSha256 === 'string' ? document.detailsSha256 : null,
      last_seen_at: dateToSql(document.lastSeenAt),
      created_at: dateToSql(document.createdAt),
      updated_at: dateToSql(document.updatedAt),
    });
  }

  private writeCheckpointDocument(document: PlainDocument): void {
    this.checkpointWriteStatement.run({
      mongo_id: serializeTechApiEjson(document._id),
      file_key: document.fileKey,
      source_path: document.sourcePath,
      source_commit: document.sourceCommit,
      sha256: document.sha256,
      record_count: document.recordCount,
      imported_at: dateToSql(document.importedAt),
      created_at: dateToSql(document.createdAt),
      updated_at: dateToSql(document.updatedAt),
      document_ejson: serializeTechApiEjson(document),
    });
  }

  private assertOpen(): void {
    if (!this.database.open) throw new Error('TechAPI SQLite repository is closed.');
  }

  private assertWritable(): void {
    if (this.readOnly) throw new Error('TechAPI SQLite repository is read-only.');
  }

  private assertExistingSchema(): void {
    const tables = new Set((this.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
      .map((row) => row.name));
    for (const table of ['archive_schema_version', 'techapi_catalog_records', 'techapi_import_checkpoints']) {
      if (!tables.has(table)) throw new Error(`TechAPI SQLite archive is missing required table ${table}.`);
    }
    const version = (this.database.prepare('SELECT MAX(version) AS version FROM archive_schema_version').get() as { version: number | null }).version;
    if (version !== ARCHIVE_SCHEMA_VERSION) {
      throw new Error(`TechAPI SQLite archive schema version ${version ?? 'missing'} is incompatible with version ${ARCHIVE_SCHEMA_VERSION}.`);
    }
  }
}
