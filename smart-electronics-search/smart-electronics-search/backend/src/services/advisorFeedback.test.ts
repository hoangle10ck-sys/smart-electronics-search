import assert from 'node:assert/strict';
import test from 'node:test';
import { findAssistantFeedbackMessage, isFeedbackProductAttached, summarizeAdvisorFeedback, validateAdvisorFeedbackInput } from './advisorFeedback';

const conversationId = '492e7681-2b50-4114-a5ae-331631cd0207';
const assistantMessageId = '39e0b151-f57e-4225-9302-bf606b3d3001';
const productId = '507f1f77bcf86cd799439011';

test('feedback accepts minimal helpful/unhelpful ratings without collecting free text', () => {
  for (const rating of ['helpful', 'not_helpful']) {
    const result = validateAdvisorFeedbackInput({ conversation_id: conversationId, assistant_message_id: assistantMessageId, rating, comment: 'should not be stored' });
    assert.ok('data' in result);
    if ('data' in result) {
      assert.deepEqual(Object.keys(result.data).sort(), ['assistantMessageId', 'conversationId', 'errorCategory', 'productId', 'rating', 'reportType'].sort());
      assert.equal((result.data as any).comment, undefined);
    }
  }
});

test('wrong advice reports require one supported diagnostic category', () => {
  assert.equal('error' in validateAdvisorFeedbackInput({ conversation_id: conversationId, assistant_message_id: assistantMessageId, rating: 'not_helpful', report_type: 'wrong_advice' }), true);
  const valid = validateAdvisorFeedbackInput({ conversation_id: conversationId, assistant_message_id: assistantMessageId, rating: 'not_helpful', report_type: 'wrong_advice', error_category: 'qwen_explanation' });
  assert.ok('data' in valid);
  if ('data' in valid) assert.equal(valid.data.errorCategory, 'qwen_explanation');
});

test('irrelevant product feedback is tied to a product and classified as search', () => {
  const valid = validateAdvisorFeedbackInput({ conversation_id: conversationId, assistant_message_id: assistantMessageId, rating: 'not_helpful', report_type: 'irrelevant_product', product_id: productId });
  assert.ok('data' in valid);
  if ('data' in valid) assert.equal(valid.data.errorCategory, 'search');
  assert.equal('error' in validateAdvisorFeedbackInput({ conversation_id: conversationId, assistant_message_id: assistantMessageId, rating: 'not_helpful', report_type: 'irrelevant_product' }), true);
});

test('feedback rejects identifiers, categories, and issue/rating combinations outside its schema', () => {
  assert.equal('error' in validateAdvisorFeedbackInput({ conversation_id: 'bad', assistant_message_id: assistantMessageId, rating: 'helpful' }), true);
  assert.equal('error' in validateAdvisorFeedbackInput({ conversation_id: conversationId, assistant_message_id: assistantMessageId, rating: 'helpful', report_type: 'wrong_advice', error_category: 'search' }), true);
  assert.equal('error' in validateAdvisorFeedbackInput({ conversation_id: conversationId, assistant_message_id: assistantMessageId, rating: 'not_helpful', report_type: 'wrong_advice', error_category: 'personal_data' }), true);
});

test('developer summary groups issue classes without retaining conversation contents', () => {
  const summary = summarizeAdvisorFeedback([
    { rating: 'helpful', reportType: 'none', errorCategory: null },
    { rating: 'not_helpful', reportType: 'wrong_advice', errorCategory: 'query_understanding' },
    { rating: 'not_helpful', reportType: 'irrelevant_product', errorCategory: 'search', productId },
    { rating: 'not_helpful', reportType: 'irrelevant_product', errorCategory: 'search', productId },
  ]);
  assert.equal(summary.total, 4);
  assert.equal(summary.byErrorCategory.query_understanding, 1);
  assert.equal(summary.byErrorCategory.search, 2);
  assert.deepEqual(summary.topIrrelevantProductIds, [{ productId, reports: 2 }]);
  assert.equal('conversationId' in summary, false);
});

test('feedback can target only the exact assistant message and its attached product card', () => {
  const messages = [
    { role: 'user', messageId: assistantMessageId },
    { role: 'assistant', messageId: 'cc6e9c81-f261-4e52-aa03-5c3129395bb5', recommendations: [{ productId }] },
    { role: 'assistant', messageId: assistantMessageId, recommendations: [{ productId: '507f191e810c19729de860ea' }] },
  ];
  const target = findAssistantFeedbackMessage(messages, assistantMessageId);
  assert.ok(target);
  assert.equal(isFeedbackProductAttached(target!, '507f1f77bcf86cd799439011'), false);
  assert.equal(findAssistantFeedbackMessage(messages, '9a11e0e5-9b09-4a7b-9d3f-6a5c9f164ac1'), null);
});
