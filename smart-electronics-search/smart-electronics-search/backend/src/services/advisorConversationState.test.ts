import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY_ADVISOR_SEARCH_STATE, allHistoricalProductReferences, recordCurrentSearch,
} from './advisorConversationState';
import { withConversationQueue } from './conversationQueue';

test('conversation search state stays isolated by conversation', () => {
  const first = recordCurrentSearch(EMPTY_ADVISOR_SEARCH_STATE, {
    searchId: 'first-search', query: 'Lenovo', createdAt: new Date(), productIds: ['product-a'],
  });
  const second = recordCurrentSearch(EMPTY_ADVISOR_SEARCH_STATE, {
    searchId: 'second-search', query: 'Apple', createdAt: new Date(), productIds: ['product-b'],
  });
  assert.deepEqual(first.currentSearchResults, ['product-a']);
  assert.deepEqual(second.currentSearchResults, ['product-b']);
  assert.deepEqual(allHistoricalProductReferences(first), ['product-a']);
  assert.deepEqual(allHistoricalProductReferences(second), ['product-b']);
});

test('consecutive turns in one conversation serialize and preserve both updates', async () => {
  let value = 0;
  const update = () => withConversationQueue('conversation-a', async () => {
    const snapshot = value;
    await new Promise((resolve) => setTimeout(resolve, 15));
    value = snapshot + 1;
  });
  await Promise.all([update(), update()]);
  assert.equal(value, 2);
});

test('each new search replaces current results, including with an empty result set, and archives prior references', () => {
  const first = recordCurrentSearch(EMPTY_ADVISOR_SEARCH_STATE, {
    searchId: 'turn-1', query: 'ASUS laptop', createdAt: new Date(), productIds: ['asus-laptop'],
  });
  const second = recordCurrentSearch(first, {
    searchId: 'turn-2', query: 'Lenovo laptop under 20m', createdAt: new Date(), productIds: ['lenovo-laptop'],
  });
  const third = recordCurrentSearch(second, {
    searchId: 'turn-3', query: 'Lenovo laptop with RAM 16GB', createdAt: new Date(), productIds: [],
  });
  assert.equal(third.currentSearchId, 'turn-3');
  assert.deepEqual(third.currentSearchResults, []);
  assert.deepEqual(third.previousSearchResults.map((search) => search.searchId), ['turn-1', 'turn-2']);
  assert.deepEqual(allHistoricalProductReferences(third), ['asus-laptop', 'lenovo-laptop']);
});

test('different conversations can process turns concurrently', async () => {
  let active = 0;
  let maximumActive = 0;
  const update = (conversationId: string) => withConversationQueue(conversationId, async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
  });
  await Promise.all([update('conversation-a'), update('conversation-b')]);
  assert.equal(maximumActive, 2);
});
