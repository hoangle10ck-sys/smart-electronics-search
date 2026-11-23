import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSafeLocalRestoreUri } from '../seed/migrateTechApiMongoToSqlite';

const safeUri = 'mongodb://127.0.0.1:27017/smart_electronics_restore_test?directConnection=true';

test('migration source guard accepts only the approved loopback restore database', () => {
  assert.deepEqual(assertSafeLocalRestoreUri(safeUri), {
    host: '127.0.0.1',
    port: 27017,
    database: 'smart_electronics_restore_test',
  });
  assert.equal(assertSafeLocalRestoreUri(
    'mongodb://localhost:27017/smart_electronics_restore_test?directConnection=true',
  ).host, 'localhost');
  assert.equal(assertSafeLocalRestoreUri(
    'mongodb://[::1]:27017/smart_electronics_restore_test?directConnection=true',
  ).host, '::1');
});

test('migration source guard rejects Atlas or other non-loopback hosts', () => {
  assert.throws(
    () => assertSafeLocalRestoreUri('mongodb+srv://cluster.example/smart_electronics_restore_test'),
    /loopback MongoDB endpoint/,
  );
  assert.throws(
    () => assertSafeLocalRestoreUri('mongodb://192.0.2.10:27017/smart_electronics_restore_test?directConnection=true'),
    /loopback MongoDB endpoint/,
  );
});

test('migration source guard rejects a production database, credentials, and unexpected port', () => {
  assert.throws(
    () => assertSafeLocalRestoreUri('mongodb://127.0.0.1:27017/smart_electronics?directConnection=true'),
    /database must be smart_electronics_restore_test/,
  );
  assert.throws(
    () => assertSafeLocalRestoreUri('mongodb://user:password@127.0.0.1:27017/smart_electronics_restore_test?directConnection=true'),
    /Credential-bearing source URIs/,
  );
  assert.throws(
    () => assertSafeLocalRestoreUri('mongodb://127.0.0.1:27018/smart_electronics_restore_test?directConnection=true'),
    /port must be 27017/,
  );
});
