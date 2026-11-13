import { BRANDS, CATEGORIES, TAGS } from './dictionary';
import { ParsedQuery, parseQuery } from './queryParser';
import { normalize } from '../utils/text';
import { countAdvisorCall, getAdvisorRequestSignal, recordAdvisorPhase } from './advisorPerformance';

export type QueryUnderstandingStatus = 'active' | 'not_configured' | 'fallback';
export type QueryUnderstandingProvider = 'ollama' | 'rules';

export interface QueryUnderstandingResult {
  parsed: ParsedQuery;
  provider: QueryUnderstandingProvider;
  status: QueryUnderstandingStatus;
}

const categoryKeys = Object.keys(CATEGORIES);
const brandKeys = Object.keys(BRANDS);
const tagKeys = Object.keys(TAGS);
const sortKeys = ['price_asc', 'price_desc', 'popular', 'rating'];
const hardConstraintKeys = ['category', 'brand', 'min_price', 'max_price', 'ram_gb', 'storage_type', 'storage_gb', 'vram_gb', 'display_inches', 'use_cases'];
const softPreferenceKeys = ['portable', 'battery', 'premium', 'budget', 'camera', 'design'];
const nullableEnum = (values: string[]) => ({ anyOf: [{ type: 'string', enum: values }, { type: 'null' }] });
const nullableNumber = { anyOf: [{ type: 'integer' }, { type: 'null' }] };
const nullableMeasurement = { anyOf: [{ type: 'number' }, { type: 'null' }] };

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['category', 'brands', 'minPrice', 'maxPrice', 'ram', 'storageGB', 'storageType', 'vramGB', 'displayInches', 'tags', 'keywords', 'hardConstraints', 'softPreferences', 'sort'],
  properties: {
    category: nullableEnum(categoryKeys),
    brands: { type: 'array', items: { type: 'string', enum: brandKeys } },
    minPrice: nullableNumber,
    maxPrice: nullableNumber,
    ram: nullableNumber,
    storageGB: nullableNumber,
    storageType: nullableEnum(['ssd', 'hdd']),
    vramGB: nullableNumber,
    displayInches: nullableMeasurement,
    tags: { type: 'array', items: { type: 'string', enum: tagKeys } },
    keywords: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 80 } },
    hardConstraints: { type: 'array', maxItems: 10, items: { type: 'string', enum: hardConstraintKeys } },
    softPreferences: { type: 'array', maxItems: 8, items: { type: 'string', enum: softPreferenceKeys } },
    sort: nullableEnum(sortKeys),
  },
} as const;

type ModelIntent = {
  category: string | null;
  brands: string[];
  minPrice: number | null;
  maxPrice: number | null;
  ram: number | null;
  storageGB: number | null;
  storageType: string | null;
  vramGB: number | null;
  displayInches: number | null;
  tags: string[];
  keywords: string[];
  hardConstraints: string[];
  softPreferences: string[];
  sort: string | null;
};

type CacheEntry = { expiresAt: number; result: QueryUnderstandingResult };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_LIMIT = 200;

function fallback(raw: string, status: QueryUnderstandingStatus): QueryUnderstandingResult {
  return { parsed: parseQuery(raw), provider: 'rules', status };
}

function validIntent(value: any): value is ModelIntent {
  return value && typeof value === 'object'
    && (value.category === null || categoryKeys.includes(value.category))
    && Array.isArray(value.brands) && value.brands.length <= 5 && value.brands.every((brand: unknown) => typeof brand === 'string' && brandKeys.includes(brand))
    && (value.minPrice === null || (Number.isSafeInteger(value.minPrice) && value.minPrice >= 0 && value.minPrice <= 1_000_000_000_000))
    && (value.maxPrice === null || (Number.isSafeInteger(value.maxPrice) && value.maxPrice > 0 && value.maxPrice <= 1_000_000_000_000))
    && (value.ram === null || (Number.isSafeInteger(value.ram) && value.ram > 0 && value.ram <= 2048))
    && (value.storageGB === null || (Number.isSafeInteger(value.storageGB) && value.storageGB > 0 && value.storageGB <= 1_000_000))
    && (value.storageType === null || ['ssd', 'hdd'].includes(value.storageType))
    && (value.vramGB === null || (Number.isSafeInteger(value.vramGB) && value.vramGB > 0 && value.vramGB <= 256))
    && (value.displayInches === null || (typeof value.displayInches === 'number' && Number.isFinite(value.displayInches) && value.displayInches >= 3 && value.displayInches <= 100))
    && Array.isArray(value.tags) && value.tags.length <= 12 && value.tags.every((tag: unknown) => typeof tag === 'string' && tagKeys.includes(tag))
    && Array.isArray(value.keywords) && value.keywords.length <= 20 && value.keywords.every((word: unknown) => typeof word === 'string' && word.length <= 80)
    && Array.isArray(value.hardConstraints) && value.hardConstraints.length <= 10 && value.hardConstraints.every((item: unknown) => typeof item === 'string' && hardConstraintKeys.includes(item))
    && Array.isArray(value.softPreferences) && value.softPreferences.length <= 8 && value.softPreferences.every((item: unknown) => typeof item === 'string' && softPreferenceKeys.includes(item))
    && (value.sort === null || sortKeys.includes(value.sort));
}

function sanitizeModelIntent(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const intent = { ...(value as Record<string, unknown>) };
  const boundedNumber = (field: string, min: number, max: number, integer = true) => {
    if (!(field in intent)) return;
    const candidate = intent[field];
    intent[field] = candidate === null || typeof candidate !== 'number' || !Number.isFinite(candidate)
      || candidate < min || candidate > max || (integer && !Number.isSafeInteger(candidate))
      ? null
      : candidate;
  };
  boundedNumber('minPrice', 0, 1_000_000_000_000);
  boundedNumber('maxPrice', 1, 1_000_000_000_000);
  boundedNumber('ram', 1, 2048);
  boundedNumber('storageGB', 1, 1_000_000);
  boundedNumber('vramGB', 1, 256);
  boundedNumber('displayInches', 3, 100, false);
  return intent;
}

function mergeIntent(raw: string, rules: ParsedQuery, ai: ModelIntent): ParsedQuery {
  const normalizedRaw = normalize(raw);
  const explicitRam = /\b(?:ram|memory|bo nho ram)\b/.test(normalizedRaw);
  const aiRam = explicitRam && ai.ram !== null && ai.ram > 0 && ai.ram <= 2048 ? ai.ram : undefined;
  return {
    ...rules,
    category: rules.category ?? (ai.category && categoryKeys.includes(ai.category) ? ai.category : undefined),
    // Brands are hard search filters, so only accept one the user actually named.
    // The language model often guesses a set of likely manufacturers for generic
    // requests such as "gaming laptop"; treating those guesses as requirements
    // silently removes valid products and invents preferences the user did not state.
    brands: rules.brands,
    // Numeric constraints are accepted only from deterministic parsing so the model cannot invent a budget.
    minPrice: rules.minPrice,
    maxPrice: rules.maxPrice,
    ram: rules.ram ?? aiRam,
    // The deterministic dictionary already captures the supported use-case terms.
    // Do not let the model add unstated needs (for example, design to "gaming laptop").
    tags: rules.tags,
    // Keep the visible/searchable terms grounded in words left after deterministic
    // parsing; the model tends to echo the whole request as one redundant keyword.
    keywords: rules.keywords,
    sort: rules.sort ?? (ai.sort && sortKeys.includes(ai.sort) ? ai.sort as ParsedQuery['sort'] : undefined),
  };
}

/** Uses the local Ollama chat API and safely falls back to the deterministic parser. */
export async function understandQuery(raw: string): Promise<QueryUnderstandingResult> {
  const rules = parseQuery(raw);
  if (rules.validationIssues.length) return fallback(raw, 'fallback');
  // The evaluation runner uses the same search engine and deterministic parser
  // on both revisions, so ranking metrics exclude model warm-up/network latency.
  if (process.env.SEARCH_EVAL_SKIP_OLLAMA === 'true') return fallback(raw, 'fallback');
  const baseUrl = (process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const model = process.env.OLLAMA_QUERY_MODEL?.trim() || 'qwen3:4b';
  const configuredTimeout = Number(process.env.OLLAMA_QUERY_TIMEOUT_MS);
  const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout >= 1000
    ? Math.min(configuredTimeout, 120_000)
    : 60_000;

  const cacheKey = normalize(raw);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const inferenceStartedAt = performance.now();
  const requestSignal = getAdvisorRequestSignal();
  countAdvisorCall('ollama_chat');
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: requestSignal ? AbortSignal.any([AbortSignal.timeout(timeoutMs), requestSignal]) : AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Phân tích câu tìm kiếm mua sản phẩm điện tử thành ý định có cấu trúc. Chỉ chọn category, brand và tag từ enum. Giữ keyword là tên model hoặc cụm ý nghĩa trong truy vấn. Không tự đoán ngân sách; các con số giá và RAM chỉ được điền khi người dùng nói rõ. Không biến dung lượng lưu trữ thành RAM. Chỉ trả JSON khớp schema.' },
          { role: 'user', content: raw.slice(0, 300) },
        ],
        stream: false,
        think: false,
        keep_alive: '10m',
        options: { temperature: 0, num_predict: 256 },
        format: responseSchema,
      }),
    });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const payload = await response.json() as any;
    const text = payload?.message?.content;
    if (!text) throw new Error('Ollama returned no structured output');
    const candidate = sanitizeModelIntent(JSON.parse(text));
    if (!validIntent(candidate)) {
      throw new Error('OpenAI output failed local validation');
    }

    const result: QueryUnderstandingResult = {
      parsed: mergeIntent(raw, rules, candidate),
      provider: 'ollama',
      status: 'active',
    };
    cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    return result;
  } catch (error) {
    if (requestSignal?.aborted) throw error;
    const reason = error instanceof SyntaxError
      ? 'invalid_json'
      : error instanceof Error && /^Ollama HTTP \d{3}$/.test(error.message)
        ? error.message
        : error instanceof Error && error.message === 'Ollama returned no structured output'
          ? 'empty_output'
          : error instanceof Error && error.message === 'OpenAI output failed local validation'
            ? 'schema_validation_failed'
            : 'request_failed';
    console.warn(`Ollama query understanding fell back to rules (${reason})`);
    return fallback(raw, 'fallback');
  } finally {
    recordAdvisorPhase('ollama_inference', performance.now() - inferenceStartedAt);
  }
}
