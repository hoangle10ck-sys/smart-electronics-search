import assert from 'node:assert/strict';
import test from 'node:test';
import { readAdvisorEventStream } from '../../frontend/src/advisorStream';

const complete = {
  type: 'complete', conversation_id: 'b2a0a361-d767-4dc1-97e1-c858e9a8d7b2',
  assistant_message_id: '1992b65f-373e-474c-8771-861226c4f9a8', intent: 'product_search',
  understood_requirements: {}, suggested_questions: [], needs_clarification: false,
} as const;

function frame(event: Record<string, unknown>) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

test('SSE client handles split UTF-8 frames and assembles one completed answer', async () => {
  const product = { _id: '64a000000000000000000001', name: 'Verified laptop', verified: true };
  const bytes = new TextEncoder().encode([
    frame({ type: 'status', phase: 'searching' }),
    frame({ type: 'verified_products', products: [product, { ...product, _id: '64a000000000000000000002' }] }),
    frame({ type: 'explanation_delta', text: 'Máy có pin tốt. ' }),
    frame({ type: 'explanation_delta', text: 'RAM 16 GB.' }),
    frame(complete),
  ].join(''));
  let offset = 0;
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      const end = Math.min(offset + 11, bytes.length);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  }));
  const seen: string[] = [];
  const result = await readAdvisorEventStream<{ _id: string; name: string }>(response, (event) => seen.push(event.type));
  assert.equal(result.content, 'Máy có pin tốt. RAM 16 GB.');
  assert.equal(result.products.length, 2);
  assert.deepEqual(seen, ['status', 'verified_products', 'explanation_delta', 'explanation_delta', 'complete']);
});

test('SSE error frames are errors, never completed assistant answers', async () => {
  const response = new Response(frame({ type: 'error', message: 'model timeout' }));
  await assert.rejects(readAdvisorEventStream(response, () => undefined), /model timeout/);
});

test('a dropped stream after partial text rejects the answer as incomplete', async () => {
  const response = new Response([
    frame({ type: 'verified_products', products: [] }),
    frame({ type: 'explanation_delta', text: 'Partial response' }),
  ].join(''));
  await assert.rejects(readAdvisorEventStream(response, () => undefined), /hoàn tất câu trả lời/);
});
