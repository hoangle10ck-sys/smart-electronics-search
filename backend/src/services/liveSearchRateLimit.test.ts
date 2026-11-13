import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearLiveSearchRateLimitsForTests, takeLiveSearchSlot } from './liveSearchRateLimit';

test('live search limiter caps requests per IP and resets after the window', () => {
  clearLiveSearchRateLimitsForTests();
  assert.equal(takeLiveSearchSlot('client-a', 1000, 2, 1000), true);
  assert.equal(takeLiveSearchSlot('client-a', 1100, 2, 1000), true);
  assert.equal(takeLiveSearchSlot('client-a', 1200, 2, 1000), false);
  assert.equal(takeLiveSearchSlot('client-b', 1200, 2, 1000), true);
  assert.equal(takeLiveSearchSlot('client-a', 2000, 2, 1000), true);
  clearLiveSearchRateLimitsForTests();
});
