import Database from 'better-sqlite3';

export type TechApiSqliteTable = 'techapi_catalog_records' | 'techapi_import_checkpoints';
export type TechApiSqliteIndex = {
  name: string;
  unique: boolean;
  origin: string;
  partial: boolean;
  columns: Array<string | null>;
};
export type UniqueKeyExpectation = {
  label: string;
  businessFields: string[];
  sqliteColumns: string[];
};

export const TECHAPI_SQLITE_UNIQUE_KEY_EXPECTATIONS: Record<TechApiSqliteTable, UniqueKeyExpectation[]> = {
  techapi_catalog_records: [
    { label: 'mongo_id', businessFields: ['_id'], sqliteColumns: ['mongo_id'] },
    { label: 'source_key', businessFields: ['sourceKey'], sqliteColumns: ['source_key'] },
    { label: 'source_category + source_slug', businessFields: ['sourceCategory', 'sourceSlug'], sqliteColumns: ['source_category', 'source_slug'] },
  ],
  techapi_import_checkpoints: [
    { label: 'mongo_id', businessFields: ['_id'], sqliteColumns: ['mongo_id'] },
    { label: 'file_key', businessFields: ['fileKey'], sqliteColumns: ['file_key'] },
  ],
};

export const TECHAPI_SQLITE_NOT_NULL_EXPECTATIONS: Record<TechApiSqliteTable, string[]> = {
  techapi_catalog_records: ['mongo_id', 'source_key', 'source_category', 'source_slug'],
  techapi_import_checkpoints: ['mongo_id', 'file_key'],
};

function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function inspectSqliteIndexes(database: Database.Database, table: TechApiSqliteTable): TechApiSqliteIndex[] {
  const tableIdentifier = quoteSqliteIdentifier(table);
  const indexes = database.pragma(`index_list(${tableIdentifier})`) as Array<{
    name: string;
    unique: number;
    origin: string;
    partial: number;
  }>;

  return indexes.map((index) => {
    const indexIdentifier = quoteSqliteIdentifier(index.name);
    const columns = database.pragma(`index_info(${indexIdentifier})`) as Array<{ name: string | null }>;
    return {
      name: index.name,
      unique: index.unique === 1,
      origin: index.origin,
      partial: index.partial === 1,
      columns: columns.map((column) => column.name),
    };
  });
}

export function assessSqliteUniqueKeys(database: Database.Database, table: TechApiSqliteTable) {
  const indexes = inspectSqliteIndexes(database, table);
  const checks = TECHAPI_SQLITE_UNIQUE_KEY_EXPECTATIONS[table].map((expectation) => {
    const matchingIndex = indexes.find((index) => index.unique
      && !index.partial
      && JSON.stringify(index.columns) === JSON.stringify(expectation.sqliteColumns));
    return {
      label: expectation.label,
      businessFields: expectation.businessFields,
      sqliteColumns: expectation.sqliteColumns,
      satisfied: Boolean(matchingIndex),
      ...(matchingIndex ? { indexName: matchingIndex.name, origin: matchingIndex.origin } : {}),
    };
  });
  return { indexes, checks, allSatisfied: checks.every((check) => check.satisfied) };
}

export function assertSqliteUniqueKeys(database: Database.Database, table: TechApiSqliteTable) {
  const result = assessSqliteUniqueKeys(database, table);
  const missing = result.checks.filter((check) => !check.satisfied).map((check) => check.label);
  if (missing.length) {
    throw new Error(`SQLite ${table} is missing exact unique key constraint(s): ${missing.join(', ')}.`);
  }
  return result;
}

export function assessSqliteNotNullKeys(database: Database.Database, table: TechApiSqliteTable) {
  const columns = database.pragma(`table_info(${quoteSqliteIdentifier(table)})`) as Array<{
    name: string;
    notnull: number;
    pk: number;
  }>;
  const byName = new Map(columns.map((column) => [column.name, column]));
  const checks = TECHAPI_SQLITE_NOT_NULL_EXPECTATIONS[table].map((name) => {
    const column = byName.get(name);
    return {
      column: name,
      exists: Boolean(column),
      notNull: column?.notnull === 1,
      primaryKeyPosition: column?.pk ?? 0,
      satisfied: Boolean(column && column.notnull === 1),
    };
  });
  return { columns, checks, allSatisfied: checks.every((check) => check.satisfied) };
}

export function assertSqliteNotNullKeys(database: Database.Database, table: TechApiSqliteTable) {
  const result = assessSqliteNotNullKeys(database, table);
  const missing = result.checks.filter((check) => !check.satisfied).map((check) => check.column);
  if (missing.length) {
    throw new Error(`SQLite ${table} key column(s) are missing NOT NULL: ${missing.join(', ')}.`);
  }
  return result;
}
