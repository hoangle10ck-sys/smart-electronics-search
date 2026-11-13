import { normalize } from '../utils/text';

const EXPLICIT_EXPLANATION = /\b(so sanh|compare|vi sao|tai sao|giai thich|khac nhau|tuong thich|chay docker|chay blender|nen chon|uu nhuoc diem|why|explain|compatible|can this run)\b/i;

/**
 * Simple retrieval and price answers already have verified, deterministic backend copy.
 * Reserve Qwen explanation calls for turns where contextual reasoning adds value.
 */
export function shouldGenerateAdvisorExplanation(input: {
  intent: string;
  latestMessage: string;
  productCount: number;
  needsClarification: boolean;
  historicalReference: boolean;
}) {
  if (input.productCount < 1 || input.needsClarification || input.historicalReference) return false;
  if (EXPLICIT_EXPLANATION.test(normalize(input.latestMessage))) return true;
  return !['product_search', 'budget_consultation', 'price_question'].includes(input.intent);
}
