import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldGenerateAdvisorExplanation } from './advisorResponsePolicy';

const base = { latestMessage: 'Tìm laptop Lenovo theo nhu cầu của tôi.', productCount: 3, needsClarification: false, historicalReference: false };

test('simple verified product search and price answers use backend copy without a Qwen call', () => {
  assert.equal(shouldGenerateAdvisorExplanation({ ...base, intent: 'product_search' }), false);
  assert.equal(shouldGenerateAdvisorExplanation({ ...base, intent: 'budget_consultation' }), false);
  assert.equal(shouldGenerateAdvisorExplanation({ ...base, intent: 'price_question' }), false);
});

test('comparisons, compatibility questions and explicit explanations keep the Qwen path', () => {
  assert.equal(shouldGenerateAdvisorExplanation({ ...base, intent: 'product_search', latestMessage: 'giai thich vi sao mau nay hop hon'}), true);
  assert.equal(shouldGenerateAdvisorExplanation({ ...base, intent: 'product_comparison' }), true);
  assert.equal(shouldGenerateAdvisorExplanation({ ...base, intent: 'compatibility_check', latestMessage: 'Máy này chạy Docker được không?' }), true);
});

test('empty, clarification and historical responses never make an unnecessary explanation call', () => {
  assert.equal(shouldGenerateAdvisorExplanation({ ...base, intent: 'product_comparison', productCount: 0 }), false);
  assert.equal(shouldGenerateAdvisorExplanation({ ...base, intent: 'product_comparison', needsClarification: true }), false);
  assert.equal(shouldGenerateAdvisorExplanation({ ...base, intent: 'product_comparison', historicalReference: true }), false);
});
