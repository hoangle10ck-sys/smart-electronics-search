import assert from 'node:assert/strict';
import test, { TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assessSqliteNotNullKeys,
  assessSqliteUniqueKeys,
  assertSqliteNotNullKeys,
  assertSqliteUniqueKeys,
  TECHAPI_SQLITE_UNIQUE_KEY_EXPECTATIONS,
} from '../seed/techApiSqliteArchiveVerification';

async function createDatabase(t: TestContext, schema: string): Promise<Database.Database> {
  const directory = await mkdtemp(join(tmpdir(), 'techapi-schema-verifier-test-'));
  const database = new Database(join(directory, 'fixture.sqlite'));
  database.exec(schema);
  t.after(async () => {
    if (database.open) database.close();
    await rm(directory, { recursive: true, force: true });
  });
  return database;
}

const completeSchema = `
  CREATE TABLE techapi_catalog_records (
    mongo_id TEXT NOT NULL UNIQUE,
    source_key TEXT NOT NULL UNIQUE,
    source_category TEXT NOT NULL,
    source_slug TEXT NOT NULL,
    UNIQUE (source_category, source_slug)
  ) STRICT;
  CREATE TABLE techapi_import_checkpoints (
    mongo_id TEXT NOT NULL UNIQUE,
    file_key TEXT PRIMARY KEY
  ) STRICT;
`;

test('recognizes required constraints by exact columns, independent of autoindex names', async (t) => {
  const database = await createDatabase(t, completeSchema);
  const catalog = assertSqliteUniqueKeys(database, 'techapi_catalog_records');
  const checkpoints = assertSqliteUniqueKeys(database, 'techapi_import_checkpoints');

  assert.equal(catalog.allSatisfied, true);
  assert.equal(checkpoints.allSatisfied, true);
  assert.ok(catalog.indexes.filter((index) => index.unique).every((index) => index.name.startsWith('sqlite_autoindex_')));
  assert.deepEqual(catalog.checks.map((check) => check.sqliteColumns), [
    ['mongo_id'], ['source_key'], ['source_category', 'source_slug'],
  ]);
  assert.deepEqual(checkpoints.checks.map((check) => check.sqliteColumns), [['mongo_id'], ['file_key']]);
});

test('does not accept an unrelated unique index as source_key or compound identity', async (t) => {
  const database = await createDatabase(t, `
    CREATE TABLE techapi_catalog_records (
      mongo_id TEXT NOT NULL UNIQUE,
      source_key TEXT NOT NULL,
      source_category TEXT NOT NULL,
      source_slug TEXT NOT NULL,
      name TEXT UNIQUE,
      UNIQUE (source_category)
    ) STRICT;
  `);
  const result = assessSqliteUniqueKeys(database, 'techapi_catalog_records');
  assert.equal(result.checks.find((check) => check.label === 'source_key')?.satisfied, false);
  assert.equal(result.checks.find((check) => check.label === 'source_category + source_slug')?.satisfied, false);
  assert.throws(() => assertSqliteUniqueKeys(database, 'techapi_catalog_records'), /source_key, source_category \+ source_slug/);
});

test('rejects an index with the right name but wrong columns and a partial unique index', async (t) => {
  const database = await createDatabase(t, `
    CREATE TABLE techapi_catalog_records (
      mongo_id TEXT NOT NULL UNIQUE,
      source_key TEXT NOT NULL,
      source_category TEXT NOT NULL,
      source_slug TEXT NOT NULL
    ) STRICT;
    CREATE UNIQUE INDEX source_key ON techapi_catalog_records(source_category);
    CREATE INDEX source_key_nonunique ON techapi_catalog_records(source_key);
    CREATE UNIQUE INDEX compound_idx ON techapi_catalog_records(source_category, source_slug) WHERE source_slug <> '';
  `);
  const result = assessSqliteUniqueKeys(database, 'techapi_catalog_records');
  assert.equal(result.checks.find((check) => check.label === 'source_key')?.satisfied, false);
  assert.equal(result.checks.find((check) => check.label === 'source_category + source_slug')?.satisfied, false);
});

test('requires file_key unique or primary key and ignores autoindex names', async (t) => {
  const database = await createDatabase(t, `
    CREATE TABLE techapi_import_checkpoints (
      mongo_id TEXT NOT NULL UNIQUE,
      file_key TEXT NOT NULL UNIQUE
    ) STRICT;
  `);
  const result = assertSqliteUniqueKeys(database, 'techapi_import_checkpoints');
  assert.equal(result.checks.find((check) => check.label === 'file_key')?.satisfied, true);
});

test('explicit business-field mapping translates camelCase keys to SQLite snake_case columns', () => {
  assert.deepEqual(TECHAPI_SQLITE_UNIQUE_KEY_EXPECTATIONS.techapi_catalog_records.map((item) => [item.businessFields, item.sqliteColumns]), [
    [['_id'], ['mongo_id']],
    [['sourceKey'], ['source_key']],
    [['sourceCategory', 'sourceSlug'], ['source_category', 'source_slug']],
  ]);
  assert.deepEqual(TECHAPI_SQLITE_UNIQUE_KEY_EXPECTATIONS.techapi_import_checkpoints.map((item) => [item.businessFields, item.sqliteColumns]), [
    [['_id'], ['mongo_id']],
    [['fileKey'], ['file_key']],
  ]);
});

test('checks NOT NULL metadata and catches nullable TEXT PRIMARY KEY on a non-STRICT table', async (t) => {
  const strictDatabase = await createDatabase(t, completeSchema);
  assert.equal(assessSqliteNotNullKeys(strictDatabase, 'techapi_catalog_records').allSatisfied, true);
  assert.equal(assessSqliteNotNullKeys(strictDatabase, 'techapi_import_checkpoints').allSatisfied, true);
  assert.doesNotThrow(() => assertSqliteNotNullKeys(strictDatabase, 'techapi_import_checkpoints'));

  const legacyDatabase = await createDatabase(t, `
    CREATE TABLE techapi_import_checkpoints (
      mongo_id TEXT NOT NULL UNIQUE,
      file_key TEXT PRIMARY KEY
    );
  `);
  const fileKey = assessSqliteNotNullKeys(legacyDatabase, 'techapi_import_checkpoints').checks.find((check) => check.column === 'file_key');
  assert.equal(fileKey?.primaryKeyPosition, 1);
  assert.equal(fileKey?.notNull, false);
  assert.throws(() => assertSqliteNotNullKeys(legacyDatabase, 'techapi_import_checkpoints'), /file_key/);
});
