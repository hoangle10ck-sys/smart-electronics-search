import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { DataSource } from '../models/DataSource';
import { Offer } from '../models/Offer';
import { PendingProduct } from '../models/PendingProduct';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';
import { fetchDatafeedPage } from '../services/accesstradeClient';
import { CANONICAL_CATEGORY_KEYS } from '../services/taxonomy';
import { ACCESTRADE_SELLERS, classifyAccessTradeListing, extractFeedBrand, mapAccessTradeCatalogListing, normalizeAccessTradeProductUrl } from '../services/accesstradeCatalog';
import { normalize } from '../utils/text';

const TARGET_PER_CATEGORY = 30;
const DEFAULT_MAX_AGE_DAYS = 14;
const PAGE_SIZE = 200;
const DOMAIN_NAMES = ['thegioididong.com', 'cellphones.com.vn'];

type Listing = NonNullable<ReturnType<typeof mapAccessTradeCatalogListing>>;
type CatalogIdentity = { category: string; brand: string; model: string };

function canonicalCategory(value: string) { return value === 'watch' ? 'smartwatch' : value; }
function identityKey(value: CatalogIdentity) { return `${canonicalCategory(value.category)}|${normalize(value.brand)}|${normalize(value.model)}`; }
function safeDomain(value: string) { return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(); }
function parseOption(name: string, fallback: number) {
  const item = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!item) return fallback;
  const value = Number(item.slice(name.length + 3));
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer`);
  return value;
}

function parseDomains(): string[] {
  const option = process.argv.find((arg) => arg.startsWith('--domains='));
  if (!option) return DOMAIN_NAMES;
  const domains = option.slice('--domains='.length).split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!domains.length || domains.some((domain) => !ACCESTRADE_SELLERS[domain])) throw new Error('Only configured AccessTrade campaign domains are accepted');
  return [...new Set(domains)];
}

async function main() {
  const importMode = process.argv.includes('--import');
  const target = parseOption('target', TARGET_PER_CATEGORY);
  const maxPagesOption = process.argv.find((arg) => arg.startsWith('--max-pages='));
  const maxPages = maxPagesOption ? parseOption('max-pages', 1) : Number.POSITIVE_INFINITY;
  const domains = parseDomains();
  if (!process.env.ACCESSTRADE_API_KEY?.trim()) throw new Error('AccessTrade API key is not configured');

  await connectDB();
  const imagePermissions = new Map<string, boolean>();
  for (const domain of domains) {
    const seller = ACCESTRADE_SELLERS[domain];
    const source = await DataSource.findOne({ sourceKey: seller.sourceKey }).select(
      'active dataUsageAuthorized imageUsageAuthorized imagePermissionEvidence'
    ).lean() as { active?: boolean; dataUsageAuthorized?: boolean; imageUsageAuthorized?: boolean; imagePermissionEvidence?: string | null } | null;
    if (!source?.active || !source.dataUsageAuthorized) {
      throw new Error(`Data source ${seller.sourceKey} is missing or has no active data-use authorization`);
    }
    const imageUsageAuthorized = source.imageUsageAuthorized === true && Boolean(source.imagePermissionEvidence?.trim());
    imagePermissions.set(domain, imageUsageAuthorized);
  }

  const runStartedAt = new Date();
  const existing = await Product.find({}).select(
    '_id category brand model name productUrl sourceKey sourceProductId sourceProductIds verified productVerificationStatus urlVerificationStatus publicationStatus'
  ).lean() as Array<{ _id: mongoose.Types.ObjectId; category: string; brand?: string | null; model?: string | null; name?: string | null; productUrl?: string | null; sourceKey?: string | null; sourceProductId?: string | null; sourceProductIds?: string[]; verified?: boolean; productVerificationStatus?: string; urlVerificationStatus?: string; publicationStatus?: string }>;
  const pending = await PendingProduct.find({}).select('raw').lean() as Array<{ raw?: Record<string, unknown> }>;
  const productKeys = new Set<string>();
  const sourceProductKeys = new Set<string>();
  const productUrlKeys = new Set<string>();
  const existingProductIdsByUrl = new Map<string, { id: mongoose.Types.ObjectId; verifiedPublished: boolean }>();
  for (const item of existing) {
    if (item.brand && item.model) productKeys.add(identityKey({ category: item.category, brand: item.brand, model: item.model }));
    if (item.brand && item.name) productKeys.add(identityKey({ category: item.category, brand: item.brand, model: item.name }));
    if (item.sourceKey && item.sourceProductId) sourceProductKeys.add(`${item.sourceKey}|${item.sourceProductId}`);
    if (item.sourceKey) for (const sourceProductId of item.sourceProductIds ?? []) sourceProductKeys.add(`${item.sourceKey}|${sourceProductId}`);
    const urlKey = normalizeAccessTradeProductUrl(item.productUrl);
    if (urlKey) {
      productUrlKeys.add(urlKey);
      const verifiedPublished = item.verified === true && item.productVerificationStatus === 'verified' && item.publicationStatus === 'published';
      if (!existingProductIdsByUrl.has(urlKey) || verifiedPublished) {
        existingProductIdsByUrl.set(urlKey, { id: item._id, verifiedPublished });
      }
    }
  }
  for (const item of pending) {
    const raw = item.raw ?? {};
    const rawName = typeof raw.name === 'string' ? raw.name : '';
    const category = typeof raw.category === 'string' ? canonicalCategory(raw.category) : classifyAccessTradeListing(raw as any);
    const brand = typeof raw.brand === 'string' ? raw.brand : extractFeedBrand(raw as any);
    const model = typeof raw.model === 'string' ? raw.model : rawName;
    if (category && brand && model) productKeys.add(identityKey({ category, brand, model }));
  }
  const currentCounts: Record<string, number> = Object.fromEntries(CANONICAL_CATEGORY_KEYS.map((category) => [category, 0]));
  const publishedKeys = new Set(existing.filter((item) =>
    item.brand && item.model && item.verified === true && item.productVerificationStatus === 'verified'
    && item.urlVerificationStatus === 'verified' && item.publicationStatus === 'published'
  ).map((item) => identityKey({ category: item.category, brand: item.brand!, model: item.model! })));
  for (const key of publishedKeys) {
    const category = key.split('|')[0];
    currentCounts[category] = (currentCounts[category] ?? 0) + 1;
  }
  const selected = new Map<string, Listing>();
  const offerJobs = new Map<string, Listing>();
  const createdProductIds = new Map<string, mongoose.Types.ObjectId>();
  const stats = { pagesFetched: 0, scanned: 0, feedRowsMapped: 0, skippedOldOrInvalid: 0, skippedWithoutPermittedImage: 0, newModelsSelected: 0, duplicateModels: 0 };
  const discoveredTotals: Record<string, number | null> = {};

  for (const domain of domains) {
    const seller = ACCESTRADE_SELLERS[domain];
    const first = await fetchDatafeedPage({
      apiKey: process.env.ACCESSTRADE_API_KEY ?? '', baseUrl: process.env.ACCESSTRADE_BASE_URL, domain,
      page: 1, limit: PAGE_SIZE, retries: 1, timeoutMs: 20000,
    });
    discoveredTotals[domain] = first.total;
    const pagesAvailable = first.total === null ? Math.min(maxPages, 1000) : Math.ceil(first.total / PAGE_SIZE);
    const pagesToScan = Math.min(pagesAvailable, maxPages);
    for (let page = 1; page <= pagesToScan; page += 1) {
      const data = page === 1 ? first : await fetchDatafeedPage({
        apiKey: process.env.ACCESSTRADE_API_KEY ?? '', baseUrl: process.env.ACCESSTRADE_BASE_URL, domain,
        page, limit: PAGE_SIZE, retries: 1, timeoutMs: 20000,
      });
      stats.pagesFetched += 1;
      stats.scanned += data.items.length;
      for (const row of data.items) {
        const mapped = mapAccessTradeCatalogListing(row, {
          domain, imageUsageAuthorized: imagePermissions.get(domain) === true,
          maxAgeDays: DEFAULT_MAX_AGE_DAYS,
        });
        if (!mapped) { stats.skippedOldOrInvalid += 1; continue; }
        stats.feedRowsMapped += 1;
        const key = identityKey(mapped);
        const nameKey = identityKey({ category: mapped.category, brand: mapped.brand, model: mapped.product.name });
        const urlKey = normalizeAccessTradeProductUrl(mapped.product.productUrl);
        const alreadySelected = selected.has(key);
        const alreadyInCatalog = productKeys.has(key) || productKeys.has(nameKey)
          || sourceProductKeys.has(`${mapped.sourceKey}|${mapped.sourceProductId}`)
          || Boolean(urlKey && productUrlKeys.has(urlKey));
        if (alreadySelected) {
          stats.duplicateModels += 1;
          const jobKey = `${key}|${mapped.sourceKey}`;
          const prior = offerJobs.get(jobKey);
          if (!prior || prior.updatedAt < mapped.updatedAt) offerJobs.set(jobKey, mapped);
          continue;
        }
        if (alreadyInCatalog) {
          stats.duplicateModels += 1;
          const existingUrlMatch = urlKey ? existingProductIdsByUrl.get(urlKey) : undefined;
          if (existingUrlMatch?.verifiedPublished) {
            createdProductIds.set(key, existingUrlMatch.id);
            const jobKey = `${key}|${mapped.sourceKey}`;
            const prior = offerJobs.get(jobKey);
            if (!prior || prior.updatedAt < mapped.updatedAt) offerJobs.set(jobKey, mapped);
          }
          continue;
        }
        if (!mapped.product.imageUrl) {
          stats.skippedWithoutPermittedImage += 1;
          continue;
        }
        const category = canonicalCategory(mapped.category);
        if ((currentCounts[category] ?? 0) >= target) continue;
        selected.set(key, mapped);
        productKeys.add(key);
        productKeys.add(nameKey);
        if (urlKey) productUrlKeys.add(urlKey);
        sourceProductKeys.add(`${mapped.sourceKey}|${mapped.sourceProductId}`);
        currentCounts[category] = (currentCounts[category] ?? 0) + 1;
        stats.newModelsSelected += 1;
        const jobKey = `${key}|${mapped.sourceKey}`;
        const prior = offerJobs.get(jobKey);
        if (!prior || prior.updatedAt < mapped.updatedAt) offerJobs.set(jobKey, mapped);
      }
      if (data.items.length < PAGE_SIZE) break;
      if (page > 1) await new Promise((resolve) => setTimeout(resolve, 180));
    }
    console.info(`[catalog-feed] scanned ${seller.name}: ${pagesToScan} page(s), ${Math.min(dataCount(first.total, pagesToScan), stats.scanned)} rows`);
  }

  if (!importMode) {
    const belowTarget = Object.entries(currentCounts).filter(([, count]) => count < target).map(([category, count]) => ({ category, count, missing: target - count }));
    console.log(JSON.stringify({
      mode: 'dry-run', database: mongoose.connection.name, targetPerCategory: target,
      maxAgeDays: DEFAULT_MAX_AGE_DAYS, discoveredTotals, domains, stats,
      plannedProducts: [...selected.values()].map(({ category, brand, model, sourceKey, sourceProductId, product }) => ({
        category, brand, model, sourceKey, sourceProductId, productUrl: product.productUrl,
        titleDerivedSpecifications: product.specifications,
        hasPermittedFeedImage: Boolean(product.imageUrl),
      })),
      publishedUniqueProductsAfterPlannedImport: currentCounts, categoriesBelowTarget: belowTarget,
    }, null, 2));
    await mongoose.disconnect();
    return;
  }

  let productsCreated = 0;
  let productsMatchedExisting = 0;
  let offersUpserted = 0;
  for (const [key, mapped] of selected) {
    const exact = await Product.findOne({
      category: mapped.category,
      brand: new RegExp(`^${mapped.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      $or: [
        { model: new RegExp(`^${mapped.model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        { name: new RegExp(`^${mapped.product.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      ],
    }).select('_id publicationStatus').lean() as { _id: mongoose.Types.ObjectId; publicationStatus?: string } | null;
    if (exact?._id) {
      if (exact.publicationStatus === 'published') createdProductIds.set(key, exact._id);
      productsMatchedExisting += 1;
      continue;
    }
    const prior = await Product.findOne({ dedupeKey: mapped.product.dedupeKey }).select('_id').lean();
    if (prior?._id) {
      createdProductIds.set(key, prior._id as mongoose.Types.ObjectId);
      continue;
    }
    const product = await Product.create(mapped.product);
    createdProductIds.set(key, product._id as mongoose.Types.ObjectId);
    productsCreated += 1;
  }

  for (const [jobKey, mapped] of offerJobs) {
    const productKey = jobKey.slice(0, jobKey.lastIndexOf('|'));
    let productId = createdProductIds.get(productKey);
    if (!productId) {
      const product = await Product.findOne({
        category: mapped.category,
        brand: new RegExp(`^${mapped.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        model: new RegExp(`^${mapped.model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        publicationStatus: 'published',
      }).select('_id').lean();
      productId = product?._id as mongoose.Types.ObjectId | undefined;
    }
    if (!productId) continue;
    await Offer.updateOne({ productId, source: mapped.sourceKey, sellerName: ACCESTRADE_SELLERS[mapped.sourceKey === 'accesstrade-cellphones' ? 'cellphones.com.vn' : 'thegioididong.com'].name }, {
      $set: { ...mapped.offer, productId, source: mapped.sourceKey },
    }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
    offersUpserted += 1;
  }

  const byCategory = await Product.aggregate([
    { $match: { verified: true, productVerificationStatus: 'verified', urlVerificationStatus: 'verified', publicationStatus: 'published', source: { $in: ['accesstrade', 'csv', 'curated'] } } },
    { $group: { _id: { category: '$category', brand: { $toLower: '$brand' }, model: { $toLower: '$model' } } } },
    { $group: { _id: '$_id.category', uniqueBrandModels: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const publishedProducts = await Product.countDocuments({ publicationStatus: 'published' });
  const offers = await Offer.countDocuments({});
  const finishedAt = new Date();
  await SyncRun.create({
    source: 'accesstrade', sourceKey: `catalog-expansion:${domains.join(',')}`, mode: 'import', page: 1, status: 'succeeded',
    startedAt: runStartedAt, finishedAt,
    stats: {
      ...stats, fetched: stats.scanned, created: productsCreated, updated: productsMatchedExisting,
      offersCreatedOrUpdated: offersUpserted, pendingReview: 0,
      productsCreated, productsMatchedExisting, offersUpserted, publishedProducts, offers, targetPerCategory: target, categories: byCategory,
    },
  });
  console.log(JSON.stringify({ mode: 'import', database: mongoose.connection.name, targetPerCategory: target, discoveredTotals, stats, productsCreated, productsMatchedExisting, offersUpserted, publishedProducts, offers, publishedUniqueModelsByCategory: byCategory, categoriesBelowTarget: byCategory.filter((row: any) => row.uniqueBrandModels < target).map((row: any) => ({ category: row._id, count: row.uniqueBrandModels, missing: target - row.uniqueBrandModels })) }, null, 2));
  await mongoose.disconnect();
}

function dataCount(total: number | null, pages: number) {
  return total === null ? pages * PAGE_SIZE : Math.min(total, pages * PAGE_SIZE);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'AccessTrade catalog import failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
