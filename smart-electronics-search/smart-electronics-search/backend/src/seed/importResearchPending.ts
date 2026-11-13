import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { PendingProduct } from '../models/PendingProduct';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';
import { CANONICAL_CATEGORIES } from '../services/taxonomy';

type ResearchEntry = {
  sourceKey: string;
  brand: string;
  model: string;
  category: string;
  family: string;
  generation: string | null;
  productUrl: string;
  specificationSourceUrl: string;
  productVerificationStatus?: 'verified' | 'pending' | 'rejected';
  imageVerificationStatus?: 'verified' | 'pending' | 'rejected';
  urlVerificationStatus?: 'verified' | 'pending' | 'rejected';
  publicationStatus?: 'published' | 'pending' | 'hidden';
  imageCandidate?: { imageUrl?: string; filePageUrl?: string; license?: string; licenseUrl?: string; author?: string; attribution?: string; visualIdentityChecked?: boolean; visualReviewNotes?: string } | null;
  imageUrl?: string | null;
  evidence: Array<{ evidenceType: string; sourceName: string; sourceUrl: string; notes: string }>;
  reasons: string[];
  [key: string]: unknown;
};

const SOURCE = 'web_research';
const RUN_KEY = process.env.RESEARCH_BATCH_KEY ?? 'research-pending-batch-2026-11-10-02';
const httpsUrl = (value: unknown): value is string => typeof value === 'string' && /^https:\/\//i.test(value);

async function main() {
  const fileName = basename(process.env.RESEARCH_PENDING_FILE ?? 'research-pending.json');
  const entries = JSON.parse(await readFile(resolve(__dirname, fileName), 'utf8')) as ResearchEntry[];
  if (!entries.length || entries.length > 20) throw new Error('Research import must contain 1–20 records.');
  const categoryKeys = new Set(CANONICAL_CATEGORIES.map(({ key }) => key));
  const seen = new Set<string>();
  for (const entry of entries) {
    const modelKey = `${entry.brand.trim().toLowerCase()}|${entry.model.trim().toLowerCase()}`;
    if (seen.has(modelKey)) throw new Error(`Duplicate brand/model in research batch: ${modelKey}`);
    seen.add(modelKey);
    if (!entry.sourceKey.startsWith('web-research:') || !entry.brand || !entry.model || !entry.family) throw new Error(`Missing identity metadata for ${entry.sourceKey}`);
    if (!entry.generation && !entry.reasons.some((reason) => /generation/i.test(reason))) throw new Error(`Record missing a sourced generation must explain why it is unknown: ${entry.sourceKey}`);
    if (!categoryKeys.has(entry.category)) throw new Error(`Non-canonical category for ${entry.sourceKey}: ${entry.category}`);
    if (!httpsUrl(entry.productUrl) || !httpsUrl(entry.specificationSourceUrl)) throw new Error(`Product/specification URL must use HTTPS for ${entry.sourceKey}`);
    if (entry.imageUrl) throw new Error(`Research candidates with unchecked images must not contain a displayable image URL: ${entry.sourceKey}`);
    if (!Array.isArray(entry.evidence) || !entry.evidence.some((source) => source.evidenceType === 'identity') || !entry.evidence.some((source) => source.evidenceType === 'specifications')) throw new Error(`Identity and specifications evidence required: ${entry.sourceKey}`);
    if (entry.evidence.some((source) => !httpsUrl(source.sourceUrl))) throw new Error(`Evidence URLs must use HTTPS: ${entry.sourceKey}`);
    const productStatus = entry.productVerificationStatus ?? 'pending';
    const imageStatus = entry.imageVerificationStatus ?? 'pending';
    const urlStatus = entry.urlVerificationStatus ?? 'pending';
    const publicationStatus = entry.publicationStatus ?? 'pending';
    if (!['verified', 'pending', 'rejected'].includes(productStatus) || !['verified', 'pending', 'rejected'].includes(imageStatus) || !['verified', 'pending', 'rejected'].includes(urlStatus) || !['published', 'pending', 'hidden'].includes(publicationStatus)) throw new Error(`Invalid verification status for ${entry.sourceKey}`);
    if (productStatus === 'verified' && (!entry.specifications || !Object.keys(entry.specifications).length)) throw new Error(`Verified product requires sourced technical specifications: ${entry.sourceKey}`);
    if (urlStatus === 'verified' && (!entry.evidence.some((source) => source.evidenceType === 'product_page' && source.sourceUrl === entry.productUrl)
      || !entry.evidence.some((source) => source.evidenceType === 'specifications' && source.sourceUrl === entry.specificationSourceUrl))) throw new Error(`Verified URLs require exact-model product and specification evidence on their respective source pages: ${entry.sourceKey}`);
    if (imageStatus === 'verified') {
      const candidate = entry.imageCandidate;
      const hasImageEvidence = entry.evidence.some((source) => source.evidenceType === 'image' && source.sourceUrl === candidate?.filePageUrl);
      const hasRightsEvidence = entry.evidence.some((source) => source.evidenceType === 'image_rights' && source.sourceUrl === candidate?.filePageUrl);
      if (!candidate?.imageUrl || !httpsUrl(candidate.filePageUrl) || !candidate.license?.trim() || !httpsUrl(candidate.licenseUrl) || !candidate.author?.trim() || !candidate.attribution?.trim() || candidate.visualIdentityChecked !== true || !candidate.visualReviewNotes?.trim() || !hasImageEvidence || !hasRightsEvidence) throw new Error(`Verified image requires exact model match, file URL, visual review, license, attribution, and source evidence: ${entry.sourceKey}`);
    }
    if (publicationStatus === 'published') throw new Error(`Research queue records stay pending until a separately validated Product upsert: ${entry.sourceKey}`);
    if (!entry.reasons?.length) throw new Error(`Pending reason is required: ${entry.sourceKey}`);
  }

  await connectDB();
  const startedAt = new Date();
  let created = 0;
  let updated = 0;
  let skippedReviewed = 0;
  let existingProductMatches = 0;
  try {
    for (const entry of entries) {
      const existing = await PendingProduct.findOne({ sourceKey: entry.sourceKey }).lean();
      if (existing?.reviewDecision || existing?.reviewedAt) { skippedReviewed += 1; continue; }

      const duplicate = await Product.findOne({
        brand: new RegExp(`^${entry.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        model: new RegExp(`^${entry.model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }).select('_id').lean();
      if (duplicate) existingProductMatches += 1;

      const now = new Date();
      const sourceEvidence = entry.evidence.map((source) => ({ ...source, retrievedAt: now, verifiedAt: now }));
      const raw = {
        ...entry,
        source: SOURCE,
        sourceEvidence,
        imageUrl: null,
        image: null,
        imageUsagePermission: entry.imageVerificationStatus === 'verified' ? 'granted' : 'not_provided',
        imageVisualIdentityChecked: entry.imageCandidate?.visualIdentityChecked === true,
        imagePermissionEvidence: entry.imageVerificationStatus === 'verified' ? `${entry.imageCandidate?.license}; ${entry.imageCandidate?.attribution}; visually inspected against the exact product image candidate.` : null,
        imageLicense: entry.imageVerificationStatus === 'verified' ? entry.imageCandidate?.license : null,
        imageLicenseUrl: entry.imageVerificationStatus === 'verified' ? entry.imageCandidate?.licenseUrl : null,
        imageAttribution: entry.imageVerificationStatus === 'verified' ? entry.imageCandidate?.attribution : null,
        imageAuthor: entry.imageVerificationStatus === 'verified' ? entry.imageCandidate?.author : null,
        imageSource: entry.imageVerificationStatus === 'verified' ? entry.imageCandidate?.filePageUrl : null,
        imageSourceUrl: entry.imageVerificationStatus === 'verified' ? entry.imageCandidate?.filePageUrl : null,
        imageRetrievedAt: entry.imageVerificationStatus === 'verified' ? now : null,
        productVerificationStatus: entry.productVerificationStatus ?? 'pending',
        imageVerificationStatus: entry.imageVerificationStatus ?? 'pending',
        urlVerificationStatus: entry.urlVerificationStatus ?? 'pending',
        publicationStatus: entry.publicationStatus ?? 'pending',
        lastResearchedAt: now,
        potentialExistingProductId: duplicate?._id ?? null,
      };
      const filter = { sourceKey: entry.sourceKey, reviewDecision: null };
      await PendingProduct.updateOne(filter, {
        $set: { source: SOURCE, productVerificationStatus: entry.productVerificationStatus ?? 'pending', imageVerificationStatus: entry.imageVerificationStatus ?? 'pending', urlVerificationStatus: entry.urlVerificationStatus ?? 'pending', publicationStatus: entry.publicationStatus ?? 'pending', reasons: [...entry.reasons, ...(duplicate ? ['Matching brand/model already exists in Product; merge review required.'] : [])], raw, lastSeenAt: now },
        $setOnInsert: { classification: 'pending_review', reviewDecision: null, reviewedAt: null },
      }, { upsert: true, runValidators: true });
      if (existing) updated += 1; else created += 1;
    }
    const finishedAt = new Date();
    await SyncRun.create({
      source: SOURCE,
      sourceKey: RUN_KEY,
      mode: 'import',
      page: 1,
      status: 'succeeded',
      startedAt,
      finishedAt,
      stats: { fetched: entries.length, created, updated, skippedReviewed, existingProductMatches, pendingReview: created + updated, publicProductsCreated: 0, offersCreated: 0 },
    });
    console.log(JSON.stringify({ status: 'succeeded', database: mongoose.connection.name, sourceKey: RUN_KEY, fetched: entries.length, created, updated, skippedReviewed, existingProductMatches, publicProductsCreated: 0, offersCreated: 0 }, null, 2));
  } catch (error) {
    await SyncRun.create({
      source: SOURCE,
      sourceKey: RUN_KEY,
      mode: 'import',
      page: 1,
      status: 'failed',
      startedAt,
      finishedAt: new Date(),
      error: error instanceof Error ? error.message : 'Research pending import failed',
      stats: { fetched: entries.length, created, updated, skippedReviewed, existingProductMatches, pendingReview: created + updated, publicProductsCreated: 0, offersCreated: 0 },
    });
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Research pending import failed');
  process.exitCode = 1;
});
