import { createHash } from 'node:crypto';
import { normalize } from '../utils/text';
import { countAdvisorCall, getAdvisorRequestSignal, recordAdvisorPhase } from './advisorPerformance';

export const DEFAULT_EMBEDDING_MODEL = 'bge-m3';
const EMBEDDING_TIMEOUT_MS = 90_000;
const queryCache = new Map<string, { expiresAt: number; embedding: number[] }>();

export function embeddingModel() {
  return process.env.OLLAMA_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

export function productEmbeddingText(product: Record<string, any>) {
  const specs = product.normalizedSpecs ?? {};
  const aliases = Array.isArray(product.aliases) ? product.aliases : [];
  const tags = Array.isArray(product.tags) ? product.tags : [];
  return [
    product.name, product.brand, product.category, product.model, product.modelNumber, product.sku,
    ...aliases, product.description, ...tags,
    specs.cpuModel, specs.gpuModel,
    specs.ramGB ? `RAM ${specs.ramGB} GB` : null,
    specs.storageGB ? `storage ${specs.storageGB} GB` : null,
    specs.storageType ? `${specs.storageType} storage` : null,
    specs.vramGB ? `VRAM ${specs.vramGB} GB` : null,
    ...Object.entries(product.specs ?? {}).map(([key, value]) => `${key} ${String(value)}`),
    ...Object.entries(product.specifications ?? {}).map(([key, value]) => `${key} ${String(value)}`),
  ].filter((value) => typeof value === 'string' && value.trim()).join(' ').slice(0, 6000);
}

export function embeddingContentHash(text: string) {
  return createHash('sha256').update(normalize(text)).digest('hex');
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  if (texts.length > 64) throw new Error('Embedding batch is limited to 64 inputs');
  const baseUrl = (process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const configuredTimeout = Number(process.env.OLLAMA_EMBEDDING_TIMEOUT_MS);
  const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout >= 1000
    ? Math.min(configuredTimeout, 180_000)
    : EMBEDDING_TIMEOUT_MS;
  const inferenceStartedAt = performance.now();
  const requestSignal = getAdvisorRequestSignal();
  countAdvisorCall('ollama_embedding');
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/embed`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      signal: requestSignal ? AbortSignal.any([AbortSignal.timeout(timeoutMs), requestSignal]) : AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model: embeddingModel(), input: texts, truncate: true }),
    });
  } finally {
    recordAdvisorPhase('embedding_inference', performance.now() - inferenceStartedAt);
  }
  if (!response.ok) throw new Error(`Ollama embedding HTTP ${response.status}`);
  const payload = await response.json() as any;
  const embeddings = payload?.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== texts.length || embeddings.some((vector: any) => !Array.isArray(vector) || !vector.length || vector.some((n: unknown) => typeof n !== 'number' || !Number.isFinite(n)))) {
    throw new Error('Ollama returned invalid embedding vectors');
  }
  const dimensions = embeddings[0].length;
  if (embeddings.some((vector: number[]) => vector.length !== dimensions)) throw new Error('Ollama returned inconsistent vector dimensions');
  return embeddings as number[][];
}

export async function embedQuery(text: string): Promise<number[]> {
  const key = `${embeddingModel()}:${normalize(text)}`;
  const cached = queryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.embedding;
  const [embedding] = await embedTexts([text]);
  queryCache.set(key, { expiresAt: Date.now() + 30 * 60_000, embedding });
  if (queryCache.size > 200) queryCache.delete(queryCache.keys().next().value as string);
  return embedding;
}
