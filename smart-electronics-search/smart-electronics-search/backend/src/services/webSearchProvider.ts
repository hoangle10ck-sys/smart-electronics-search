export type SearchProviderName = 'tavily' | 'brave';

export type WebSearchCandidate = {
  title: string;
  url: string;
  snippet: string;
  source: SearchProviderName;
};

export type WebSearchStatus = 'available' | 'not_configured' | 'rate_limited' | 'unavailable';

export type WebSearchResponse = {
  status: WebSearchStatus;
  provider: SearchProviderName | null;
  candidates: WebSearchCandidate[];
};

type SearchConfig = {
  provider?: string;
  tavilyApiKey?: string;
  braveApiKey?: string;
  fetcher?: typeof fetch;
  cacheTtlMs?: number;
  now?: () => number;
};

type ProviderConfig = { provider: SearchProviderName; apiKey: string } | null;
type CacheEntry = { expiresAt: number; response: WebSearchResponse };

function selectProvider(config: SearchConfig): ProviderConfig {
  const requested = config.provider?.trim().toLowerCase();
  if (requested === 'none') return null;
  if (requested === 'tavily') return config.tavilyApiKey ? { provider: 'tavily', apiKey: config.tavilyApiKey } : null;
  if (requested === 'brave') return config.braveApiKey ? { provider: 'brave', apiKey: config.braveApiKey } : null;
  if (requested && requested !== 'auto') return null;
  if (config.tavilyApiKey) return { provider: 'tavily', apiKey: config.tavilyApiKey };
  if (config.braveApiKey) return { provider: 'brave', apiKey: config.braveApiKey };
  return null;
}

function safeCandidate(value: unknown, provider: SearchProviderName): WebSearchCandidate | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const title = typeof row.title === 'string' ? row.title.trim().slice(0, 300) : '';
  const rawUrl = typeof row.url === 'string' ? row.url : '';
  const snippet = typeof row.content === 'string'
    ? row.content.trim().slice(0, 600)
    : typeof row.description === 'string' ? row.description.trim().slice(0, 600) : '';
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.username || url.password || !title) return null;
    return { title, url: url.toString(), snippet, source: provider };
  } catch {
    return null;
  }
}

async function fetchCandidates(provider: ProviderConfig, query: string, fetcher: typeof fetch): Promise<WebSearchResponse> {
  if (!provider) return { status: 'not_configured', provider: null, candidates: [] };

  let response: Response;
  try {
    if (provider.provider === 'tavily') {
      response = await fetcher('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query, search_depth: 'basic', max_results: 5, include_answer: false, include_raw_content: false }),
        signal: AbortSignal.timeout(8000),
      });
    } else {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', query);
      url.searchParams.set('count', '5');
      url.searchParams.set('safesearch', 'moderate');
      response = await fetcher(url, {
        headers: { 'X-Subscription-Token': provider.apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
    }
  } catch {
    return { status: 'unavailable', provider: provider.provider, candidates: [] };
  }

  if (response.status === 429) return { status: 'rate_limited', provider: provider.provider, candidates: [] };
  if (!response.ok) return { status: 'unavailable', provider: provider.provider, candidates: [] };

  try {
    const payload = await response.json() as Record<string, any>;
    const rows = provider.provider === 'tavily' ? payload.results : payload.web?.results;
    const candidates = Array.isArray(rows)
      ? rows.map((row: unknown) => safeCandidate(row, provider.provider)).filter((row: WebSearchCandidate | null): row is WebSearchCandidate => Boolean(row)).slice(0, 5)
      : [];
    return { status: 'available', provider: provider.provider, candidates };
  } catch {
    return { status: 'unavailable', provider: provider.provider, candidates: [] };
  }
}

export function createWebSearchProvider(config: SearchConfig) {
  const provider = selectProvider(config);
  const fetcher = config.fetcher ?? fetch;
  const now = config.now ?? Date.now;
  const cacheTtlMs = Math.max(0, config.cacheTtlMs ?? 10 * 60 * 1000);
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<WebSearchResponse>>();

  return {
    configured: Boolean(provider),
    provider: provider?.provider ?? null,
    async search(query: string): Promise<WebSearchResponse> {
      const normalized = query.trim().replace(/\s+/g, ' ');
      if (!provider) return { status: 'not_configured', provider: null, candidates: [] };
      if (!normalized) return { status: 'available', provider: provider.provider, candidates: [] };
      const key = normalized.toLocaleLowerCase();
      const cached = cache.get(key);
      if (cached && cached.expiresAt > now()) return cached.response;
      if (cached) cache.delete(key);
      const pending = inFlight.get(key);
      if (pending) return pending;

      const task = fetchCandidates(provider, normalized, fetcher).then((result) => {
        if (result.status === 'available' && cacheTtlMs > 0) {
          if (cache.size >= 200) cache.delete(cache.keys().next().value as string);
          cache.set(key, { expiresAt: now() + cacheTtlMs, response: result });
        }
        return result;
      }).finally(() => inFlight.delete(key));
      inFlight.set(key, task);
      return task;
    },
  };
}

export const webSearchProvider = createWebSearchProvider({
  provider: process.env.SEARCH_PROVIDER,
  tavilyApiKey: process.env.TAVILY_API_KEY,
  braveApiKey: process.env.BRAVE_SEARCH_API_KEY,
});
