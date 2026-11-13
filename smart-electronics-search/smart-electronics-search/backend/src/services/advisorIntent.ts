import { AdvisorRequirements, AdvisorIntent } from './productAdvisor';
import { normalize } from '../utils/text';
import { parseQuery } from './queryParser';

export type ContextIntent =
  | 'MODIFY_REQUIREMENT' | 'REMOVE_REQUIREMENT' | 'ADD_REQUIREMENT' | 'REQUEST_CHEAPER'
  | 'REQUEST_LIGHTER' | 'REQUEST_BETTER_PERFORMANCE' | 'REQUEST_LONGER_BATTERY'
  | 'REQUEST_ALTERNATIVE_BRAND' | 'REQUEST_MORE_PRODUCTS' | 'COMPARE_PREVIOUS_RESULTS'
  | 'ASK_ABOUT_PREVIOUS_PRODUCT' | 'CONTINUE_CONSULTATION' | 'NEW_PRODUCT_SEARCH' | 'OUT_OF_SCOPE';

export interface IntentContext {
  requirements: AdvisorRequirements;
  currentSearchResultCount: number;
  historicalProductReferenceCount: number;
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string; intent?: string | null }>;
}

export interface IntentDetection {
  intent: ContextIntent;
  confidence: number;
  inScope: boolean;
  needsClarification: boolean;
  clarificationQuestion: string;
  category?: string;
}

export function shouldUseOllamaForIntent(detection: IntentDetection) {
  return detection.confidence < 0.78;
}

const OFF_TOPIC = [
  /\b(weather|forecast|thoi tiet|mua bao|nhiet do)\b/,
  /\b(recipe|cooking|nau an|mon an|cong thuc)\b/,
  /\b(politics|political|chinh tri|bau cu)\b/,
  /\b(football score|ket qua bong da|lich thi dau)\b/,
  /\b(stock market|thi truong chung khoan|gia vang hom nay)\b/,
  /\b(joke|tell me a joke|ke chuyen cuoi|viet .* tho|write .* poem)\b/,
  /\b(relationship advice|tu van tinh cam|chuyen tinh cam|chia tay|nguoi yeu)\b/,
  /\b(capital of|thu do cua|translate this|dich cau nay)\b/,
];

const CONTEXT_LINK = /\b(nhe hon|gon hon|re hon|mem hon|gia thap hon|pin (?:trau|lau)|con pin|pin thi sao|manh hon|tot hon|brand khac|hang khac|thuong hieu khac|option khac|lua chon khac|tim them|them vai mau|bo cai do|bo yeu cau do|doi y|cai thu hai|mau thu hai|may nay|mau nay|con nao|cai nao|the nao|what about|how about|that one|this one|another|more options|cheaper|lighter|battery|faster|stronger|docker)\b/;

function hasElectronicContext(message: string, context: IntentContext) {
  const requirement = context.requirements;
  if (requirement.category || context.currentSearchResultCount || context.historicalProductReferenceCount) return true;
  if (requirement.brands.length || requirement.modelIdentifiers.length || requirement.requiredSpecs.ramGB !== null) return true;
  if (context.recentMessages.some(({ intent }) => intent && !['unknown', 'greeting', 'clarification'].includes(intent))) return true;
  return context.recentMessages.some(({ content }) => {
    const parsed = parseQuery(content);
    return Boolean(parsed.category || parsed.brands.length || parsed.tags.length)
      || /\b(laptop|dien thoai|phone|chuot|mouse|tai nghe|headphone|gpu|cpu|may tinh|san pham)\b/.test(normalize(content));
  }) || CONTEXT_LINK.test(normalize(message)) && context.recentMessages.length > 0;
}

function explicitOffTopic(text: string) {
  return OFF_TOPIC.some((pattern) => pattern.test(text));
}

function mentionedCategory(text: string): string | undefined {
  const categories: Array<[string, RegExp]> = [
    ['laptop', /\b(laptop|notebook|macbook)\b/], ['phone', /\b(dien thoai|smartphone|phone|iphone)\b/],
    ['tablet', /\b(tablet|ipad|may tinh bang)\b/], ['headphone', /\b(tai nghe|headphone|earbuds|airpods)\b/],
    ['mouse', /\b(chuot|mouse)\b/], ['keyboard', /\b(ban phim|keyboard)\b/], ['monitor', /\b(monitor|man hinh)\b/],
    ['desktop', /\b(desktop|may tinh de ban|pc)\b/], ['cpu', /\b(cpu|processor)\b/], ['gpu', /\b(gpu|card man hinh|graphics card)\b/],
  ];
  return categories.find(([, pattern]) => pattern.test(text))?.[0];
}

function categoryAwareLightPhrase(category: string | null) {
  switch (category) {
    case 'laptop': return 'laptop nhẹ hơn, ưu tiên trọng lượng thấp';
    case 'mouse': return 'chuột máy tính nhẹ hơn';
    case 'headphone': return 'tai nghe nhẹ hơn';
    case 'phone': return 'điện thoại nhẹ hơn';
    default: return 'trọng lượng nhẹ hơn';
  }
}

function detectRemovalTarget(text: string, context: IntentContext): { field: string; values?: string[] } | null {
  const requirements = context.requirements;
  if (/\b(ram|bo nho ram)\b/.test(text)) return { field: 'requiredSpecs.ramGB' };
  if (/\b(storage|o cung|ssd|hdd|luu tru)\b/.test(text)) return { field: 'requiredSpecs.storageGB' };
  if (/\b(vram|gpu|card roi|card do hoa)\b/.test(text)) {
    if (/\b(loai tru|tranh|avoid|exclude)\b/.test(text)) {
      const excluded = requirements.exclusions.filter((value) => /gpu|card|do hoa/i.test(value));
      return excluded.length ? { field: 'exclusions', values: excluded } : null;
    }
    if (requirements.requiredSpecs.vramGB !== null) return { field: 'requiredSpecs.vramGB' };
    const preference = requirements.preferences.filter((value) => /gpu|card|do hoa/i.test(value));
    return preference.length ? { field: 'preferences', values: preference } : null;
  }
  if (/\b(ngan sach|gia|budget|price)\b/.test(text)) return { field: 'budget' };
  if (/\b(hang|thuong hieu|brand)\b/.test(text)) return { field: 'brands', values: requirements.brands };
  if (/\b(muc dich|nhu cau|programming|lap trinh|gaming|hoc tap)\b/.test(text)) return { field: 'purpose' };
  if (/\bmodel\b/.test(text)) return { field: 'modelIdentifiers', values: requirements.modelIdentifiers };

  const latestUser = [...context.recentMessages].reverse().find((message) => message.role === 'user');
  const previous = normalize(latestUser?.content ?? '');
  if (/\b(ram|gb ram)\b/.test(previous)) return { field: 'requiredSpecs.ramGB' };
  if (/\b(ngan sach|trieu|budget|gia|price)\b/.test(previous)) return { field: 'budget' };
  if (/\b(brand|hang|asus|lenovo|dell|hp|apple)\b/.test(previous) && requirements.brands.length) return { field: 'brands', values: requirements.brands };
  if (/\b(gpu|card roi|vram)\b/.test(previous)) return requirements.exclusions.length
    ? { field: 'exclusions', values: requirements.exclusions } : { field: 'requiredSpecs.vramGB' };
  if (/\b(pin|battery|nhe|trong luong)\b/.test(previous)) return { field: 'preferences', values: requirements.preferences.slice(-1) };

  const active = [
    requirements.requiredSpecs.ramGB !== null ? { field: 'requiredSpecs.ramGB' } : null,
    requirements.budgetMax !== null || requirements.budgetMin !== null ? { field: 'budget' } : null,
    requirements.brands.length ? { field: 'brands', values: requirements.brands } : null,
    requirements.preferences.length ? { field: 'preferences', values: requirements.preferences.slice(-1) } : null,
    requirements.exclusions.length ? { field: 'exclusions', values: requirements.exclusions.slice(-1) } : null,
  ].filter(Boolean);
  return active.length === 1 ? active[0] as { field: string; values?: string[] } : null;
}

function withoutContext(intent: ContextIntent, hasContext: boolean, confidence: number): IntentDetection {
  if (hasContext) return make(intent, confidence, true);
  return make('CONTINUE_CONSULTATION', 0.82, true, true, 'Bạn đang muốn tư vấn hoặc tìm sản phẩm nào?');
}

function make(intent: ContextIntent, confidence: number, inScope: boolean, needsClarification = false, clarificationQuestion = ''): IntentDetection {
  return { intent, confidence, inScope, needsClarification, clarificationQuestion };
}

export function detectAdvisorIntent(message: string, context: IntentContext): IntentDetection {
  const text = normalize(message);
  const hasContext = hasElectronicContext(message, context);
  if (explicitOffTopic(text)) return make('OUT_OF_SCOPE', 0.99, false);
  const parsed = parseQuery(message);
  const category = mentionedCategory(text) ?? parsed.category;
  const removeCue = /\b(bo cai|bo yeu cau|bo tieu chi|bo dieu kien|bo ngan sach|bo ram|bo card|khong khoa|xoa|khong can|khong muon|khong yeu cau|remove|no longer need|drop that)\b/;

  const ramRelaxation = context.requirements.requiredSpecs.ramGB !== null
    && /\b(khong can|khong yeu cau|no longer need|ram)\b/.test(text)
    && /\b(duoc|cung duoc|chap nhan|okay|ok)\b/.test(text)
    && [...text.matchAll(/(\d+)\s*gb\b/g)].length >= 2;
  const contextualRamRelaxation = context.requirements.requiredSpecs.ramGB !== null
    && /\b(thuc ra|actually|instead|rather)\b/.test(text)
    && /\b(duoc|cung duoc|chap nhan|okay|ok|fine)\b/.test(text)
    && [...text.matchAll(/(\d+)\s*gb\b/g)].length === 1;
  if ((ramRelaxation || contextualRamRelaxation) && hasContext) return make('MODIFY_REQUIREMENT', 0.94, true);

  if (/\b(doi y|changed my mind)\b/.test(text)) {
    return make('MODIFY_REQUIREMENT', 0.9, true, true, 'Bạn muốn thay đổi tiêu chí nào?');
  }
  if (/\b(bo cai do di|bo yeu cau do|khong can cai do|remove that|drop that requirement)\b/.test(text)) {
    const target = detectRemovalTarget(text, context);
    return target
      ? make('REMOVE_REQUIREMENT', 0.96, hasContext)
      : make('REMOVE_REQUIREMENT', 0.9, true, true, 'Bạn muốn bỏ tiêu chí nào trong yêu cầu hiện tại?');
  }
  if (removeCue.test(text)) {
    const target = detectRemovalTarget(text, context);
    if (target) return make('REMOVE_REQUIREMENT', 0.95, hasContext);
  }

  const explicitAdd = /\b(bo sung|them(?: vao)?|uu tien|add|also need)\b/.test(text);
  const parsedHasAddableField = parsed.brands.length > 0 || parsed.ram !== undefined || parsed.storageGB !== undefined
    || parsed.storageType !== undefined || parsed.vramGB !== undefined || parsed.displayInches !== undefined;
  if (explicitAdd && hasContext && parsedHasAddableField) return make('ADD_REQUIREMENT', 0.94, true);

  if (hasContext && /\b(van|giu nguyen|still keep|unchanged)\b/.test(text)) {
    const parsedPurpose = parsed.tags.map((tag) => tag.toLocaleLowerCase('vi-VN')).join(', ');
    const sameBudget = (parsed.minPrice === undefined || parsed.minPrice === context.requirements.budgetMin)
      && (parsed.maxPrice === undefined || parsed.maxPrice === context.requirements.budgetMax);
    const sameBrand = !parsed.brands.length || parsed.brands.every((brand) => context.requirements.brands.includes(brand));
    const samePurpose = !parsedPurpose || normalize(context.requirements.purpose ?? '').includes(parsedPurpose);
    if (sameBudget && sameBrand && samePurpose) return make('CONTINUE_CONSULTATION', 0.9, true);
  }

  if (/\b(tim them|them vai mau|them mau|co option khac|co lua chon khac|co lua chon nao khac|co lua chon nao tot hon|co mau nao tot hon|more products|more options|another option|show me more)\b/.test(text)) {
    return withoutContext('REQUEST_MORE_PRODUCTS', hasContext, 0.96);
  }
  if (/\b(bo sung|them tieu chi|them vao|uu tien them|add|also need)\b/.test(text) && hasContext) {
    return make('ADD_REQUIREMENT', 0.92, true);
  }

  if (/\b(so sanh|compare|khac nhau|chon giua|cai nao tot hon)\b/.test(text)
    && (hasContext || context.currentSearchResultCount > 0)) return make('COMPARE_PREVIOUS_RESULTS', 0.96, true);
  if (/\b(cai thu hai|mau thu hai|con thu hai|the second one|second one|may nay|mau nay|san pham nay|asus luc nay|luc nay|ket qua cu|mau cu|chay docker|docker|tuong thich)\b/.test(text)
    && hasContext) return make('ASK_ABOUT_PREVIOUS_PRODUCT', 0.94, true);

  if (/\b(re hon|gia mem hon|gia thap hon|cheaper|lower price|less expensive)\b/.test(text)) return withoutContext('REQUEST_CHEAPER', hasContext, 0.97);
  if (/\b(nhe hon|lighter|less weight|lightweight)\b/.test(text)) return withoutContext('REQUEST_LIGHTER', hasContext, 0.97);
  if (/\b(pin trau hon|pin lau hon|thoi luong pin|longer battery|battery life|con pin|pin thi sao)\b/.test(text)) return withoutContext('REQUEST_LONGER_BATTERY', hasContext, 0.97);
  if (/\b(manh hon|hieu nang cao hon|nhanh hon|stronger|faster|better performance|more powerful)\b/.test(text)) return withoutContext('REQUEST_BETTER_PERFORMANCE', hasContext, 0.96);
  if (/\b(thuong hieu khac|brand khac|hang khac|different brand|other brand|another brand)\b/.test(text)) return withoutContext('REQUEST_ALTERNATIVE_BRAND', hasContext, 0.96);

  if (/\b(doi sang|chuyen sang|thay bang|switch to|change to)\b/.test(text) && category && category !== context.requirements.category) {
    return { ...make('NEW_PRODUCT_SEARCH', 0.97, true), category };
  }
  if (category && ['ram', 'storage'].includes(category)
    && (!hasContext || /\b(tim|search|find|show me|looking for)\b/.test(text))) {
    return { ...make('NEW_PRODUCT_SEARCH', 0.96, true), category };
  }
  if (category && !['ram', 'storage'].includes(category) && (!hasContext || category !== context.requirements.category)) {
    return { ...make('NEW_PRODUCT_SEARCH', 0.97, true), category };
  }
  if (/\b(tim|search|looking for|show me|find me)\b/.test(text)
    && /\b(laptop|phone|dien thoai|headphone|tai nghe|chuot|mouse|cpu|gpu|may tinh)\b/.test(text)) {
    return make('NEW_PRODUCT_SEARCH', 0.94, true);
  }
  if (hasContext && (parsed.minPrice !== undefined || parsed.maxPrice !== undefined || parsed.ram !== undefined
    || parsed.storageGB !== undefined || parsed.storageType !== undefined || parsed.brands.length)) {
    return make('MODIFY_REQUIREMENT', 0.93, true);
  }
  if (/\b(doi y|doi sang|chuyen sang|thay bang|thay doi|modify|change it|change to)\b/.test(text)) {
    const explicit = Boolean(parsed.category || parsed.brands.length || parsed.maxPrice !== undefined || parsed.ram !== undefined
      || /\bmodel\b/.test(text) && /\b[a-z]{1,5}[- ]?\d{2,}[a-z0-9-]*\b/i.test(message));
    return explicit
      ? make('MODIFY_REQUIREMENT', 0.94, hasContext || Boolean(category))
      : make('MODIFY_REQUIREMENT', 0.9, true, true, 'Bạn muốn thay đổi tiêu chí nào?');
  }
  if (hasContext && CONTEXT_LINK.test(text)) return make('CONTINUE_CONSULTATION', 0.84, true);
  if (hasContext && text.length < 70) return make('CONTINUE_CONSULTATION', 0.68, true);
  return make('OUT_OF_SCOPE', 0.55, false);
}
const keep = () => ({ operation: 'KEEP', value: null });

export function createRuleAnalysis(detection: IntentDetection, message: string, previous: AdvisorRequirements, recentMessages: IntentContext['recentMessages'] = []) {
  const requirements: any = {
    category: keep(), brands: keep(), budgetMin: keep(), budgetMax: keep(), budgetFlexible: keep(),
    purpose: keep(), audience: keep(), environment: keep(), existingHardware: keep(),
    requiredSpecs: { ramGB: keep(), storageGB: keep(), storageType: keep(), vramGB: keep(), displayInches: keep() },
    preferences: keep(), exclusions: keep(), selectionCriteria: keep(), modelIdentifiers: keep(), variant: keep(),
  };
  const operation = (name: string, value: unknown = null) => ({ operation: name, value });
  if (detection.category) requirements.category = operation('REPLACE', detection.category);
  const text = normalize(message);
  switch (detection.intent) {
    case 'MODIFY_REQUIREMENT': {
      if (detection.category) requirements.category = operation('REPLACE', detection.category);
      const modelMatch = message.match(/\bmodel\s+(?:sang|thanh|la)\s+([A-Z0-9][A-Z0-9 +._-]{1,40}?)(?:[.!?,;]|$)/i);
      if (modelMatch) requirements.modelIdentifiers = operation('REPLACE', [modelMatch[1].trim().replace(/[.!?,;]+$/, '')]);
      const variantMatch = text.match(/\b(?:ban|version|variant)\s+(\d{2,4}\s*(?:gb|tb))\b/);
      if (variantMatch) requirements.variant = operation('REPLACE', [variantMatch[1].replace(/\s+/g, '').toUpperCase()]);
      break;
    }
    case 'REQUEST_LIGHTER':
      requirements.preferences = operation('ADD', [categoryAwareLightPhrase(previous.category)]);
      break;
    case 'REQUEST_CHEAPER':
      requirements.selectionCriteria = operation('ADD', ['giá thấp hơn các lựa chọn trước']);
      break;
    case 'REQUEST_LONGER_BATTERY':
      requirements.preferences = operation('ADD', ['thời lượng pin lâu hơn']);
      break;
    case 'REQUEST_BETTER_PERFORMANCE':
      requirements.preferences = operation('ADD', ['hiệu năng mạnh hơn']);
      break;
    case 'REQUEST_ALTERNATIVE_BRAND':
      if (previous.brands.length) requirements.brands = operation('REMOVE', previous.brands);
      break;
    case 'REMOVE_REQUIREMENT': {
      const target = detectRemovalTarget(text, { requirements: previous, currentSearchResultCount: 0, historicalProductReferenceCount: 0, recentMessages });
      if (target?.field === 'budget') {
        requirements.budgetMin = operation('REMOVE'); requirements.budgetMax = operation('REMOVE');
        requirements.budgetFlexible = operation('REMOVE');
      } else if (target?.field === 'brands') requirements.brands = operation('REMOVE', target.values ?? previous.brands);
      else if (target?.field === 'exclusions') requirements.exclusions = operation('REMOVE', target.values ?? null);
      else if (target?.field === 'preferences') requirements.preferences = operation('REMOVE', target.values ?? null);
      else if (target?.field === 'requiredSpecs.ramGB') requirements.requiredSpecs.ramGB = operation('REMOVE');
      else if (target?.field === 'requiredSpecs.storageGB') {
        requirements.requiredSpecs.storageGB = operation('REMOVE'); requirements.requiredSpecs.storageType = operation('REMOVE');
      } else if (target?.field === 'requiredSpecs.vramGB') requirements.requiredSpecs.vramGB = operation('REMOVE');
      else if (target?.field === 'modelIdentifiers') requirements.modelIdentifiers = operation('REMOVE', target.values ?? null);
      else if (target?.field === 'purpose') requirements.purpose = operation('REMOVE');
      break;
    }
    case 'ADD_REQUIREMENT': {
      const parsed = parseQuery(message);
      if (parsed.brands.length) requirements.brands = operation('ADD', parsed.brands);
      if (parsed.ram !== undefined) requirements.requiredSpecs.ramGB = operation('REPLACE', parsed.ram);
      if (parsed.storageGB !== undefined) requirements.requiredSpecs.storageGB = operation('REPLACE', parsed.storageGB);
      if (parsed.storageType !== undefined) requirements.requiredSpecs.storageType = operation('REPLACE', parsed.storageType);
      if (parsed.vramGB !== undefined) requirements.requiredSpecs.vramGB = operation('REPLACE', parsed.vramGB);
      if (parsed.displayInches !== undefined) requirements.requiredSpecs.displayInches = operation('REPLACE', parsed.displayInches);
      const variantMatch = text.match(/\b(?:ban|version|variant)\s+(\d{2,4}\s*(?:gb|tb))\b/);
      if (variantMatch) requirements.variant = operation('REPLACE', [variantMatch[1].replace(/\s+/g, '').toUpperCase()]);
      const purposeMatch = /\b(?:uu tien|add|them).{0,50}\b(?:chay docker|docker|lap trinh|programming|coding|code)\b/.test(text);
      if (purposeMatch && /\bdocker\b/.test(text)) requirements.purpose = operation('REPLACE', 'programming');
      if (!parsed.brands.length && parsed.ram === undefined && parsed.storageGB === undefined && parsed.storageType === undefined
        && parsed.vramGB === undefined && parsed.displayInches === undefined && !variantMatch && !purposeMatch) {
        requirements.preferences = operation('ADD', [message.trim().slice(0, 100)]);
      }
      break;
    }
  }
  const legacyIntent: AdvisorIntent = detection.intent === 'OUT_OF_SCOPE' ? 'unknown'
    : detection.intent === 'COMPARE_PREVIOUS_RESULTS' ? 'product_comparison'
      : detection.intent === 'ASK_ABOUT_PREVIOUS_PRODUCT' || detection.intent === 'CONTINUE_CONSULTATION' ? 'follow_up'
        : detection.intent === 'REQUEST_CHEAPER' || detection.intent === 'REQUEST_LIGHTER' || detection.intent === 'REQUEST_LONGER_BATTERY' || detection.intent === 'REQUEST_BETTER_PERFORMANCE' ? 'purchase_advice'
          : detection.intent === 'NEW_PRODUCT_SEARCH' || detection.intent === 'REQUEST_MORE_PRODUCTS' ? 'product_search'
            : 'product_consultation';
  return { intent: legacyIntent, inScope: detection.inScope, requirements };
}
