import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Offer } from '../models/Offer';
import { PendingProduct } from '../models/PendingProduct';
import { Product } from '../models/Product';

async function main() {
  const seed = JSON.parse(await readFile(resolve(__dirname, 'research-pending-techapi-gpu-2026-11-11.json'), 'utf8')) as Array<{ sourceKey: string; model: string; evidence?: Array<{ evidenceType: string; sourceUrl: string }> }>;
  await connectDB();
  try {
    const keys = seed.map(({ sourceKey }) => sourceKey);
    const [products, pendingTotal, activePending, offers, gpuProducts, gpuPending, rows] = await Promise.all([
      Product.countDocuments(),
      PendingProduct.countDocuments(),
      PendingProduct.countDocuments({ classification: 'pending_review', reviewDecision: null }),
      Offer.countDocuments(),
      Product.countDocuments({ category: 'gpu' }),
      PendingProduct.countDocuments({ 'raw.category': 'gpu', classification: 'pending_review', reviewDecision: null }),
      PendingProduct.find({ sourceKey: { $in: keys } }).select('sourceKey raw productVerificationStatus imageVerificationStatus urlVerificationStatus publicationStatus classification reviewDecision reasons').lean() as Promise<any[]>,
    ]);
    const checks = seed.map((entry) => {
      const row = rows.find((candidate) => candidate.sourceKey === entry.sourceKey);
      const variantSourceUrl = entry.evidence?.find((item) => item.evidenceType === 'variant_specifications')?.sourceUrl;
      return {
        model: entry.model,
        found: Boolean(row),
        productVerified: row?.productVerificationStatus === 'verified',
        imagePending: row?.imageVerificationStatus === 'pending',
        urlVerified: row?.urlVerificationStatus === 'verified',
        publicationPending: row?.publicationStatus === 'pending',
        noDisplayImage: row?.raw?.imageUrl == null,
        attributionStored: row?.raw?.dataAttribution === 'Data from TechAPI' && row?.raw?.dataSourceUrl === 'https://github.com/GetTechAPI/TechAPI',
        shareAlikeLicenseStored: row?.raw?.dataLicense === 'CC BY-SA 4.0' && Boolean(row?.raw?.dataLicenseUrl),
        TechApiEvidenceStored: Array.isArray(row?.raw?.sourceEvidence) && row.raw.sourceEvidence.some((item: any) => item.evidenceType === 'catalog_record' && item.sourceName === 'TechAPI'),
        variantEvidenceStored: !variantSourceUrl || row?.raw?.sourceEvidence?.some((item: any) => item.evidenceType === 'variant_specifications' && item.sourceUrl === variantSourceUrl) === true,
        classificationPending: row?.classification === 'pending_review' && row?.reviewDecision == null,
      };
    });
    const complete = rows.length === seed.length && checks.every((row) => Object.entries(row).every(([key, value]) => key === 'model' || value === true));
    const report = {
      checkedAt: new Date().toISOString(), database: mongoose.connection.name, batchKey: 'techapi-gpu-pilot-2026-11-11',
      batch: { expected: seed.length, found: rows.length, complete },
      mongo: { products, pendingProductDocuments: pendingTotal, activePendingReview: activePending, offers, gpuProducts, activeGpuPending: gpuPending },
      statuses: { modelVerified: checks.filter((row) => row.productVerified).length, imagePending: checks.filter((row) => row.imagePending).length, urlVerified: checks.filter((row) => row.urlVerified).length, publicationPending: checks.filter((row) => row.publicationPending).length },
      checks,
      sourceLicense: { attribution: 'Data from TechAPI', source: 'https://github.com/GetTechAPI/TechAPI', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
      publishedProductsCreated: 0,
      offersCreated: 0,
    };
    await writeFile(resolve(__dirname, '../../../TECHAPI_GPU_MONGO_IMPORT_2026_11_11.json'), JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
    if (!complete) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'TechAPI Mongo report failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
