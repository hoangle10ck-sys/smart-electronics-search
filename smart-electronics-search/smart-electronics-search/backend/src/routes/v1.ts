import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { Product } from '../models/Product';
import { SearchFeedback } from '../models/SearchFeedback';
import { parseQuery } from '../services/queryParser';
import { understandQuery } from '../services/queryUnderstanding';
import { smartSearch, SearchMode } from '../services/searchService';
import { validateSearchRequest } from '../services/searchRequest';
import { takeLiveSearchSlot } from '../services/liveSearchRateLimit';
import advisorChatRoutes from './advisorChat';

const router = Router();
const SOFT_TAGS = new Set(['portable', 'battery', 'budget', 'premium', 'camera', 'fitness', 'wireless']);

function hardConstraints(parsed: ReturnType<typeof parseQuery>) {
  return [
    ...(parsed.category ? ['category'] : []), ...(parsed.brands.length ? ['brand'] : []),
    ...(parsed.minPrice !== undefined ? ['min_price'] : []), ...(parsed.maxPrice !== undefined ? ['max_price'] : []),
    ...(parsed.ram ? ['ram_gb'] : []), ...(parsed.storageType ? ['storage_type'] : []), ...(parsed.storageGB ? ['storage_gb'] : []),
    ...(parsed.vramGB ? ['vram_gb'] : []), ...(parsed.displayInches ? ['display_inches'] : []),
    ...(parsed.tags.some((tag) => !SOFT_TAGS.has(tag)) ? ['use_cases'] : []),
  ];
}

function searchMethod(retrieval: { exact: boolean; keyword: boolean; semantic: boolean }) {
  const channels = (['exact', 'keyword', 'semantic'] as const).filter((channel) => retrieval[channel]);
  return channels.length ? channels.join('+') : 'no_match';
}

function productResult(product: any) {
  const offer = product.bestOffer ?? null;
  return {
    id: String(product._id), _id: product._id, name: product.name, model: product.model, modelNumber: product.modelNumber,
    brand: product.brand, category: product.category, price: offer?.price ?? null, currency: offer?.currency ?? 'VND',
    seller: offer?.sellerName ?? null, sellerName: offer?.sellerName ?? null, offerUrl: offer?.productUrl ?? null,
    productUrl: product.productUrl ?? null, sourceUrl: product.sourceUrl ?? null,
    specificationSourceUrl: product.specificationSourceUrl ?? null,
    priceUpdatedAt: offer?.lastUpdated ?? null, imageUrl: product.imageUrl ?? null,
    imageSource: product.imageSource ?? null, imageSourceUrl: product.imageSourceUrl ?? null,
    imageAttribution: product.imageAttribution ?? null, imageLicense: product.imageLicense ?? null,
    imageLicenseUrl: product.imageLicenseUrl ?? null, imageUsagePermission: product.imageUsagePermission ?? 'not_provided',
    imageVerificationStatus: product.imageVerificationStatus ?? 'pending', localOnlyAsset: product.localOnlyAsset ?? false,
    verificationScope: product.verificationScope ?? null, sourceEvidence: product.sourceEvidence ?? [],
    dataAttribution: product.dataAttribution ?? null, dataSourceUrl: product.dataSourceUrl ?? null,
    dataLicense: product.dataLicense ?? null, dataLicenseUrl: product.dataLicenseUrl ?? null,
    specifications: product.specifications ?? product.specs ?? {}, specs: product.specs ?? {},
    offers: product.offers ?? [], bestOffer: offer, relevanceScore: product.score ?? null, reasons: product.reasons ?? [],
  };
}

async function runSearch(input: unknown, res: any, next: (error?: unknown) => void) {
  const validated = validateSearchRequest(input);
  if ('error' in validated) return res.status(400).json({ success: false, message: validated.error });
  try {
    const startedAt = performance.now();
    const request = validated.data;
    const result = await smartSearch(request.query, request.limit, request.sort, { mode: request.mode, page: request.page });
    return res.json({
      success: true,
      query: request.query,
      search_method: searchMethod(result.retrieval),
      search_mode: request.mode,
      parsed_filters: { ...result.intent, hard_constraints: hardConstraints(parseQuery(request.query)) },
      page: request.page, limit: request.limit, total: result.total,
      products: result.items.map(productResult),
      budget_unknown_products: result.budgetUnknownItems.map(productResult),
      notes: result.notes,
      query_understanding: result.queryUnderstanding,
      retrieval: result.retrieval,
      execution_time_ms: Number((performance.now() - startedAt).toFixed(2)),
    });
  } catch (error) { next(error); }
}

router.get('/search', (req, res, next) => { void runSearch(req.query, res, next); });
router.post('/search', (req, res, next) => { void runSearch(req.body, res, next); });

router.post('/ai/understand-query', async (req, res, next) => {
  try {
    const query = req.body?.query ?? req.body?.q;
    if (typeof query !== 'string' || !query.trim() || query.length > 300) return res.status(400).json({ success: false, message: 'query must contain 1 to 300 characters' });
    const parsed = parseQuery(query.trim());
    const understood = await understandQuery(query.trim());
    const intent = understood.parsed;
    const softPreferences = parsed.tags.filter((tag) => SOFT_TAGS.has(tag));
    const hardUseCases = parsed.tags.filter((tag) => !SOFT_TAGS.has(tag));
    return res.json({
      success: true, query: query.trim(), provider: understood.provider, status: understood.status,
      intent: {
        category: parsed.category ?? intent.category ?? null,
        brands: parsed.brands,
        budget: { min: parsed.minPrice ?? null, max: parsed.maxPrice ?? null, currency: 'VND' },
        requirements: {
          ram_gb: parsed.ram ? { min: parsed.ram } : null,
          storage_type: parsed.storageType ?? null,
          storage_gb: parsed.storageGB ? { min: parsed.storageGB } : null,
          vram_gb: parsed.vramGB ? { min: parsed.vramGB } : null,
          display_inches: parsed.displayInches ?? null,
        },
        use_cases: [...new Set([...hardUseCases, ...softPreferences])],
        hard_constraints: hardConstraints(parsed), soft_preferences: softPreferences,
        keywords: parsed.keywords, sort: parsed.sort ?? 'relevance',
      },
    });
  } catch (error) { next(error); }
});

router.get('/products/:id/similar', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'invalid product id' });
    const source = await Product.findOne({
      _id: req.params.id, verified: true, productVerificationStatus: 'verified',
      urlVerificationStatus: 'verified', publicationStatus: 'published',
    }).select('_id name brand model category description tags normalizedSpecs').lean() as any;
    if (!source) return res.status(404).json({ success: false, message: 'product not found' });
    const query = [source.category, source.brand, source.tags?.join(' ')]
      .filter(Boolean).join(' ').slice(0, 300);
    const requestedLimit = req.query.limit === undefined ? 8 : Number(req.query.limit);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 20) return res.status(400).json({ success: false, message: 'limit must be an integer from 1 to 20' });
    const limit = requestedLimit;
    let result = await smartSearch(query, limit + 1, undefined, { mode: 'semantic' });
    let similarItems = result.items.filter((item: any) => String(item._id) !== String(source._id));
    if (!similarItems.length) {
      result = await smartSearch(query, limit + 1, undefined, { mode: 'hybrid' });
      similarItems = result.items.filter((item: any) => String(item._id) !== String(source._id));
    }
    const items = similarItems.slice(0, limit).map(productResult);
    return res.json({ success: true, productId: String(source._id), total: items.length, products: items });
  } catch (error) { next(error); }
});

router.post('/feedback', async (req, res, next) => {
  try {
    const query = req.body?.query;
    const feedback = req.body?.feedback;
    const productId = req.body?.productId ?? null;
    const searchMode = req.body?.searchMode ?? 'hybrid';
    if (typeof query !== 'string' || !query.trim() || query.length > 300) return res.status(400).json({ success: false, message: 'query must contain 1 to 300 characters' });
    if (!['helpful', 'not_helpful', 'wrong_product', 'wrong_price', 'not_relevant'].includes(feedback)) return res.status(400).json({ success: false, message: 'feedback value is not supported' });
    if (!['hybrid', 'exact', 'keyword', 'semantic'].includes(searchMode)) return res.status(400).json({ success: false, message: 'searchMode is not supported' });
    if (productId !== null && (typeof productId !== 'string' || !isValidObjectId(productId))) return res.status(400).json({ success: false, message: 'productId is invalid' });
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!takeLiveSearchSlot(`feedback:${ip}`, Date.now(), 10)) return res.status(429).json({ success: false, message: 'feedback rate limit exceeded' });
    if (productId && !await Product.exists({ _id: productId, publicationStatus: 'published', verified: true })) return res.status(404).json({ success: false, message: 'product not found' });
    const entry = await SearchFeedback.create({ query: query.trim(), productId, feedback, searchMethod: searchMode as SearchMode });
    return res.status(201).json({ success: true, id: entry._id });
  } catch (error) { next(error); }
});

router.use('/chat', advisorChatRoutes);

export default router;
