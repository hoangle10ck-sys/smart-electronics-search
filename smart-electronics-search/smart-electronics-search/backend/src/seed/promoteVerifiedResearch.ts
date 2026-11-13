import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Offer } from '../models/Offer';
import { PendingProduct } from '../models/PendingProduct';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';
import { verifyModelPage } from '../services/urlVerification';
import { buildSearchText } from '../utils/text';
import { normalizeSpecs } from '../utils/specs';

type Evidence = { evidenceType: string; sourceName: string; sourceUrl: string; notes: string };
type Entry = {
  sourceKey: string; brand: string; model: string; modelNumber: string | null; name: string; category: string;
  family: string; generation: string | null; releaseYear: number | null; productStatus: string;
  productUrl: string; specificationSourceUrl: string; specifications: Record<string, unknown>;
  description?: string; variants?: unknown[]; evidence: Evidence[];
  dataAttribution?: string; dataSourceUrl?: string; dataLicense?: string; dataLicenseUrl?: string;
  productVerificationStatus: string; imageVerificationStatus: string; urlVerificationStatus: string;
  publicationStatus: string;
  imageCandidate: {
    imageUrl: string; filePageUrl: string; license: string; licenseUrl: string; author: string;
    attribution: string; visualIdentityChecked: boolean; visualReviewNotes: string;
  };
};

function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'); }

async function checkImageAndRights(entry: Entry) {
  const image = entry.imageCandidate;
  if (!image?.imageUrl || !image.filePageUrl || !image.license || !image.licenseUrl || !image.author || !image.attribution
    || image.visualIdentityChecked !== true || !image.visualReviewNotes?.includes(entry.model)) {
    throw new Error(`${entry.sourceKey}: complete exact-image review metadata is required`);
  }
  await verifyModelPage(image.filePageUrl, entry.model);
  const pageResponse = await fetch(image.filePageUrl, {
    headers: { 'User-Agent': 'smart-electronics-search/1.0 (catalog image license verification)', Accept: 'text/html' },
    signal: AbortSignal.timeout(15000),
  });
  if (!pageResponse.ok) throw new Error(`${entry.sourceKey}: image file page returned HTTP ${pageResponse.status}`);
  const page = await pageResponse.text();
  if (!page.toLowerCase().includes(image.license.toLowerCase()) || !page.toLowerCase().includes(image.author.toLowerCase())) {
    throw new Error(`${entry.sourceKey}: Commons file page does not confirm the recorded author and license`);
  }
  const licenseResponse = await fetch(image.licenseUrl, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
  if (!licenseResponse.ok) throw new Error(`${entry.sourceKey}: license URL returned HTTP ${licenseResponse.status}`);
  let imageResponse = await fetch(image.imageUrl, {
    method: 'HEAD', headers: { 'User-Agent': 'smart-electronics-search/1.0 (licensed image verification)' },
    signal: AbortSignal.timeout(15000),
  });
  if (imageResponse.status === 405 || imageResponse.status === 501) {
    imageResponse = await fetch(image.imageUrl, {
      method: 'GET', headers: { 'User-Agent': 'smart-electronics-search/1.0 (licensed image verification)', Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(15000),
    });
    await imageResponse.body?.cancel();
  }
  if (!imageResponse.ok || !imageResponse.headers.get('content-type')?.toLowerCase().startsWith('image/')) {
    throw new Error(`${entry.sourceKey}: image URL did not return an image (HTTP ${imageResponse.status})`);
  }
}

async function main() {
  const requestedKeys = new Set(process.argv.slice(2));
  if (!requestedKeys.size) throw new Error('Pass the exact existing web-research source keys to promote.');
  const fileName = process.env.RESEARCH_PENDING_FILE ?? 'research-pending.json';
  if (fileName.includes('/') || fileName.includes('\\')) throw new Error('RESEARCH_PENDING_FILE must be a seed filename');
  const file = resolve(__dirname, fileName);
  const rows = JSON.parse(await readFile(file, 'utf8')) as Entry[];
  const entries = rows.filter((row) => requestedKeys.has(row.sourceKey));
  if (entries.length !== requestedKeys.size) throw new Error(`Requested ${requestedKeys.size} source row(s); found ${entries.length}`);
  for (const entry of entries) {
    if (!entry.sourceKey.startsWith('web-research:') || !entry.brand || !entry.model || !entry.specifications
      || Object.keys(entry.specifications).length === 0 || entry.publicationStatus !== 'pending'
      || entry.productVerificationStatus !== 'verified' || entry.urlVerificationStatus !== 'verified'
      || entry.imageVerificationStatus !== 'verified' || !entry.evidence?.length) {
      throw new Error(`${entry.sourceKey}: model, specs, independent verification statuses, and pending publication are required`);
    }
    if (!entry.evidence.some((item) => ['identity', 'product_page'].includes(item.evidenceType) && item.sourceUrl === entry.productUrl)
      || !entry.evidence.some((item) => item.evidenceType === 'specifications' && item.sourceUrl === entry.specificationSourceUrl)
      || !entry.evidence.some((item) => item.evidenceType === 'image' && item.sourceUrl === entry.imageCandidate.imageUrl)
      || !entry.evidence.some((item) => item.evidenceType === 'image_rights' && item.sourceUrl === entry.imageCandidate.filePageUrl)) {
      throw new Error(`${entry.sourceKey}: exact product, specs, image, and rights evidence URLs are required`);
    }
    await verifyModelPage(entry.productUrl, entry.model);
    await verifyModelPage(entry.specificationSourceUrl, entry.model);
    await checkImageAndRights(entry);
  }

  await connectDB();
  const startedAt = new Date();
  try {
    const pendingRows = await PendingProduct.find({ sourceKey: { $in: entries.map((entry) => entry.sourceKey) } });
    const pendingByKey = new Map(pendingRows.map((row) => [row.sourceKey, row]));
    if (pendingByKey.size !== entries.length) throw new Error(`Expected ${entries.length} existing pending rows; found ${pendingByKey.size}; refusing to create new identities`);
    for (const entry of entries) {
      const pending = pendingByKey.get(entry.sourceKey)!;
      const raw = pending.raw as any;
      const exactEvidence = raw?.evidence?.some((item: any) => ['identity', 'product_page'].includes(item.evidenceType) && item.sourceUrl === entry.productUrl)
        && raw?.evidence?.some((item: any) => item.evidenceType === 'specifications' && item.sourceUrl === entry.specificationSourceUrl);
      const alreadyPublished = pending.reviewDecision === 'approved' && pending.publicationStatus === 'published'
        && await Product.exists({ sourceKey: entry.sourceKey, publicationStatus: 'published' });
      if (alreadyPublished) continue;
      if (pending.classification !== 'pending_review' || pending.reviewDecision != null || raw?.brand !== entry.brand
        || raw?.model !== entry.model || raw?.category !== entry.category || raw?.productUrl !== entry.productUrl
        || raw?.specificationSourceUrl !== entry.specificationSourceUrl || !raw?.specifications || !exactEvidence) {
        throw new Error(`${entry.sourceKey}: persisted pending row differs from the researched identity/specification sources`);
      }
      const matchingProducts = await Product.find({
        brand: new RegExp(`^${escapeRegex(entry.brand)}$`, 'i'),
        model: new RegExp(`^${escapeRegex(entry.model)}$`, 'i'),
      }).select('_id').lean();
      if (matchingProducts.length > 1) throw new Error(`${entry.sourceKey}: multiple matching Product rows; refusing ambiguous merge`);
    }

    const now = new Date();
    let created = 0;
    let updated = 0;
    let skippedPublished = 0;
    for (const entry of entries) {
      const pending = pendingByKey.get(entry.sourceKey)!;
      if (pending.reviewDecision === 'approved' && pending.publicationStatus === 'published') { skippedPublished += 1; continue; }
      const image = entry.imageCandidate;
      const sourceEvidence = entry.evidence.map((item) => ({ ...item, retrievedAt: now, verifiedAt: now }));
      const previous = await Product.findOne({
        brand: new RegExp(`^${escapeRegex(entry.brand)}$`, 'i'),
        model: new RegExp(`^${escapeRegex(entry.model)}$`, 'i'),
      }).select('_id').lean();
      const value = {
        name: entry.name, brand: entry.brand, model: entry.model, modelNumber: entry.modelNumber,
        family: entry.family, generation: entry.generation, releaseYear: entry.releaseYear,
        productStatus: entry.productStatus, category: entry.category, description: entry.description ?? null,
        imageUrl: image.imageUrl, imageSource: image.filePageUrl, imageSourceUrl: image.filePageUrl,
        imageAuthor: image.author, imageRetrievedAt: now, imageUsagePermission: 'granted',
        imagePermissionEvidence: `${image.license}; ${image.attribution}; exact model visually checked against the Commons file page.`,
        imageLicense: image.license, imageLicenseUrl: image.licenseUrl, imageAttribution: image.attribution,
        imageVisualIdentityChecked: true, sourceUrl: entry.productUrl, productUrl: entry.productUrl,
        specificationSourceUrl: entry.specificationSourceUrl, verified: true, verifiedAt: now,
        productVerificationStatus: 'verified', imageVerificationStatus: 'verified',
        urlVerificationStatus: 'verified', publicationStatus: 'published',
        specifications: entry.specifications, specs: normalizeSpecs(entry.specifications), variants: entry.variants ?? [],
        dataAttribution: entry.dataAttribution ?? null, dataSourceUrl: entry.dataSourceUrl ?? null,
        dataLicense: entry.dataLicense ?? null, dataLicenseUrl: entry.dataLicenseUrl ?? null,
        sourceEvidence, source: 'curated', sourceProductId: entry.sourceKey, sourceKey: entry.sourceKey,
        dedupeKey: `catalog:${entry.brand.toLowerCase()}-${entry.model.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        electronicStatus: 'approved', price: null, originalPrice: null, rating: null, sold: null, stock: null,
        searchText: buildSearchText({ name: entry.name, brand: entry.brand, category: entry.category, description: entry.description, specs: normalizeSpecs(entry.specifications) }),
      };
      const result = await Product.updateOne(previous ? { _id: previous._id } : { dedupeKey: value.dedupeKey },
        { $set: value }, { upsert: !previous, runValidators: true, setDefaultsOnInsert: true });
      if (result.upsertedCount) created += 1; else updated += 1;
      pending.productVerificationStatus = 'verified';
      pending.imageVerificationStatus = 'verified';
      pending.urlVerificationStatus = 'verified';
      pending.publicationStatus = 'published';
      pending.reviewDecision = 'approved';
      pending.reviewedAt = now;
      pending.raw = { ...pending.raw, ...entry, imageUsagePermission: 'granted', imageVisualIdentityChecked: true, imageUrl: null };
      await pending.save();
    }
    const counts = await Promise.all([Product.countDocuments(), PendingProduct.countDocuments({ classification: 'pending_review', reviewDecision: null }), Offer.countDocuments()]);
    await SyncRun.create({
      source: 'web_research', sourceKey: `web-research:licensed-non-cpu-promotion:${entries.map((entry) => entry.sourceKey.split(':').at(-1)).join(',')}`,
      mode: 'import', page: 1, status: 'succeeded', startedAt, finishedAt: now,
      stats: { fetched: entries.length, created, updated, skippedPublished, pendingReview: 0, publicProductsCreated: created, offersCreated: 0 },
    });
    console.log(JSON.stringify({ database: mongoose.connection.name, models: entries.map((entry) => entry.model), modelCount: entries.length, created, updated, skippedPublished, products: counts[0], activePendingReview: counts[1], offers: counts[2] }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Research promotion failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
