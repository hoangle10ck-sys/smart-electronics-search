export const ADVISOR_FEEDBACK_CATEGORIES = [
  'query_understanding', 'search', 'catalog_data', 'product_evaluation', 'qwen_explanation',
] as const;
export type AdvisorFeedbackCategory = typeof ADVISOR_FEEDBACK_CATEGORIES[number];
export type AdvisorFeedbackRating = 'helpful' | 'not_helpful';
export type AdvisorFeedbackReportType = 'none' | 'wrong_advice' | 'irrelevant_product';

export interface AdvisorFeedbackInput {
  conversationId: string;
  assistantMessageId: string;
  rating: AdvisorFeedbackRating;
  reportType: AdvisorFeedbackReportType;
  errorCategory: AdvisorFeedbackCategory | null;
  productId: string | null;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_ID = /^[0-9a-f]{24}$/i;

export function validateAdvisorFeedbackInput(body: any): { data: AdvisorFeedbackInput } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'feedback body must be an object' };
  const { conversation_id: conversationId, assistant_message_id: assistantMessageId, rating, report_type: reportType = 'none', error_category: rawCategory = null, product_id: productId = null } = body;
  if (typeof conversationId !== 'string' || !UUID_V4.test(conversationId)) return { error: 'conversation_id is invalid' };
  if (typeof assistantMessageId !== 'string' || !UUID_V4.test(assistantMessageId)) return { error: 'assistant_message_id is invalid' };
  if (rating !== 'helpful' && rating !== 'not_helpful') return { error: 'rating is not supported' };
  if (!['none', 'wrong_advice', 'irrelevant_product'].includes(reportType)) return { error: 'report_type is not supported' };
  if (rawCategory !== null && !ADVISOR_FEEDBACK_CATEGORIES.includes(rawCategory)) return { error: 'error_category is not supported' };
  if (productId !== null && (typeof productId !== 'string' || !OBJECT_ID.test(productId))) return { error: 'product_id is invalid' };
  if (rating === 'helpful' && reportType !== 'none') return { error: 'helpful feedback cannot contain an issue report' };
  if (reportType !== 'none' && rating !== 'not_helpful') return { error: 'issue reports must use not_helpful rating' };
  if (reportType === 'wrong_advice' && !rawCategory) return { error: 'wrong_advice requires an error_category' };
  if (reportType === 'irrelevant_product' && !productId) return { error: 'irrelevant_product requires a product_id' };
  if (reportType !== 'irrelevant_product' && productId !== null) return { error: 'product_id is only valid for irrelevant_product reports' };
  if (reportType === 'irrelevant_product' && rawCategory && rawCategory !== 'search') return { error: 'irrelevant_product must be classified as search' };
  if (reportType === 'none' && (rawCategory !== null || productId !== null)) return { error: 'unclassified feedback cannot include issue details' };

  return {
    data: {
      conversationId, assistantMessageId, rating, reportType,
      errorCategory: reportType === 'irrelevant_product' ? 'search' : rawCategory,
      productId,
    },
  };
}

export function findAssistantFeedbackMessage(messages: Array<{ role?: string; messageId?: string | null }>, assistantMessageId: string) {
  return messages.find((message) => message.role === 'assistant' && message.messageId === assistantMessageId) ?? null;
}

export function isFeedbackProductAttached(message: { role?: string; messageId?: string | null; recommendations?: Array<{ productId?: unknown }> }, productId: string) {
  return (message.recommendations ?? []).some((item) => String(item.productId) === productId);
}

export interface AdvisorFeedbackAggregateRow {
  rating: AdvisorFeedbackRating;
  reportType: AdvisorFeedbackReportType;
  errorCategory: AdvisorFeedbackCategory | null;
  productId?: string | null;
}

export function summarizeAdvisorFeedback(rows: AdvisorFeedbackAggregateRow[]) {
  const counts = <T extends string>(values: Array<T | null | undefined>) => values.reduce<Record<string, number>>((result, value) => {
    const key = value ?? 'unclassified';
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
  const productCounts = counts(rows.flatMap((row) => row.reportType === 'irrelevant_product' && row.productId ? [row.productId] : []));
  return {
    total: rows.length,
    byRating: counts(rows.map((row) => row.rating)),
    byReportType: counts(rows.map((row) => row.reportType)),
    byErrorCategory: counts(rows.map((row) => row.errorCategory)),
    topIrrelevantProductIds: Object.entries(productCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([productId, reports]) => ({ productId, reports })),
  };
}
