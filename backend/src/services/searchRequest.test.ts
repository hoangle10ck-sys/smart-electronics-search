import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSearchRequest } from './searchRequest';
import { parseQuery } from './queryParser';

test('validates versioned structured search fields and converts them to deterministic query intent', () => {
  const result = validateSearchRequest({
    query: 'laptop', brand: 'DELL', maxPrice: 20_000_000,
    specifications: { ramGB: 16, storageGB: 512, storageType: 'SSD' },
    useCases: ['programming'], page: 2, limit: 12, sort: 'relevance', searchMode: 'hybrid',
  });
  assert.ok(result.data);
  assert.equal(result.data.page, 2);
  assert.equal(result.data.limit, 12);
  const intent = parseQuery(result.data.query);
  assert.deepEqual(intent.brands, ['Dell']);
  assert.equal(intent.maxPrice, 20_000_000);
  assert.equal(intent.ram, 16);
  assert.equal(intent.storageGB, 512);
  assert.equal(intent.storageType, 'ssd');
  assert.ok(intent.tags.includes('programming'));
});

test('rejects contradictory, unsafe, and unsupported structured filters', () => {
  assert.ok(validateSearchRequest({ query: 'laptop Dell', brand: 'Apple' }).error);
  assert.ok(validateSearchRequest({ query: 'laptop', minPrice: 20_000_000, maxPrice: 5_000_000 }).error);
  assert.ok(validateSearchRequest({ query: 'laptop', specifications: { mongoOperator: 'drop' } }).error);
  assert.ok(validateSearchRequest({ query: 'laptop', searchMode: 'arbitrary' }).error);
  assert.ok(validateSearchRequest({ query: 'laptop dưới 999999999999999999 triệu' }).error);
  assert.ok(validateSearchRequest({ query: 'laptop RAM 4096GB' }).error);
});
