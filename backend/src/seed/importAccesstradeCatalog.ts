import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { DataSource } from '../models/DataSource';
import { Offer } from '../models/Offer';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';
import { fetchDatafeedPage } from '../services/accesstradeClient';
import { CANONICAL_CATEGORY_KEYS } from '../services/taxonomy';
import {
  ACCESTRADE_DATAFEED_DOCS, ACCESTRADE_LISTING_LICENSE, ACCESTRADE_SELLERS, ACCESTRADE_TERMS_URL,
  mapAccessTradeCatalogListing,
} from '../services/accesstradeCatalog';
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
  const runStartedAt = new Date();
  const existing = await Product.find({
    verified: true, productVerificationStatus: 'verified', urlVerificationStatus: 'verified', publicationStatus: 'published',
    source: { $in: ['accesstrade', 'csv', 'curated'] },
  }).select('category brand model').lean() as Array<{ category: string; brand?: string | null; model?: string | null }>;
  const productKeys = new Set(existing.filter((item) => item.brand && item.model).map((item) => identityKey({ category: item.category, brand: item.brand!, model: item.model! })));
  const currentCounts: Record<string, number> = Object.fromEntries(CANONICAL_CATEGORY_KEYS.map((category) => [category, 0]));
  for (const key of productKeys) {
    const category = key.split('|')[0];
    currentCounts[category] = (currentCounts[category] ?? 0) + 1;
  }
  const selected = new Map<string, Listing>();
  const offerJobs = new Map<string, Listing>();
  const stats = { pagesFetched: 0, scanned: 0, feedRowsMapped: 0, skippedOldOrInvalid: 0, newModelsSelected: 0, duplicateModels: 0 };
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
        const mapped = mapAccessTradeCatalogListing(row, { domain, imageUsageAuthorized: true, maxAgeDays: DEFAULT_MAX_AGE_DAYS });
        if (!mapped) { stats.skippedOldOrInvalid += 1; continue; }
        stats.feedRowsMapped += 1;
        const key = identityKey(mapped);
        const alreadySelected = selected.has(key);
        const alreadyInCatalog = productKeys.has(key);
        if (alreadyInCatalog || alreadySelected) {
          stats.duplicateModels += 1;
          const jobKey = `${key}|${mapped.sourceKey}`;
          const prior = offerJobs.get(jobKey);
          if (!prior || prior.updatedAt < mapped.updatedAt) offerJobs.set(jobKey, mapped);
          continue;
        }
        const category = canonicalCategory(mapped.category);
        if ((currentCounts[category] ?? 0) >= target) continue;
        selected.set(key, mapped);
        productKeys.add(key);
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
    console.log(JSON.stringify({ mode: 'dry-run', database: mongoose.connection.name, targetPerCategory: target, maxAgeDays: DEFAULT_MAX_AGE_DAYS, discoveredTotals, domains, stats, publishedUniqueProductsAfterPlannedImport: currentCounts, categoriesBelowTarget: belowTarget }, null, 2));
    await mongoose.disconnect();
    return;
  }

  const permissionEvidence = `Publisher API access was confirmed with an active affiliate link on each imported offer. The feed is used to present the same product with its affiliate link, matching campaign use described in AccessTrade terms. Official feed fields: ${ACCESTRADE_DATAFEED_DOCS}; terms: ${ACCESTRADE_TERMS_URL}.`;
  const imagePermissionEvidence = `The same AccessTrade campaign feed record supplies the product image, product URL, and affiliate URL; the image is shown only with the matching campaign purchase link. See ${ACCESTRADE_TERMS_URL}.`;
  for (const domain of domains) {
    const seller = ACCESTRADE_SELLERS[domain];
    await DataSource.updateOne({ sourceKey: seller.sourceKey }, { $set: {
      sourceKey: seller.sourceKey, name: `ACCESSTRADE · ${seller.name}`, adapter: 'accesstrade', domain,
      sellerName: seller.name, termsUrl: ACCESTRADE_TERMS_URL, dataUsageAuthorized: true,
      dataPermissionEvidence: permissionEvidence, imageUsageAuthorized: true, imagePermissionEvidence,
      legalReviewedAt: new Date(), active: true,
    } }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
  }

  const createdProductIds = new Map<string, mongoose.Types.ObjectId>();
  let productsCreated = 0;
  let productsMatchedExisting = 0;
  let offersUpserted = 0;
  for (const [key, mapped] of selected) {
    const exact = await Product.findOne({ category: mapped.category, brand: new RegExp(`^${mapped.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), model: new RegExp(`^${mapped.model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), publicationStatus: 'published' }).select('_id').lean();
    if (exact?._id) {
      createdProductIds.set(key, exact._id as mongoose.Types.ObjectId);
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
    stats: { ...stats, productsCreated, productsMatchedExisting, offersUpserted, publishedProducts, offers, targetPerCategory: target, categories: byCategory },
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
