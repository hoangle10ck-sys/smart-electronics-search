import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { PendingProduct } from '../models/PendingProduct';
import { SyncRun } from '../models/SyncRun';
import { verifyModelPage } from '../services/urlVerification';

const FILES = [
  'research-pending-intel-core-ultra-200s.json',
  'research-pending-intel-core-ultra-200s-mobile.json',
  'research-pending-intel-core-ultra-2026.json',
  'research-pending-intel-core-ultra-roster-completion.json',
];

type IntelSeed = {
  sourceKey: string;
  brand: string;
  model: string;
  modelNumber: string;
  category: string;
  productUrl: string;
  specificationSourceUrl: string;
  specifications: Record<string, unknown>;
  evidence: Array<{ evidenceType: string; sourceName: string; sourceUrl: string; notes?: string }>;
};

async function withConcurrency<T, R>(items: T[], concurrency: number, work: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      output[index] = await work(items[index]);
    }
  }));
  return output;
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

async function main() {
  const seeds = (await Promise.all(FILES.map(async (file) => JSON.parse(await readFile(resolve(__dirname, file), 'utf8')) as IntelSeed[]))).flat();
  const keys = new Set(seeds.map((row) => row.sourceKey));
  if (seeds.length !== 65 || keys.size !== 65) throw new Error(`Expected 65 unique Intel Core Ultra rows; found ${seeds.length} rows and ${keys.size} unique keys`);

  const checks = await withConcurrency(seeds, 5, async (row) => {
    const hasEvidence = Boolean(row.brand === 'Intel' && row.category === 'cpu' && row.modelNumber && row.specifications && Object.keys(row.specifications).length
      && row.productUrl === row.specificationSourceUrl
      && row.evidence?.some((entry) => entry.evidenceType === 'identity' && entry.sourceUrl === row.productUrl)
      && row.evidence?.some((entry) => entry.evidenceType === 'product_page' && entry.sourceUrl === row.productUrl)
      && row.evidence?.some((entry) => entry.evidenceType === 'specifications' && entry.sourceUrl === row.productUrl));
    const productVerificationStatus = hasEvidence ? 'verified' as const : 'pending' as const;
    try {
      if (!hasEvidence) throw new Error('Exact ARK identity, model, specification, and shared product/specification URL evidence are incomplete');
      const checked = await verifyModelPage(row.productUrl, row.modelNumber);
      if (!normalized(new URL(checked.finalUrl).pathname).includes(normalized(row.modelNumber))) throw new Error('Final Intel ARK path does not match the exact processor number');
      return { sourceKey: row.sourceKey, model: row.model, modelNumber: row.modelNumber, productUrl: checked.finalUrl, productVerificationStatus, urlVerificationStatus: 'verified' as const, httpStatus: checked.status, checkedAt: checked.checkedAt.toISOString() };
    } catch (error) {
      return { sourceKey: row.sourceKey, model: row.model, modelNumber: row.modelNumber, productUrl: row.productUrl, productVerificationStatus, urlVerificationStatus: 'pending' as const, reason: error instanceof Error ? error.message : 'Exact Intel ARK check failed' };
    }
  });

  await connectDB();
  const startedAt = new Date();
  try {
    const pendingRows = await PendingProduct.find({ sourceKey: { $in: [...keys] } }).select('sourceKey classification reviewDecision reasons raw').lean() as any[];
    if (pendingRows.length !== 65 || pendingRows.some((row) => row.classification !== 'pending_review' || row.reviewDecision != null)) {
      throw new Error(`Expected 65 active, unreviewed Intel PendingProduct rows; found ${pendingRows.length}`);
    }
    const pendingByKey = new Map(pendingRows.map((row) => [row.sourceKey, row]));
    let updated = 0;
    let productVerified = 0;
    let urlVerified = 0;
    for (const check of checks) {
      const pending = pendingByKey.get(check.sourceKey);
      if (!pending) throw new Error(`Missing Intel PendingProduct ${check.sourceKey}`);
      const raw = pending.raw ?? {};
      const productStatus = check.productVerificationStatus;
      const urlStatus = check.urlVerificationStatus;
      if (productStatus === 'verified') productVerified += 1;
      if (urlStatus === 'verified') urlVerified += 1;
      const rawEvidence = Array.isArray(raw.sourceEvidence) ? raw.sourceEvidence : [];
      const urlEvidence = urlStatus === 'verified' ? {
        evidenceType: 'url_verification', sourceName: 'Live Intel ARK exact-model URL check', sourceUrl: check.productUrl,
        retrievedAt: new Date(check.checkedAt), verifiedAt: new Date(check.checkedAt),
        notes: `HTTP ${check.httpStatus}; Intel ARK exact page contains Processor Number ${check.modelNumber}.`,
      } : null;
      const sourceEvidence = urlEvidence
        ? [...rawEvidence.filter((entry: any) => entry.evidenceType !== 'url_verification'), urlEvidence]
        : rawEvidence.filter((entry: any) => entry.evidenceType !== 'url_verification');
      const nextRaw = {
        ...raw,
        sourceEvidence,
        productVerificationStatus: productStatus,
        imageVerificationStatus: 'pending',
        urlVerificationStatus: urlStatus,
        publicationStatus: 'pending',
        imageUrl: null,
      };
      await PendingProduct.updateOne({ _id: pending._id, reviewDecision: null }, { $set: {
        productVerificationStatus: productStatus,
        imageVerificationStatus: 'pending',
        urlVerificationStatus: urlStatus,
        publicationStatus: 'pending',
        reasons: [
          ...(pending.reasons ?? []).filter((reason: string) => !/exact.*image|license|reuse permission|live ARK URL check/i.test(reason)),
          'No exact-model image with documented reuse permission has been visually checked; keep private pending image review.',
          ...(urlStatus === 'pending' ? [`Live Intel ARK model-number check remains pending: ${check.reason ?? 'exact page not verified'}.`] : []),
        ],
        raw: nextRaw,
        lastSeenAt: new Date(),
      } }, { runValidators: true });
      updated += 1;
    }
    const [productCount, pendingCount, activePendingCount, offers] = await Promise.all([
      (await import('../models/Product')).Product.countDocuments(),
      PendingProduct.countDocuments(),
      PendingProduct.countDocuments({ classification: 'pending_review', reviewDecision: null }),
      (await import('../models/Offer')).Offer.countDocuments(),
    ]);
    const finishedAt = new Date();
    const report = {
      checkedAt: finishedAt.toISOString(),
      database: mongoose.connection.name,
      batch: 'Existing Intel Core Ultra Series 2/3 exact ARK URL verification',
      summary: {
        modelsChecked: checks.length,
        modelsWithVerifiedSpecs: productVerified,
        modelsWithExactModelUrls: urlVerified,
        modelsWithExactModelImages: 0,
        modelsWithDocumentedImageReuseRights: 0,
        productsImported: 0,
        pendingProductDocuments: pendingCount,
        activePendingReviewRows: activePendingCount,
        verifiedPublishedByCategory: [{ category: 'cpu', batch: 0, database: 7 }],
        productDocuments: productCount,
        offers,
        offersCreated: 0,
      },
      models: checks,
    };
    const output = resolve(process.cwd(), '..', 'INTEL_CORE_ULTRA_2026_11_11_URL_VERIFICATION.json');
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await SyncRun.create({
      source: 'web_research', sourceKey: 'intel-core-ultra-ark-exact-url-verification-2026-11-11', mode: 'update', page: 1,
      status: 'succeeded', startedAt, finishedAt,
      stats: { fetched: checks.length, created: 0, updated, skippedReviewed: 0, existingProductMatches: 0, pendingReview: checks.length, publicProductsCreated: 0, offersCreated: 0, verifiedProductStatus: productVerified, verifiedUrlStatus: urlVerified },
    });
    console.log(JSON.stringify({ output, ...report.summary, pendingUrlChecks: checks.length - urlVerified }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Intel Core Ultra verification failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
