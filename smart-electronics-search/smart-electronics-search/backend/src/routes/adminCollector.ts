import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../middleware/adminAuth';
import { DataSource } from '../models/DataSource';
import { Product } from '../models/Product';
import { Offer } from '../models/Offer';
import { PendingProduct } from '../models/PendingProduct';
import { SyncRun } from '../models/SyncRun';
import { AccesstradeError, DatafeedItem, fetchDatafeedPage } from '../services/accesstradeClient';
import { parseProductCsv } from '../services/csvProductAdapter';
import { mapDatafeedItem, syncDatafeedItems, syncDatafeedPrices, validExternalUrl } from '../services/accesstradeSync';
import { ALLOWED_ELECTRONIC_CATEGORIES } from '../services/electronicsClassifier';
import { CATEGORIES } from '../services/dictionary';
import { mongoCatalogRepository } from '../services/mongoCatalogRepository';
import { isCollectorAdapter } from '../services/collectorAdapters';

const router = Router();
const MAX_BATCH = 20;
const runningSources = new Set<string>();

const siteSources = [
  {
    sourceKey: 'accesstrade-fptshop', name: 'ACCESSTRADE · FPT Shop', adapter: 'accesstrade', domain: 'fptshop.com.vn',
    termsUrl: 'https://fptshop.com.vn/ho-tro/tos', robotsUrl: 'https://fptshop.com.vn/robots.txt',
    status: 'feed_empty_permission_unconfirmed', note: 'API trả 0 record cho domain này. Cần xác nhận quyền/feed với ACCESSTRADE. Không scrape website.',
    dataUsageAuthorized: false, imageUsageAuthorized: false,
  },
  {
    sourceKey: 'cellphones-site', name: 'CellphoneS website', adapter: 'unavailable', domain: 'cellphones.com.vn',
    termsUrl: 'https://cellphones.com.vn/chinh-sach-su-dung', robotsUrl: 'https://cellphones.com.vn/robots.txt',
    status: 'permission_required', note: 'Điều khoản hiện tại giới hạn sao chép/tải/lưu/phân phối nội dung; cần giấy phép hoặc product feed.',
    dataUsageAuthorized: false, imageUsageAuthorized: false,
  },
  {
    sourceKey: 'phongvu-site', name: 'Phong Vũ website', adapter: 'unavailable', domain: 'phongvu.vn',
    termsUrl: null, robotsUrl: 'https://phongvu.vn/robots.txt',
    status: 'not_accessible_permission_unconfirmed', note: 'robots.txt trả 403 trong lần kiểm tra; chưa có feed/API hoặc giấy phép được xác nhận.',
    dataUsageAuthorized: false, imageUsageAuthorized: false,
  },
  {
    sourceKey: 'gearvn-site', name: 'GearVN website', adapter: 'unavailable', domain: 'gearvn.com',
    termsUrl: 'https://gearvn.com/pages/dieu-khoan-dich-vu', robotsUrl: 'https://gearvn.com/robots.txt',
    status: 'permission_required', note: 'robots cho phép search/reference, không cấp rõ quyền dùng làm product catalog/ảnh; chưa scrape.',
    dataUsageAuthorized: false, imageUsageAuthorized: false,
  },
];

function safeText(value: unknown, max = 500): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function validDomain(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const domain = value.trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(domain) && !domain.includes('..') ? domain : null;
}

function summarizeItems(items: DatafeedItem[], source: { sourceKey: string; adapter: string; domain?: string | null; imageUsageAuthorized: boolean; imagePermissionEvidence?: string | null; termsUrl?: string | null }) {
  const counts = { fetched: items.length, validElectronic: 0, rejected: 0, pendingReview: 0, withPrice: 0, withSourceImage: 0, withPermittedImage: 0, withProductUrl: 0, withAffiliateUrl: 0 };
  for (const item of items) {
    const mapped = mapDatafeedItem(item, source.domain ?? source.sourceKey, {
      source: source.adapter,
      sourceKey: source.sourceKey,
      imageUsageAuthorized: source.imageUsageAuthorized,
      imagePermissionEvidence: source.imagePermissionEvidence,
      imageTermsUrl: source.termsUrl,
    });
    if (mapped.classification.status === 'rejected') { counts.rejected += 1; continue; }
    if (mapped.classification.status === 'pending_review' || !mapped.product) { counts.pendingReview += 1; continue; }
    counts.validElectronic += 1;
    if (mapped.offer.price != null) counts.withPrice += 1;
    if (mapped.hasSourceImage) counts.withSourceImage += 1;
    if (mapped.hasImage) counts.withPermittedImage += 1;
    if (mapped.offer.productUrl) counts.withProductUrl += 1;
    if (mapped.offer.affiliateUrl) counts.withAffiliateUrl += 1;
  }
  return counts;
}

async function resolveSource(sourceKey: string): Promise<any | null> {
  const registered = await DataSource.findOne({ sourceKey }).lean();
  if (registered) return registered;
  return siteSources.find((source) => source.sourceKey === sourceKey && source.adapter === 'accesstrade') ?? null;
}

function toCsvCell(value: unknown): string {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

router.use(requireAdmin);

router.get('/sources', async (_req, res, next) => {
  try {
    const registered = await DataSource.find({ adapter: { $in: ['accesstrade', 'csv'] } }).sort({ name: 1 }).lean();
    const registeredKeys = new Set(registered.map((source) => source.sourceKey));
    const sources = [
      ...siteSources.filter((source) => !registeredKeys.has(source.sourceKey)),
      ...registered.map((source) => ({ ...source, status: source.active ? 'configured' : 'disabled', note: null })),
    ];
    const withStats = await Promise.all(sources.map(async (source) => {
      const prefix = new RegExp(`^${source.sourceKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`);
      const [products, offers, pending, latestRun] = await Promise.all([
        Product.countDocuments({ sourceKey: prefix }),
        Offer.countDocuments({ source: source.sourceKey }),
        PendingProduct.countDocuments({ source: source.sourceKey, classification: 'pending_review', reviewDecision: null }),
        SyncRun.findOne({ sourceKey: source.sourceKey }).sort({ startedAt: -1 }).lean(),
      ]);
      return { ...source, products, offers, pendingReview: pending, latestRun };
    }));
    res.json(withStats);
  } catch (error) { next(error); }
});

router.get('/categories', (_req, res) => {
  res.json(ALLOWED_ELECTRONIC_CATEGORIES.map((key) => ({ key, label: CATEGORIES[key]?.label ?? key })));
});

router.post('/sources', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const sourceKey = safeText(body.sourceKey, 80)?.toLowerCase();
    const name = safeText(body.name, 120);
    const adapter = body.adapter;
    if (!sourceKey || !/^[a-z0-9][a-z0-9._-]{1,79}$/.test(sourceKey) || !name || !isCollectorAdapter(adapter)) {
      return res.status(400).json({ message: 'sourceKey, name hoặc adapter không hợp lệ' });
    }
    const domain = body.domain ? validDomain(body.domain) : null;
    if (body.domain && !domain) return res.status(400).json({ message: 'domain không hợp lệ' });
    if (adapter === 'accesstrade' && !domain) return res.status(400).json({ message: 'Adapter ACCESSTRADE cần domain chính xác đã được xác nhận' });
    const dataUsageAuthorized = body.dataUsageAuthorized === true;
    const imageUsageAuthorized = body.imageUsageAuthorized === true;
    const dataPermissionEvidence = safeText(body.dataPermissionEvidence);
    const imagePermissionEvidence = safeText(body.imagePermissionEvidence);
    if (dataUsageAuthorized && !dataPermissionEvidence) return res.status(400).json({ message: 'Cần ghi bằng chứng quyền sử dụng dữ liệu trước khi bật import' });
    if (adapter === 'accesstrade' && dataUsageAuthorized && body.legalReviewed !== true) return res.status(400).json({ message: 'Cần xác nhận đã kiểm tra quyền dùng feed và điều khoản nguồn trước khi bật import' });
    if (imageUsageAuthorized && !imagePermissionEvidence) return res.status(400).json({ message: 'Cần ghi bằng chứng quyền dùng ảnh trước khi bật hiển thị ảnh' });
    const termsUrl = body.termsUrl ? validExternalUrl(body.termsUrl) : null;
    if (body.termsUrl && !termsUrl) return res.status(400).json({ message: 'termsUrl phải là HTTPS URL hợp lệ' });
    const source = await DataSource.findOneAndUpdate(
      { sourceKey },
      { $set: {
        sourceKey, name, adapter, domain, sellerName: safeText(body.sellerName, 120), termsUrl,
        dataUsageAuthorized, dataPermissionEvidence, imageUsageAuthorized, imagePermissionEvidence,
        legalReviewedAt: body.legalReviewed === true ? new Date() : null, active: body.active !== false,
      } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    res.status(200).json({ sourceKey: source?.sourceKey, configured: true, dataUsageAuthorized, imageUsageAuthorized });
  } catch (error) { next(error); }
});

router.post('/sources/:sourceKey/run', async (req, res) => {
  const sourceKey = String(req.params.sourceKey);
  const source = await resolveSource(sourceKey);
  if (!source || !source.active && source.active !== undefined) return res.status(404).json({ message: 'Không tìm thấy nguồn đang hoạt động' });
  if (!['accesstrade', 'csv'].includes(source.adapter)) return res.status(409).json({ message: 'Nguồn này chưa có API/feed/CSV được cấp phép; không scrape website' });
  const mode = req.query.mode ?? req.body?.mode ?? 'dry-run';
  const priceMode = mode === 'price-dry-run' || mode === 'price-sync';
  if (!['dry-run', 'import', 'update', 'price-dry-run', 'price-sync'].includes(mode)) return res.status(400).json({ message: 'mode không hợp lệ' });
  if (priceMode && source.adapter !== 'accesstrade') return res.status(409).json({ message: 'Đồng bộ giá hiện hỗ trợ Datafeed ACCESSTRADE' });
  if (mode !== 'dry-run' && mode !== 'price-dry-run' && !source.dataUsageAuthorized) return res.status(403).json({ message: 'Nguồn chưa có bằng chứng quyền sử dụng dữ liệu; chỉ được dry-run' });
  if (runningSources.has(sourceKey)) return res.status(409).json({ message: 'Nguồn này đang được xử lý' });
  runningSources.add(sourceKey);
  let run: any;
  try {
    const page = req.body?.page === undefined ? 1 : Number(req.body.page);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return res.status(400).json({ message: 'page không hợp lệ' });
    // Dry-run is strictly read-only: do not persist a run, source metrics, pending rows, or products.
    if (mode !== 'dry-run' && mode !== 'price-dry-run') {
      run = await SyncRun.create({ source: source.adapter, sourceKey, mode, page, status: 'running', startedAt: new Date() });
    }
    let items: DatafeedItem[];
    let rejectedRows = 0;
    let rowErrors: string[] = [];
    let upstreamTotal: number | null = null;
    if (source.adapter === 'accesstrade') {
      const result = await fetchDatafeedPage({
        apiKey: process.env.ACCESSTRADE_API_KEY ?? '', baseUrl: process.env.ACCESSTRADE_BASE_URL,
        domain: source.domain, page, limit: MAX_BATCH,
      });
      items = result.items;
      upstreamTotal = result.total;
    } else {
      const csv = typeof req.body === 'string' ? req.body : typeof req.body?.csv === 'string' ? req.body.csv : '';
      const parsed = parseProductCsv(csv, MAX_BATCH);
      items = parsed.items;
      rejectedRows = parsed.rejectedRows;
      rowErrors = parsed.errors;
    }
    let stats = summarizeItems(items, source);
    stats = { ...stats, rejected: stats.rejected + rejectedRows };
    if (priceMode) {
      const priceStats = await syncDatafeedPrices(items, mongoCatalogRepository, source.domain ?? source.sourceKey, {
        sourceKey,
        sellerName: source.sellerName,
        dryRun: mode === 'price-dry-run',
      });
      stats = { ...stats, ...priceStats };
    } else if (mode !== 'dry-run') {
      const imported = await syncDatafeedItems(items, mongoCatalogRepository, source.domain ?? source.sourceKey, {
        source: source.adapter,
        sourceKey,
        imageUsageAuthorized: source.imageUsageAuthorized,
        imagePermissionEvidence: source.imagePermissionEvidence,
        imageTermsUrl: source.termsUrl,
        sellerName: source.sellerName,
        updateOnly: mode === 'update',
      });
      stats = { ...stats, ...imported, rejected: imported.rejected + rejectedRows };
    }
    const resultStats = { ...stats, page: source.adapter === 'accesstrade' ? page : null, upstreamTotal, rowErrors };
    if (run?._id) {
      await SyncRun.updateOne({ _id: run._id }, { $set: { status: 'succeeded', finishedAt: new Date(), stats: resultStats, error: null } });
      if (source._id) await DataSource.updateOne({ _id: source._id }, { $set: { lastRunAt: new Date(), lastRunStats: resultStats, lastRunError: null } });
    }
    console.info(`[collector] ${mode} source=${sourceKey} fetched=${stats.fetched} exactMatches=${(stats as any).exactMatches ?? 0} offers=${(stats as any).offersCreatedOrUpdated ?? 0}`);
    return res.json({ status: 'succeeded', mode, stats: resultStats });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi collector không xác định';
    const upstreamStatus = error instanceof AccesstradeError ? error.status : undefined;
    if (run?._id) await SyncRun.updateOne({ _id: run._id }, { $set: { status: 'failed', finishedAt: new Date(), error: message } });
    if (run?._id && source._id) await DataSource.updateOne({ _id: source._id }, { $set: { lastRunAt: new Date(), lastRunError: message } });
    console.error(`[collector] source=${sourceKey} failed${upstreamStatus ? ` HTTP ${upstreamStatus}` : ''}: ${message}`);
    return res.status(upstreamStatus ? 502 : 400).json({ message, upstreamStatus });
  } finally { runningSources.delete(sourceKey); }
});

router.get('/runs', async (req, res, next) => {
  try {
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ message: 'limit phải từ 1 đến 100' });
    const runs = await SyncRun.find({ sourceKey: { $ne: null } }).sort({ startedAt: -1 }).limit(limit).lean();
    res.json(runs);
  } catch (error) { next(error); }
});

router.get('/review', async (req, res, next) => {
  try {
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ message: 'limit phải từ 1 đến 100' });
    const rows = await PendingProduct.find({ classification: 'pending_review', reviewDecision: null }).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(rows.map((row) => {
      const product = row.raw?.draft ?? row.raw ?? {};
      return ({
      _id: row._id, source: row.source, sourceKey: row.sourceKey, reasons: row.reasons,
      productVerificationStatus: row.productVerificationStatus, imageVerificationStatus: row.imageVerificationStatus,
      urlVerificationStatus: row.urlVerificationStatus, publicationStatus: row.publicationStatus,
      name: product.name ?? null, brand: product.brand ?? null, category: product.cate ?? product.category ?? null,
      model: product.model ?? null, modelNumber: product.modelNumber ?? null,
      family: product.family ?? null, generation: product.generation ?? null,
      productUrl: product.productUrl ?? product.url ?? null,
      specificationSourceUrl: product.specificationSourceUrl ?? product.productUrl ?? null,
      specifications: product.specifications ?? null, variants: product.variants ?? [],
      sourceEvidence: row.raw?.sourceEvidence ?? row.raw?.evidence ?? [], imageCandidate: row.raw?.imageCandidate ?? null,
      imageReady: Boolean((row.raw?.imageUrl || row.raw?.imageCandidate?.imageUrl) && row.raw?.imageUsagePermission === 'granted' && row.raw?.imageVisualIdentityChecked === true), createdAt: row.createdAt,
    });
    }));
  } catch (error) { next(error); }
});

router.post('/review/:id', async (req, res, next) => {
  try {
    const { decision, category } = req.body ?? {};
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ message: 'decision phải là approve hoặc reject' });
    const row = await PendingProduct.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Không tìm thấy mục chờ duyệt' });
    if (decision === 'reject') {
      row.classification = 'rejected'; row.reviewDecision = 'rejected'; row.productVerificationStatus = 'rejected'; row.publicationStatus = 'hidden'; row.reviewedAt = new Date(); await row.save();
      return res.json({ reviewed: true, decision: 'rejected' });
    }
    if (!ALLOWED_ELECTRONIC_CATEGORIES.includes(category)) return res.status(400).json({ message: 'Chọn một danh mục điện tử hợp lệ' });
    const source = await resolveSource(row.source);
    if (!source?.dataUsageAuthorized) return res.status(403).json({ message: 'Nguồn chưa có quyền sử dụng dữ liệu được xác nhận' });
    const mapped = mapDatafeedItem({ ...row.raw, cate: category }, source.domain ?? source.sourceKey, {
      source: source.adapter, sourceKey: source.sourceKey, imageUsageAuthorized: source.imageUsageAuthorized,
      imagePermissionEvidence: source.imagePermissionEvidence, imageTermsUrl: source.termsUrl,
      sellerName: source.sellerName, reviewedCategory: category,
    });
    if (!mapped.product) return res.status(422).json({ message: 'Mục này thiếu tên sản phẩm cần thiết để lưu' });
    if (!mapped.product.verified) return res.status(422).json({ message: 'Mục này vẫn thiếu family/generation, specification evidence, hoặc image-rights evidence; bổ sung nguồn trước khi duyệt.' });
    const productResult = await mongoCatalogRepository.upsertProduct({ dedupeKey: mapped.dedupeKey }, mapped.product);
    if (mapped.offer.sellerName) await mongoCatalogRepository.upsertOffer({ productId: productResult.id, source: source.sourceKey, sellerName: mapped.offer.sellerName }, { ...mapped.offer, productId: productResult.id });
    row.classification = 'pending_review'; row.reviewDecision = 'approved'; row.reviewedAt = new Date(); await row.save();
    res.json({ reviewed: true, decision: 'approved', productId: productResult.id });
  } catch (error) { next(error); }
});

router.get('/export.csv', async (req, res, next) => {
  try {
    const limit = req.query.limit === undefined ? 1000 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 5000) return res.status(400).json({ message: 'limit phải từ 1 đến 5000' });
    const products = await Product.find({ source: { $in: ['accesstrade', 'csv', 'curated'] }, verified: true, electronicStatus: 'approved' }).sort({ updatedAt: -1 }).limit(limit).lean();
    const offers = await Offer.find({ productId: { $in: products.map((p) => p._id) } }).lean();
    const headings = ['productId', 'name', 'brand', 'model', 'category', 'price', 'originalPrice', 'currency', 'imageUrl', 'imageUsagePermission', 'imageLicense', 'imageAttribution', 'source', 'sourceUrl', 'specificationSourceUrl', 'sellerName', 'productUrl', 'affiliateUrl', 'lastUpdated', 'specifications'];
    const lines = [headings.map(toCsvCell).join(',')];
    for (const product of products) {
      const productOffers = offers.filter((offer) => String(offer.productId) === String(product._id));
      if (!productOffers.length) lines.push([product._id, product.name, product.brand, product.model, product.category, product.price, product.originalPrice, '', product.imageUsagePermission === 'granted' ? product.imageUrl : null, product.imageUsagePermission, product.imageLicense, product.imageAttribution, product.source, product.sourceUrl, product.specificationSourceUrl, '', product.productUrl, '', product.updatedAt, product.specifications].map(toCsvCell).join(','));
      else for (const offer of productOffers) lines.push([product._id, product.name, product.brand, product.model, product.category, offer.price, offer.originalPrice, offer.currency, product.imageUsagePermission === 'granted' ? product.imageUrl : null, product.imageUsagePermission, product.imageLicense, product.imageAttribution, product.source, product.sourceUrl, product.specificationSourceUrl, offer.sellerName, offer.productUrl ?? product.productUrl, offer.affiliateUrl, offer.lastUpdated, product.specifications].map(toCsvCell).join(','));
    }
    res.type('text/csv; charset=utf-8').attachment('electronics-products.csv').send(`\uFEFF${lines.join('\r\n')}`);
  } catch (error) { next(error); }
});

export default router;
