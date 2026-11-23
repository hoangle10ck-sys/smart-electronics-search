import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTechApiMongoDestination } from './techApiMongoDestination';

const localEnvironment = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/smart_electronics_test?directConnection=true',
};

test('local loopback destination remains allowed and source readonly URI is never used as destination', () => {
  const result = resolveTechApiMongoDestination({
    ...localEnvironment,
    TECHAPI_SOURCE_READONLY_URI: 'mongodb+srv://readonly-user:FIXTURE_NOT_A_CREDENTIAL@source.example.net/techapi',
  }, 'sqlite');
  assert.equal(result.mode, 'local');
  assert.equal(result.databaseName, 'smart_electronics_test');
  assert.equal(result.uri, localEnvironment.MONGODB_URI);
});

test('remote Mongo URI is rejected by default even when MONGODB_URI points remote', () => {
  assert.throws(() => resolveTechApiMongoDestination({
    MONGODB_URI: 'mongodb+srv://user:FIXTURE_NOT_A_CREDENTIAL@cluster.example.net/smart_electronics',
  }, 'sqlite'), /localhost|loopback/);
});

test('remote destination requires explicit URI, exact database, host allowlist, TLS, and SQLite source', () => {
  const environment = {
    TECHAPI_MONGO_DESTINATION_URI: 'mongodb+srv://writer:FIXTURE_NOT_A_CREDENTIAL@cluster.example.net/smart_electronics?retryWrites=true',
    TECHAPI_MONGO_DESTINATION_DATABASE: 'smart_electronics',
    TECHAPI_MONGO_DESTINATION_ALLOWED_HOSTS: 'cluster.example.net',
  };
  const result = resolveTechApiMongoDestination(environment, 'sqlite');
  assert.equal(result.mode, 'remote');
  assert.equal(result.databaseName, 'smart_electronics');
  assert.equal(result.uri, environment.TECHAPI_MONGO_DESTINATION_URI);
});

test('remote destination rejects host, database, TLS, wildcards, partial config, and Mongo source mode', () => {
  const base = {
    TECHAPI_MONGO_DESTINATION_URI: 'mongodb://writer:FIXTURE_NOT_A_CREDENTIAL@cluster.example.net:27017/smart_electronics?tls=true',
    TECHAPI_MONGO_DESTINATION_DATABASE: 'smart_electronics',
    TECHAPI_MONGO_DESTINATION_ALLOWED_HOSTS: 'cluster.example.net',
  };
  assert.throws(() => resolveTechApiMongoDestination({ ...base, TECHAPI_MONGO_DESTINATION_ALLOWED_HOSTS: 'other.example.net' }, 'sqlite'), /not in/);
  assert.throws(() => resolveTechApiMongoDestination({ ...base, TECHAPI_MONGO_DESTINATION_DATABASE: 'other_db' }, 'sqlite'), /does not match/);
  assert.throws(() => resolveTechApiMongoDestination({ ...base, TECHAPI_MONGO_DESTINATION_URI: base.TECHAPI_MONGO_DESTINATION_URI.replace('?tls=true', '') }, 'sqlite'), /TLS/);
  assert.throws(() => resolveTechApiMongoDestination({ ...base, TECHAPI_MONGO_DESTINATION_URI: 'mongodb://cluster.example.net:27017/smart_electronics?tls=true' }, 'sqlite'), /authenticated/);
  assert.throws(() => resolveTechApiMongoDestination({ ...base, TECHAPI_MONGO_DESTINATION_URI: `${base.TECHAPI_MONGO_DESTINATION_URI}&tlsInsecure=true` }, 'sqlite'), /verify TLS/);
  assert.throws(() => resolveTechApiMongoDestination({ ...base, TECHAPI_MONGO_DESTINATION_ALLOWED_HOSTS: '*.example.net' }, 'sqlite'), /wildcards/);
  assert.throws(() => resolveTechApiMongoDestination({ TECHAPI_MONGO_DESTINATION_URI: base.TECHAPI_MONGO_DESTINATION_URI }, 'sqlite'), /requires TECHAPI_MONGO_DESTINATION_URI/);
  assert.throws(() => resolveTechApiMongoDestination(base, 'mongo'), /requires TECHAPI_STORAGE=sqlite/);
});

test('destination configuration errors do not echo URI credentials', () => {
  const secret = 'FIXTURE_NOT_A_CREDENTIAL';
  assert.throws(() => resolveTechApiMongoDestination({
    TECHAPI_MONGO_DESTINATION_URI: `mongodb://writer:${secret}@cluster.example.net:27017/smart_electronics`,
    TECHAPI_MONGO_DESTINATION_DATABASE: 'wrong_database',
    TECHAPI_MONGO_DESTINATION_ALLOWED_HOSTS: 'cluster.example.net',
  }, 'sqlite'), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /does not match/);
    assert.equal(error.message.includes(secret), false);
    return true;
  });
});
