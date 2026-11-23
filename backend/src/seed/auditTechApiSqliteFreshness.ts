import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import Database from 'better-sqlite3';
import { EJSON } from 'bson';
import { MongoClient, type Document } from 'mongodb';
import { serializeTechApiEjson } from '../repositories/sqliteTechApiRepository';
import {
  assessSqliteNotNullKeys,
  assessSqliteUniqueKeys,
  type TechApiSqliteTable,
} from './techApiSqliteArchiveVerification';

const ATLAS_HOST = 'cluster0.wapbjwc.mongodb.net';
const ATLAS_USERNAME = 'techapi_freshness_audit_ro';
const DATABASE_NAME = 'smart_electronics';
const DEFAULT_ARCHIVE_PATH = 'D:\\SmartElectronicsData\\techapi_catalog.sqlite';
const DEFAULT_MANIFEST_PATH = 'D:\\SmartElectronicsData\\techapi_catalog.manifest.json';
const REQUIRED_SCHEMA_VERSION = 1;
const OPERATION_TIMEOUT_MS = 180_000;
const MAX_TIME_MS = 60_000;
const SAMPLE_LIMIT = 20;

type CollectionSpec = {
  atlasName: 'techapicatalogrecords' | 'techapiimportcheckpoints';
  table: TechApiSqliteTable;
  keyField: 'sourceKey' | 'fileKey';
  keyColumn: 'source_key' | 'file_key';
  freshnessFields: readonly string[];
};

const COLLECTIONS: readonly CollectionSpec[] = [
  {
    atlasName: 'techapicatalogrecords',
    table: 'techapi_catalog_records',
    keyField: 'sourceKey',
    keyColumn: 'source_key',
    freshnessFields: ['lastSeenAt', 'updatedAt', 'createdAt'],
  },
  {
    atlasName: 'techapiimportcheckpoints',
    table: 'techapi_import_checkpoints',
    keyField: 'fileKey',
    keyColumn: 'file_key',
    freshnessFields: ['importedAt', 'updatedAt', 'createdAt'],
  },
];

const REQUIRED_COLUMNS: Record<TechApiSqliteTable, readonly string[]> = {
  techapi_catalog_records: [
    'mongo_id', 'source_key', 'source_category', 'source_slug', 'name', 'name_lower',
    'source_record_url', 'source_list_url', 'data_attribution', 'data_source_url',
    'data_license', 'data_license_url', 'license_terms_url', 'workflow_status',
    'document_ejson', 'search_text', 'search_text_lower', 'raw_manufacturer_lower',
    'raw_manufacturer_name_lower', 'raw_brand_lower', 'raw_verified',
    'details_fetched_at', 'details_sha256', 'last_seen_at', 'created_at', 'updated_at',
  ],
  techapi_import_checkpoints: [
    'mongo_id', 'file_key', 'source_path', 'source_commit', 'sha256', 'record_count',
    'imported_at', 'created_at', 'updated_at', 'document_ejson',
  ],
};

export type FreshnessStatus =
  | 'PASS'
  | 'PASS_WITH_ADDITIONS'
  | 'PASS_WITH_UPDATES'
  | 'FAIL'
  | 'BLOCKED'
  | 'INCONSISTENT_SOURCE';

type Manifest = {
  archiveName: string;
  schemaVersion: number;
  tableCounts: { catalog: number; checkpoints: number; total: number };
  archivePayloadChecksums: { catalog: string; checkpoints: string; combined: string };
  archiveFileSha256: string;
  archiveFileSizeBytes: number;
  integrityCheck: string;
  uniqueIndexVerification: Record<string, Array<{
    label: string;
    businessFields: string[];
    sqliteColumns: string[];
    satisfied: boolean;
  }>>;
  notNullVerification: Record<string, Array<{
    column: string;
    exists: boolean;
    notNull: boolean;
    primaryKeyPosition: number;
    satisfied: boolean;
  }>>;
};

type ArchiveState = {
  database: Database.Database;
  manifest: Manifest;
  archiveSha256: string;
  archiveSizeBytes: number;
  schemaVersion: number;
  counts: { catalog: number; checkpoints: number; total: number };
  payloadChecksums: { catalog: string; checkpoints: string; combined: string };
  freshness: { catalog: Freshness; checkpoints: Freshness };
};

type Freshness = Record<string, string | null>;
type Fingerprint = { count: number; sha256: string; freshness: Freshness };
type DeltaSample = { key: string; atlasSha256?: string; archiveSha256?: string };
type AtlasCollectionName = CollectionSpec['atlasName'];
type DiagnosticPhase =
  | 'audit'
  | 'mongo_client_create'
  | 'mongo_connect'
  | 'database_select'
  | 'collection_select'
  | 'cursor_create'
  | 'cursor_has_next'
  | 'cursor_next'
  | 'document_validate'
  | 'canonicalize_identifier'
  | 'canonicalize_document'
  | 'fingerprint_update'
  | 'archive_document_decode'
  | 'archive_iterator'
  | 'cursor_close'
  | 'client_close'
  | 'sqlite_cleanup';
type DiagnosticClassification =
  | 'unauthorized'
  | 'authentication_failed'
  | 'server_selection'
  | 'network'
  | 'timeout'
  | 'abort'
  | 'bson_canonicalization'
  | 'cursor_read'
  | 'unknown';
type SafeAuditDiagnostic = {
  phase: DiagnosticPhase;
  collection?: AtlasCollectionName;
  classification: DiagnosticClassification;
  errorName: string;
  code?: number;
  codeName?: string;
  errorLabels: string[];
  deadlineExceeded: boolean;
  aborted: boolean;
};
type IdentifierInfo = {
  valid: boolean;
  key?: string;
  reason?: 'missing' | 'null' | 'empty' | 'undefined' | 'non_string';
  fingerprintToken: string;
  identifierSha256: string;
};
type CollectionComparison = {
  atlasCount: number;
  archiveCount: number;
  matched: number;
  atlasOnly: number;
  archiveOnly: number;
  payloadMismatch: number;
  mongoIdMismatch: number;
  duplicateAtlasKeys: number;
  invalidAtlasIdentifiers: number;
  atlasSha256: string;
  archivePayloadSha256: string;
  atlasFreshness: Freshness;
  archiveFreshness: Freshness;
  samples: {
    atlasOnly: DeltaSample[];
    archiveOnly: DeltaSample[];
    payloadMismatch: DeltaSample[];
    mongoIdMismatch: DeltaSample[];
    invalidIdentifiers: Array<{ reason: string; identifierSha256: string; documentSha256: string }>;
    duplicateKeys: Array<{ identifierSha256: string; documentSha256: string }>;
  };
};

export type FreshnessReport = {
  status: FreshnessStatus;
  startedAt: string;
  finishedAt: string;
  operatorConfirmedNoWriters: true;
  database: typeof DATABASE_NAME;
  archive: {
    schemaVersion: number;
    counts: ArchiveState['counts'];
    sha256: string;
    integrityCheck: 'ok';
    manifestSchemaFingerprintAvailable: false;
    readOnly: true;
  };
  sourceRead: {
    server: 'Atlas primary';
    readConcern: 'majority';
    snapshotClaimed: false;
    stableAcrossObservedScans: boolean;
    quiescenceRequirement: string;
    fingerprints: Record<string, { head: Fingerprint; compared: Fingerprint; tail: Fingerprint }>;
  };
  comparisons: Record<string, CollectionComparison>;
  message?: string;
  diagnostic?: SafeAuditDiagnostic;
  cleanupDiagnostics?: SafeAuditDiagnostic[];
};

type MongoCursorLike = {
  hasNext(): Promise<boolean>;
  next(): Promise<Document | null>;
  close(): Promise<void>;
};
type MongoCollectionLike = { find(filter: Document, options: Document): MongoCursorLike };
type MongoDatabaseLike = { collection(name: string): MongoCollectionLike };
type MongoClientLike = {
  connect(): Promise<unknown>;
  db(name: string, options?: Document): MongoDatabaseLike;
  close(): Promise<void>;
};

export class FreshnessAuditError extends Error {
  constructor(
    readonly status: 'FAIL' | 'BLOCKED',
    message: string,
    readonly diagnostic?: SafeAuditDiagnostic,
    readonly cleanupDiagnostics: SafeAuditDiagnostic[] = [],
  ) {
    super(message);
    this.name = 'FreshnessAuditError';
  }
}

function fail(status: 'FAIL' | 'BLOCKED', message: string): never {
  throw new FreshnessAuditError(status, message);
}

const SAFE_ERROR_NAMES = new Set([
  'AbortError', 'BSONError', 'Error', 'FreshnessAuditError', 'MongoInvalidArgumentError',
  'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoOperationTimeoutError', 'MongoParseError',
  'MongoPoolClearedError', 'MongoRuntimeError', 'MongoServerClosedError', 'MongoServerError',
  'MongoServerSelectionError', 'MongoTopologyClosedError', 'MongoUnexpectedServerResponseError',
  'RangeError', 'TimeoutError', 'TypeError',
]);
const SAFE_ERROR_LABELS = new Set([
  'HandshakeError', 'NetworkError', 'NoWritesPerformed', 'NonResumableChangeStreamError',
  'ResumableChangeStreamError', 'RetryableReadError', 'RetryableWriteError',
  'TransientTransactionError', 'UnknownTransactionCommitResult',
]);
const KNOWN_CODE_NAMES = new Map<number, string>([
  [6, 'HostUnreachable'],
  [7, 'HostNotFound'],
  [13, 'Unauthorized'],
  [18, 'AuthenticationFailed'],
  [50, 'MaxTimeMSExpired'],
  [89, 'NetworkTimeout'],
  [91, 'ShutdownInProgress'],
]);

function safeErrorProperty(error: unknown, property: string): unknown {
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) return undefined;
  try { return (error as Record<string, unknown>)[property]; } catch { return undefined; }
}

function safeDiagnostic(
  phase: DiagnosticPhase,
  error: unknown,
  deadline?: AuditDeadline,
  collection?: AtlasCollectionName,
): SafeAuditDiagnostic {
  const rawName = safeErrorProperty(error, 'name');
  const errorName = typeof rawName === 'string' && SAFE_ERROR_NAMES.has(rawName) ? rawName : 'OtherError';
  const rawCode = safeErrorProperty(error, 'code');
  const code = typeof rawCode === 'number' && Number.isSafeInteger(rawCode) && rawCode >= 0 && rawCode <= 2_147_483_647
    ? rawCode
    : undefined;
  const rawCodeName = safeErrorProperty(error, 'codeName');
  const codeName = typeof rawCodeName === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(rawCodeName)
    ? rawCodeName
    : undefined;
  let rawLabels = safeErrorProperty(error, 'errorLabels');
  if (!Array.isArray(rawLabels)) {
    const getLabels = safeErrorProperty(error, 'getErrorLabels');
    if (typeof getLabels === 'function') {
      try { rawLabels = getLabels.call(error); } catch { rawLabels = undefined; }
    }
  }
  const errorLabels = Array.isArray(rawLabels)
    ? [...new Set(rawLabels.filter((label): label is string => typeof label === 'string' && SAFE_ERROR_LABELS.has(label)))].slice(0, 8)
    : [];
  const deadlineExceeded = deadline?.expired ?? false;
  const aborted = deadline?.signal.aborted ?? false;

  let classification: DiagnosticClassification = 'unknown';
  const expectedCodeName = code === undefined ? undefined : KNOWN_CODE_NAMES.get(code);
  const knownCodeNameCode = codeName
    ? [...KNOWN_CODE_NAMES.entries()].find(([, knownName]) => knownName === codeName)?.[0]
    : undefined;
  const codeNameWasProvided = rawCodeName !== undefined && rawCodeName !== null;
  const codeNameMismatch = code !== undefined && codeNameWasProvided && (
    codeName === undefined
    || (expectedCodeName ? codeName !== expectedCodeName : knownCodeNameCode !== code)
  );
  if (deadlineExceeded) classification = 'timeout';
  else if (aborted) classification = 'abort';
  else if (!codeNameMismatch) {
    if (code === 13 || codeName === 'Unauthorized') classification = 'unauthorized';
    else if (code === 18 || codeName === 'AuthenticationFailed') classification = 'authentication_failed';
    else if (code === 50 || code === 89 || codeName === 'MaxTimeMSExpired' || codeName === 'NetworkTimeout'
      || errorName === 'MongoNetworkTimeoutError' || errorName === 'MongoOperationTimeoutError' || errorName === 'TimeoutError') {
      classification = 'timeout';
    } else if (errorName === 'MongoServerSelectionError') classification = 'server_selection';
    else if (errorName === 'MongoNetworkError') classification = 'network';
    else if (phase === 'canonicalize_identifier' || phase === 'canonicalize_document') classification = 'bson_canonicalization';
    else if (phase === 'cursor_create' || phase === 'cursor_has_next' || phase === 'cursor_next' || phase === 'cursor_close') {
      classification = 'cursor_read';
    }
  }

  return {
    phase,
    ...(collection ? { collection } : {}),
    classification,
    errorName,
    ...(code !== undefined ? { code } : {}),
    ...(codeName ? { codeName } : {}),
    errorLabels,
    deadlineExceeded,
    aborted,
  };
}

export class AuditDeadline {
  readonly controller = new AbortController();
  readonly expiresAt: number;
  private timer: NodeJS.Timeout | undefined;
  private expiredState = false;
  private expirationHandler: (() => void) | undefined;

  constructor(
    private readonly timeoutMs: number,
    private readonly now: () => number = Date.now,
    private readonly beforeCheck?: (stage: string) => void,
  ) {
    this.expiresAt = this.now() + timeoutMs;
  }

  get signal(): AbortSignal { return this.controller.signal; }
  get expired(): boolean { return this.expiredState; }

  start(onExpire: () => void): void {
    this.expirationHandler = onExpire;
    this.timer = setTimeout(() => this.expire(), Math.max(0, this.timeoutMs));
  }

  check(stage = 'audit'): void {
    this.beforeCheck?.(stage);
    if (this.expiredState || this.now() >= this.expiresAt) {
      this.expire();
      throw this.timeoutError();
    }
  }

  timeoutError(): FreshnessAuditError {
    return new FreshnessAuditError('BLOCKED', 'The freshness audit exceeded its deadline.');
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private expire(): void {
    if (this.expiredState) return;
    this.expiredState = true;
    this.controller.abort();
    try { this.expirationHandler?.(); } catch { /* the caller records cleanup failure */ }
  }
}

function parseAndValidateUri(uri: string | undefined): string {
  if (!uri) fail('BLOCKED', 'TECHAPI_SOURCE_READONLY_URI is missing.');
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    fail('BLOCKED', 'TECHAPI_SOURCE_READONLY_URI is not a valid MongoDB URI.');
  }

  if (parsed.protocol !== 'mongodb+srv:') fail('BLOCKED', 'Audit URI must use mongodb+srv with TLS.');
  if (parsed.hostname.toLowerCase() !== ATLAS_HOST) fail('BLOCKED', 'Audit URI host is not the approved Atlas host.');
  let username = '';
  try {
    username = decodeURIComponent(parsed.username);
  } catch {
    fail('BLOCKED', 'Audit URI username encoding is invalid.');
  }
  if (username !== ATLAS_USERNAME || !parsed.password) {
    fail('BLOCKED', 'Audit URI must use the designated read-only audit identity.');
  }
  if (parsed.pathname && parsed.pathname !== '/' && parsed.pathname !== `/${DATABASE_NAME}`) {
    fail('BLOCKED', 'Audit URI contains an unexpected database path.');
  }

  const queryValues = new Map<string, string[]>();
  new URLSearchParams(parsed.search).forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    queryValues.set(normalizedKey, [...(queryValues.get(normalizedKey) ?? []), value.toLowerCase()]);
  });
  for (const key of ['tls', 'ssl']) {
    const values = queryValues.get(key);
    if (values?.some((value) => value !== 'true' && value !== '1')) fail('BLOCKED', 'Audit URI disables or has an invalid TLS setting.');
  }
  for (const key of ['tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames', 'sslvalidate']) {
    const values = queryValues.get(key);
    if (values?.some((value) => (key === 'sslvalidate' ? value !== 'true' && value !== '1' : value !== 'false' && value !== '0'))) {
      fail('BLOCKED', 'Audit URI does not require TLS certificate and hostname verification.');
    }
  }
  return uri;
}

export function validateTechApiAuditUri(uri: string | undefined): boolean {
  parseAndValidateUri(uri);
  return true;
}

export function readAuditUriFromEnvironment(environment: NodeJS.ProcessEnv): string | undefined {
  return environment.TECHAPI_SOURCE_READONLY_URI;
}

export async function hashFileWithDeadline(path: string, deadline: AuditDeadline): Promise<string> {
  deadline.check('archive.sha256.before');
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  const abortStream = () => stream.destroy();
  deadline.signal.addEventListener('abort', abortStream, { once: true });
  try {
    for await (const chunk of stream) {
      deadline.check('archive.sha256.chunk');
      hash.update(chunk as Buffer);
    }
    deadline.check('archive.sha256.after');
  } catch (error) {
    if (deadline.expired) throw deadline.timeoutError();
    if (error instanceof FreshnessAuditError) throw error;
    fail('BLOCKED', 'A required archive file could not be read.');
  } finally {
    deadline.signal.removeEventListener('abort', abortStream);
    if (!stream.destroyed) stream.destroy();
  }
  return hash.digest('hex');
}

function readManifest(path: string, deadline: AuditDeadline): Manifest {
  deadline.check('manifest.read.before');
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail('BLOCKED', 'The official archive manifest is missing or unreadable.');
  }
  deadline.check('manifest.read.after');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('FAIL', 'The archive manifest structure is invalid.');
  }
  const value = parsed as Record<string, any>;
  const checksum = (input: unknown) => typeof input === 'string' && /^[a-f0-9]{64}$/i.test(input);
  const collectionChecks = ['catalog', 'checkpoints'];
  if (value.archiveName !== 'techapi_catalog.sqlite'
    || !Number.isInteger(value.schemaVersion)
    || !value.tableCounts || !Number.isInteger(value.tableCounts.catalog)
    || !Number.isInteger(value.tableCounts.checkpoints) || !Number.isInteger(value.tableCounts.total)
    || !value.archivePayloadChecksums || !checksum(value.archivePayloadChecksums.catalog)
    || !checksum(value.archivePayloadChecksums.checkpoints) || !checksum(value.archivePayloadChecksums.combined)
    || !checksum(value.archiveFileSha256) || !Number.isInteger(value.archiveFileSizeBytes)
    || value.integrityCheck !== 'ok' || !value.uniqueIndexVerification || !value.notNullVerification
    || collectionChecks.some((key) => !Array.isArray(value.uniqueIndexVerification[key])
      || !Array.isArray(value.notNullVerification[key]))) {
    fail('FAIL', 'The archive manifest does not match the supported schema and checksum contract.');
  }
  return value as Manifest;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function verifyManifestChecks(manifestChecks: Array<Record<string, unknown>>, actualChecks: Array<Record<string, unknown>>, keys: string[]): boolean {
  const simplify = (checks: Array<Record<string, unknown>>) => checks
    .map((check) => Object.fromEntries(keys.map((key) => [key, check[key]])))
    .sort((left, right) => safeJson(left).localeCompare(safeJson(right)));
  return safeJson(simplify(manifestChecks)) === safeJson(simplify(actualChecks));
}

function archivePayloadDigest(
  database: Database.Database,
  table: TechApiSqliteTable,
  keyColumn: 'source_key' | 'file_key',
  freshnessFields: readonly string[],
  deadline: AuditDeadline,
) {
  deadline.check();
  const hash = createHash('sha256');
  const freshness = newFreshness(freshnessFields);
  const rows = database.prepare(`SELECT ${keyColumn} AS stable_key, document_ejson FROM ${table} ORDER BY ${keyColumn} COLLATE BINARY`)
    .iterate() as IterableIterator<{ stable_key: string; document_ejson: string }>;
  let count = 0;
  try {
    for (const row of rows) {
      deadline.check(`sqlite.payload.${table}.row`);
      const document = EJSON.parse(row.document_ejson, { relaxed: false }) as Document;
      const canonical = serializeTechApiEjson(document);
      const documentHash = createHash('sha256').update(canonical, 'utf8').digest('hex');
      hash.update(`${JSON.stringify(row.stable_key)}:${documentHash}\n`, 'utf8');
      updateFreshness(freshness, document, freshnessFields);
      count += 1;
    }
    deadline.check(`sqlite.payload.${table}.complete`);
  } catch (error) {
    if (deadline.expired) throw deadline.timeoutError();
    if (error instanceof FreshnessAuditError) throw error;
    fail('FAIL', 'An archive EJSON document could not be decoded.');
  }
  return { count, sha256: hash.digest('hex'), freshness };
}

function tableColumns(database: Database.Database, table: TechApiSqliteTable, deadline: AuditDeadline): string[] {
  deadline.check(`sqlite.columns.${table}.before`);
  const columns = (database.pragma(`table_info("${table}")`) as Array<{ name: string }>).map((row) => row.name);
  deadline.check(`sqlite.columns.${table}.after`);
  return columns;
}

function archiveCount(database: Database.Database, table: TechApiSqliteTable, deadline: AuditDeadline): number {
  deadline.check(`sqlite.count.${table}.before`);
  const count = (database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
  deadline.check(`sqlite.count.${table}.after`);
  return count;
}

export async function openVerifiedArchive(archivePath: string, manifestPath: string, deadline: AuditDeadline): Promise<ArchiveState> {
  const manifest = readManifest(manifestPath, deadline);
  const archiveSha256 = await hashFileWithDeadline(archivePath, deadline);
  deadline.check('archive.stat');
  let archiveSizeBytes: number;
  try {
    archiveSizeBytes = statSync(archivePath).size;
  } catch {
    fail('BLOCKED', 'The official SQLite archive is missing or unreadable.');
  }
  if (archiveSha256 !== manifest.archiveFileSha256 || archiveSizeBytes !== manifest.archiveFileSizeBytes) {
    fail('FAIL', 'The archive file hash or size does not match its manifest.');
  }

  let database: Database.Database;
  try {
    database = new Database(archivePath, { readonly: true, fileMustExist: true });
  } catch {
    fail('BLOCKED', 'The official SQLite archive could not be opened read-only.');
  }
  try {
    deadline.check('sqlite.begin');
    database.exec('BEGIN DEFERRED TRANSACTION');
    deadline.check('sqlite.integrity.before');
    const integrity = (database.pragma('integrity_check') as Array<{ integrity_check: string }>).map((row) => row.integrity_check);
    deadline.check('sqlite.integrity.after');
    if (integrity.length !== 1 || integrity[0] !== 'ok' || manifest.integrityCheck !== 'ok') {
      fail('FAIL', 'SQLite integrity_check did not pass or did not match the manifest.');
    }
    deadline.check('sqlite.schema_version.before');
    const schemaVersion = (database.prepare('SELECT MAX(version) AS version FROM archive_schema_version').get() as { version: number | null }).version;
    deadline.check('sqlite.schema_version.after');
    if (schemaVersion !== REQUIRED_SCHEMA_VERSION || schemaVersion !== manifest.schemaVersion) {
      fail('FAIL', 'The archive schema version does not match the supported version.');
    }

    for (const table of ['techapi_catalog_records', 'techapi_import_checkpoints'] as const) {
      deadline.check(`sqlite.schema.${table}.before`);
      const actualColumns = tableColumns(database, table, deadline);
      if (safeJson(actualColumns) !== safeJson(REQUIRED_COLUMNS[table])) {
        fail('FAIL', 'The SQLite archive table structure does not match the supported schema.');
      }
      const tableDdl = (database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { sql: string | null } | undefined)?.sql;
      deadline.check(`sqlite.constraints.${table}`);
      if (!tableDdl || !/\bSTRICT\s*$/i.test(tableDdl)) {
        fail('FAIL', 'A required SQLite archive table is missing or has an unexpected table mode.');
      }
      const unique = assessSqliteUniqueKeys(database, table);
      const notNull = assessSqliteNotNullKeys(database, table);
      deadline.check();
      const manifestKey = table === 'techapi_catalog_records' ? 'catalog' : 'checkpoints';
      if (!unique.allSatisfied || !notNull.allSatisfied
        || !verifyManifestChecks(manifest.uniqueIndexVerification[manifestKey] as Array<Record<string, unknown>>, unique.checks as unknown as Array<Record<string, unknown>>, ['label', 'businessFields', 'sqliteColumns', 'satisfied'])
        || !verifyManifestChecks(manifest.notNullVerification[manifestKey] as Array<Record<string, unknown>>, notNull.checks as unknown as Array<Record<string, unknown>>, ['column', 'exists', 'notNull', 'primaryKeyPosition', 'satisfied'])) {
        fail('FAIL', 'SQLite archive key constraints do not match the manifest.');
      }
    }

    const counts = {
      catalog: archiveCount(database, 'techapi_catalog_records', deadline),
      checkpoints: archiveCount(database, 'techapi_import_checkpoints', deadline),
      total: 0,
    };
    counts.total = counts.catalog + counts.checkpoints;
    if (counts.catalog !== manifest.tableCounts.catalog || counts.checkpoints !== manifest.tableCounts.checkpoints
      || counts.total !== manifest.tableCounts.total) fail('FAIL', 'SQLite archive counts do not match the manifest.');

    const catalogDigest = archivePayloadDigest(database, 'techapi_catalog_records', 'source_key', COLLECTIONS[0].freshnessFields, deadline);
    const checkpointDigest = archivePayloadDigest(database, 'techapi_import_checkpoints', 'file_key', COLLECTIONS[1].freshnessFields, deadline);
    const combined = createHash('sha256').update(`${catalogDigest.sha256}\n${checkpointDigest.sha256}\n`, 'utf8').digest('hex');
    if (catalogDigest.count !== counts.catalog || checkpointDigest.count !== counts.checkpoints
      || catalogDigest.sha256 !== manifest.archivePayloadChecksums.catalog
      || checkpointDigest.sha256 !== manifest.archivePayloadChecksums.checkpoints
      || combined !== manifest.archivePayloadChecksums.combined) {
      fail('FAIL', 'SQLite archive payload checksums do not match the manifest.');
    }

    return {
      database,
      manifest,
      archiveSha256,
      archiveSizeBytes,
      schemaVersion,
      counts,
      payloadChecksums: { catalog: catalogDigest.sha256, checkpoints: checkpointDigest.sha256, combined },
      freshness: { catalog: catalogDigest.freshness, checkpoints: checkpointDigest.freshness },
    };
  } catch (error) {
    let cleanupFailed = false;
    try { database.exec('ROLLBACK'); } catch { cleanupFailed = true; }
    try { database.close(); } catch { cleanupFailed = true; }
    if (cleanupFailed) fail('BLOCKED', 'SQLite archive cleanup failed; audit cannot continue safely.');
    if (error instanceof FreshnessAuditError) throw error;
    fail('FAIL', 'The SQLite archive structure could not be verified.');
  }
}

function timestampValue(value: unknown): number | undefined {
  const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : undefined;
}

function updateFreshness(freshness: Freshness, document: Document, fields: readonly string[]): void {
  for (const field of fields) {
    const timestamp = timestampValue(document[field]);
    if (timestamp === undefined) continue;
    const previous = freshness[field] ? Date.parse(freshness[field]!) : Number.NEGATIVE_INFINITY;
    if (timestamp > previous) freshness[field] = new Date(timestamp).toISOString();
  }
}

function newFreshness(fields: readonly string[]): Freshness {
  return Object.fromEntries(fields.map((field) => [field, null]));
}

function documentHash(document: Document): string {
  return createHash('sha256').update(serializeTechApiEjson(document), 'utf8').digest('hex');
}

function inspectIdentifier(document: Document, field: string, beforeCanonicalize?: () => void): IdentifierInfo {
  const hasField = Object.prototype.hasOwnProperty.call(document, field);
  const value = document[field];
  let reason: IdentifierInfo['reason'];
  let fingerprintToken: string;
  let key: string | undefined;
  if (!hasField) {
    reason = 'missing';
    fingerprintToken = JSON.stringify({ state: 'missing' });
  } else if (value === null) {
    reason = 'null';
    fingerprintToken = JSON.stringify({ state: 'null' });
  } else if (value === undefined) {
    reason = 'undefined';
    fingerprintToken = JSON.stringify({ state: 'undefined' });
  } else if (typeof value !== 'string') {
    reason = 'non_string';
    beforeCanonicalize?.();
    fingerprintToken = JSON.stringify({ state: 'non_string', canonicalValue: serializeTechApiEjson(value) });
  } else {
    key = value;
    fingerprintToken = JSON.stringify({ state: value.length > 0 ? 'string' : 'empty', value });
    if (value.length === 0) reason = 'empty';
  }
  return {
    valid: reason === undefined,
    ...(key !== undefined ? { key } : {}),
    ...(reason ? { reason } : {}),
    fingerprintToken,
    identifierSha256: createHash('sha256').update(fingerprintToken, 'utf8').digest('hex'),
  };
}

export function hasNoWritersConfirmation(argv: string[]): boolean {
  return argv.includes('--confirm-no-writers');
}

function sourceCursor(collection: MongoCollectionLike, spec: CollectionSpec, deadline: AuditDeadline): MongoCursorLike {
  return collection.find({}, {
    sort: { [spec.keyField]: 1, _id: 1 },
    collation: { locale: 'simple' },
    batchSize: 500,
    maxTimeMS: MAX_TIME_MS,
    signal: deadline.signal,
  });
}

async function scanSource(
  database: MongoDatabaseLike,
  spec: CollectionSpec,
  deadline: AuditDeadline,
  fingerprintHashFactory: () => ReturnType<typeof createHash> = () => createHash('sha256'),
): Promise<Fingerprint> {
  let cursor: MongoCursorLike | undefined;
  const hash = fingerprintHashFactory();
  const freshness = newFreshness(spec.freshnessFields);
  let count = 0;
  let sha256 = '';
  let phase: DiagnosticPhase = 'collection_select';
  let primaryError: FreshnessAuditError | undefined;
  try {
    deadline.check(`mongo.fingerprint.${spec.atlasName}.before`);
    const collection = database.collection(spec.atlasName);
    phase = 'cursor_create';
    cursor = sourceCursor(collection, spec, deadline);
    while (true) {
      phase = 'cursor_has_next';
      if (!await cursor.hasNext()) break;
      phase = 'cursor_next';
      const document = await cursor.next();
      deadline.check(`mongo.fingerprint.${spec.atlasName}.document`);
      if (!document) fail('BLOCKED', 'Atlas cursor returned no document after reporting data.');

      phase = 'document_validate';
      const identifier = inspectIdentifier(document, spec.keyField, () => { phase = 'canonicalize_identifier'; });
      phase = 'canonicalize_document';
      const digest = documentHash(document);
      phase = 'fingerprint_update';
      hash.update(`${identifier.fingerprintToken}:${digest}\n`, 'utf8');
      phase = 'document_validate';
      updateFreshness(freshness, document, spec.freshnessFields);
      count += 1;
    }
    deadline.check(`mongo.fingerprint.${spec.atlasName}.after`);
    phase = 'fingerprint_update';
    sha256 = hash.digest('hex');
  } catch (error) {
    const diagnostic = safeDiagnostic(phase, error, deadline, spec.atlasName);
    if (error instanceof FreshnessAuditError) {
      primaryError = new FreshnessAuditError(error.status, error.message, error.diagnostic ?? diagnostic, error.cleanupDiagnostics);
    } else if (deadline.expired) {
      primaryError = new FreshnessAuditError('BLOCKED', 'The freshness audit exceeded its deadline.', diagnostic);
    } else {
      primaryError = new FreshnessAuditError('BLOCKED', 'Atlas read failed while computing a source fingerprint.', diagnostic);
    }
  } finally {
    if (cursor) {
      try {
        await cursor.close();
      } catch (error) {
        const cleanupDiagnostic = safeDiagnostic('cursor_close', error, deadline, spec.atlasName);
        primaryError = new FreshnessAuditError(
          'BLOCKED',
          primaryError?.message ?? 'Atlas cursor cleanup failed.',
          primaryError?.diagnostic ?? cleanupDiagnostic,
        [...(primaryError?.cleanupDiagnostics ?? []), cleanupDiagnostic],
        );
      }
    }
  }
  if (primaryError) throw primaryError;
  return { count, sha256, freshness };
}

function archiveIterator(database: Database.Database, spec: CollectionSpec): IterableIterator<{ key: string; document_ejson: string; mongo_id: string }> {
  return database.prepare(`SELECT ${spec.keyColumn} AS key, document_ejson, mongo_id FROM ${spec.table} ORDER BY ${spec.keyColumn} COLLATE BINARY`)
    .iterate() as IterableIterator<{ key: string; document_ejson: string; mongo_id: string }>;
}

function addSample(list: DeltaSample[], sample: DeltaSample): void {
  if (list.length < SAMPLE_LIMIT) list.push(sample);
}

async function compareCollection(database: MongoDatabaseLike, archive: ArchiveState, spec: CollectionSpec, deadline: AuditDeadline): Promise<CollectionComparison> {
  deadline.check(`mongo.compare.${spec.atlasName}.before`);
  const collection = database.collection(spec.atlasName);
  let cursor: MongoCursorLike | undefined;
  let phase: DiagnosticPhase = 'cursor_create';
  let primaryError: FreshnessAuditError | undefined;
  let atlasSha256 = '';
  const sourceHash = createHash('sha256');
  const freshness = newFreshness(spec.freshnessFields);
  const archiveRows = archiveIterator(archive.database, spec);
  let archiveRow = archiveRows.next();
  let atlasCount = 0;
  let matched = 0;
  let atlasOnly = 0;
  let archiveOnly = 0;
  let payloadMismatch = 0;
  let mongoIdMismatch = 0;
  let duplicateAtlasKeys = 0;
  let invalidAtlasIdentifiers = 0;
  let previousAtlasKey: string | undefined;
  const samples = {
    atlasOnly: [] as DeltaSample[],
    archiveOnly: [] as DeltaSample[],
    payloadMismatch: [] as DeltaSample[],
    mongoIdMismatch: [] as DeltaSample[],
    invalidIdentifiers: [] as Array<{ reason: string; identifierSha256: string; documentSha256: string }>,
    duplicateKeys: [] as Array<{ identifierSha256: string; documentSha256: string }>,
  };

  const markArchiveOnlyUntil = (atlasKey: string) => {
    while (!archiveRow.done && archiveRow.value.key < atlasKey) {
      phase = 'archive_iterator';
      deadline.check(`sqlite.diff.${spec.atlasName}.archiveOnly`);
      archiveOnly += 1;
      phase = 'archive_document_decode';
      addSample(samples.archiveOnly, { key: archiveRow.value.key, archiveSha256: documentHash(EJSON.parse(archiveRow.value.document_ejson, { relaxed: false }) as Document) });
      phase = 'archive_iterator';
      archiveRow = archiveRows.next();
    }
  };

  try {
    phase = 'cursor_create';
    cursor = sourceCursor(collection, spec, deadline);
    while (true) {
      phase = 'cursor_has_next';
      if (!await cursor.hasNext()) break;
      phase = 'cursor_next';
      const atlasDocument = await cursor.next();
      deadline.check(`mongo.compare.${spec.atlasName}.document`);
      if (!atlasDocument) fail('BLOCKED', 'Atlas cursor returned no document after reporting data.');
      atlasCount += 1;
      phase = 'canonicalize_document';
      const atlasDigest = documentHash(atlasDocument);
      phase = 'document_validate';
      const identifier = inspectIdentifier(atlasDocument, spec.keyField, () => { phase = 'canonicalize_identifier'; });
      const atlasKey = identifier.valid ? identifier.key : undefined;
      phase = 'fingerprint_update';
      sourceHash.update(`${identifier.fingerprintToken}:${atlasDigest}\n`, 'utf8');
      phase = 'document_validate';
      updateFreshness(freshness, atlasDocument, spec.freshnessFields);

      if (!atlasKey) {
        invalidAtlasIdentifiers += 1;
        if (identifier.reason && samples.invalidIdentifiers.length < SAMPLE_LIMIT) {
          samples.invalidIdentifiers.push({ reason: identifier.reason, identifierSha256: identifier.identifierSha256, documentSha256: atlasDigest });
        }
        continue;
      }
      if (previousAtlasKey === atlasKey) {
        duplicateAtlasKeys += 1;
        if (samples.duplicateKeys.length < SAMPLE_LIMIT) {
          samples.duplicateKeys.push({ identifierSha256: identifier.identifierSha256, documentSha256: atlasDigest });
        }
        continue;
      }
      previousAtlasKey = atlasKey;
      markArchiveOnlyUntil(atlasKey);

      if (archiveRow.done || atlasKey < archiveRow.value.key) {
        atlasOnly += 1;
        addSample(samples.atlasOnly, { key: atlasKey, atlasSha256: atlasDigest });
        continue;
      }
      if (atlasKey > archiveRow.value.key) {
        // The archive iterator will catch remaining records after the Atlas cursor ends.
        continue;
      }

      phase = 'archive_document_decode';
      const archiveDocument = EJSON.parse(archiveRow.value.document_ejson, { relaxed: false }) as Document;
      phase = 'canonicalize_document';
      const archiveDigest = documentHash(archiveDocument);
      let archiveId: unknown;
      try { archiveId = EJSON.parse(archiveRow.value.mongo_id, { relaxed: false }); } catch { archiveId = undefined; }
      const idsMatch = serializeTechApiEjson(atlasDocument._id) === serializeTechApiEjson(archiveId)
        && serializeTechApiEjson(archiveDocument._id) === serializeTechApiEjson(archiveId);
      if (!idsMatch) {
        mongoIdMismatch += 1;
        addSample(samples.mongoIdMismatch, { key: atlasKey, atlasSha256: documentHash({ _id: atlasDocument._id }), archiveSha256: documentHash({ _id: archiveId }) });
      }
      if (atlasDigest !== archiveDigest) {
        payloadMismatch += 1;
        addSample(samples.payloadMismatch, { key: atlasKey, atlasSha256: atlasDigest, archiveSha256: archiveDigest });
      } else if (idsMatch) {
        matched += 1;
      }
      phase = 'archive_iterator';
      archiveRow = archiveRows.next();
    }
    phase = 'fingerprint_update';
    atlasSha256 = sourceHash.digest('hex');
  } catch (error) {
    const diagnostic = safeDiagnostic(phase, error, deadline, spec.atlasName);
    primaryError = error instanceof FreshnessAuditError
      ? new FreshnessAuditError(error.status, error.message, error.diagnostic ?? diagnostic, error.cleanupDiagnostics)
      : deadline.expired
        ? new FreshnessAuditError('BLOCKED', 'The freshness audit exceeded its deadline.', diagnostic)
        : new FreshnessAuditError('BLOCKED', 'Atlas read or document comparison failed.', diagnostic);
    try { archiveRows.return?.(); } catch (cleanupError) {
      primaryError = new FreshnessAuditError(primaryError.status, primaryError.message, primaryError.diagnostic, [
        ...primaryError.cleanupDiagnostics,
        safeDiagnostic('archive_iterator', cleanupError, deadline, spec.atlasName),
      ]);
    }
  } finally {
    if (cursor) {
      try { await cursor.close(); } catch (cleanupError) {
        const cleanupDiagnostic = safeDiagnostic('cursor_close', cleanupError, deadline, spec.atlasName);
        primaryError = new FreshnessAuditError('BLOCKED', primaryError?.message ?? 'Atlas cursor cleanup failed.', primaryError?.diagnostic ?? cleanupDiagnostic, [
          ...(primaryError?.cleanupDiagnostics ?? []),
          cleanupDiagnostic,
        ]);
      }
    }
  }
  if (primaryError) throw primaryError;

  try {
    while (!archiveRow.done) {
      phase = 'archive_iterator';
      deadline.check(`sqlite.diff.${spec.atlasName}.archiveOnly`);
      const key = archiveRow.value.key;
      archiveOnly += 1;
      let digest = '';
      try {
        phase = 'archive_document_decode';
        digest = documentHash(EJSON.parse(archiveRow.value.document_ejson, { relaxed: false }) as Document);
      } catch { /* malformed rows are still reported by archive verification */ }
      addSample(samples.archiveOnly, { key, archiveSha256: digest || undefined });
      phase = 'archive_iterator';
      archiveRow = archiveRows.next();
    }
    archiveRows.return?.();
    deadline.check(`mongo.compare.${spec.atlasName}.after`);
  } catch (error) {
    const diagnostic = safeDiagnostic(phase, error, deadline, spec.atlasName);
    const primary = error instanceof FreshnessAuditError
      ? new FreshnessAuditError(error.status, error.message, error.diagnostic ?? diagnostic, error.cleanupDiagnostics)
      : deadline.expired
        ? new FreshnessAuditError('BLOCKED', 'The freshness audit exceeded its deadline.', diagnostic)
        : new FreshnessAuditError('BLOCKED', 'Archive comparison failed.', diagnostic);
    try { archiveRows.return?.(); } catch (cleanupError) {
      throw new FreshnessAuditError('BLOCKED', primary.message, primary.diagnostic, [
        ...primary.cleanupDiagnostics,
        safeDiagnostic('archive_iterator', cleanupError, deadline, spec.atlasName),
      ]);
    }
    throw primary;
  }

  return {
    atlasCount,
    archiveCount: archive.counts[spec.table === 'techapi_catalog_records' ? 'catalog' : 'checkpoints'],
    matched,
    atlasOnly,
    archiveOnly,
    payloadMismatch,
    mongoIdMismatch,
    duplicateAtlasKeys,
    invalidAtlasIdentifiers,
    atlasSha256,
    archivePayloadSha256: archive.payloadChecksums[spec.table === 'techapi_catalog_records' ? 'catalog' : 'checkpoints'],
    atlasFreshness: freshness,
    archiveFreshness: archive.freshness[spec.table === 'techapi_catalog_records' ? 'catalog' : 'checkpoints'],
    samples,
  };
}

function diffStatus(comparisons: Record<string, CollectionComparison>): FreshnessStatus {
  const values = Object.values(comparisons);
  if (values.some((item) => item.archiveOnly || item.mongoIdMismatch || item.duplicateAtlasKeys || item.invalidAtlasIdentifiers)) return 'FAIL';
  const additions = values.some((item) => item.atlasOnly > 0);
  const updates = values.some((item) => item.payloadMismatch > 0);
  if (additions && updates) return 'FAIL';
  if (updates) return 'PASS_WITH_UPDATES';
  if (additions) return 'PASS_WITH_ADDITIONS';
  return 'PASS';
}

function sameFingerprint(left: Fingerprint, right: Fingerprint): boolean {
  return left.count === right.count && left.sha256 === right.sha256;
}

function createClient(uri: string): MongoClient {
  return new MongoClient(uri, {
    tls: true,
    tlsAllowInvalidCertificates: false,
    tlsAllowInvalidHostnames: false,
    promoteValues: false,
    promoteLongs: false,
    promoteBuffers: false,
    readPreference: 'primary',
    connectTimeoutMS: 10_000,
    serverSelectionTimeoutMS: 15_000,
    socketTimeoutMS: 60_000,
  });
}

export async function runTechApiFreshnessAudit(options: {
  uri: string | undefined;
  archivePath: string;
  manifestPath: string;
  confirmNoWriters: boolean;
  clientFactory?: (uri: string) => MongoClientLike;
  fingerprintHashFactory?: () => ReturnType<typeof createHash>;
  timeoutMs?: number;
  deadlineFactory?: (timeoutMs: number) => AuditDeadline;
}): Promise<FreshnessReport> {
  const startedAt = new Date().toISOString();
  const uri = parseAndValidateUri(options.uri);
  if (!options.confirmNoWriters) fail('BLOCKED', 'Confirm that no TechAPI importer or enrichment writer is running, then pass --confirm-no-writers.');
  const timeoutMs = options.timeoutMs ?? OPERATION_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) fail('BLOCKED', 'The audit deadline configuration is invalid.');
  const deadline = (options.deadlineFactory ?? ((value) => new AuditDeadline(value)))(timeoutMs);
  let archive: ArchiveState | undefined;
  let client: MongoClientLike | undefined;
  let closeClientPromise: Promise<void> | undefined;
  let clientCloseDiagnostic: SafeAuditDiagnostic | undefined;
  const sqliteCleanupDiagnostics: SafeAuditDiagnostic[] = [];
  let primaryError: FreshnessAuditError | undefined;
  let report: FreshnessReport | undefined;
  let activePhase: DiagnosticPhase = 'audit';

  const closeClient = (): Promise<void> => {
    if (!client) return Promise.resolve();
    if (!closeClientPromise) {
      try {
        closeClientPromise = Promise.resolve(client.close()).catch((error) => {
          clientCloseDiagnostic = safeDiagnostic('client_close', error, deadline);
        });
      } catch (error) {
        clientCloseDiagnostic = safeDiagnostic('client_close', error, deadline);
        closeClientPromise = Promise.resolve();
      }
    }
    return closeClientPromise;
  };

  deadline.start(() => { void closeClient(); });
  try {
    deadline.check('audit.begin');
    archive = await openVerifiedArchive(options.archivePath, options.manifestPath, deadline);
    deadline.check('mongo.client.create');
    activePhase = 'mongo_client_create';
    try {
      client = (options.clientFactory ?? createClient)(uri) as MongoClientLike;
    } catch (error) {
      throw new FreshnessAuditError('BLOCKED', 'MongoDB client creation failed.', safeDiagnostic(activePhase, error, deadline));
    }
    deadline.check('mongo.connect.before');
    activePhase = 'mongo_connect';
    try {
      await client.connect();
    } catch (error) {
      throw new FreshnessAuditError('BLOCKED', 'MongoDB connection failed.', safeDiagnostic(activePhase, error, deadline));
    }
    deadline.check('mongo.connect.after');
    activePhase = 'database_select';
    let database: MongoDatabaseLike;
    try {
      database = client.db(DATABASE_NAME, { readConcern: { level: 'majority' } });
    } catch (error) {
      throw new FreshnessAuditError('BLOCKED', 'MongoDB database selection failed.', safeDiagnostic(activePhase, error, deadline));
    }
    const fingerprints: FreshnessReport['sourceRead']['fingerprints'] = {};
    const comparisons: Record<string, CollectionComparison> = {};
    const heads: Record<string, Fingerprint> = {};
    let stableAcrossObservedScans = true;

    for (const spec of COLLECTIONS) {
      activePhase = 'cursor_create';
      heads[spec.atlasName] = await scanSource(database, spec, deadline, options.fingerprintHashFactory);
    }
    for (const spec of COLLECTIONS) {
      activePhase = 'archive_iterator';
      comparisons[spec.atlasName] = await compareCollection(database, archive, spec, deadline);
    }
    // Reverse the collection order on the final sweep so a catalog mutation while
    // the checkpoint fingerprint is being read is observed by the catalog tail.
    for (const spec of [...COLLECTIONS].reverse()) {
      const compared = comparisons[spec.atlasName];
      const comparedFingerprint: Fingerprint = { count: compared.atlasCount, sha256: compared.atlasSha256, freshness: compared.atlasFreshness };
      activePhase = 'cursor_create';
      const tail = await scanSource(database, spec, deadline, options.fingerprintHashFactory);
      const head = heads[spec.atlasName];
      fingerprints[spec.atlasName] = { head, compared: comparedFingerprint, tail };
      if (!sameFingerprint(head, tail) || !sameFingerprint(head, comparedFingerprint)) stableAcrossObservedScans = false;
    }

    deadline.check('audit.before-report');
    const status = stableAcrossObservedScans ? diffStatus(comparisons) : 'INCONSISTENT_SOURCE';
    report = {
      status,
      startedAt,
      finishedAt: '',
      operatorConfirmedNoWriters: true,
      database: DATABASE_NAME,
      archive: {
        schemaVersion: archive.schemaVersion,
        counts: archive.counts,
        sha256: archive.archiveSha256,
        integrityCheck: 'ok',
        manifestSchemaFingerprintAvailable: false,
        readOnly: true,
      },
      sourceRead: {
        server: 'Atlas primary',
        readConcern: 'majority',
        snapshotClaimed: false,
        stableAcrossObservedScans,
        quiescenceRequirement: 'Stop every known writer, including catalog importers, SoC importer, app/background workers, and manual writes, before the first scan; keep them stopped through the last scan and cleanup. The runner cannot detect writers.',
        fingerprints,
      },
      comparisons,
      ...(!stableAcrossObservedScans ? { message: 'Atlas fingerprints differed across observed scans; this is not a snapshot or a guarantee that no mutation occurred.' } : {}),
    };
  } catch (error) {
    primaryError = error instanceof FreshnessAuditError
      ? error.diagnostic
        ? error
        : new FreshnessAuditError(error.status, error.message, safeDiagnostic(activePhase, error, deadline), error.cleanupDiagnostics)
      : new FreshnessAuditError('BLOCKED', 'The audit stopped safely; sensitive details were suppressed.', safeDiagnostic(activePhase, error, deadline));
  } finally {
    if (archive) {
      try { archive.database.exec('ROLLBACK'); } catch (error) {
        sqliteCleanupDiagnostics.push(safeDiagnostic('sqlite_cleanup', error, deadline));
      }
      try { archive.database.close(); } catch (error) {
        sqliteCleanupDiagnostics.push(safeDiagnostic('sqlite_cleanup', error, deadline));
      }
    }
    await closeClient();
  }

  const cleanupDiagnostics = [
    ...(primaryError?.cleanupDiagnostics ?? []),
    ...(clientCloseDiagnostic ? [clientCloseDiagnostic] : []),
    ...sqliteCleanupDiagnostics,
  ];
  if (cleanupDiagnostics.length > 0) {
    deadline.stop();
    throw new FreshnessAuditError(
      'BLOCKED',
      primaryError?.message ?? 'Audit cleanup could not be confirmed; no successful result is available.',
      primaryError?.diagnostic ?? cleanupDiagnostics[0],
      cleanupDiagnostics,
    );
  }
  if (deadline.expired) {
    deadline.stop();
    throw new FreshnessAuditError(
      'BLOCKED',
      'The freshness audit exceeded its deadline.',
      primaryError?.diagnostic ?? safeDiagnostic('audit', deadline.timeoutError(), deadline),
    );
  }
  if (primaryError) {
    deadline.stop();
    throw primaryError;
  }
  if (!archive || !report) {
    deadline.stop();
    fail('BLOCKED', 'The audit ended without a verified result.');
  }

  try {
    const archiveHashAfterClose = await hashFileWithDeadline(options.archivePath, deadline);
    if (archiveHashAfterClose !== archive.archiveSha256) fail('FAIL', 'The SQLite archive changed during the audit.');
  } catch (error) {
    if (error instanceof FreshnessAuditError) throw error;
    fail('BLOCKED', 'The archive could not be reverified after cleanup.');
  } finally {
    deadline.stop();
  }
  deadline.check('audit.return');
  report.finishedAt = new Date().toISOString();
  return report;
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  try {
    const uri = readAuditUriFromEnvironment(process.env);
    const report = await runTechApiFreshnessAudit({
      uri,
      archivePath: DEFAULT_ARCHIVE_PATH,
      manifestPath: DEFAULT_MANIFEST_PATH,
      confirmNoWriters: hasNoWritersConfirmation(process.argv),
    });
    console.log(JSON.stringify(report, null, 2));
    if (!['PASS', 'PASS_WITH_ADDITIONS', 'PASS_WITH_UPDATES'].includes(report.status)) process.exitCode = 1;
  } catch (error) {
    const auditError = error instanceof FreshnessAuditError ? error : undefined;
    const status = auditError?.status ?? 'BLOCKED';
    const message = auditError?.message ?? 'The audit stopped safely due to an unexpected error; sensitive details were suppressed.';
    const diagnostic = auditError?.diagnostic ?? safeDiagnostic('audit', error);
    console.log(JSON.stringify({
      status,
      startedAt,
      finishedAt: new Date().toISOString(),
      message,
      diagnostic,
      ...(auditError?.cleanupDiagnostics.length ? { cleanupDiagnostics: auditError.cleanupDiagnostics } : {}),
    }, null, 2));
    process.exitCode = 1;
  }
}

if (require.main === module) void main();
