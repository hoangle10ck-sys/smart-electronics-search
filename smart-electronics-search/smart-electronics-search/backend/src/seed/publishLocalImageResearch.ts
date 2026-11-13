import 'dotenv/config';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { PendingProduct } from '../models/PendingProduct';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';
import { verifyModelPage } from '../services/urlVerification';
import { buildSearchText, normalize } from '../utils/text';
import { normalizeSpecs } from '../utils/specs';

type Evidence = { evidenceType: string; sourceName: string; sourceUrl: string; notes: string };
type ResearchEntry = {
  sourceKey: string; brand: string; model: string; modelNumber?: string | null; name: string; category: string;
  family?: string | null; generation?: string | null; releaseYear?: number | null; productStatus?: string;
  productUrl: string; specificationSourceUrl: string; specifications: Record<string, unknown>;
  specs?: Record<string, unknown>; description?: string; variants?: unknown[]; tags?: string[]; evidence: Evidence[];
};
type AssetRow = {
  sourceFile: string; sourceKey: string; imageFile: string; imageUrl: string; imageSource: string; imageSourcePage: string;
  catalogProductUrl?: string; catalogSpecificationUrl?: string; identityPageUrl?: string; identityText?: string; variantText?: string;
  productIdentityText?: string; productVariantText?: string; specificationIdentityText?: string; specificationVariantText?: string;
};

const SEED_DIR = resolve(__dirname);
const IMAGE_DIR = resolve(__dirname, '../../../frontend/public/catalog-images');
const ALLOWED_SEED_FILES = new Set(['research-pending.json', 'research-pending-shure-sm7b-2026-11-11.json']);

function slug(value: string) { return normalize(value).replace(/\s+/g, '-'); }

async function readEntries() {
  const configFile = resolve(SEED_DIR, 'local-image-research-2026-11-11.json');
  const config = JSON.parse(await readFile(configFile, 'utf8')) as AssetRow[];
  const rowsByFile = new Map<string, ResearchEntry[]>();
  for (const row of config) {
    if (!ALLOWED_SEED_FILES.has(row.sourceFile) || !/^[-a-z0-9]+\.(jpg|jpeg|png|webp)$/i.test(row.imageFile)
      || !row.sourceKey.startsWith('web-research:') || !row.imageSource || !row.imageSourcePage) {
      throw new Error(`${row.sourceKey}: invalid local image research metadata`);
    }
    let rows = rowsByFile.get(row.sourceFile);
    if (!rows) {
      rows = JSON.parse(await readFile(resolve(SEED_DIR, row.sourceFile), 'utf8')) as ResearchEntry[];
      rowsByFile.set(row.sourceFile, rows);
    }
    const entry = rows.find((candidate) => candidate.sourceKey === row.sourceKey);
    if (!entry || !entry.brand || !entry.model || !entry.name || !Object.keys(entry.specifications ?? {}).length
      || !entry.evidence?.some((item) => ['identity', 'product_page'].includes(item.evidenceType) && item.sourceUrl === entry.productUrl)
      || !entry.evidence.some((item) => item.evidenceType === 'specifications' && item.sourceUrl === entry.specificationSourceUrl)) {
      throw new Error(`${row.sourceKey}: exact product identity and specification evidence is incomplete`);
    }
    const localPath = resolve(IMAGE_DIR, row.imageFile);
    if (dirname(localPath) !== IMAGE_DIR) throw new Error(`${row.sourceKey}: image path is outside the catalog image directory`);
    const imageBytes = await readFile(localPath);
    const imageStat = await stat(localPath);
    if (imageStat.size < 1000 || !isImageBytes(row.imageFile, imageBytes)) throw new Error(`${row.sourceKey}: local image is missing, too small, or has the wrong file type`);
    const imageUrl = new URL(row.imageUrl);
    const pageUrl = new URL(row.imageSourcePage);
    if (imageUrl.protocol !== 'https:' || pageUrl.protocol !== 'https:') throw new Error(`${row.sourceKey}: image source URLs must use HTTPS`);
    const catalogProductUrl = row.catalogProductUrl ?? entry.productUrl;
    const productIdentityText = row.productIdentityText ?? row.identityText ?? entry.model;
    const identityPageUrl = row.identityPageUrl ?? entry.productUrl;
    try { await verifyModelPage(identityPageUrl, productIdentityText); }
    catch (error) { throw new Error(`${row.sourceKey}: product page verification failed (${identityPageUrl}): ${error instanceof Error ? error.message : 'unknown error'}`); }
    if (row.productVariantText) {
      try { await verifyModelPage(entry.productUrl, row.productVariantText); }
      catch (error) { throw new Error(`${row.sourceKey}: product variant verification failed (${entry.productUrl}): ${error instanceof Error ? error.message : 'unknown error'}`); }
    }
    if (row.catalogProductUrl) {
      try { await verifyModelPage(catalogProductUrl, row.identityText ?? entry.model); }
      catch (error) { throw new Error(`${row.sourceKey}: exact product listing verification failed (${catalogProductUrl}): ${error instanceof Error ? error.message : 'unknown error'}`); }
    }
    if (row.variantText) {
      try { await verifyModelPage(catalogProductUrl, row.variantText); }
      catch (error) { throw new Error(`${row.sourceKey}: variant page verification failed (${catalogProductUrl}): ${error instanceof Error ? error.message : 'unknown error'}`); }
    }
    const catalogSpecificationUrl = row.catalogSpecificationUrl ?? entry.specificationSourceUrl;
    const specIdentity = row.specificationIdentityText ?? entry.model;
    try { await verifyModelPage(catalogSpecificationUrl, row.specificationIdentityText ?? (row.catalogSpecificationUrl ? (row.identityText ?? entry.model) : specIdentity)); }
    catch (error) { throw new Error(`${row.sourceKey}: specification page verification failed (${catalogSpecificationUrl}): ${error instanceof Error ? error.message : 'unknown error'}`); }
    if (row.specificationVariantText) {
      try { await verifyModelPage(entry.specificationSourceUrl, row.specificationVariantText); }
      catch (error) { throw new Error(`${row.sourceKey}: specification variant verification failed (${entry.specificationSourceUrl}): ${error instanceof Error ? error.message : 'unknown error'}`); }
    }
  }
  return config;
}

function isImageBytes(fileName: string, bytes: Buffer) {
  const extension = fileName.split('.').at(-1)?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === 'png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === 'webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

function localImageEvidence(asset: AssetRow, entry: ResearchEntry, now: Date) {
  return {
    evidenceType: 'image_local_copy', sourceName: asset.imageSource, sourceUrl: asset.imageUrl,
    notes: `Image copied from the product listing at ${asset.imageSourcePage} after a normal public image request returned successfully. Stored for local development; reuse permission is not verified.`,
    retrievedAt: now, verifiedAt: now,
  };
}

async function main() {
  const config = await readEntries();
  const rowsByFile = new Map<string, ResearchEntry[]>();
  for (const row of config) {
    let rows = rowsByFile.get(row.sourceFile);
    if (!rows) {
      rows = JSON.parse(await readFile(resolve(SEED_DIR, row.sourceFile), 'utf8')) as ResearchEntry[];
      rowsByFile.set(row.sourceFile, rows);
    }
  }

  await connectDB();
  const startedAt = new Date();
  try {
    const sourceKeys = config.map((row) => row.sourceKey);
    const pendingRows = await PendingProduct.find({ sourceKey: { $in: sourceKeys } });
    const pendingByKey = new Map(pendingRows.map((row) => [row.sourceKey, row]));
    if (pendingByKey.size !== config.length) throw new Error(`Expected ${config.length} existing pending products, found ${pendingByKey.size}`);

    const prepared = config.map((asset) => {
      const entry = rowsByFile.get(asset.sourceFile)!.find((candidate) => candidate.sourceKey === asset.sourceKey)!;
      const pending = pendingByKey.get(asset.sourceKey)!;
      const raw = pending.raw as any;
      const evidenceMatches = raw?.evidence?.some((item: any) => ['identity', 'product_page'].includes(item.evidenceType) && item.sourceUrl === entry.productUrl)
        && raw?.evidence?.some((item: any) => item.evidenceType === 'specifications' && item.sourceUrl === entry.specificationSourceUrl);
      if (pending.classification !== 'pending_review' || (pending.reviewDecision != null && pending.reviewDecision !== 'approved')
        || raw?.brand !== entry.brand || raw?.model !== entry.model || raw?.category !== entry.category
        || raw?.productUrl !== entry.productUrl || raw?.specificationSourceUrl !== entry.specificationSourceUrl
        || !raw?.specifications || !evidenceMatches) {
        throw new Error(`${asset.sourceKey}: Mongo pending record differs from the researched identity and specification sources`);
      }
      return { asset, entry, pending };
    });

    for (const { entry, pending } of prepared) {
      const alreadyPublished = pending.reviewDecision === 'approved' && pending.publicationStatus === 'published'
        && await Product.exists({ sourceKey: entry.sourceKey, publicationStatus: 'published' });
      if (alreadyPublished) continue;
      const duplicate = await Product.findOne({ brand: entry.brand, model: entry.model }).select('_id sourceKey').lean();
      if (duplicate && duplicate.sourceKey !== entry.sourceKey) throw new Error(`${entry.sourceKey}: duplicate exact model already exists as ${duplicate.sourceKey ?? duplicate._id}`);
    }

    if (process.argv.includes('--dry-run')) {
      console.log(JSON.stringify({ mode: 'dry-run', verifiedModelPages: prepared.map(({ asset, entry }) => ({ model: entry.model, productUrl: asset.catalogProductUrl ?? asset.identityPageUrl ?? entry.productUrl, specificationSourceUrl: asset.catalogSpecificationUrl ?? entry.specificationSourceUrl })), localImages: prepared.map(({ asset }) => ({ sourceKey: asset.sourceKey, file: asset.imageFile, source: asset.imageSource })) }, null, 2));
      return;
    }

    const now = new Date();
    let created = 0;
    let updated = 0;
    let skippedPublished = 0;
    for (const { asset, entry, pending } of prepared) {
      const existingPublished = pending.reviewDecision === 'approved' && pending.publicationStatus === 'published'
        ? await Product.findOne({ sourceKey: entry.sourceKey, publicationStatus: 'published' }).select('_id imageUrl localOnlyAsset sourceEvidence').lean() as any
        : null;
      const localImagePath = `/catalog-images/${asset.imageFile}`;
      if (existingPublished) {
        if (existingPublished.localOnlyAsset === true && existingPublished.imageUrl === localImagePath) { skippedPublished += 1; continue; }
        const imageEvidence = localImageEvidence(asset, entry, now);
        const sourceEvidence = [...(existingPublished.sourceEvidence ?? []).filter((item: any) => !['image', 'image_rights', 'image_license', 'image_local_copy'].includes(item.evidenceType)), imageEvidence];
        await Product.updateOne({ _id: existingPublished._id }, { $set: {
          imageUrl: localImagePath, localOnlyAsset: true, imageSource: asset.imageSource, imageSourceUrl: asset.imageUrl,
          imageAuthor: null, imageRetrievedAt: now, imageUsagePermission: 'not_provided', imagePermissionEvidence: null,
          imageLicense: null, imageLicenseUrl: null, imageAttribution: null, imageVisualIdentityChecked: true,
          imageVerificationStatus: 'pending', sourceEvidence,
        } }, { runValidators: true });
        pending.imageVerificationStatus = 'pending';
        pending.raw = { ...pending.raw, imageVerificationStatus: 'pending', imageUrl: localImagePath, localOnlyAsset: true, imageUsagePermission: 'not_provided', imageCandidate: null };
        await pending.save();
        updated += 1;
        continue;
      }
      const productSpecs = normalizeSpecs(entry.specs ?? entry.specifications);
      const evidence = entry.evidence
        .filter((item) => !['image', 'image_rights', 'image_license'].includes(item.evidenceType))
        .filter((item) => !(asset.identityPageUrl && item.evidenceType === 'product_page' && item.sourceUrl === entry.productUrl))
        .filter((item) => !(asset.catalogSpecificationUrl && item.evidenceType === 'specifications' && item.sourceUrl === entry.specificationSourceUrl))
        .map((item) => ({ ...item, retrievedAt: now, verifiedAt: now }));
      if (asset.catalogSpecificationUrl) evidence.push({
        evidenceType: 'specifications', sourceName: asset.imageSource, sourceUrl: asset.catalogSpecificationUrl,
        notes: `${entry.model} technical details are listed on this local retailer product page.`, retrievedAt: now, verifiedAt: now,
      });
      evidence.push(localImageEvidence(asset, entry, now));
      if (asset.identityPageUrl) evidence.push({
        evidenceType: 'product_identity', sourceName: entry.evidence.find((item) => item.sourceUrl === asset.identityPageUrl)?.sourceName ?? asset.imageSource,
        sourceUrl: asset.identityPageUrl, notes: `Manufacturer identity page verified ${entry.model}.`, retrievedAt: now, verifiedAt: now,
      });
      if (asset.catalogProductUrl) evidence.push({
        evidenceType: 'product_variant_listing', sourceName: asset.imageSource, sourceUrl: asset.catalogProductUrl,
        notes: `${entry.model} exact configuration is identified on the retailer page.`, retrievedAt: now, verifiedAt: now,
      });
      const value = {
        name: entry.name, brand: entry.brand, model: entry.model, modelNumber: entry.modelNumber ?? null,
        family: entry.family ?? null, generation: entry.generation ?? null, releaseYear: entry.releaseYear ?? null,
        productStatus: entry.productStatus ?? 'unknown', category: entry.category, description: entry.description ?? null,
        imageUrl: localImagePath, localOnlyAsset: true,
        imageSource: asset.imageSource, imageSourceUrl: asset.imageUrl, imageAuthor: null, imageRetrievedAt: now,
        imageUsagePermission: 'not_provided', imagePermissionEvidence: null, imageLicense: null, imageLicenseUrl: null,
        imageAttribution: null, imageVisualIdentityChecked: true,
        sourceUrl: asset.catalogProductUrl ?? entry.productUrl, productUrl: asset.catalogProductUrl ?? entry.productUrl,
        specificationSourceUrl: asset.catalogSpecificationUrl ?? entry.specificationSourceUrl,
        verified: true, verifiedAt: now, productVerificationStatus: 'verified', imageVerificationStatus: 'pending',
        urlVerificationStatus: 'verified', publicationStatus: 'published', specifications: entry.specifications,
        specs: productSpecs, variants: entry.variants ?? [], tags: entry.tags ?? [], sourceEvidence: evidence,
        source: 'curated', sourceProductId: entry.sourceKey, sourceKey: entry.sourceKey,
        dedupeKey: `research:${slug(`${entry.brand}-${entry.model}`)}`,
        electronicStatus: 'approved', price: null, originalPrice: null, rating: null, sold: null, stock: null,
        searchText: buildSearchText({ name: entry.name, brand: entry.brand, category: entry.category, description: entry.description, tags: entry.tags, specs: { ...entry.specifications, ...productSpecs } }),
      };
      const result = await Product.updateOne({ dedupeKey: value.dedupeKey }, { $set: value }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
      if (result.upsertedCount) created += 1; else updated += 1;
      pending.productVerificationStatus = 'verified';
      pending.imageVerificationStatus = 'pending';
      pending.urlVerificationStatus = 'verified';
      pending.publicationStatus = 'published';
      pending.reviewDecision = 'approved';
      pending.reviewedAt = now;
      pending.raw = { ...pending.raw, productVerificationStatus: 'verified', imageVerificationStatus: 'pending', urlVerificationStatus: 'verified', publicationStatus: 'published', imageUrl: localImagePath, localOnlyAsset: true, imageUsagePermission: 'not_provided', imageCandidate: null };
      await pending.save();
    }
    const products = await Product.countDocuments();
    const offers = await mongoose.connection.db!.collection('offers').countDocuments();
    await SyncRun.create({
      source: 'web_research', sourceKey: `web-research:local-image-product-promotion:${prepared.map(({ entry }) => entry.sourceKey.split(':').at(-1)).join(',')}`,
      mode: 'import', page: 1, status: 'succeeded', startedAt, finishedAt: now,
      stats: { fetched: prepared.length, created, updated, skippedPublished, pendingReview: 0, publicProductsCreated: created, offersCreated: 0 },
    });
    console.log(JSON.stringify({ database: mongoose.connection.name, processed: prepared.length, created, updated, skippedPublished, products, offers, localOnlyImages: prepared.length }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Local catalog publication failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
