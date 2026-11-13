import { Product } from '../models/Product';
import { ProductSearchVector } from '../models/ProductSearchVector';
import { Offer } from '../models/Offer';
import { TechApiCatalogRecord } from '../models/TechApiCatalogRecord';
import { CATEGORIES, TAGS, BRANDS } from './dictionary';
import { ParsedQuery, SortMode, parseQuery } from './queryParser';
import { understandQuery } from './queryUnderstanding';
import { embedQuery } from './productEmbeddings';
import { escapeRegex, normalize } from '../utils/text';
import { CANONICAL_CATEGORY_KEYS, CATEGORY_ALIASES } from './taxonomy';
import { advisorCurrentOffer, classifyAdvisorPrice } from './advisorProductVerification';
import { recordAdvisorPhase } from './advisorPerformance';
import { techApiImageReference } from './techApiCatalog';

type Filter = Record<string, any>;
type RankChannel = 'exact' | 'keyword' | 'semantic';
type RankList = { channel: RankChannel; weight: number; ids: string[] };
export type SearchMode = 'hybrid' | 'exact' | 'keyword' | 'semantic';
const CANDIDATE_LIMIT = 120;
const ELECTRONIC_CATEGORIES = CANONICAL_CATEGORY_KEYS;
const VECTOR_INDEX_NAME = process.env.MONGODB_VECTOR_SEARCH_INDEX?.trim() || 'product_embedding_vector_index';
const LOCAL_ONLY_IMAGE_FILTER = process.env.SERVE_LOCAL_ONLY_IMAGES === 'true' || process.env.NODE_ENV !== 'production'
  ? [{
    imageVerificationStatus: 'pending', imageUsagePermission: 'not_provided', localOnlyAsset: true,
    imageUrl: { $regex: '^/catalog-images/[a-z0-9][a-z0-9._-]*\\.(jpg|jpeg|png|webp)$', $options: 'i' },
  }]
  : [];

const TECHAPI_CATEGORIES: Record<string, string[]> = {
  laptop: ['laptop'], phone: ['smartphone'], tablet: ['tablet'], smartwatch: ['smartwatch'],
  cpu: ['cpu'], gpu: ['gpu'], monitor: ['monitor'], soc: ['soc'],
};

function discoverySpecificationHighlights(raw: Record<string, any>) {
  const ignored = /^(id|slug|name|manufacturer|brand|release_date|verified|source_urls|.*url.*|.*image.*|.*logo.*|.*price.*|.*msrp.*|score|created_at|updated_at|.*_license|.*_attribution)$/i;
  const values: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (ignored.test(key)) continue;
    const label = key.replace(/_/g, ' ');
    if (value === null || value === undefined) continue;
    if (['string', 'number', 'boolean'].includes(typeof value)) values.push(`${label}: ${String(value)}`);
    else if (Array.isArray(value) && value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) values.push(`${label}: ${value.join(', ')}`);
    else if (typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        if (childValue === null || childValue === undefined || !['string', 'number', 'boolean'].includes(typeof childValue)) continue;
        values.push(`${label} ${childKey.replace(/_/g, ' ')}: ${String(childValue)}`);
      }
    }
    if (values.length >= 8) break;
  }
  return values.slice(0, 8);
}

function discoverySourceUrls(raw: Record<string, any>) {
  if (!Array.isArray(raw.source_urls)) return [];
  return [...new Set(raw.source_urls.filter((value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    try { return new URL(value).protocol === 'https:'; } catch { return false; }
  }))].slice(0, 5);
}

function searchableProductText(product: any) {
  return normalize([
    product.name, product.brand, product.category, product.description,
    ...(product.tags ?? []), ...Object.values(product.specs ?? {}), ...Object.values(product.normalizedSpecs ?? {}),
    ...(product.aliases ?? []), product.searchText,
  ].filter(Boolean).join(' '));
}

function productMatchesTag(product: any, tag: string, searchText = searchableProductText(product)) {
  if ((product.tags ?? []).includes(tag)
    || (TAGS[tag]?.terms ?? []).some((term) => term.length > 2 && ` ${searchText} `.includes(` ${term} `))) return true;

  if (tag === 'gaming' || tag === 'design') {
    const gpuText = normalize([
      product.normalizedSpecs?.gpuModel, product.specs?.gpu, product.specifications?.gpu,
      product.specifications?.graphics, product.specifications?.['Graphics Processor'],
    ].filter(Boolean).join(' '));
    return /\b(rtx|gtx|radeon rx|rx \d{3,}|arc a\d{3,})\b/.test(gpuText);
  }
  if (tag === 'programming') {
    // A coding suitability signal is derived only from stored hardware facts.
    return product.category === 'laptop'
      && Number(product.normalizedSpecs?.ramGB ?? product.specs?.ram ?? 0) >= 16
      && Boolean(product.normalizedSpecs?.cpuModel ?? product.specs?.cpu);
  }
  return false;
}

async function findTechApiDiscovery(p: ParsedQuery, limit: number) {
  const categories = p.category ? TECHAPI_CATEGORIES[p.category] : ['laptop', 'smartphone', 'tablet', 'smartwatch', 'cpu', 'gpu', 'monitor', 'soc'];
  if (!categories?.length) return [];
  const brandTerms = [...new Set([
    ...p.brands.flatMap((brand) => [brand, ...(BRANDS[brand] ?? [])]),
  ])].sort((a, b) => b.length - a.length);
  const queryTerms = [...new Set([
    ...p.keywords.filter((term) => term.length > 1),
  ])];
  if (!queryTerms.length && !brandTerms.length) return [];
  const filter: Record<string, any> = { sourceCategory: { $in: categories } };
  if (queryTerms.length) filter.$and = queryTerms.map((term) => ({ $or: [
    { name: { $regex: escapeRegex(term), $options: 'i' } },
    { searchText: { $regex: escapeRegex(term), $options: 'i' } },
  ] }));
  if (brandTerms.length) {
    const brandPattern = brandTerms.map(escapeRegex).join('|');
    filter.$and ??= [];
    filter.$and.push({ $or: [
      { name: { $regex: brandPattern, $options: 'i' } },
      { 'raw.manufacturer': { $regex: brandPattern, $options: 'i' } },
      { 'raw.manufacturer.name': { $regex: brandPattern, $options: 'i' } },
      { 'raw.brand': { $regex: brandPattern, $options: 'i' } },
    ] });
  }
  const refs = await TechApiCatalogRecord.find({
    ...filter,
  }).select('sourceCategory sourceSlug name sourceRecordUrl dataAttribution dataSourceUrl dataLicense dataLicenseUrl searchText raw').limit(500).lean() as any[];
  const ranked = refs.map((item) => {
    const name = normalize(item.name);
    const searchableText = normalize([item.name, item.searchText].filter(Boolean).join(' '));
    const keywordHits = p.keywords.filter((term) => searchableText.includes(term));
    const rawManufacturer = typeof item.raw?.manufacturer === 'string'
      ? item.raw.manufacturer
      : item.raw?.manufacturer?.name ?? item.raw?.brand?.name ?? item.raw?.brand;
    const manufacturer = normalize([rawManufacturer].filter(Boolean).join(' '));
    const brandHits = p.brands.filter((brand) => [brand, ...(BRANDS[brand] ?? [])].map(normalize)
      .some((term) => term && (` ${name} `.includes(` ${term} `) || ` ${manufacturer} `.includes(` ${term} `))));
    if ((p.keywords.length > 0 && keywordHits.length !== p.keywords.length) || (p.brands.length > 0 && !brandHits.length)) return null;
    return { item, score: keywordHits.length * 5 + brandHits.length * 4 + (p.category ? 3 : 0) + (item.raw?.verified === true ? 0.25 : 0) };
  }).filter((row): row is { item: any; score: number } => row !== null).sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  const seen = new Set<string>();
  return ranked.flatMap(({ item, score }) => {
    const key = normalize(item.name);
    if (seen.has(key)) return [];
    seen.add(key);
    const raw = item.raw ?? {};
    const rawBrand = typeof raw.manufacturer === 'string' ? raw.manufacturer : raw.manufacturer?.name ?? raw.brand?.name ?? raw.brand;
    const brandLabels: Record<string, string> = { amd: 'AMD', apple: 'Apple', intel: 'Intel', mediatek: 'MediaTek', nvidia: 'NVIDIA', qualcomm: 'Qualcomm', samsung: 'Samsung' };
    const imageReference = techApiImageReference(raw);
    return [{
      name: item.name, category: item.sourceCategory, sourceUrl: item.sourceRecordUrl, source: 'TechAPI',
      dataAttribution: item.dataAttribution, dataSourceUrl: item.dataSourceUrl, dataLicense: item.dataLicense,
      dataLicenseUrl: item.dataLicenseUrl, techApiVerified: item.raw?.verified === true,
      brand: typeof rawBrand === 'string' ? brandLabels[rawBrand.toLowerCase()] ?? rawBrand : null,
      releaseDate: typeof raw.release_date === 'string' ? raw.release_date : null,
      specificationHighlights: discoverySpecificationHighlights(raw),
      sourceUrls: discoverySourceUrls(raw),
      imageReference,
      priceStatus: 'unknown' as const, imageStatus: 'not_reviewed' as const,
      note: 'Bản ghi tham khảo từ TechAPI. Ảnh chỉ là tham chiếu có metadata giấy phép/ghi công từ nguồn; chưa đối chiếu trực quan với đúng model. Giá hiện hành chưa có.', score,
    }];
  }).slice(0, limit);
}

async function attachOffers(items: any[]) {
  if (!items.length) return items;
  const offers = await Offer.find({
    productId: { $in: items.map((product) => product._id) }, price: { $gt: 0 },
  }).lean();
  const byProduct = new Map<string, any>();
  const evidenceByProduct = new Map<string, any[]>();
  for (const offer of offers) {
    const key = String(offer.productId);
    evidenceByProduct.set(key, [...(evidenceByProduct.get(key) ?? []), offer]);
    const current = advisorCurrentOffer([...(byProduct.has(key) ? [byProduct.get(key)] : []), offer]);
    if (current) byProduct.set(key, current);
  }
  return items.map((product) => {
    const currentOffer = byProduct.get(String(product._id)) ?? null;
    const historicalOrUnknown = (evidenceByProduct.get(String(product._id)) ?? [])
      .map((offer) => classifyAdvisorPrice(offer))
      .sort((a, b) => (b.observedAt ? Date.parse(b.observedAt) : 0) - (a.observedAt ? Date.parse(a.observedAt) : 0))[0];
    return {
      ...product,
      offers: (evidenceByProduct.get(String(product._id)) ?? [])
        .map((offer) => advisorCurrentOffer([offer])).filter(Boolean),
      bestOffer: currentOffer,
      priceEvidence: currentOffer ? classifyAdvisorPrice(currentOffer) : historicalOrUnknown
        ?? { status: 'unknown', observedAt: null, currentPrice: null, url: null },
    };
  });
}

function buildFilter(p: ParsedQuery, categoryWasExplicit: boolean): Filter {
  const filter: Filter = {
    category: p.category && categoryWasExplicit && ELECTRONIC_CATEGORIES.includes(p.category)
      ? { $in: [p.category, ...Object.entries(CATEGORY_ALIASES).filter(([, canonical]) => canonical === p.category).map(([alias]) => alias)] }
      : { $in: ELECTRONIC_CATEGORIES },
    electronicStatus: { $in: ['approved', null] },
    source: { $in: ['accesstrade', 'csv', 'curated'] },
    verified: true, productVerificationStatus: 'verified', urlVerificationStatus: 'verified', publicationStatus: 'published',
    verifiedAt: { $ne: null }, productUrl: { $type: 'string', $ne: '' }, specificationSourceUrl: { $type: 'string', $ne: '' },
    brand: { $type: 'string', $ne: '' }, model: { $type: 'string', $ne: '' },
    $and: [{ $or: [
      { imageVerificationStatus: 'verified', imageUsagePermission: 'granted', imageUrl: { $type: 'string', $ne: '' }, imageSource: { $type: 'string', $ne: '' },
        $or: [{ imagePermissionEvidence: { $type: 'string', $ne: '' } }, { imageLicenseUrl: { $type: 'string', $ne: '' }, imageAttribution: { $type: 'string', $ne: '' } }] },
      { imageVerificationStatus: 'pending', imageUsagePermission: 'not_provided', imageUrl: null },
      ...LOCAL_ONLY_IMAGE_FILTER,
    ] }],
  };
  if (p.brands.length) {
    const normalizedBrands = p.brands.map(normalize);
    const fallbackBrands = p.brands.map((brand) => new RegExp(`^${escapeRegex(brand)}$`, 'i'));
    filter.$and.push({ $or: [{ normalizedBrand: { $in: normalizedBrands } }, { normalizedBrand: null, brand: { $in: fallbackBrands } }] });
  }
  const addNumericConstraint = (path: string, value: number, mode: 'min' | 'range' = 'min') => {
    const expected = mode === 'range' ? { $gte: Math.max(0, value - 0.25), $lte: value + 0.25 } : { $gte: value };
    filter.$and.push({ [path]: expected });
  };
  if (p.ram) addNumericConstraint('normalizedSpecs.ramGB', p.ram);
  if (p.storageGB) addNumericConstraint('normalizedSpecs.storageGB', p.storageGB);
  if (p.storageType) filter.$and.push({ 'normalizedSpecs.storageType': p.storageType });
  if (p.vramGB) addNumericConstraint('normalizedSpecs.vramGB', p.vramGB);
  if (p.displayInches) {
    const tolerance = Number.isInteger(p.displayInches) ? 0.75 : 0.25;
    filter.$and.push({ 'normalizedSpecs.displayInches': { $gte: Math.max(0, p.displayInches - tolerance), $lte: p.displayInches + tolerance } });
  }
  return filter;
}

function queryNamesCategory(q: string, category?: string) {
  const terms = category ? CATEGORIES[category]?.terms ?? [] : [];
  const query = ` ${normalize(q)} `;
  return terms.some((term) => query.includes(` ${normalize(term)} `));
}

function queryModelCodes(q: string) {
  const capacity = /^(?:\d+(?:\.\d+)?)(?:gb|tb|hz|mah|mp|inch|in)$/;
  return [...new Set(parseQuery(q).keywords.map(normalize).filter((token) => token.length >= 2 && !capacity.test(token)
    && ((/[a-z]/.test(token) && /\d/.test(token)) || /^\d{4,}$/.test(token))))];
}

function productIdentity(product: any) {
  return normalize([
    product.name, product.model, product.modelNumber, product.sku, product.normalizedName,
    product.normalizedModel, product.normalizedModelNumber, product.normalizedSku, ...(product.aliases ?? []),
  ].filter(Boolean).join(' ')).split(' ');
}

function productHasModelCodes(product: any, codes: string[]) {
  const identity = productIdentity(product);
  return codes.every((code) => identity.includes(code));
}

async function exactCandidates(filter: Filter, q: string, codes: string[], keywords: string[]) {
  const values = [...new Set([normalize(q), ...codes, normalize(keywords.join(' '))].filter((value) => value.length >= 2))];
  if (!values.length) return [];
  const rows = await Product.find({ ...filter, $or: [
    { normalizedName: { $in: values } }, { normalizedModel: { $in: values } },
    { normalizedModelNumber: { $in: values } }, { normalizedSku: { $in: values } }, { aliases: { $in: values } },
  ] }).limit(50).lean() as any[];
  const ranked = rows.map((product) => {
    const identity = productIdentity(product);
    const codeMatch = codes.length > 0 && codes.every((code) => identity.includes(code));
    const exactText = values.includes(product.normalizedName) || values.includes(product.normalizedModel)
      || values.includes(product.normalizedModelNumber) || values.includes(product.normalizedSku)
      || (product.aliases ?? []).some((alias: string) => values.includes(alias));
    return { product, rankScore: codeMatch ? 4 : exactText ? 3 : 0 };
  }).filter((entry) => entry.rankScore > 0)
    .sort((a, b) => b.rankScore - a.rankScore || String(a.product.name).localeCompare(String(b.product.name)));
  return ranked.map(({ product }) => product);
}

async function keywordCandidates(filter: Filter, p: ParsedQuery) {
  const terms = [...new Set(p.keywords.map(normalize).filter((word) => word.length > 1))].slice(0, 20);
  if (!terms.length) return [];
  try {
    return await Product.find({ ...filter, $text: { $search: terms.join(' ') } })
      .select({ score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } }).limit(CANDIDATE_LIMIT).lean() as any[];
  } catch {
    return await Product.find({ ...filter, $and: [...(filter.$and ?? []), { $or: terms.slice(0, 6).map((term) => ({ searchText: { $regex: escapeRegex(term), $options: 'i' } })) }] })
      .limit(CANDIDATE_LIMIT).lean() as any[];
  }
}

let vectorUnavailableUntil = 0;
async function semanticCandidates(filter: Filter, query: string, limit = CANDIDATE_LIMIT) {
  if (process.env.MONGODB_VECTOR_SEARCH_ENABLED !== 'true' || vectorUnavailableUntil > Date.now()) return { items: [] as any[], status: 'not_enabled' };
  const retrievalStartedAt = performance.now();
  try {
    const vector = await embedQuery(query);
    const matches = await ProductSearchVector.aggregate([
      { $vectorSearch: { index: VECTOR_INDEX_NAME, path: 'embedding', queryVector: vector, numCandidates: Math.max(200, Math.min(2000, limit * 10)), limit } },
      { $project: { productId: 1, score: { $meta: 'vectorSearchScore' } } },
    ]);
    const ids = matches.map((match: any) => match.productId);
    if (!ids.length) {
      recordAdvisorPhase('vector_retrieval', performance.now() - retrievalStartedAt);
      return { items: [], status: 'active' };
    }
    const products = await Product.find({ ...filter, _id: { $in: ids } }).lean() as any[];
    const byId = new Map(products.map((product) => [String(product._id), product]));
    const items = matches.flatMap((match: any) => {
      const product = byId.get(String(match.productId));
      return product ? [{ ...product, semanticScore: match.score }] : [];
    });
    recordAdvisorPhase('vector_retrieval', performance.now() - retrievalStartedAt);
    return { items, status: 'active' };
  } catch {
    vectorUnavailableUntil = Date.now() + 60_000;
    recordAdvisorPhase('vector_retrieval', performance.now() - retrievalStartedAt);
    return { items: [] as any[], status: 'unavailable' };
  }
}

function rrfLists(lists: RankList[]) {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.ids.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + list.weight / (60 + index + 1)));
  }
  return scores;
}

function offerFilterForBudget(p: ParsedQuery): Filter {
  const price: Filter = { $gt: 0 };
  if (p.minPrice !== undefined) price.$gte = p.minPrice;
  if (p.maxPrice !== undefined) price.$lte = p.maxPrice;
  return {
    verified: true, priceVerificationStatus: { $in: ['verified', null] }, price,
    productUrl: { $type: 'string', $ne: '' }, currency: 'VND',
  };
}

export async function smartSearch(
  q: string,
  limit = 24,
  sortOverride?: SortMode,
  options: { mode?: SearchMode; page?: number } = {},
) {
  const mode = options.mode ?? 'hybrid';
  const page = options.page ?? 1;
  const rules = parseQuery(q);
  if (rules.validationIssues.length) {
    return {
      query: q, searchMethod: mode,
      queryUnderstanding: { provider: 'rules' as const, status: 'fallback' as const },
      retrieval: { exact: false, keyword: false, semantic: false, semanticStatus: 'not_enabled' },
      intent: { category: undefined, brands: [], minPrice: undefined, maxPrice: undefined, ram: undefined, storageGB: undefined, storageType: undefined, vramGB: undefined, displayInches: undefined, tags: [], keywords: [] },
      notes: rules.validationIssues, total: 0, items: [], budgetUnknownTotal: 0, budgetUnknownItems: [], catalogDiscovery: [],
    };
  }
  const modelCodes = queryModelCodes(q);
  const hasDeterministicSignal = !!(rules.category || rules.brands.length || rules.minPrice !== undefined || rules.maxPrice !== undefined
    || rules.ram || rules.storageGB || rules.storageType || rules.vramGB || rules.displayInches || rules.tags.length || modelCodes.length);
  const understanding = hasDeterministicSignal
    ? { parsed: rules, provider: 'rules' as const, status: 'active' as const }
    : await understandQuery(q);
  const parsed = understanding.parsed;
  const notes: string[] = [];
  const categoryWasExplicit = queryNamesCategory(q, parsed.category);
  const baseFilter = buildFilter(parsed, categoryWasExplicit);
  const candidatesStartedAt = performance.now();
  const [exact, keyword] = await Promise.all([
    mode === 'hybrid' || mode === 'exact' ? exactCandidates(baseFilter, q, modelCodes, parsed.keywords) : Promise.resolve([]),
    mode === 'hybrid' || mode === 'keyword' ? keywordCandidates(baseFilter, parsed) : Promise.resolve([]),
  ]);
  recordAdvisorPhase('mongo_retrieval', performance.now() - candidatesStartedAt);
  const hasAllCodes = (product: any) => {
    const terms = searchableProductText(product).split(' ');
    return modelCodes.every((code) => terms.includes(code));
  };
  const exactMatches = modelCodes.length ? exact.filter((product: any) => productHasModelCodes(product, modelCodes)) : exact;
  const keywordMatches = modelCodes.length ? keyword.filter((product: any) => hasAllCodes(product)) : keyword;
  // Model identifiers are hard identity signals. If they cannot be found by
  // exact or keyword retrieval, semantic neighbors must not turn a missing SKU
  // into a false product match.
  const useSemantic = mode === 'semantic' || (mode === 'hybrid' && modelCodes.length === 0);
  const semanticResult = useSemantic
    ? await semanticCandidates(baseFilter, q)
    : { items: [] as any[], status: modelCodes.length ? 'skipped_exact_query' : 'not_enabled' };
  const lists: RankList[] = [
    ...(mode === 'hybrid' || mode === 'exact' ? [{ channel: 'exact' as const, weight: 12, ids: exactMatches.map((product: any) => String(product._id)) }] : []),
    ...(mode === 'hybrid' || mode === 'keyword' ? [{ channel: 'keyword' as const, weight: 1, ids: keywordMatches.map((product: any) => String(product._id)) }] : []),
    ...(useSemantic ? [{ channel: 'semantic' as const, weight: 1.5, ids: semanticResult.items.map((product: any) => String(product._id)) }] : []),
  ];
  const candidateRows = [...exactMatches, ...keywordMatches, ...semanticResult.items];
  const candidates = [...new Map(candidateRows.map((product: any) => [String(product._id), product])).values()];
  const attachOffersStartedAt = performance.now();
  const candidatesWithOffers = await attachOffers(candidates);
  recordAdvisorPhase('mongo_retrieval', performance.now() - attachOffersStartedAt);
  const rrfScores = rrfLists(lists);
  const exactIds = new Set(lists.find((list) => list.channel === 'exact')?.ids ?? []);

  const scored = candidatesWithOffers.map((product) => {
    const searchText = searchableProductText(product);
    const tagHits = parsed.tags.filter((tag) => productMatchesTag(product, tag, searchText));
    const keywordHits = parsed.keywords.filter((term) => term.length > 1 && searchText.includes(normalize(term)));
    const reasons: string[] = [];
    tagHits.forEach((tag) => reasons.push(`Phù hợp nhu cầu: ${TAGS[tag]?.label ?? tag}`));
    if (parsed.ram) reasons.push(`RAM ${product.normalizedSpecs?.ramGB ?? product.specs?.ram}GB`);
    if (parsed.storageGB) reasons.push(`Ổ lưu trữ từ ${parsed.storageGB}GB`);
    if (parsed.vramGB) reasons.push(`VRAM từ ${parsed.vramGB}GB`);
    const hasBudget = parsed.minPrice !== undefined || parsed.maxPrice !== undefined;
    const price = product.bestOffer?.verified === true && typeof product.bestOffer.price === 'number' ? product.bestOffer.price : null;
    if (hasBudget && price !== null && (parsed.minPrice === undefined || price >= parsed.minPrice) && (parsed.maxPrice === undefined || price <= parsed.maxPrice)) reasons.push('Trong ngân sách');
    const exactMatch = exactIds.has(String(product._id));
    const score = (rrfScores.get(String(product._id)) ?? 0) * 1000
      + tagHits.length * 12 + keywordHits.length * 2 + (exactMatch ? 100 : 0)
      + (product.verifiedAt ? 1 : 0) + (product.bestOffer?.verified === true ? 0.5 : 0);
    return { ...product, score: Number(score.toFixed(3)), relevance: keywordHits.length + tagHits.length * 2, reasons, exactMatch, searchText };
  });

  const relevant = scored.filter((product) => parsed.tags.every((tag) => productMatchesTag(product, tag)));
  const hasSignal = parsed.tags.length > 0 || parsed.keywords.length > 0 || modelCodes.length > 0;
  if (hasSignal && !relevant.length && scored.length) {
    const needs = parsed.tags.map((tag) => TAGS[tag]?.label.toLocaleLowerCase('vi-VN') ?? tag);
    notes.push(needs.length
      ? `Catalog hiện chưa có sản phẩm đã xác minh khớp nhu cầu ${needs.join(' và ')} trong danh mục/điều kiện này; không hiển thị sản phẩm lệch nhu cầu.`
      : 'Catalog hiện chưa có sản phẩm đã xác minh khớp từ khóa/model này.');
  }

  const hasBudget = parsed.minPrice !== undefined || parsed.maxPrice !== undefined;
  const hasVerifiedOffer = (product: any) => product.bestOffer?.verified === true && typeof product.bestOffer.price === 'number';
  const inBudget = (product: any) => hasVerifiedOffer(product)
    && (parsed.minPrice === undefined || product.bestOffer.price >= parsed.minPrice)
    && (parsed.maxPrice === undefined || product.bestOffer.price <= parsed.maxPrice);
  const budgetUnknownItems = hasBudget ? relevant.filter((product) => !hasVerifiedOffer(product)) : [];
  let results = hasBudget ? relevant.filter(inBudget) : relevant;
  if (hasBudget && !results.length && relevant.length) {
    if (budgetUnknownItems.length) notes.push(`Có ${budgetUnknownItems.length} sản phẩm đã xác minh phù hợp về model/nhu cầu nhưng chưa có giá bán được xác minh; chưa thể xác nhận sản phẩm nằm trong ngân sách.`);
    else notes.push('Không tìm thấy sản phẩm có giá đã xác minh trong khoảng ngân sách đã nêu.');
  }
  if (semanticResult.status === 'unavailable') notes.push('Semantic Search tạm không khả dụng; kết quả hiện dựa trên model và từ khóa.');

  const sort = sortOverride ?? parsed.sort;
  const comparators: Record<SortMode, (a: any, b: any) => number> = {
    price_asc: (a, b) => (a.bestOffer?.price ?? Number.MAX_SAFE_INTEGER) - (b.bestOffer?.price ?? Number.MAX_SAFE_INTEGER),
    price_desc: (a, b) => (b.bestOffer?.price ?? 0) - (a.bestOffer?.price ?? 0),
    popular: (a, b) => (b.sold ?? 0) - (a.sold ?? 0),
    rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
  };
  results.sort(sort ? comparators[sort] : (a, b) => Number(b.exactMatch) - Number(a.exactMatch) || b.score - a.score);
  budgetUnknownItems.sort((a, b) => Number(b.exactMatch) - Number(a.exactMatch) || b.score - a.score);

  const discoveryAllowed = process.env.SEARCH_EVAL_SKIP_DISCOVERY !== 'true';
  const discoveryStartedAt = performance.now();
  const catalogDiscovery = discoveryAllowed && results.length + budgetUnknownItems.length < 3 ? await findTechApiDiscovery(parsed, 8) : [];
  if (discoveryAllowed && results.length + budgetUnknownItems.length < 3) recordAdvisorPhase('mongo_retrieval', performance.now() - discoveryStartedAt);
  if (catalogDiscovery.length) notes.push(`Tìm thấy ${catalogDiscovery.length} mục tham khảo trong chỉ mục TechAPI. Đây chưa phải sản phẩm đã xác minh trong catalog; giá và quyền dùng ảnh chưa được kiểm tra.`);
  if (!candidates.length) notes.push('Không tìm thấy sản phẩm khớp danh mục và các thông số bắt buộc trong catalog đã xác minh.');

  return {
    query: q,
    searchMethod: mode,
    queryUnderstanding: { provider: understanding.provider, status: understanding.status },
    retrieval: {
      exact: exactMatches.length > 0, keyword: keywordMatches.length > 0,
      semantic: semanticResult.status === 'active' && semanticResult.items.length > 0,
      semanticStatus: semanticResult.status,
    },
    intent: {
      category: parsed.category ? CATEGORIES[parsed.category]?.label ?? parsed.category : undefined,
      brands: parsed.brands, minPrice: parsed.minPrice, maxPrice: parsed.maxPrice, ram: parsed.ram,
      storageGB: parsed.storageGB, storageType: parsed.storageType, vramGB: parsed.vramGB, displayInches: parsed.displayInches,
      tags: parsed.tags.map((tag) => TAGS[tag]?.label ?? tag), keywords: parsed.keywords,
    },
    notes,
    total: results.length,
    items: results.slice((page - 1) * limit, page * limit).map(({ relevance, searchText, exactMatch, ...rest }) => rest),
    budgetUnknownTotal: budgetUnknownItems.length,
    budgetUnknownItems: budgetUnknownItems.slice((page - 1) * limit, Math.min(page * limit, (page - 1) * limit + 8)).map(({ relevance, searchText, exactMatch, ...rest }) => rest),
    catalogDiscovery,
  };
}

export async function suggestProducts(q: string, limit = 6) {
  const tokens = normalize(q).split(' ').filter(Boolean).slice(0, 4);
  if (!tokens.length) return [];
  return Product.find({
    source: { $in: ['accesstrade', 'csv', 'curated'] }, verified: true, verifiedAt: { $ne: null },
    electronicStatus: { $in: ['approved', null] }, productUrl: { $type: 'string', $ne: '' },
    specificationSourceUrl: { $type: 'string', $ne: '' }, brand: { $type: 'string', $ne: '' }, model: { $type: 'string', $ne: '' },
    category: { $in: ELECTRONIC_CATEGORIES }, $and: [
      { $or: [
        { imageUsagePermission: 'granted', imageUrl: { $type: 'string', $ne: '' }, imageSource: { $type: 'string', $ne: '' },
          $or: [{ imagePermissionEvidence: { $type: 'string', $ne: '' } }, { imageLicenseUrl: { $type: 'string', $ne: '' }, imageAttribution: { $type: 'string', $ne: '' } }] },
        ...LOCAL_ONLY_IMAGE_FILTER,
      ] },
      ...tokens.map((token) => ({ searchText: { $regex: escapeRegex(token) } })),
    ],
  }).sort({ sold: -1 }).limit(limit).select('name category').lean();
}
