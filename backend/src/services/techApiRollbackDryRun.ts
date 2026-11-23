import { createHash } from 'node:crypto';
import { EJSON } from 'bson';

export type TechApiCatalogSnapshotRecord = Record<string, unknown> & { sourceKey: string };
export type TechApiCheckpointSnapshotRecord = Record<string, unknown> & { fileKey: string };
export type SnapshotDelta<T> = {
  key: string;
  status: 'added' | 'changed' | 'missing' | 'unchanged';
  beforeSha256?: string;
  afterSha256?: string;
  afterCanonicalEjson?: string;
  beforeCanonicalEjson?: string;
  missingIsDeletable: false;
  record?: T;
};

export type TechApiRollbackDryRun = {
  mode: 'dry-run';
  catalog: SnapshotDelta<TechApiCatalogSnapshotRecord>[];
  checkpoints: SnapshotDelta<TechApiCheckpointSnapshotRecord>[];
  counts: Record<'catalog' | 'checkpoints', Record<'added' | 'changed' | 'missing' | 'unchanged', number>>;
  deletionsSupported: false;
};

/** Compares snapshots without opening a repository or writing to MongoDB. */
export function compareTechApiSnapshots(
  before: { catalog: TechApiCatalogSnapshotRecord[]; checkpoints: TechApiCheckpointSnapshotRecord[] },
  after: { catalog: TechApiCatalogSnapshotRecord[]; checkpoints: TechApiCheckpointSnapshotRecord[] },
): TechApiRollbackDryRun {
  const catalog = compareCollection(before.catalog, after.catalog, 'sourceKey');
  const checkpoints = compareCollection(before.checkpoints, after.checkpoints, 'fileKey');
  return {
    mode: 'dry-run',
    catalog,
    checkpoints,
    counts: { catalog: countStatuses(catalog), checkpoints: countStatuses(checkpoints) },
    deletionsSupported: false,
  };
}

function compareCollection<T extends Record<string, unknown>>(
  before: T[],
  after: T[],
  keyField: 'sourceKey' | 'fileKey',
): SnapshotDelta<T>[] {
  const beforeByKey = uniqueRecords(before, keyField, 'before');
  const afterByKey = uniqueRecords(after, keyField, 'after');
  const keys = [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])].sort();
  return keys.map((key) => {
    const beforeRecord = beforeByKey.get(key);
    const afterRecord = afterByKey.get(key);
    const beforeEjson = beforeRecord ? canonicalEjson(beforeRecord) : undefined;
    const afterEjson = afterRecord ? canonicalEjson(afterRecord) : undefined;
    const beforeSha256 = beforeEjson ? sha256(beforeEjson) : undefined;
    const afterSha256 = afterEjson ? sha256(afterEjson) : undefined;
    let status: SnapshotDelta<T>['status'];
    if (!beforeRecord) status = 'added';
    else if (!afterRecord) status = 'missing';
    else if (beforeSha256 !== afterSha256) status = 'changed';
    else status = 'unchanged';
    return {
      key,
      status,
      ...(beforeSha256 ? { beforeSha256 } : {}),
      ...(afterSha256 ? { afterSha256 } : {}),
      ...(afterEjson && status !== 'unchanged' ? { afterCanonicalEjson: afterEjson } : {}),
      ...(beforeEjson && status === 'missing' ? { beforeCanonicalEjson: beforeEjson } : {}),
      missingIsDeletable: false as const,
      ...(afterRecord ? { record: afterRecord } : {}),
    };
  });
}

function uniqueRecords<T extends Record<string, unknown>>(
  records: T[],
  keyField: 'sourceKey' | 'fileKey',
  snapshotName: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const record of records) {
    const key = record[keyField];
    if (typeof key !== 'string' || !key.trim()) throw new Error(`${snapshotName} snapshot contains a record without ${keyField}.`);
    if (result.has(key)) throw new Error(`${snapshotName} snapshot contains duplicate ${keyField} values.`);
    result.set(key, record);
  }
  return result;
}

function canonicalEjson(value: unknown): string {
  return EJSON.stringify(sortPlainObjectKeys(value), { relaxed: false });
}

function sortPlainObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortPlainObjectKeys);
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
  if ('_bsontype' in value) return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(source).sort().map((key) => [key, sortPlainObjectKeys(source[key])]));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function countStatuses<T>(deltas: SnapshotDelta<T>[]) {
  return deltas.reduce((counts, delta) => {
    counts[delta.status] += 1;
    return counts;
  }, { added: 0, changed: 0, missing: 0, unchanged: 0 });
}
