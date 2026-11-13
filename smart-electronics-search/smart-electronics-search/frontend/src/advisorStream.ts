export type AdvisorStreamEvent<TProduct = unknown> =
  | { type: 'status'; phase: string }
  | { type: 'verified_products'; products: TProduct[] }
  | { type: 'explanation_delta'; text: string }
  | { type: 'complete'; conversation_id: string; assistant_message_id: string | null; intent: string; understood_requirements: Record<string, unknown>; suggested_questions: string[]; needs_clarification: boolean; timings_ms?: Record<string, number> }
  | { type: 'error'; message: string };

export interface AdvisorStreamResult<TProduct = unknown> {
  complete: Extract<AdvisorStreamEvent<TProduct>, { type: 'complete' }>;
  products: TProduct[];
  content: string;
}

/** Reads POST-based SSE without accepting a partial response as complete. */
export async function readAdvisorEventStream<TProduct = unknown>(
  response: Response,
  onEvent: (event: AdvisorStreamEvent<TProduct>) => void,
): Promise<AdvisorStreamResult<TProduct>> {
  if (!response.body) throw new Error('Không nhận được dữ liệu từ kết nối trực tiếp.');

  let buffer = '';
  let completion: AdvisorStreamResult<TProduct>['complete'] | null = null;
  let products: TProduct[] = [];
  let content = '';
  const consumeBlock = (block: string) => {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    const event = JSON.parse(data) as AdvisorStreamEvent<TProduct>;
    if (event.type === 'verified_products') products = event.products;
    if (event.type === 'explanation_delta') content += event.text;
    if (event.type === 'complete') completion = event;
    onEvent(event);
    if (event.type === 'error') throw new Error(event.message);
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary >= 0) {
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? '\n\n';
        consumeBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + separator.length);
        boundary = buffer.search(/\r?\n\r?\n/);
      }
      if (done) break;
    }
    if (buffer.trim()) consumeBlock(buffer);
  } finally {
    reader.releaseLock();
  }
  if (!completion) throw new Error('Kết nối kết thúc trước khi trợ lý hoàn tất câu trả lời.');
  return { complete: completion, products, content };
}
