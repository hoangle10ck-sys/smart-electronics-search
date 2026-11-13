import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWebSearchProvider } from './webSearchProvider';

function jsonResponse(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload } as Response;
}

test('does not call a web provider without a server-side key', async () => {
  let calls = 0;
  const provider = createWebSearchProvider({ fetcher: async () => { calls += 1; return jsonResponse({}); } });
  assert.deepEqual(await provider.search('Quest 3'), { status: 'not_configured', provider: null, candidates: [] });
  assert.equal(calls, 0);
});

test('Tavily results are cached and unsafe/non-HTTPS links are discarded', async () => {
  let calls = 0;
  let requestInit: RequestInit | undefined;
  const provider = createWebSearchProvider({
    provider: 'tavily',
    tavilyApiKey: 'server-only-test-key',
    fetcher: async (_input, init) => {
      calls += 1;
      requestInit = init;
      return jsonResponse({ results: [
        { title: 'Official product page', url: 'https://example.com/product', content: 'A sourced search excerpt.' },
        { title: 'Unsafe link', url: 'javascript:alert(1)', content: 'discard' },
      ] });
    },
  });

  const first = await provider.search('  Quest   3  ');
  const second = await provider.search('quest 3');
  assert.equal(calls, 1);
  assert.equal(first.status, 'available');
  assert.equal(first.candidates.length, 1);
  assert.equal(first.candidates[0].url, 'https://example.com/product');
  assert.match(String(requestInit?.headers && (requestInit.headers as Record<string, string>).Authorization), /^Bearer /);
  assert.equal(JSON.stringify(first).includes('server-only-test-key'), false);
  assert.deepEqual(second, first);
});

test('Brave HTTP 429 is reported without exposing provider response data', async () => {
  const provider = createWebSearchProvider({
    provider: 'brave',
    braveApiKey: 'server-only-test-key',
    fetcher: async () => jsonResponse({ message: 'private provider response' }, 429),
  });
  const result = await provider.search('product model');
  assert.deepEqual(result, { status: 'rate_limited', provider: 'brave', candidates: [] });
});
