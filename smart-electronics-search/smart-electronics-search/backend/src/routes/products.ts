import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { Product } from '../models/Product';
import { Offer } from '../models/Offer';
import { smartSearch, suggestProducts } from '../services/searchService';
import { buildSearchText } from '../utils/text';
import { classifyElectronics } from '../services/electronicsClassifier';
import { CANONICAL_CATEGORY_KEYS, CATEGORY_ALIASES, canonicalCategory } from '../services/taxonomy';
import { takeLiveSearchSlot } from '../services/liveSearchRateLimit';
import { webSearchProvider } from '../services/webSearchProvider';
import { normalizeSpecs } from '../utils/specs';
import { normalizeProduct } from '../services/productNormalizer';
import { advisorCurrentOffer, classifyAdvisorPrice } from '../services/advisorProductVerification';

const router = Router();
const SORTS = ['price_asc', 'price_desc', 'popular', 'rating'] as const;
const ELECTRONIC_CATEGORIES = CANONICAL_CATEGORY_KEYS;
const LOCAL_ONLY_IMAGE_FILTER = process.env.SERVE_LOCAL_ONLY_IMAGES === 'true' || process.env.NODE_ENV !== 'production'
  ? [{
    imageVerificationStatus: 'pending', imageUsagePermission: 'not_provided', localOnlyAsset: true,
    imageUrl: { $regex: '^/catalog-images/[a-z0-9][a-z0-9._-]*\\.(jpg|jpeg|png|webp)$', $options: 'i' },
  }]
  : [];
const PUBLIC_VERIFIED_FILTER = {
  source: { $in: ['accesstrade', 'csv', 'curated'] },
  verified: true,
  productVerificationStatus: 'verified',
  urlVerificationStatus: 'verified',
  publicationStatus: 'published',
  verifiedAt: { $ne: null },
  electronicStatus: { $in: ['approved', null] },
  productUrl: { $type: 'string', $ne: '' },
  specificationSourceUrl: { $type: 'string', $ne: '' },
  brand: { $type: 'string', $ne: '' },
  model: { $type: 'string', $ne: '' },
  $and: [{
    $or: [
      {
        imageVerificationStatus: 'verified',
        imageUsagePermission: 'granted',
        imageUrl: { $type: 'string', $ne: '' },
        imageSource: { $type: 'string', $ne: '' },
        $or: [
          { imagePermissionEvidence: { $type: 'string', $ne: '' } },
          { imageLicenseUrl: { $type: 'string', $ne: '' }, imageAttribution: { $type: 'string', $ne: '' } },
        ],
      },
      { imageVerificationStatus: 'pending', imageUsagePermission: 'not_provided', imageUrl: null },
      ...LOCAL_ONLY_IMAGE_FILTER,
    ],
  }],
};

async function addOffers(items: any[]) {
  if (!items.length) return items;
  const offers = await Offer.find({ productId: { $in: items.map((p) => p._id) }, price: { $gt: 0 } }).lean();
  const byProduct = new Map<string, any>();
  const evidenceByProduct = new Map<string, any[]>();
  for (const offer of offers) {
    const key = String(offer.productId);
    evidenceByProduct.set(key, [...(evidenceByProduct.get(key) ?? []), offer]);
    const current = advisorCurrentOffer([...(byProduct.has(key) ? [byProduct.get(key)] : []), offer]);
    if (current) byProduct.set(key, current);
  }
  return items.map((p) => {
    const currentOffer = byProduct.get(String(p._id)) ?? null;
    const historicalOrUnknown = (evidenceByProduct.get(String(p._id)) ?? [])
      .map((offer) => classifyAdvisorPrice(offer))
      .sort((a, b) => (b.observedAt ? Date.parse(b.observedAt) : 0) - (a.observedAt ? Date.parse(a.observedAt) : 0))[0];
    return {
      ...p,
      offers: (evidenceByProduct.get(String(p._id)) ?? []).map((offer) => advisorCurrentOffer([offer])).filter(Boolean),
      bestOffer: currentOffer,
      priceEvidence: currentOffer ? classifyAdvisorPrice(currentOffer) : historicalOrUnknown
        ?? { status: 'unknown', observedAt: null, currentPrice: null, url: null },
    };
  });
}

// GET /api/products/search?q=laptop gaming dưới 20 triệu&limit=24&sort=price_asc
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.status(400).json({ message: 'Thiếu từ khoá tìm kiếm (q)' });
    if (q.length > 300) return res.status(400).json({ message: 'Từ khoá tìm kiếm tối đa 300 ký tự' });
    const requestedLimit = req.query.limit === undefined ? 24 : Number(req.query.limit);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 60) return res.status(400).json({ message: 'limit phải là số nguyên từ 1 đến 60' });
    const sort = SORTS.find((s) => s === req.query.sort);
    const result = await smartSearch(q, requestedLimit, sort);
    const fallbackThreshold = Math.min(3, requestedLimit);
    if (result.total >= fallbackThreshold) {
      return res.json({ ...result, webSearch: [], webSearchStatus: { status: 'not_requested', provider: webSearchProvider.provider } });
    }

    if (!webSearchProvider.configured) {
      return res.json({
        ...result,
        notes: [...result.notes, `MongoDB hiện có ${result.total} sản phẩm phù hợp, chưa đủ ngưỡng ${fallbackThreshold}. Live Search chưa được cấu hình nên chưa tìm trên web.`],
        webSearch: [],
        webSearchStatus: { status: 'not_configured', provider: null },
      });
    }

    const configuredLimit = Number(process.env.LIVE_SEARCH_MAX_REQUESTS_PER_MINUTE);
    const liveSearchLimit = Number.isInteger(configuredLimit) && configuredLimit >= 1 && configuredLimit <= 60 ? configuredLimit : 8;
    if (!takeLiveSearchSlot(req.ip || req.socket.remoteAddress || 'unknown', Date.now(), liveSearchLimit)) {
      return res.json({
        ...result,
        notes: [...result.notes, 'Live Search đang tạm giới hạn số lượt; vui lòng thử lại sau.'],
        webSearch: [],
        webSearchStatus: { status: 'rate_limited', provider: webSearchProvider.provider },
      });
    }

    const web = await webSearchProvider.search(q);
    const note = web.candidates.length
      ? `MongoDB hiện có ${result.total} sản phẩm phù hợp; tìm thấy thêm ${web.candidates.length} liên kết web tham khảo. Đây là nguồn để nghiên cứu tiếp, chưa phải Product đã xác minh; ảnh, model, thông số và quyền sử dụng chưa được kiểm tra.`
      : web.status === 'rate_limited'
        ? 'Nhà cung cấp Live Search đang giới hạn yêu cầu; vui lòng thử lại sau.'
        : web.status === 'available'
          ? 'Live Search chưa tìm thấy nguồn phù hợp cho truy vấn này.'
          : 'Live Search hiện không khả dụng; dữ liệu MongoDB không bị thay đổi.';
    res.json({ ...result, notes: [...result.notes, note], webSearch: web.candidates, webSearchStatus: { status: web.status, provider: web.provider } });
  } catch (e) { next(e); }
});

// GET /api/products/suggest?q=iph  -> gợi ý tên sản phẩm khi gõ
router.get('/suggest', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '');
    if (q.length > 200) return res.status(400).json({ message: 'Từ khoá gợi ý tối đa 200 ký tự' });
    res.json(await suggestProducts(q));
  } catch (e) { next(e); }
});

router.get('/categories', async (_req, res, next) => {
  try {
    const categories = await Product.distinct('category', { ...PUBLIC_VERIFIED_FILTER, category: { $in: [...ELECTRONIC_CATEGORIES, ...Object.keys(CATEGORY_ALIASES)] } });
    res.json([...new Set(categories.map(canonicalCategory))].sort());
  } catch (e) { next(e); }
});

// GET /api/products?category=laptop&page=1&pageSize=20
router.get('/', async (req, res, next) => {
  try {
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const pageSize = req.query.pageSize === undefined ? 20 : Number(req.query.pageSize);
    if (!Number.isInteger(page) || page < 1 || page > 100000) return res.status(400).json({ message: 'page phải là số nguyên từ 1 đến 100000' });
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return res.status(400).json({ message: 'pageSize phải là số nguyên từ 1 đến 100' });
    const requestedCategory = req.query.category ? String(req.query.category) : undefined;
    if (requestedCategory && !ELECTRONIC_CATEGORIES.includes(requestedCategory) && !Object.keys(CATEGORY_ALIASES).includes(requestedCategory)) return res.status(400).json({ message: 'Danh mục điện tử không hợp lệ' });
    const category = requestedCategory ? canonicalCategory(requestedCategory) : undefined;
    const categoryFilter = category ? { $in: [category, ...Object.entries(CATEGORY_ALIASES).filter(([, canonical]) => canonical === category).map(([alias]) => alias)] } : { $in: [...ELECTRONIC_CATEGORIES, ...Object.keys(CATEGORY_ALIASES)] };
    const filter = { ...PUBLIC_VERIFIED_FILTER, category: categoryFilter };
    const [items, total] = await Promise.all([
      Product.find(filter).select('-searchText').sort({ sold: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      Product.countDocuments(filter),
    ]);
    res.json({ page, pageSize, total, items: await addOffers(items) });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'ID không hợp lệ' });
    const item = await Product.findOne({ _id: req.params.id, ...PUBLIC_VERIFIED_FILTER, category: { $in: [...ELECTRONIC_CATEGORIES, ...Object.keys(CATEGORY_ALIASES)] } }).select('-searchText').lean();
    if (!item) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    res.json((await addOffers([item]))[0]);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const b = req.body;
    if (!b || typeof b !== 'object' || Array.isArray(b) || typeof b.name !== 'string' || typeof b.category !== 'string') {
      return res.status(400).json({ message: 'Cần cung cấp name và category hợp lệ' });
    }
    const classification = classifyElectronics({ name: b.name, cate: b.category, brand: b.brand, specs: b.specs, desc: b.description });
    if (classification.status !== 'approved') return res.status(422).json({ message: 'Sản phẩm bị từ chối hoặc cần kiểm tra để xác nhận thuộc lĩnh vực điện tử', reviewRequired: classification.status === 'pending_review' });
    const payload = {
      name: b.name,
      brand: typeof b.brand === 'string' ? b.brand : null,
      category: classification.category,
      price: typeof b.price === 'number' && Number.isFinite(b.price) && b.price > 0 ? b.price : null,
      originalPrice: typeof b.originalPrice === 'number' && Number.isFinite(b.originalPrice) && b.originalPrice > 0 ? b.originalPrice : undefined,
      description: typeof b.description === 'string' ? b.description : null,
      imageUrl: typeof b.imageUrl === 'string' ? b.imageUrl : null,
      specs: normalizeSpecs(b.specs),
      tags: Array.isArray(b.tags) ? b.tags.filter((tag: unknown) => typeof tag === 'string') : [],
      searchText: buildSearchText({ ...b, category: classification.category }),
      electronicStatus: 'approved',
      source: 'manual',
    };
    const created = await Product.create({ ...payload, ...normalizeProduct({ ...b, ...payload }) });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

export default router;
