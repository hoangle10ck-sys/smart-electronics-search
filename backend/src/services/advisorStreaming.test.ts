import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeAdvisorStreamEvent, splitValidatedExplanation } from './advisorStreaming';

test('validated explanation chunks preserve text and keep Unicode code points intact', () => {
  const source = 'Mẫu này phù hợp 😊; catalog xác minh đủ thông số.';
  const chunks = splitValidatedExplanation(source, 7);
  assert.equal(chunks.join(''), source);
  assert.ok(chunks.every((chunk) => !chunk.includes('\uFFFD')));
});

test('SSE event encoder emits one JSON data frame without duplicated text', () => {
  const event = { type: 'explanation_delta', text: 'Đáp án' };
  assert.equal(encodeAdvisorStreamEvent(event), `data: ${JSON.stringify(event)}\n\n`);
});
