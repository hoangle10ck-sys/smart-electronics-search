import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { EJSON } from 'bson';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { PendingProduct } from '../models/PendingProduct';
import { SyncRun } from '../models/SyncRun';

const FILES = [
  'research-pending-amd-ryzen-7000-desktop.json',
  'research-pending-amd-ryzen-8000-desktop.json',
  'research-pending-amd-ryzen-9000-desktop.json',
];
const AMD_9500F_URL = 'https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-5-9500F.html';

async function main() {
  const backupDir = process.argv[2];
  if (!backupDir) throw new Error('Pass the pre-retry Mongo backup directory as the first argument');
  const seeds = (await Promise.all(FILES.map(async (file) => JSON.parse(await readFile(resolve(__dirname, file), 'utf8')) as any[]))).flat();
  if (seeds.length !== 32) throw new Error(`Expected 32 AMD Ryzen 7000/8000/9000 seeds; found ${seeds.length}`);
  const keys = new Set(seeds.map((row) => row.sourceKey));
  const backupPath = resolve(backupDir, 'pendingproducts.ejson');
  const backupRows = EJSON.parse(await readFile(backupPath, 'utf8')) as any[];
  const backupByKey = new Map(backupRows.map((row) => [row.sourceKey, row]));
  const storedAt = new Date();

  await connectDB();
  const startedAt = new Date();
  try {
    const currentRows = await PendingProduct.find({ sourceKey: { $in: [...keys] } }).select('sourceKey classification reviewDecision').lean() as any[];
    if (currentRows.length !== 32 || currentRows.some((row) => row.classification !== 'pending_review' || row.reviewDecision != null)) throw new Error(`Expected 32 active, unreviewed AMD PendingProduct rows; found ${currentRows.length}`);
    const seedByKey = new Map(seeds.map((row) => [row.sourceKey, row]));
    const models = [];
    let updated = 0;
    for (const current of currentRows) {
      const prior = backupByKey.get(current.sourceKey);
      const seed = seedByKey.get(current.sourceKey);
      if (!prior || !seed || prior.productVerificationStatus !== 'verified' || prior.imageVerificationStatus !== 'pending' || prior.publicationStatus !== 'pending') throw new Error(`Backup state is incomplete for ${current.sourceKey}`);
      const raw = prior.raw ?? {};
      const is9500F = seed.model === 'Ryzen 5 9500F';
      let urlStatus = prior.urlVerificationStatus === 'verified' ? 'verified' : 'pending';
      let verificationMethod = prior.urlVerificationStatus === 'verified' ? 'Prior successful live AMD page checks stored in the pre-retry Mongo backup.' : null;
      if (is9500F) {
        raw.productUrl = AMD_9500F_URL;
        raw.specificationSourceUrl = AMD_9500F_URL;
        raw.evidence = (Array.isArray(raw.evidence) ? raw.evidence : []).map((entry: any) => ({
          ...entry,
          ...(entry.sourceUrl?.toLowerCase().endsWith('/amd-ryzen-5-9500f.html') ? { sourceUrl: AMD_9500F_URL } : {}),
        }));
        const sourceEvidence = Array.isArray(raw.sourceEvidence) ? raw.sourceEvidence.map((entry: any) => ({
          ...entry,
          ...(entry.sourceUrl?.toLowerCase().endsWith('/amd-ryzen-5-9500f.html') ? { sourceUrl: AMD_9500F_URL } : {}),
        })) : [];
        sourceEvidence.push({
          evidenceType: 'url_verification', sourceName: 'AMD Web Search Live exact-model page check', sourceUrl: AMD_9500F_URL,
          retrievedAt: storedAt, verifiedAt: storedAt,
          notes: 'Opened the canonical AMD product page in Web Search Live; its title and specification table identify Ryzen 5 9500F. The lowercase URL variant returned HTTP 403 to the automated fetcher, so the canonical uppercase-F URL from AMD was recorded.',
        });
        raw.sourceEvidence = sourceEvidence;
        raw.productVerificationStatus = 'verified';
        raw.imageVerificationStatus = 'pending';
        raw.urlVerificationStatus = 'verified';
        raw.publicationStatus = 'pending';
        urlStatus = 'verified';
        verificationMethod = 'Opened exact canonical AMD model page via Web Search Live; automatic direct fetch was HTTP 403.';
      }
      if (!is9500F && urlStatus !== 'verified') throw new Error(`No prior live URL verification is present in backup for ${current.sourceKey}`);
      raw.productVerificationStatus = 'verified';
      raw.imageVerificationStatus = 'pending';
      raw.urlVerificationStatus = urlStatus;
      raw.publicationStatus = 'pending';
      raw.imageUrl = null;
      const reasons = [...(prior.reasons ?? []).filter((reason: string) => !/live AMD product\/specification URL verification remains pending/i.test(reason))];
      if (!reasons.some((reason: string) => /image|license|reuse permission/i.test(reason))) reasons.push('No exact-model image with documented reuse permission has been visually checked; keep private pending image review.');
      await PendingProduct.updateOne({ _id: current._id, reviewDecision: null }, { $set: {
        productVerificationStatus: 'verified', imageVerificationStatus: 'pending', urlVerificationStatus: urlStatus,
        publicationStatus: 'pending', raw, reasons, lastSeenAt: storedAt,
      } }, { runValidators: true });
      models.push({
        sourceKey: current.sourceKey, model: seed.model, modelNumber: seed.modelNumber,
        productUrl: raw.productUrl, specificationSourceUrl: raw.specificationSourceUrl,
        productVerificationStatus: 'verified', imageVerificationStatus: 'pending', urlVerificationStatus: urlStatus,
        publicationStatus: 'pending', urlVerificationMethod: verificationMethod,
      });
      updated += 1;
    }
    const [productCount, pendingCount, activePendingCount, offers] = await Promise.all([
      (await import('../models/Product')).Product.countDocuments(), PendingProduct.countDocuments(),
      PendingProduct.countDocuments({ classification: 'pending_review', reviewDecision: null }),
      (await import('../models/Offer')).Offer.countDocuments(),
    ]);
    const finishedAt = new Date();
    const report = {
      checkedAt: finishedAt.toISOString(), database: mongoose.connection.name,
      batch: 'AMD Ryzen 7000/8000/9000 exact-model URL status reconciliation',
      sourceBackup: backupDir,
      summary: {
        modelsResearched: models.length,
        modelsWithVerifiedSpecifications: models.filter((row) => row.productVerificationStatus === 'verified').length,
        modelsWithVerifiedProductAndSpecificationsUrls: models.filter((row) => row.urlVerificationStatus === 'verified').length,
        modelsWithExactModelImages: 0,
        modelsWithDocumentedImageReuseRights: 0,
        productsImported: 0,
        activePendingReviewRows: activePendingCount,
        verifiedPublishedByCategory: [{ category: 'cpu', batch: 0, database: 7 }],
        productDocuments: productCount, pendingProductDocuments: pendingCount, offers, offersCreated: 0,
      },
      models,
    };
    await writeFile(resolve(process.cwd(), '..', 'AMD_RYZEN_7000_8000_9000_2026_11_11_URL_VERIFICATION.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await SyncRun.create({
      source: 'web_research', sourceKey: 'amd-ryzen-7000-8000-9000-url-status-reconciliation-2026-11-11', mode: 'update', page: 1,
      status: 'succeeded', startedAt, finishedAt,
      stats: { fetched: models.length, created: 0, updated, skippedReviewed: 0, existingProductMatches: 0, pendingReview: models.length, publicProductsCreated: 0, offersCreated: 0, verifiedProductStatus: models.length, verifiedUrlStatus: models.filter((row) => row.urlVerificationStatus === 'verified').length },
    });
    console.log(JSON.stringify({ output: 'AMD_RYZEN_7000_8000_9000_2026_11_11_URL_VERIFICATION.json', ...report.summary }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'AMD status reconciliation failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
