import 'dotenv/config';

const baseUrl = (process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const model = process.env.OLLAMA_QUERY_MODEL?.trim() || 'qwen3:4b';
const configuredRuns = Number(process.env.ADVISOR_OLLAMA_BENCHMARK_RUNS);
const runCount = Number.isInteger(configuredRuns) && configuredRuns >= 3 && configuredRuns <= 30 ? configuredRuns : 5;
const configuredTimeout = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS);
const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout >= 1000 ? Math.min(configuredTimeout, 180000) : 90000;
const schema = {
  type: 'object', additionalProperties: false,
  required: ['reply', 'productIds', 'suggestedQuestions', 'needsClarification'],
  properties: {
    reply: { type: 'string' }, productIds: { type: 'array', items: { type: 'string' } },
    suggestedQuestions: { type: 'array', items: { type: 'string' } }, needsClarification: { type: 'boolean' },
  },
};
const body = {
  model,
  messages: [
    { role: 'system', content: 'Return a short Vietnamese JSON response matching the given schema. No product facts are supplied. Do not invent prices, products or specifications.' },
    { role: 'user', content: JSON.stringify({ intent: 'product_consultation', requirements: { category: 'laptop' }, recent_conversation: [], new_customer_message: 'Tư vấn laptop giúp tôi', catalog_products: [], search_notes: [], clarification_to_ask: 'Bạn dự kiến ngân sách bao nhiêu?' }) },
  ],
  stream: false,
  think: false,
  keep_alive: '10m',
  options: { temperature: 0.2, num_predict: 96 },
  format: schema,
};

async function oneInference() {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
  const payload = await response.json() as any;
  if (typeof payload?.message?.content !== 'string' || !payload.message.content.trim()) throw new Error('Ollama returned no message content');
  return Number((performance.now() - started).toFixed(2));
}

function percentile(sorted: number[], fraction: number) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

async function main() {
  await oneInference(); // warm model before the measured samples
  const samples: number[] = [];
  for (let index = 0; index < runCount; index++) samples.push(await oneInference());
  samples.sort((a, b) => a - b);
  console.log(JSON.stringify({
    phase: 'ollama_structured_answer_inference', model, measuredRuns: samples.length, warmupRuns: 1,
    samplesMs: samples, p50Ms: percentile(samples, 0.5), p95Ms: percentile(samples, 0.95),
  }, null, 2));
}

void main().catch((error) => {
  console.error(`Ollama benchmark failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
