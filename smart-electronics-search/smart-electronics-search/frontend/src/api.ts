import { readAdvisorEventStream } from './advisorStream';
import type { AdvisorStreamEvent as BaseAdvisorStreamEvent } from './advisorStream';

export interface Product {
  _id: string;
  name: string;
  brand: string | null;
  category: string;
  price: number | null;
  originalPrice?: number | null;
  description: string | null;
  imageUrl?: string | null;
  localOnlyAsset?: boolean;
  imageSource?: string | null;
  imageSourceUrl?: string | null;
  imageAuthor?: string | null;
  imageRetrievedAt?: string | null;
  imageUsagePermission?: 'granted' | 'not_authorized' | 'not_provided';
  imageVerificationStatus?: 'verified' | 'pending' | 'rejected';
  imageLicense?: string | null;
  imageLicenseUrl?: string | null;
  imageAttribution?: string | null;
  imageVerificationBasis?: string | null;
  sourceUrl?: string | null;
  productUrl?: string | null;
  specificationSourceUrl?: string | null;
  verified?: boolean;
  verifiedAt?: string | null;
  verificationScope?: 'manufacturer' | 'retailer_feed' | 'open_dataset' | 'curated' | null;
  model?: string | null;
  modelNumber?: string | null;
  family?: string | null;
  generation?: string | null;
  releaseYear?: number | null;
  productStatus?: 'active' | 'discontinued' | 'end_of_life' | 'unknown';
  source?: string;
  sourceProductId?: string | null;
  specifications?: Record<string, unknown> | null;
  variants?: Array<{ name?: string | null; sku?: string | null; modelNumber?: string | null; attributes?: Record<string, unknown> }>;
  sourceEvidence?: Array<{ evidenceType: string; sourceName: string; sourceUrl: string; retrievedAt: string; verifiedAt: string; notes?: string | null }>;
  dataAttribution?: string | null;
  dataSourceUrl?: string | null;
  dataLicense?: string | null;
  dataLicenseUrl?: string | null;
  bestOffer?: Offer | null;
  offers?: Offer[];
  specs: Record<string, string | number>;
  tags: string[];
  rating: number | null;
  sold: number | null;
  stock: number | null;
  score?: number;
  reasons?: string[];
  advisorFit?: {
    score: number;
    matchScore?: number;
    dataConfidence?: number;
    matchingStatus?: 'fully_matching' | 'incomplete' | 'not_matching' | 'historical_reference';
    fullyMatching?: boolean;
    reasons: string[];
    budgetStatus: 'within_budget' | 'over_budget' | 'price_unknown' | 'not_specified';
    criteria?: Array<{ key: string; label: string; status: 'PASS' | 'FAIL' | 'UNKNOWN'; required: boolean; expected: unknown; actual: unknown; sourceUrls: string[] }>;
    unmetRequirements?: Array<{ key: string; label: string; status: 'FAIL' | 'UNKNOWN'; expected: unknown; actual: unknown }>;
    missingSpecifications?: string[];
  } | null;
  priceEvidence?: { status: 'current_verified' | 'historical' | 'reference' | 'expired' | 'unknown'; observedAt: string | null };
}

export interface Offer {
  sellerName: string;
  variantLabel?: string | null;
  price: number | null;
  originalPrice: number | null;
  discount: number | null;
  currency: string | null;
  productUrl: string | null;
  affiliateUrl: string | null;
  availability: string | null;
  verified: boolean;
  priceVerificationStatus?: 'verified' | 'pending' | 'rejected';
  priceStatus?: 'current_verified';
  observedAt?: string | null;
  verifiedAt: string | null;
  lastUpdated: string | null;
}

export interface Intent {
  category?: string;
  brands: string[];
  minPrice?: number;
  maxPrice?: number;
  ram?: number;
  storageGB?: number;
  storageType?: string;
  vramGB?: number;
  displayInches?: number;
  tags: string[];
  keywords: string[];
}

export interface SearchResponse {
  query: string;
  intent: Intent;
  queryUnderstanding?: { provider: 'ollama' | 'rules'; status: 'active' | 'not_configured' | 'fallback' };
  notes: string[];
  total: number;
  items: Product[];
  budgetUnknownTotal?: number;
  budgetUnknownItems?: Product[];
  catalogDiscovery?: CatalogDiscoveryCandidate[];
  webSearch?: WebSearchCandidate[];
  webSearchStatus?: { status: 'not_requested' | 'available' | 'not_configured' | 'rate_limited' | 'unavailable'; provider: 'tavily' | 'brave' | null };
}

export interface CatalogDiscoveryCandidate {
  name: string;
  category: string;
  sourceUrl: string;
  source: 'TechAPI';
  dataAttribution: string;
  dataSourceUrl: string;
  dataLicense: string;
  dataLicenseUrl: string;
  techApiVerified: boolean;
  brand?: string | null;
  releaseDate?: string | null;
  specificationHighlights?: string[];
  sourceUrls?: string[];
  imageReference?: { imageUrl: string; filePageUrl: string; license: string; attribution: string } | null;
  priceStatus: 'unknown';
  imageStatus: 'not_reviewed';
  note: string;
}

export interface WebSearchCandidate {
  title: string;
  url: string;
  snippet: string;
  source: 'tavily' | 'brave';
}

export interface Suggestion {
  _id: string;
  name: string;
  category: string;
}

export interface AdvisorConversationMessage {
  role: 'user' | 'assistant';
  message_id?: string | null;
  content: string;
  intent?: string | null;
  needs_clarification?: boolean;
  suggested_questions?: string[];
  products?: Product[];
  feedback?: AdvisorFeedbackState | null;
  created_at?: string;
}

export type AdvisorFeedbackCategory = 'query_understanding' | 'search' | 'catalog_data' | 'product_evaluation' | 'qwen_explanation';
export interface AdvisorFeedbackState {
  rating: 'helpful' | 'not_helpful' | null;
  report_type: 'none' | 'wrong_advice' | 'irrelevant_product';
  error_category: AdvisorFeedbackCategory | null;
  product_id: string | null;
  reported_product_ids?: string[];
  issue_reported?: boolean;
}

export interface AdvisorChatResponse {
  success: boolean;
  conversation_id: string;
  assistant_message_id: string | null;
  message: { role: 'assistant'; content: string };
  intent: string;
  understood_requirements: Record<string, unknown>;
  products: Product[];
  suggested_questions: string[];
  needs_clarification: boolean;
  status: 'success';
}

export type AdvisorStreamEvent = BaseAdvisorStreamEvent<Product>;

const BASE = import.meta.env.VITE_API_URL ?? '/api';

async function advisorError(response: Response) {
  try {
    const payload = await response.json() as { message?: string };
    if (payload.message) return payload.message;
  } catch { /* Use a concise local message when the server has no JSON body. */ }
  return 'Trợ lý đang gặp sự cố kết nối. Bạn có thể thử lại.';
}

export async function sendAdvisorMessage(message: string, conversationId?: string | null, clientMessageId?: string): Promise<AdvisorChatResponse> {
  const response = await fetch(`${BASE}/v1/chat/message`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message,
      ...(conversationId ? { conversation_id: conversationId } : {}),
      ...(clientMessageId ? { client_message_id: clientMessageId } : {}),
    }),
  });
  if (!response.ok) throw new Error(await advisorError(response));
  return response.json();
}

export async function sendAdvisorMessageStreaming(
  message: string,
  conversationId: string | null | undefined,
  clientMessageId: string,
  onEvent: (event: AdvisorStreamEvent) => void,
  signal: AbortSignal,
): Promise<AdvisorChatResponse> {
  const response = await fetch(`${BASE}/v1/chat/message`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    signal,
    body: JSON.stringify({
      message,
      ...(conversationId ? { conversation_id: conversationId } : {}),
      ...(clientMessageId ? { client_message_id: clientMessageId } : {}),
    }),
  });
  if (!response.ok) throw new Error(await advisorError(response));

  // Keep a JSON fallback for older proxies or a server that has not been restarted yet.
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const result = await response.json() as AdvisorChatResponse;
    onEvent({ type: 'verified_products', products: result.products ?? [] });
    if (result.message?.content) onEvent({ type: 'explanation_delta', text: result.message.content });
    onEvent({
      type: 'complete', conversation_id: result.conversation_id, assistant_message_id: result.assistant_message_id,
      intent: result.intent, understood_requirements: result.understood_requirements,
      suggested_questions: result.suggested_questions, needs_clarification: result.needs_clarification,
    });
    return result;
  }
  const { complete: completed, products, content } = await readAdvisorEventStream<Product>(response, onEvent);
  return {
    success: true,
    conversation_id: completed.conversation_id,
    assistant_message_id: completed.assistant_message_id,
    message: { role: 'assistant', content },
    intent: completed.intent,
    understood_requirements: completed.understood_requirements,
    products,
    suggested_questions: completed.suggested_questions,
    needs_clarification: completed.needs_clarification,
    status: 'success',
  };
}

export async function getAdvisorConversation(conversationId: string): Promise<{
  conversation_id: string;
  messages: AdvisorConversationMessage[];
  understood_requirements: Record<string, unknown>;
  conversation_summary: string;
  expires_at: string;
}> {
  const response = await fetch(`${BASE}/v1/chat/conversations/${encodeURIComponent(conversationId)}`);
  if (!response.ok) throw new Error(await advisorError(response));
  return response.json();
}

export async function submitAdvisorFeedback(
  conversationId: string,
  assistantMessageId: string,
  feedback: { rating: 'helpful' | 'not_helpful'; report_type?: 'none' | 'wrong_advice' | 'irrelevant_product'; error_category?: AdvisorFeedbackCategory; product_id?: string },
): Promise<AdvisorFeedbackState> {
  const response = await fetch(`${BASE}/v1/chat/feedback`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      conversation_id: conversationId,
      assistant_message_id: assistantMessageId,
      rating: feedback.rating,
      report_type: feedback.report_type ?? 'none',
      ...(feedback.error_category ? { error_category: feedback.error_category } : {}),
      ...(feedback.product_id ? { product_id: feedback.product_id } : {}),
    }),
  });
  if (!response.ok) throw new Error(await advisorError(response));
  const payload = await response.json() as { feedback: { rating: AdvisorFeedbackState['rating']; report_type: AdvisorFeedbackState['report_type']; error_category: AdvisorFeedbackCategory | null; product_id: string | null } };
  return payload.feedback;
}

export async function deleteAdvisorConversation(conversationId: string): Promise<void> {
  const response = await fetch(`${BASE}/v1/chat/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(await advisorError(response));
}

export async function searchProducts(q: string, signal?: AbortSignal, limit = 60): Promise<SearchResponse> {
  const res = await fetch(`${BASE}/products/search?q=${encodeURIComponent(q)}&limit=${limit}`, { signal });
  if (!res.ok) throw new Error('Không tìm kiếm được, kiểm tra backend đã chạy chưa.');
  return res.json();
}

export async function suggest(q: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const res = await fetch(`${BASE}/products/suggest?q=${encodeURIComponent(q)}`, { signal });
  return res.ok ? res.json() : [];
}

export async function getCategories(signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${BASE}/products/categories`, { signal });
  if (!res.ok) throw new Error('Không tải được danh mục sản phẩm.');
  return res.json();
}

export async function getProducts(page = 1, pageSize = 8, signal?: AbortSignal): Promise<{ page: number; pageSize: number; total: number; items: Product[] }> {
  const res = await fetch(`${BASE}/products?page=${page}&pageSize=${pageSize}`, { signal });
  if (!res.ok) throw new Error('Không tải được danh sách sản phẩm.');
  return res.json();
}

export async function getProductById(id: string, signal?: AbortSignal): Promise<Product> {
  const res = await fetch(`${BASE}/products/${encodeURIComponent(id)}`, { signal });
  if (!res.ok) throw new Error(res.status === 404 ? 'Không tìm thấy sản phẩm.' : 'Không tải được chi tiết sản phẩm.');
  return res.json();
}

export async function getSimilarProducts(id: string, limit = 4, signal?: AbortSignal): Promise<Product[]> {
  const res = await fetch(`${BASE}/v1/products/${encodeURIComponent(id)}/similar?limit=${limit}`, { signal });
  if (!res.ok) throw new Error('Chưa tải được sản phẩm tương tự.');
  const payload = await res.json() as { products?: Array<Partial<Product> & { id?: string }> };
  return (payload.products ?? []).flatMap((product) => {
    const productId = product._id ?? product.id;
    if (!productId || !product.name) return [];
    return [{
      ...product,
      _id: productId,
      brand: product.brand ?? null,
      category: product.category ?? '',
      price: product.price ?? null,
      description: product.description ?? null,
      specs: product.specs ?? {},
      tags: product.tags ?? [],
      rating: product.rating ?? null,
      sold: product.sold ?? null,
      stock: product.stock ?? null,
    } as Product];
  });
}

export const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

export const formatShort = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(1)} triệu` : `${Math.round(n / 1e3)}k`;
