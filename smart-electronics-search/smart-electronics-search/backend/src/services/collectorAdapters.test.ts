import test from 'node:test';
import assert from 'node:assert/strict';
import { COLLECTOR_ADAPTERS, isCollectorAdapter } from './collectorAdapters';

test('the collector exposes only the supported feed and licensed CSV adapters', () => {
  assert.deepEqual(COLLECTOR_ADAPTERS, ['accesstrade', 'csv']);
  assert.equal(isCollectorAdapter('accesstrade'), true);
  assert.equal(isCollectorAdapter('csv'), true);
  assert.equal(isCollectorAdapter('unsupported-crawler'), false);
  assert.equal(isCollectorAdapter(undefined), false);
});
