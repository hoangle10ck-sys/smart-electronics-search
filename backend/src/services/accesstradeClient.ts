export interface DatafeedItem {
  [key: string]: unknown;
}

export interface DatafeedResult {
  status: number;
  items: DatafeedItem[];
  total: number | null;
  responseKeys: string[];
  pages: number;
  truncated: boolean;
}

export class AccesstradeError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'AccesstradeError';
  }
}

type FetchOptions = {
  apiKey: string;
  baseUrl?: string;
  domain?: string;
  limit?: number;
  timeoutMs?: number;
  retries?: number;
  maxPages?: number;
  fetchImpl?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
};

function apiError(status: number): AccesstradeError {
  const reason: Record<number, string> = {
    401: 'API key không hợp lệ hoặc đã hết hạn',
    403: 'Tài khoản chưa được cấp quyền truy cập Datafeeds hoặc merchant này',
    404: 'Không tìm thấy endpoint Datafeeds',
    429: 'AccessTrade đang giới hạn tần suất gọi API',
  };
  return new AccesstradeError(`AccessTrade trả HTTP ${status}: ${reason[status] ?? (status >= 500 ? 'dịch vụ AccessTrade đang lỗi' : 'yêu cầu bị từ chối')}`, status);
}

async function requestPage(page: number, options: Required<Pick<FetchOptions, 'apiKey' | 'baseUrl' | 'limit' | 'timeoutMs' | 'retries' | 'fetchImpl' | 'wait'>> & { domain?: string }): Promise<{ status: number; items: DatafeedItem[]; total: number | null; responseKeys: string[] }> {
  const base = new URL(options.baseUrl);
  if (base.protocol !== 'https:' || base.hostname !== 'api.accesstrade.vn' || base.username || base.password) {
    throw new AccesstradeError('ACCESSTRADE_BASE_URL phải là HTTPS api.accesstrade.vn');
  }
  base.pathname = `${base.pathname.replace(/\/$/, '')}/datafeeds`;
  base.search = '';
  if (options.domain?.trim()) base.searchParams.set('domain', options.domain.trim());
  base.searchParams.set('page', String(page));
  base.searchParams.set('limit', String(options.limit));

  let lastError: unknown;
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await options.fetchImpl(base, {
        method: 'GET',
        headers: { Authorization: `Token ${options.apiKey}`, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = apiError(response.status);
        if ((response.status === 429 || response.status >= 500) && attempt < options.retries) {
          await options.wait(Math.min(500 * 2 ** attempt, 4000));
          continue;
        }
        throw error;
      }
      let body: unknown;
      try { body = await response.json(); } catch { throw new AccesstradeError('AccessTrade trả về JSON không hợp lệ', response.status); }
      if (!body || typeof body !== 'object') throw new AccesstradeError('Cấu trúc phản hồi Datafeeds không hợp lệ', response.status);
      const root = body as Record<string, unknown>;
      const items = Array.isArray(root.data) ? root.data : Array.isArray(body) ? body : null;
      if (!items || items.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
        throw new AccesstradeError('Trường data của Datafeeds không phải danh sách sản phẩm', response.status);
      }
      const rawTotal = root.total;
      const total = typeof rawTotal === 'number' && Number.isSafeInteger(rawTotal) && rawTotal >= 0 ? rawTotal : null;
      return { status: response.status, items: items as DatafeedItem[], total, responseKeys: Object.keys(root) };
    } catch (error) {
      lastError = error;
      const retryable = !(error instanceof AccesstradeError) || error.status === 429 || (error.status ?? 0) >= 500;
      if (retryable && attempt < options.retries) {
        await options.wait(Math.min(500 * 2 ** attempt, 4000));
        continue;
      }
      if (error instanceof AccesstradeError) throw error;
      if (controller.signal.aborted) throw new AccesstradeError(`AccessTrade timeout sau ${options.timeoutMs}ms`);
      throw new AccesstradeError('Không kết nối được AccessTrade; kiểm tra mạng hoặc trạng thái dịch vụ');
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new AccesstradeError('Không tải được Datafeeds');
}

export async function fetchAllDatafeeds(options: FetchOptions): Promise<DatafeedResult> {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 200), 1), 200);
  const settings = {
    apiKey: options.apiKey,
    baseUrl: options.baseUrl ?? 'https://api.accesstrade.vn/v1',
    domain: options.domain ?? 'fptshop.com.vn',
    limit,
    timeoutMs: options.timeoutMs ?? 15000,
    retries: options.retries ?? 2,
    fetchImpl: options.fetchImpl ?? fetch,
    wait: options.wait ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms))),
  };
  if (!settings.apiKey.trim()) throw new AccesstradeError('Thiếu ACCESSTRADE_API_KEY trong backend environment');

  const maxPages = Math.max(1, Math.floor(options.maxPages ?? 1000));
  const first = await requestPage(1, settings);
  const items = [...first.items];
  const expectedPages = first.total === null ? null : Math.ceil(first.total / limit);
  if (expectedPages !== null && expectedPages > maxPages) {
    throw new AccesstradeError(`Datafeeds có ${expectedPages} trang, vượt giới hạn an toàn ${maxPages}; chưa ghi dữ liệu nào`);
  }
  let page = 1;
  while (page < (expectedPages ?? maxPages) && items.length > 0) {
    page += 1;
    const result = await requestPage(page, settings);
    items.push(...result.items);
    if (result.items.length < limit) break;
    if (first.total === null && result.total !== null && result.total > 0 && Math.ceil(result.total / limit) <= maxPages) {
      // Use a newly discovered total only when the first response omitted it.
    }
  }
  const pages = page;
  const truncated = first.total !== null ? items.length < first.total : pages === maxPages && items.length >= maxPages * limit;
  if (truncated) throw new AccesstradeError('Phân trang Datafeeds chưa hoàn tất; chưa ghi dữ liệu nào');
  return { status: first.status, items, total: first.total ?? items.length, responseKeys: first.responseKeys, pages, truncated: false };
}

export async function fetchDatafeedPage(options: FetchOptions & { page: number }): Promise<{ status: number; items: DatafeedItem[]; total: number | null; responseKeys: string[] }> {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 10), 1), 200);
  const settings = {
    apiKey: options.apiKey,
    baseUrl: options.baseUrl ?? 'https://api.accesstrade.vn/v1',
    domain: options.domain,
    limit,
    timeoutMs: options.timeoutMs ?? 15000,
    retries: options.retries ?? 2,
    fetchImpl: options.fetchImpl ?? fetch,
    wait: options.wait ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms))),
  };
  if (!settings.apiKey.trim()) throw new AccesstradeError('Thiếu ACCESSTRADE_API_KEY trong backend environment');
  if (!Number.isSafeInteger(options.page) || options.page < 1) throw new AccesstradeError('page phải là số nguyên dương');
  return requestPage(options.page, settings);
}
