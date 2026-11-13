import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { normalizeSpecs } from '../utils/specs';
import { PendingProduct } from '../models/PendingProduct';
import { SyncRun } from '../models/SyncRun';
import { verifyModelPage } from '../services/urlVerification';

async function verifyLicensedImage(candidate: any, model: string) {
  await verifyModelPage(candidate.filePageUrl, model);
  const pageResponse = await fetch(candidate.filePageUrl, { headers: { 'User-Agent': 'smart-electronics-search/1.0 (catalog image license verification)' }, signal: AbortSignal.timeout(15000) });
  if (!pageResponse.ok) throw new Error(`Commons file page returned HTTP ${pageResponse.status}`);
  const page = await pageResponse.text();
  if (!page.includes(candidate.license) || !page.toLowerCase().includes(String(candidate.author).split(/[ (,]/)[0].toLowerCase())) throw new Error(`Commons file page does not confirm the recorded author and ${candidate.license} terms`);
  let imageResponse = await fetch(candidate.imageUrl, { method: 'HEAD', headers: { 'User-Agent': 'smart-electronics-search/1.0 (licensed image verification)' }, signal: AbortSignal.timeout(15000) });
  if (imageResponse.status === 405 || imageResponse.status === 501) {
    imageResponse = await fetch(candidate.imageUrl, { method: 'GET', headers: { 'User-Agent': 'smart-electronics-search/1.0 (licensed image verification)', Range: 'bytes=0-0' }, signal: AbortSignal.timeout(15000) });
    await imageResponse.body?.cancel();
  }
  if (!imageResponse.ok || !imageResponse.headers.get('content-type')?.toLowerCase().startsWith('image/')) throw new Error(`Image URL did not return an image (HTTP ${imageResponse.status})`);
  if (candidate.visualIdentityChecked !== true || !candidate.visualReviewNotes?.includes(model)) throw new Error('Image candidate is not the exact visually reviewed processor image');
}

async function main() {
  const seedFiles = ['research-pending-amd-ryzen-5000-desktop.json', 'research-pending-amd-ryzen-4000-desktop.json', 'research-pending-amd-ryzen-pro-4000-desktop.json', 'research-pending-amd-ryzen-7000-desktop.json', 'research-pending-amd-ryzen-9000-desktop.json'];
  const rows = (await Promise.all(seedFiles.map((file) => readFile(resolve(__dirname, file), 'utf8').then((content) => JSON.parse(content) as any[])))).flat();
  const requestedKeys = new Set(process.argv.slice(2));
  const verifiedEntries = rows.filter((row) => row.imageVerificationStatus === 'verified');
  const entries = requestedKeys.size ? verifiedEntries.filter((row) => requestedKeys.has(row.sourceKey)) : verifiedEntries;
  if (entries.length === 0 || (requestedKeys.size > 0 && entries.length !== requestedKeys.size)) throw new Error(`Requested ${requestedKeys.size || 'at least one'} verified AMD source row(s); found ${entries.length}`);
  for (const entry of entries) {
    if (entry.publicationStatus !== 'pending' || entry.brand !== 'AMD' || entry.category !== 'cpu' || !entry.specifications || !entry.imageCandidate) throw new Error(`AMD source row is incomplete: ${entry.sourceKey}`);
    await verifyLicensedImage(entry.imageCandidate, entry.model);
  }
  await connectDB();
  const startedAt = new Date();
  try {
    const now = new Date();
    let created = 0;
    let updated = 0;
    const pendingRows = await PendingProduct.find({ sourceKey: { $in: entries.map((entry) => entry.sourceKey) } });
    const pendingByKey = new Map(pendingRows.map((row) => [row.sourceKey, row]));
    if (pendingByKey.size !== entries.length) throw new Error(`Expected ${entries.length} existing AMD PendingProduct rows; found ${pendingByKey.size}; refusing to create new identities`);
    for (const entry of entries) {
      const pending = pendingByKey.get(entry.sourceKey)!;
      const raw = pending.raw as any;
      const hasIdentityEvidence = raw?.evidence?.some((item: any) => ['identity', 'product_page'].includes(item.evidenceType) && item.sourceUrl === entry.productUrl);
      const hasSpecificationEvidence = raw?.evidence?.some((item: any) => item.evidenceType === 'specifications' && item.sourceUrl === entry.specificationSourceUrl);
      if (pending.classification !== 'pending_review' || (pending.reviewDecision && pending.reviewDecision !== 'approved')
        || pending.productVerificationStatus !== 'verified' || pending.urlVerificationStatus !== 'verified'
        || raw?.model !== entry.model || raw?.modelNumber !== entry.modelNumber || raw?.productUrl !== entry.productUrl
        || raw?.specificationSourceUrl !== entry.specificationSourceUrl || !hasIdentityEvidence || !hasSpecificationEvidence) {
        throw new Error(`${entry.sourceKey} does not have matching persisted model/specification and URL verification; refusing publication`);
      }
    }
    for (const entry of entries) {
      const pending = pendingByKey.get(entry.sourceKey)!;
      const dedupeKey = `catalog:${entry.brand.toLowerCase()}-${entry.model.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const prior = await Product.findOne({ brand: new RegExp(`^${entry.brand}$`, 'i'), model: new RegExp(`^${entry.model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).select('_id').lean();
      const sourceEvidence = entry.evidence.map((item: any) => ({ ...item, retrievedAt: now, verifiedAt: now }));
      const image = entry.imageCandidate;
      const value = {
        name: entry.name, brand: entry.brand, model: entry.model, modelNumber: entry.modelNumber,
        family: entry.family, generation: entry.generation, releaseYear: entry.releaseYear,
        productStatus: entry.productStatus, category: entry.category,
        description: entry.description, imageUrl: image.imageUrl,
        imageSource: image.filePageUrl, imageSourceUrl: image.filePageUrl,
        imageAuthor: image.author, imageRetrievedAt: now,
        imageUsagePermission: 'granted', imagePermissionEvidence: `${image.license}; ${image.attribution}; visual match confirmed from the processor lid marking.`,
        imageLicense: image.license, imageLicenseUrl: image.licenseUrl, imageAttribution: image.attribution,
        imageVisualIdentityChecked: true,
        sourceUrl: entry.productUrl, productUrl: entry.productUrl, specificationSourceUrl: entry.specificationSourceUrl,
        verified: true, verifiedAt: now,
        productVerificationStatus: 'verified', imageVerificationStatus: 'verified', urlVerificationStatus: 'verified', publicationStatus: 'published',
        specifications: entry.specifications, specs: normalizeSpecs(entry.specifications), variants: entry.variants ?? [], sourceEvidence,
        source: 'curated', sourceProductId: entry.sourceKey, sourceKey: entry.sourceKey, dedupeKey,
        electronicStatus: 'approved', price: null, originalPrice: null, rating: null, sold: null, stock: null,
      };
      const filter = prior ? { _id: prior._id } : { dedupeKey };
      const result = await Product.updateOne(filter, { $set: value }, { upsert: !prior, runValidators: true, setDefaultsOnInsert: true });
      if (result.upsertedCount) created += 1;
      else updated += 1;
      pending.productVerificationStatus = 'verified';
      pending.imageVerificationStatus = 'verified';
      pending.urlVerificationStatus = 'verified';
      pending.publicationStatus = 'published';
      pending.reviewDecision = 'approved';
      pending.reviewedAt = now;
      pending.raw = { ...pending.raw, productVerificationStatus: 'verified', imageVerificationStatus: 'verified', urlVerificationStatus: 'verified', publicationStatus: 'published', imageCandidate: image, imageUsagePermission: 'granted', imageVisualIdentityChecked: true, imageUrl: null };
      await pending.save();
    }
    const counts = await Promise.all([Product.countDocuments(), PendingProduct.countDocuments({ classification: 'pending_review', reviewDecision: null }), (await import('../models/Offer')).Offer.countDocuments()]);
    await SyncRun.create({
      source: 'web_research', sourceKey: `web-research:amd-ryzen-licensed-image-promotion-2026-11-11:${entries.map((entry) => entry.sourceKey.split(':').at(-1)).join(',')}`,
      mode: 'import', page: 1, status: 'succeeded', startedAt, finishedAt: now,
      stats: { fetched: entries.length, created, updated, skippedReviewed: 0, existingProductMatches: updated, pendingReview: 0, publicProductsCreated: created, offersCreated: 0 },
    });
    console.log(JSON.stringify({ database: mongoose.connection.name, models: entries.map((entry) => entry.model), modelCount: entries.length, created, updated, publicationStatus: 'published', offersCreated: 0, products: counts[0], pendingReview: counts[1], offers: counts[2] }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'AMD research promotion failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
