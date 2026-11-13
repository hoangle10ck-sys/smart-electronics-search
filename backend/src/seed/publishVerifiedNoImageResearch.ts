import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { PendingProduct } from '../models/PendingProduct';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';
import { verifyModelPage } from '../services/urlVerification';
import { buildSearchText, normalize } from '../utils/text';
import { normalizeSpecs } from '../utils/specs';

type Evidence = { evidenceType: string; sourceName: string; sourceUrl: string; notes: string };
type Entry = {
  sourceKey: string; brand: string; model: string; modelNumber: string | null; name: string; category: string;
  family: string; generation: string | null; releaseYear: number | null; productStatus: string;
  productUrl: string; specificationSourceUrl: string; specifications: Record<string, unknown>;
  specs: Record<string, unknown>; description?: string; variants?: unknown[]; tags?: string[];
  dataAttribution?: string; dataSourceUrl?: string; dataLicense?: string; dataLicenseUrl?: string;
  evidence: Evidence[]; productVerificationStatus: string; imageVerificationStatus: string;
  urlVerificationStatus: string; publicationStatus: string;
};

function slug(value: string) {
  return normalize(value).replace(/\s+/g, '-');
}

async function main() {
  const args = process.argv.slice(2);
  const requestedKeys = new Set(args.filter((argument) => !argument.startsWith('--')));
  const reuseStoredVerification = args.includes('--reuse-stored-verification');
  if (!requestedKeys.size) throw new Error('Pass the exact source keys to publish.');
  const fileName = process.env.RESEARCH_PENDING_FILE ?? 'research-pending.json';
  if (fileName.includes('/') || fileName.includes('\\')) throw new Error('RESEARCH_PENDING_FILE must be a seed filename');
  const file = resolve(__dirname, fileName);
  const rows = JSON.parse(await readFile(file, 'utf8')) as Entry[];
  const entries = rows.filter((row) => requestedKeys.has(row.sourceKey));
  if (entries.length !== requestedKeys.size) throw new Error(`Requested ${requestedKeys.size} source row(s); found ${entries.length}`);

  for (const entry of entries) {
    const hasProductEvidence = entry.evidence.some((item) => ['identity', 'product_page'].includes(item.evidenceType) && item.sourceUrl === entry.productUrl);
    const hasSpecEvidence = entry.evidence.some((item) => item.evidenceType === 'specifications' && item.sourceUrl === entry.specificationSourceUrl);
    if (!entry.sourceKey.startsWith('web-research:') || !entry.brand || !entry.model || !Object.keys(entry.specifications ?? {}).length
      || entry.productVerificationStatus !== 'verified' || entry.urlVerificationStatus !== 'verified'
      || entry.imageVerificationStatus !== 'pending' || entry.publicationStatus !== 'pending'
      || !hasProductEvidence || !hasSpecEvidence || (entry as any).imageUrl || (entry as any).imageCandidate?.imageUrl) {
      throw new Error(`${entry.sourceKey}: verified identity/specs, pending image review, exact sources, and no display image are required`);
    }
    if (!reuseStoredVerification) {
      await verifyModelPage(entry.productUrl, entry.model);
      await verifyModelPage(entry.specificationSourceUrl, entry.model);
    }
  }

  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ mode: 'dry-run', verifiedSources: entries.map((entry) => ({ sourceKey: entry.sourceKey, productUrl: entry.productUrl, specificationSourceUrl: entry.specificationSourceUrl })) }, null, 2));
    return;
  }

  await connectDB();
  const startedAt = new Date();
  try {
    const pendingRows = await PendingProduct.find({ sourceKey: { $in: entries.map((entry) => entry.sourceKey) } });
    const pendingByKey = new Map(pendingRows.map((row) => [row.sourceKey, row]));
    if (pendingByKey.size !== entries.length) throw new Error(`Expected ${entries.length} pending rows; found ${pendingByKey.size}`);

    for (const entry of entries) {
      const pending = pendingByKey.get(entry.sourceKey)!;
      const raw = pending.raw as any;
      const evidenceMatches = raw?.evidence?.some((item: any) => ['identity', 'product_page'].includes(item.evidenceType) && item.sourceUrl === entry.productUrl)
        && raw?.evidence?.some((item: any) => item.evidenceType === 'specifications' && item.sourceUrl === entry.specificationSourceUrl);
      const alreadyPublished = pending.reviewDecision === 'approved' && pending.publicationStatus === 'published'
        && await Product.exists({ sourceKey: entry.sourceKey, publicationStatus: 'published' });
      if (alreadyPublished) continue;
      const checkedProductPage = raw?.evidence?.some((item: any) => item.evidenceType === 'product_page'
        && item.sourceUrl === entry.productUrl && /(?:returned HTTP 200|live HTTP and model-text check passed)/i.test(String(item.notes ?? '')));
      const storedVerificationFresh = pending.createdAt instanceof Date
        && pending.createdAt.getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000;
      const storedVerificationMatches = pending.productVerificationStatus === 'verified'
        && pending.urlVerificationStatus === 'verified'
        && raw?.productVerificationStatus === 'verified'
        && raw?.urlVerificationStatus === 'verified'
        && storedVerificationFresh && checkedProductPage;
      if (pending.classification !== 'pending_review' || pending.reviewDecision != null || raw?.brand !== entry.brand
        || raw?.model !== entry.model || raw?.category !== entry.category || raw?.productUrl !== entry.productUrl
        || raw?.specificationSourceUrl !== entry.specificationSourceUrl || !raw?.specifications || !evidenceMatches || raw?.imageUrl) {
        throw new Error(`${entry.sourceKey}: stored pending record differs from the researched identity/specifications`);
      }
      if (reuseStoredVerification && !storedVerificationMatches) {
        throw new Error(`${entry.sourceKey}: stored product/URL verification is missing, stale, or lacks a matching successful URL check`);
      }
      const duplicate = await Product.findOne({ brand: entry.brand, model: entry.model }).select('_id sourceKey').lean();
      if (duplicate) throw new Error(`${entry.sourceKey}: matching Product already exists (${duplicate.sourceKey ?? duplicate._id}); refusing duplicate`);
    }

    const now = new Date();
    let created = 0;
    let skippedPublished = 0;
    for (const entry of entries) {
      const pending = pendingByKey.get(entry.sourceKey)!;
      if (pending.reviewDecision === 'approved' && pending.publicationStatus === 'published') { skippedPublished += 1; continue; }
      const productSpecs = normalizeSpecs(entry.specs);
      const verificationAt = reuseStoredVerification ? pending.createdAt : now;
      const value = {
        name: entry.name, brand: entry.brand, model: entry.model, modelNumber: entry.modelNumber,
        family: entry.family, generation: entry.generation, releaseYear: entry.releaseYear,
        productStatus: entry.productStatus, category: entry.category, description: entry.description ?? null,
        imageUrl: null, imageSource: null, imageSourceUrl: null, imageAuthor: null, imageRetrievedAt: null,
        imageUsagePermission: 'not_provided', imagePermissionEvidence: null, imageLicense: null,
        imageLicenseUrl: null, imageAttribution: null, imageVisualIdentityChecked: false,
        sourceUrl: entry.productUrl, productUrl: entry.productUrl, specificationSourceUrl: entry.specificationSourceUrl,
        verified: true, verifiedAt: verificationAt, productVerificationStatus: 'verified', imageVerificationStatus: 'pending',
        urlVerificationStatus: 'verified', publicationStatus: 'published', specifications: entry.specifications,
        specs: productSpecs, variants: entry.variants ?? [], tags: entry.tags ?? [],
        sourceEvidence: entry.evidence.map((item) => ({ ...item, retrievedAt: verificationAt, verifiedAt: verificationAt })),
        ...(entry.dataAttribution ? {
          dataAttribution: entry.dataAttribution,
          dataSourceUrl: entry.dataSourceUrl ?? null,
          dataLicense: entry.dataLicense ?? null,
          dataLicenseUrl: entry.dataLicenseUrl ?? null,
        } : {}),
        source: 'curated', sourceProductId: entry.sourceKey, sourceKey: entry.sourceKey,
        dedupeKey: `research:${slug(`${entry.brand}-${entry.model}`)}`,
        electronicStatus: 'approved', price: null, originalPrice: null, rating: null, sold: null, stock: null,
        searchText: buildSearchText({ name: entry.name, brand: entry.brand, category: entry.category, description: entry.description, tags: entry.tags, specs: { ...entry.specifications, ...productSpecs } }),
      };
      await Product.updateOne({ dedupeKey: value.dedupeKey }, { $set: value }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
      created += 1;
      pending.productVerificationStatus = 'verified';
      pending.imageVerificationStatus = 'pending';
      pending.urlVerificationStatus = 'verified';
      pending.publicationStatus = 'published';
      pending.reviewDecision = 'approved';
      pending.reviewedAt = now;
      pending.raw = { ...pending.raw, ...entry, imageUrl: null, imageUsagePermission: 'not_provided' };
      await pending.save();
    }

    const counts = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ publicationStatus: 'published', imageVerificationStatus: 'pending', imageUrl: null }),
      PendingProduct.countDocuments({ classification: 'pending_review', reviewDecision: null }),
    ]);
    await SyncRun.create({
      source: 'web_research', sourceKey: `web-research:published-no-image:${entries.map((entry) => entry.sourceKey.split(':').at(-1)).join(',')}`,
      mode: 'import', page: 1, status: 'succeeded', startedAt, finishedAt: now,
      stats: { fetched: entries.length, created, updated: 0, skippedPublished, publicProductsCreated: created, offersCreated: 0, verificationMode: reuseStoredVerification ? 'fresh_matching_mongo_evidence' : 'live_url_recheck' },
    });
    console.log(JSON.stringify({ database: mongoose.connection.name, models: entries.map((entry) => entry.model), created, skippedPublished, products: counts[0], publishedWithoutVerifiedImage: counts[1], activePendingReview: counts[2] }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'No-image research publishing failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
