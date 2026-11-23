import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

test('tracked environment template contains placeholders rather than live-looking credentials', () => {
  const template = readFileSync(resolve(__dirname, '../../.env.example'), 'utf8');
  const values = new Map<string, string>();
  for (const line of template.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/);
    if (match) values.set(match[1], match[2].trim());
  }
  for (const key of ['TAVILY_API_KEY', 'BRAVE_SEARCH_API_KEY', 'ACCESSTRADE_API_KEY', 'ADMIN_API_TOKEN']) {
    const value = values.get(key);
    assert.ok(value === '' || value?.startsWith('REPLACE_WITH_'), `${key} must be empty or an explicit placeholder.`);
  }
  assert.equal(values.get('MONGODB_URI'), 'mongodb://127.0.0.1:27017/smart_electronics');
  for (const key of [
    'TECHAPI_SOC_IMPORT_LOCK_DIR',
    'TECHAPI_SOC_IMPORT_LOCK_TIMEOUT_MS',
    'TECHAPI_SOURCE_READONLY_URI',
    'TECHAPI_MONGO_DESTINATION_URI',
    'TECHAPI_MONGO_DESTINATION_DATABASE',
    'TECHAPI_MONGO_DESTINATION_ALLOWED_HOSTS',
  ]) assert.ok(values.has(key), `${key} must be documented in the environment template.`);
});
