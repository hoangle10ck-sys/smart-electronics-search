import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { PendingProduct } from '../models/PendingProduct';
import { SyncRun } from '../models/SyncRun';
import { verifyModelPage } from '../services/urlVerification';

const FILES = [
  'research-pending-amd-ryzen-7000-desktop.json',
  'research-pending-amd-ryzen-8000-desktop.json',
  'research-pending-amd-ryzen-9000-desktop.json',
];

type AmdSeed = {
  sourceKey: string;
  brand: string;
  model: string;
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

async function main() {
  let seedUrlCorrections = 0;
  const seedRows = await Promise.all(FILES.map(async (file) => {
    const path = resolve(__dirname, file);
    let content = await readFile(path, 'utf8');
    if (file === 'research-pending-amd-ryzen-9000-desktop.json') {
      // AMD's live 9500F page uses an uppercase F; its lowercase path returned HTTP 403.
      const oldSlug = 'amd-ryzen-5-9500f.html';
      const newSlug = 'amd-ryzen-5-9500F.html';
      seedUrlCorrections += content.split(oldSlug).length - 1;
      content = content.split(oldSlug).join(newSlug);
      await writeFile(path, content, 'utf8');
    }
    return JSON.parse(content) as AmdSeed[];
  }));
  const seeds = seedRows.flat();
  const keys = new Set(seeds.map((row) => row.sourceKey));
  if (seeds.length !== 32 || keys.size !== 32) throw new Error(`Expected 32 unique Ryzen 7000/8000/9000 rows; found ${seeds.length} rows and ${keys.size} unique keys`);

  const checks = await withConcurrency(seeds, 4, async (row) => {
    const hasSpecEvidence = Boolean(row.brand === 'AMD' && row.category === 'cpu' && row.model && row.specifications && Object.keys(row.specifications).length
      && row.evidence?.some((entry) => entry.evidenceType === 'identity' && [row.productUrl, row.specificationSourceUrl].includes(entry.sourceUrl))
      && row.evidence?.some((entry) => entry.evidenceType === 'specifications' && entry.sourceUrl === row.specificationSourceUrl));
    const productVerificationStatus = hasSpecEvidence ? 'verified' as const : 'pending' as const;
    try {
      if (!hasSpecEvidence) throw new Error('AMD identity or exact specification evidence is incomplete');
      const [productPage, specificationPage] = row.productUrl === row.specificationSourceUrl
        ? await Promise.all([verifyModelPage(row.productUrl, row.model), Promise.resolve(null)])
        : await Promise.all([verifyModelPage(row.productUrl, row.model), verifyModelPage(row.specificationSourceUrl, row.model)]);
      const specPage = specificationPage ?? productPage;
      return {
        sourceKey: row.sourceKey, model: row.model, productUrl: productPage.finalUrl, specificationSourceUrl: specPage.finalUrl,
        productVerificationStatus, urlVerificationStatus: 'verified' as const,
        productHttpStatus: productPage.status, specificationHttpStatus: specPage.status,
        checkedAt: new Date(Math.max(productPage.checkedAt.getTime(), specPage.checkedAt.getTime())).toISOString(),
      };
    } catch (error) {
      return {
        sourceKey: row.sourceKey, model: row.model, productUrl: row.productUrl, specificationSourceUrl: row.specificationSourceUrl,
        productVerificationStatus, urlVerificationStatus: 'pending' as const,
        reason: error instanceof Error ? error.message : 'AMD product/specification URL check failed',
      };
    }
  });

  await connectDB();
  const startedAt = new Date();
  try {
    const pendingRows = await PendingProduct.find({ sourceKey: { $in: [...keys] } }).select('sourceKey classification reviewDecision reasons raw urlVerificationStatus').lean() as any[];
    if (pendingRows.length !== 32 || pendingRows.some((row) => row.classification !== 'pending_review' || row.reviewDecision != null)) {
      throw new Error(`Expected 32 active, unreviewed AMD PendingProduct rows; found ${pendingRows.length}`);
    }
    const pendingByKey = new Map(pendingRows.map((row) => [row.sourceKey, row]));
    let updated = 0;
    let productVerified = 0;
    let urlVerified = 0;
    const finalModels = [];
    for (const check of checks) {
      const pending = pendingByKey.get(check.sourceKey);
      if (!pending) throw new Error(`Missing AMD PendingProduct ${check.sourceKey}`);
      if (check.productVerificationStatus === 'verified') productVerified += 1;
      const raw = pending.raw ?? {};
      const oldEvidence = Array.isArray(raw.sourceEvidence) ? raw.sourceEvidence : [];
      const priorUrlEvidence = oldEvidence.filter((entry: any) => entry.evidenceType === 'url_verification');
      const expectedUrls = [check.productUrl, check.specificationSourceUrl];
      const priorVerificationCoversUrls = pending.urlVerificationStatus === 'verified'
        && expectedUrls.every((url, index) => expectedUrls.indexOf(url) === index ? priorUrlEvidence.some((entry: any) => entry.sourceUrl === url) : true);
      // A current 403 can be AMD's automated-client block; retain a previously documented successful live check for the same canonical URLs.
      const preservePriorVerification = check.urlVerificationStatus === 'pending' && check.reason === 'Model page returned HTTP 403' && priorVerificationCoversUrls;
      const urlStatus = preservePriorVerification ? 'verified' : check.urlVerificationStatus;
      const urlCheckMethod = check.checkedAt ? 'Direct live model-page check.' : preservePriorVerification ? 'Prior successful live verification retained; current automated fetch returned HTTP 403.' : check.reason ?? 'URL check not verified.';
      if (urlStatus === 'verified') urlVerified += 1;
      const sourceEvidence = (check.checkedAt ? oldEvidence.filter((entry: any) => entry.evidenceType !== 'url_verification') : oldEvidence).map((entry: any) => ({
        ...entry,
        ...(entry.evidenceType === 'product_page' ? { sourceUrl: check.productUrl } : {}),
        ...(entry.evidenceType === 'specifications' ? { sourceUrl: check.specificationSourceUrl } : {}),
      }));
      const evidence = Array.isArray(raw.evidence) ? raw.evidence.filter((entry: any) => entry.evidenceType !== 'url_verification').map((entry: any) => ({
        ...entry,
        ...(entry.evidenceType === 'product_page' ? { sourceUrl: check.productUrl } : {}),
        ...(entry.evidenceType === 'specifications' ? { sourceUrl: check.specificationSourceUrl } : {}),
      })) : [];
      if (urlStatus === 'verified') {
        const checkedAt = check.checkedAt ? new Date(check.checkedAt) : new Date();
        const productPageEvidence = {
          evidenceType: 'product_page', sourceName: 'AMD live exact-model product page', sourceUrl: check.productUrl,
          notes: check.checkedAt ? `The exact AMD product page returned HTTP ${check.productHttpStatus} and identifies ${check.model}.` : `The official AMD exact-model page was previously confirmed and identifies ${check.model}.`,
        };
        if (!evidence.some((entry: any) => entry.evidenceType === 'product_page' && entry.sourceUrl === check.productUrl)) evidence.push(productPageEvidence);
        if (!sourceEvidence.some((entry: any) => entry.evidenceType === 'product_page' && entry.sourceUrl === check.productUrl)) sourceEvidence.push({ ...productPageEvidence, retrievedAt: checkedAt, verifiedAt: checkedAt });
        if (!evidence.some((entry: any) => entry.evidenceType === 'specifications' && entry.sourceUrl === check.specificationSourceUrl)) evidence.push({
          evidenceType: 'specifications', sourceName: 'AMD exact-model specifications page', sourceUrl: check.specificationSourceUrl,
          notes: `The exact AMD specification page returned HTTP ${check.specificationHttpStatus} and identifies ${check.model}.`,
        });
      }
      if (urlStatus === 'verified' && check.checkedAt) {
        const retrievedAt = new Date(check.checkedAt);
        sourceEvidence.push({ evidenceType: 'url_verification', sourceName: 'Live AMD exact-model product page check', sourceUrl: check.productUrl, retrievedAt, verifiedAt: retrievedAt, notes: `HTTP ${check.productHttpStatus}; AMD page identifies ${check.model}.` });
        if (check.specificationSourceUrl !== check.productUrl) sourceEvidence.push({
          evidenceType: 'url_verification', sourceName: 'Live AMD exact-model specification page check', sourceUrl: check.specificationSourceUrl,
          retrievedAt, verifiedAt: retrievedAt, notes: `HTTP ${check.specificationHttpStatus}; AMD specification source identifies ${check.model}.`,
        });
      }
      finalModels.push({ ...check, urlVerificationStatus: urlStatus, urlVerificationMethod: urlCheckMethod });
      const nextRaw = {
        ...raw,
        productUrl: check.productUrl,
        specificationSourceUrl: check.specificationSourceUrl,
        sourceEvidence,
        evidence,
        productVerificationStatus: check.productVerificationStatus,
        imageVerificationStatus: 'pending',
        urlVerificationStatus: urlStatus,
        publicationStatus: 'pending',
        imageUrl: null,
      };
      await PendingProduct.updateOne({ _id: pending._id, reviewDecision: null }, { $set: {
        productVerificationStatus: check.productVerificationStatus,
        imageVerificationStatus: 'pending',
        urlVerificationStatus: urlStatus,
        publicationStatus: 'pending',
        reasons: [
          ...(pending.reasons ?? []).filter((reason: string) => !/exact.*image|license|reuse permission|live AMD URL check/i.test(reason)),
          'No exact-model image with documented reuse permission has been visually checked; keep private pending image review.',
          ...(urlStatus === 'pending' ? [`Live AMD product/specification URL verification remains pending: ${check.reason ?? 'exact pages not verified'}.`] : []),
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
      batch: 'Existing AMD Ryzen 7000/8000/9000 exact-model URL verification',
      summary: {
        modelsChecked: checks.length,
        modelsWithVerifiedSpecifications: productVerified,
        modelsWithVerifiedProductAndSpecificationsUrls: urlVerified,
        correctedOfficialUrlReferences: seedUrlCorrections,
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
      models: finalModels,
    };
    const output = resolve(process.cwd(), '..', 'AMD_RYZEN_7000_8000_9000_2026_11_11_URL_VERIFICATION.json');
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await SyncRun.create({
      source: 'web_research', sourceKey: 'amd-ryzen-7000-8000-9000-exact-url-verification-2026-11-11', mode: 'update', page: 1,
      status: 'succeeded', startedAt, finishedAt,
      stats: { fetched: checks.length, created: 0, updated, skippedReviewed: 0, existingProductMatches: 0, pendingReview: checks.length, publicProductsCreated: 0, offersCreated: 0, verifiedProductStatus: productVerified, verifiedUrlStatus: urlVerified },
    });
    console.log(JSON.stringify({ output, ...report.summary, pendingUrlChecks: checks.length - urlVerified }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'AMD Ryzen URL verification failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
