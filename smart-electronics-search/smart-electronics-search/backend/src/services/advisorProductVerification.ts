import { validExternalUrl } from './accesstradeSync';
import { parseQuery } from './queryParser';
import { normalize } from '../utils/text';

export const PRICE_FRESHNESS_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export function safeAdvisorProductUrl(value: unknown) {
  return validExternalUrl(value);
}

export type PriceEvidenceStatus = 'current_verified' | 'historical' | 'reference' | 'expired' | 'unknown';
export type RequirementStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

function usableDate(value: unknown): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function classifyAdvisorPrice(offer: any, now = new Date()) {
  if (!offer || typeof offer.price !== 'number' || !Number.isFinite(offer.price) || offer.price <= 0) {
    return { status: 'unknown' as const, observedAt: null, currentPrice: null, url: null };
  }
  const status = offer.priceVerificationStatus;
  const verified = offer.verified === true && status === 'verified';
  const observed = usableDate(offer.sourceRetrievedAt) ?? usableDate(offer.verifiedAt) ?? usableDate(offer.lastUpdated);
  const url = validExternalUrl(offer.productUrl);
  if (status === 'rejected') return { status: 'expired' as const, observedAt: observed?.toISOString() ?? null, currentPrice: null, url };
  if (!verified || String(offer.currency ?? '').toUpperCase() !== 'VND' || !url) {
    return { status: 'reference' as const, observedAt: observed?.toISOString() ?? null, currentPrice: null, url };
  }
  if (!observed || observed.getTime() > now.getTime() + 5 * 60 * 1000) {
    return { status: 'unknown' as const, observedAt: observed?.toISOString() ?? null, currentPrice: null, url };
  }
  if (now.getTime() - observed.getTime() > PRICE_FRESHNESS_DAYS * DAY_MS) {
    return { status: 'historical' as const, observedAt: observed.toISOString(), currentPrice: null, url };
  }
  return { status: 'current_verified' as const, observedAt: observed.toISOString(), currentPrice: offer.price, url };
}

export function advisorCurrentOffer(offers: any[], now = new Date()) {
  const eligible = offers
    .map((offer) => ({ offer, evidence: classifyAdvisorPrice(offer, now) }))
    .filter(({ evidence }) => evidence.status === 'current_verified')
    .sort((a, b) => Number(a.offer.price) - Number(b.offer.price));
  if (!eligible.length) return null;
  const { offer, evidence } = eligible[0];
  return {
    ...offer,
    price: evidence.currentPrice,
    currency: 'VND',
    productUrl: evidence.url,
    observedAt: evidence.observedAt,
    priceStatus: evidence.status,
    verified: true,
    priceVerificationStatus: 'verified',
  };
}

export function advisorOfferForVariant(offers: any[], requestedVariants: string[], now = new Date()) {
  const candidates = requestedVariants.length
    ? offers.filter((offer) => requestedVariants.some((variant) => normalize(String(offer.variantLabel ?? '')).includes(normalize(variant))))
    : offers;
  return advisorCurrentOffer(candidates, now);
}

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const match = value.match(/\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(',', '.')) : null;
}

function specValue(product: any, key: string) {
  return product.normalizedSpecs?.[key]
    ?? product.specs?.[key]
    ?? product.specifications?.[key]
    ?? product.specifications?.[key.toUpperCase()]
    ?? null;
}

function sourceUrls(product: any, type: 'identity' | 'spec' | 'price' = 'identity') {
  const evidence = Array.isArray(product.sourceEvidence) ? product.sourceEvidence : [];
  const matches = evidence
    .filter((item: any) => {
      const kind = normalize(String(item.evidenceType ?? ''));
      if (type === 'spec') return /spec|technical|manufacturer|product/.test(kind);
      return /product|model|catalog|manufacturer|retailer/.test(kind);
    })
    .map((item: any) => validExternalUrl(item.sourceUrl))
    .filter((url: string | null): url is string => Boolean(url));
  if (type === 'price') return [];
  const fallback = type === 'spec' ? product.specificationSourceUrl : product.productUrl;
  const validFallback = validExternalUrl(fallback);
  return [...new Set([...matches, ...(validFallback ? [validFallback] : [])])];
}

function canonicalCategory(value: unknown) {
  const category = normalize(String(value ?? ''));
  if (['phone', 'smartphone', 'dien thoai'].includes(category)) return 'phone';
  if (['headphones', 'headphone', 'earphones', 'tai nghe'].includes(category)) return 'headphone';
  return category;
}

function verifiedImageUrl(value: unknown) {
  return validExternalUrl(value)
    ?? (typeof value === 'string' && /^\/catalog-images\/[a-z0-9][a-z0-9._-]*\.(?:jpg|jpeg|png|webp)$/i.test(value) ? value : null);
}

function criterion(key: string, label: string, status: RequirementStatus, weight: number, required: boolean, expected: unknown, actual: unknown, evidenceUrls: string[]) {
  return { key, label, status, weight, required, expected: expected ?? null, actual: actual ?? null, sourceUrls: evidenceUrls };
}

export function evaluateVerifiedAdvisorFit(product: any, requirements: any, now = new Date()) {
  const criteria: ReturnType<typeof criterion>[] = [];
  const identitySources = sourceUrls(product, 'identity');
  const productStatus = product.verified === true && product.publicationStatus === 'published'
    && (product.productVerificationStatus == null || product.productVerificationStatus === 'verified')
    && (product.urlVerificationStatus == null || product.urlVerificationStatus === 'verified');
  criteria.push(criterion('catalog_verification', 'Verified catalog record', productStatus ? 'PASS' : 'FAIL', 10, true, 'verified and published', productStatus ? 'verified and published' : 'not verified or unpublished', identitySources));

  if (requirements.category) {
    const actual = text(product.category);
    const matches = canonicalCategory(actual) === canonicalCategory(requirements.category);
    criteria.push(criterion('category', 'Category', actual ? (matches ? 'PASS' : 'FAIL') : 'UNKNOWN', 20, true, requirements.category, actual || null, identitySources));
  }
  if (requirements.brands?.length) {
    const actual = text(product.brand || product.normalizedBrand);
    const normalizedBrand = normalize(actual);
    const matches = requirements.brands.some((brand: string) => {
      const wanted = normalize(brand);
      return normalizedBrand === wanted || normalizedBrand.startsWith(`${wanted} `);
    });
    criteria.push(criterion('brand', 'Brand', actual ? (matches ? 'PASS' : 'FAIL') : 'UNKNOWN', 10, true, requirements.brands, actual || null, identitySources));
  }
  if (requirements.modelIdentifiers?.length) {
    const actual = [product.model, product.modelNumber, product.normalizedModel, product.normalizedModelNumber].filter(Boolean).map(String);
    const matching = requirements.modelIdentifiers.some((wanted: string) => actual.some((value: string) => normalize(value) === normalize(wanted)));
    const status = !actual.length ? 'UNKNOWN' : matching ? 'PASS' : 'FAIL';
    criteria.push(criterion('model', 'Model', status, 15, true, requirements.modelIdentifiers, actual, identitySources));
  }

  const hasBudget = requirements.budgetMin != null || requirements.budgetMax != null;
  const offer = product.bestOffer;
  const priceEvidence = classifyAdvisorPrice(offer, now);
  let budgetStatus: 'within_budget' | 'over_budget' | 'price_unknown' | 'not_specified' = 'not_specified';
  if (hasBudget) {
    const price = priceEvidence.currentPrice;
    const inBudget = price !== null && (requirements.budgetMin == null || price >= requirements.budgetMin)
      && (requirements.budgetMax == null || price <= requirements.budgetMax);
    budgetStatus = price === null ? 'price_unknown' : inBudget ? 'within_budget' : 'over_budget';
    criteria.push(criterion('budget', 'Budget', price === null ? 'UNKNOWN' : inBudget ? 'PASS' : 'FAIL', 25, true,
      { min: requirements.budgetMin ?? null, max: requirements.budgetMax ?? null }, price, priceEvidence.url ? [priceEvidence.url] : []));
  }

  const useCase = [requirements.purpose, ...(requirements.preferences ?? []), ...(requirements.selectionCriteria ?? [])].filter(Boolean).join(' ');
  if (useCase) {
    const productText = normalize([
      ...(product.tags ?? []), ...(product.reasons ?? []), product.description,
      ...Object.values(product.specs ?? {}), ...Object.values(product.specifications ?? {}),
    ].filter(Boolean).join(' '));
    const needles = normalize(useCase).split(' ').filter((word: string) => word.length > 2);
    const expectedTags = parseQuery(useCase).tags.map((tag) => normalize(tag));
    const actualTags = (product.tags ?? []).map((tag: string) => normalize(String(tag)));
    const reasonText = normalize((product.reasons ?? []).join(' '));
    const matched = expectedTags.length
      ? expectedTags.every((tag) => actualTags.includes(tag) || reasonText.includes(tag))
      : needles.some((word: string) => productText.includes(word));
    criteria.push(criterion('purpose', 'Use case', matched ? 'PASS' : 'UNKNOWN', 20, Boolean(requirements.purpose), useCase, matched ? 'catalog text match' : null, identitySources));
  }

  const productEvidenceText = normalize([
    ...(product.tags ?? []), ...(product.reasons ?? []), product.description,
    ...Object.values(product.specs ?? {}), ...Object.values(product.specifications ?? {}),
  ].filter(Boolean).join(' '));
  for (const [key, label, required, weight] of [
    ['audience', 'Audience', false, 5], ['environment', 'Environment', false, 5],
    ['existingHardware', 'Compatibility with existing hardware', true, 20],
  ] as const) {
    const expected = requirements[key];
    if (!expected) continue;
    const phrase = normalize(String(expected));
    const supported = phrase.length > 2 && productEvidenceText.includes(phrase);
    criteria.push(criterion(key, label, supported ? 'PASS' : 'UNKNOWN', weight, required, expected, supported ? expected : null, [...identitySources, ...sourceUrls(product, 'spec')]));
  }
  for (const [key, label] of [
    ...((requirements.preferences ?? []).map((value: string) => [`preference_${normalize(value).replace(/\s+/g, '_')}`, `Preference: ${value}`, value] as const)),
    ...((requirements.selectionCriteria ?? []).map((value: string) => [`selection_${normalize(value).replace(/\s+/g, '_')}`, `Selection criterion: ${value}`, value] as const)),
  ] as const) {
    const phrase = normalize(String(label).replace(/^(?:Preference|Selection criterion):\s*/, ''));
    const supported = phrase.length > 2 && productEvidenceText.includes(phrase);
    criteria.push(criterion(key, label.replace(/^(?:Preference|Selection criterion):\s*/, ''), supported ? 'PASS' : 'UNKNOWN', 5, false, phrase, supported ? phrase : null, [...identitySources, ...sourceUrls(product, 'spec')]));
  }

  const specs = requirements.requiredSpecs ?? {};
  const specDefinitions = [
    ['ramGB', 'RAM', 'min'], ['storageGB', 'Storage', 'min'], ['storageType', 'Storage type', 'equal'],
    ['vramGB', 'VRAM', 'min'], ['displayInches', 'Display size', 'equal'],
  ] as const;
  const activeSpecs = specDefinitions.filter(([key]) => specs[key] != null);
  const specWeight = activeSpecs.length ? 25 / activeSpecs.length : 0;
  const missingSpecifications: string[] = [];
  for (const [key, label, comparison] of activeSpecs) {
    const expected = specs[key];
    const actual = specValue(product, key);
    let status: RequirementStatus = 'UNKNOWN';
    if (actual != null) {
      if (comparison === 'equal' && key === 'storageType') {
        const normalizedActual = normalize(String(actual));
        status = expected === 'ssd'
          ? (['ssd', 'nvme', 'solid state drive'].some((type) => normalizedActual.includes(type)) ? 'PASS' : 'FAIL')
          : (normalizedActual.includes(normalize(String(expected))) ? 'PASS' : 'FAIL');
      } else {
        const actualNumber = numericValue(actual);
        const expectedNumber = numericValue(expected);
        if (actualNumber !== null && expectedNumber !== null) {
          status = comparison === 'min'
            ? (actualNumber >= expectedNumber ? 'PASS' : 'FAIL')
            : (Math.abs(actualNumber - expectedNumber) <= 0.75 ? 'PASS' : 'FAIL');
        }
      }
    }
    if (status === 'UNKNOWN') missingSpecifications.push(key);
    criteria.push(criterion(`spec_${key}`, label, status, specWeight, true, expected, actual, sourceUrls(product, 'spec')));
  }

  for (const exclusion of requirements.exclusions ?? []) {
    const raw = normalize(String(exclusion)).replace(/^(?:khong can|khong muon|khong lay|tranh|without|avoid|no)\s+/, '').trim();
    const searchable = normalize([
      product.name, product.brand, product.model, product.modelNumber, product.category, product.description,
      ...(product.tags ?? []), ...Object.values(product.specs ?? {}), ...Object.values(product.specifications ?? {}),
    ].filter(Boolean).join(' '));
    const words = raw.split(' ').filter((word: string) => word.length > 2);
    const found = raw.length >= 3 && (` ${searchable} `.includes(` ${raw} `) || (words.length > 0 && words.every((word: string) => ` ${searchable} `.includes(` ${word} `))));
    criteria.push(criterion(`exclude_${normalize(String(exclusion)).replace(/\s+/g, '_')}`, `Exclude ${exclusion}`, found ? 'FAIL' : 'UNKNOWN', 10, true, `must not contain ${exclusion}`, found ? 'found in verified catalog fields' : null, [...identitySources, ...sourceUrls(product, 'spec')]));
  }

  const requestedVariants = requirements.variant ?? [];
  if (requestedVariants.length) {
    const actualVariants = [offer?.variantLabel, ...(product.variants ?? []).flatMap((variant: any) => [variant.name, variant.modelNumber, variant.sku])].filter(Boolean).map(String);
    const match = requestedVariants.some((wanted: string) => actualVariants.some((value: string) => normalize(value).includes(normalize(wanted))));
    criteria.push(criterion('variant', 'Product variant', actualVariants.length ? (match ? 'PASS' : 'FAIL') : 'UNKNOWN', 15, true, requestedVariants, actualVariants, identitySources));
  }

  const totalWeight = criteria.reduce((sum, item) => sum + item.weight, 0);
  const earnedWeight = criteria.reduce((sum, item) => sum + (item.status === 'PASS' ? item.weight : 0), 0);
  const score = totalWeight ? Math.round(earnedWeight / totalWeight * 100) : 0;
  const dataConfidence = criteria.length
    ? Math.round(criteria.filter((item) => item.status !== 'UNKNOWN' && item.sourceUrls.length > 0).length / criteria.length * 100)
    : 0;
  const failed = criteria.some((item) => item.required && item.status === 'FAIL');
  const unknownRequired = criteria.some((item) => item.required && item.status === 'UNKNOWN');
  const matchingStatus = failed ? 'not_matching' : unknownRequired ? 'incomplete' : 'fully_matching';
  const unmetRequirements = criteria.filter((item) => item.required && item.status !== 'PASS').map((item) => ({ key: item.key, label: item.label, status: item.status, expected: item.expected, actual: item.actual }));
  const reasons = criteria.map((item) => {
    if (item.key === 'budget' && item.status === 'PASS') return 'Giá đã xác minh hiện hành nằm trong ngân sách.';
    if (item.key === 'budget' && item.status === 'FAIL') return 'Giá đã xác minh hiện hành nằm ngoài ngân sách.';
    if (item.key === 'budget' && item.status === 'UNKNOWN') return 'Chưa có giá hiện hành được xác minh để đối chiếu ngân sách.';
    if (item.status === 'PASS') return `${item.label}: đã xác minh và đáp ứng.`;
    if (item.status === 'FAIL') return `${item.label}: dữ liệu xác minh không đáp ứng yêu cầu.`;
    return `${item.label}: catalog hiện chưa có đủ dữ liệu để xác minh.`;
  });
  return {
    score, matchScore: score, dataConfidence, criteria, matchingStatus, fullyMatching: matchingStatus === 'fully_matching',
    reasons: [...new Set(reasons)].slice(0, 8), budgetStatus, priceEvidence,
    unmetRequirements, missingSpecifications,
  };
}

export function buildVerifiedAdvisorProductContext(product: any) {
  const fit = product.advisorFit ?? {};
  const classifiedPrice = classifyAdvisorPrice(product.bestOffer);
  const price = product.bestOffer ? classifiedPrice : {
    ...classifiedPrice,
    status: product.priceEvidence?.status ?? classifiedPrice.status,
    observedAt: product.priceEvidence?.observedAt ?? classifiedPrice.observedAt,
  };
  const specs = { ...(product.specs ?? {}), ...(product.specifications ?? {}), ...(product.normalizedSpecs ?? {}) };
  const specificationSources = sourceUrls(product, 'spec');
  const verifiedSpecs = Object.fromEntries(Object.entries(specs)
    .filter(([, value]) => value != null && ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 30)
    .map(([key, value]) => [key, { value, sourceUrls: specificationSources }]));
  return {
    productId: String(product._id), canonicalName: product.name, brand: product.brand ?? null,
    model: product.model ?? product.modelNumber ?? null, category: product.category ?? null,
    verification: {
      product: product.productVerificationStatus ?? (product.verified === true ? 'verified' : 'unknown'),
      url: product.urlVerificationStatus ?? 'unknown', image: product.imageVerificationStatus ?? 'unknown',
    },
    specifications: verifiedSpecs, specificationSources,
    price: {
      status: price.status, amount: price.status === 'current_verified' ? price.currentPrice : null,
      currency: price.status === 'current_verified' ? 'VND' : null,
      observedAt: price.observedAt, merchant: price.status === 'current_verified' ? product.bestOffer?.sellerName ?? null : null,
      productUrl: price.status === 'current_verified' ? price.url : null,
      verificationStatus: price.status === 'current_verified' ? 'verified' : price.status,
      variantLabel: price.status === 'current_verified' ? product.bestOffer?.variantLabel ?? null : null,
      referencePrice: product.bestOffer?.originalPrice > 0 ? {
        amount: price.status === 'current_verified' ? product.bestOffer.originalPrice : null,
        status: 'reference', currency: price.status === 'current_verified' ? 'VND' : null,
        observedAt: price.observedAt, merchant: price.status === 'current_verified' ? product.bestOffer?.sellerName ?? null : null,
        productUrl: price.status === 'current_verified' ? price.url : null,
      } : null,
    },
    productUrl: validExternalUrl(product.productUrl),
    imageUrl: product.imageVerificationStatus === 'verified' && product.imageUsagePermission === 'granted'
      ? verifiedImageUrl(product.imageUrl) : null,
    matchingStatus: fit.matchingStatus ?? 'incomplete', matchScore: fit.matchScore ?? fit.score ?? null,
    dataConfidence: fit.dataConfidence ?? 0, matchingReasons: fit.reasons ?? [],
    unmetRequirements: fit.unmetRequirements ?? [], missingSpecifications: fit.missingSpecifications ?? [],
  };
}

function numericTokens(value: string) {
  return [...value.matchAll(/(?<![A-Za-z])\d[\d.,]*(?![A-Za-z])/g)].map(([token]) => token.replace(/[.,]/g, ''));
}

function normalizedClaimNumber(raw: string, unit: string) {
  const value = Number(raw.replace(/,/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, ''));
  if (!Number.isFinite(value)) return null;
  const normalizedUnit = normalize(unit);
  if (['trieu', 'tr'].includes(normalizedUnit)) return value * 1_000_000;
  if (normalizedUnit === 'ty') return value * 1_000_000_000;
  return value;
}

function numberedClaimsAreSupported(generatedText: string, products: any[]) {
  const pattern = /(RAM|VRAM|SSD|storage|lưu trữ|màn hình|display|trọng lượng|weight|pin|battery|giá|price)(?:[^\d.!?\n]{0,24})?(\d[\d.,]*)(?:\s*(GB|TB|inch|in|kg|g|h|giờ|triệu|tr|tỷ|ty|VND|đ))?/gi;
  for (const match of generatedText.matchAll(pattern)) {
    const label = normalize(match[1]);
    const number = normalizedClaimNumber(match[2], match[3] ?? '');
    if (number === null) return false;
    if (label === 'gia' || label === 'price') {
      const prefix = normalize(generatedText.slice(Math.max(0, (match.index ?? 0) - 24), match.index));
      const referenceClaim = /gia goc|gia niem yet|reference/.test(prefix);
      const prices = products.flatMap((product) => [
        product.price?.status === 'current_verified' ? product.price.amount : null,
        referenceClaim && product.price?.referencePrice?.status === 'reference' ? product.price.referencePrice.amount : null,
      ]).filter((value) => typeof value === 'number');
      if (!prices.some((price) => price === number)) return false;
      continue;
    }
    const relatedSpecs = products.flatMap((product) => Object.entries(product.specifications ?? [])
      .filter(([key]) => {
        const normalizedKey = normalize(key);
        if (label === 'ram') return normalizedKey.includes('ram') && !normalizedKey.includes('vram');
        if (label === 'vram') return normalizedKey.includes('vram');
        if (['ssd', 'storage', 'luu tru'].includes(label)) return /storage|ssd|luu tru/.test(normalizedKey);
        if (['man hinh', 'display'].includes(label)) return /display|screen|man hinh/.test(normalizedKey);
        if (['pin', 'battery'].includes(label)) return /battery|pin/.test(normalizedKey);
        return /weight|trong luong/.test(normalizedKey);
      })
      .map(([, entry]: any) => numericTokens(String(entry?.value ?? '')).map(Number))
      .flat());
    if (!relatedSpecs.some((actual) => actual === number)) return false;
  }
  const unitPattern = /(\d[\d.,]*)\s*(GB|TB|GHz|MHz|inch|inches|in|kg|g|mAh|Wh|hours?|h|Hz|MP|W|V|VND|đ|triệu|tr|tỷ|ty)\b/gi;
  const factText = normalize(JSON.stringify(products.map((product) => ({ specs: product.specifications, price: product.price }))));
  for (const match of generatedText.matchAll(unitPattern)) {
    const number = normalizedClaimNumber(match[1], match[2]);
    if (number === null) return false;
    const unit = normalize(match[2]);
    if (['vnd', 'd', 'trieu', 'tr', 'ty'].includes(unit)) {
      const hasCurrentPrice = products.some((product) => product.price?.status === 'current_verified' && product.price.amount === number);
      const hasReferencePrice = /gia goc|gia niem yet|reference/i.test(generatedText.slice(Math.max(0, (match.index ?? 0) - 24), match.index))
        && products.some((product) => product.price?.referencePrice?.amount === number);
      if (!hasCurrentPrice && !hasReferencePrice) return false;
      continue;
    }
    if (!factText.includes(normalize(`${match[1]} ${match[2]}`))) return false;
  }
  return true;
}

export function validateGeneratedAdvisorAnswer(answer: any, contextProducts: any[], requirements: any, latestMessage: string) {
  if (!answer || typeof answer.reply !== 'string' || !answer.reply.trim() || !Array.isArray(answer.productIds)
    || answer.productIds.length > 5 || !Array.isArray(answer.suggestedQuestions) || answer.suggestedQuestions.length > 3
    || answer.suggestedQuestions.some((question: unknown) => typeof question !== 'string' || question.length > 120)
    || typeof answer.needsClarification !== 'boolean') return false;
  const allowedIds = new Set(contextProducts.map((product) => String(product.productId)));
  if (answer.productIds.some((id: unknown) => typeof id !== 'string' || !allowedIds.has(id))) return false;
  const generatedText = [answer.reply, ...answer.suggestedQuestions].join(' ');
  if (/https?:\/\/|www\./i.test(generatedText)) return false;
  const allowedNumbers = new Set([...numericTokens(JSON.stringify({ contextProducts, requirements, latestMessage })), ...numericTokens(String(contextProducts.length))]);
  if (numericTokens(generatedText).some((number) => !allowedNumbers.has(number))) return false;
  if (!numberedClaimsAreSupported(generatedText, contextProducts)) return false;
  const compatibilityClaim = /tương thích|compatible|chạy được|chạy docker|dùng được với|phù hợp với|làm việc (?:tốt )?với|\b(?:can\s+)?run(?:s)?\s+\w+|\bworks? with\b|\bsupports?\s+\w+|hỗ trợ (?:docker|windows|linux|macos|blender|4k|usb-c|thunderbolt)/i.test(generatedText);
  if (compatibilityClaim) {
    const verifiedText = normalize(JSON.stringify(contextProducts.map((product) => product.specifications)));
    const claimTerms = normalize(generatedText).split(' ').filter((word) => ['docker', 'windows', 'linux', 'macos', 'thunderbolt', 'wifi', 'bluetooth', 'blender', '4k', 'usb-c'].includes(word));
    if (!claimTerms.length || !claimTerms.every((term) => verifiedText.includes(term))) return false;
  }
  if (/phù hợp hoàn toàn|fully matching|đáp ứng tất cả/i.test(generatedText)
    && contextProducts.some((product) => product.matchingStatus !== 'fully_matching')) return false;
  if (/giá (?:đã )?xác minh|verified price/i.test(generatedText)
    && contextProducts.some((product) => product.price?.status !== 'current_verified')) return false;
  return true;
}
