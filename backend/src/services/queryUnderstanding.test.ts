import test from 'node:test';
import assert from 'node:assert/strict';
import { understandQuery } from './queryUnderstanding';

test('generic máy tính uses its deterministic category group without calling Ollama', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error('Unexpected Ollama request');
  }) as typeof fetch;

  try {
    const result = await understandQuery('Máy tính');
    assert.equal(result.provider, 'rules');
    assert.equal(result.status, 'active');
    assert.deepEqual(result.parsed.categoryGroup, ['laptop', 'desktop']);
    assert.equal(result.parsed.category, undefined);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
