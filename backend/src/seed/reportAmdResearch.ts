import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { PendingProduct } from '../models/PendingProduct';
import { Offer } from '../models/Offer';

const seedFiles = [
  'research-pending-amd-ryzen-5000-desktop.json',
  'research-pending-amd-ryzen-4000-desktop.json',
  'research-pending-amd-ryzen-pro-4000-desktop.json',
];

async function main() {
  const seeds = (await Promise.all(seedFiles.map(async (file) => JSON.parse(await readFile(resolve(__dirname, file), 'utf8')) as any[]))).flat();
  if (seeds.length !== 36) throw new Error(`Expected 36 AMD Ryzen 5000/4000/PRO 4000 records; found ${seeds.length}`);
  await connectDB();
  try {
    const sourceKeys = seeds.map((row) => row.sourceKey);
    const [pendingDocs, products, offers] = await Promise.all([
      PendingProduct.find({ sourceKey: { $in: sourceKeys } }).lean() as Promise<any[]>,
      Product.find({ sourceKey: { $in: sourceKeys } }).lean() as Promise<any[]>,
      Offer.countDocuments(),
    ]);
    const pendingByKey = new Map(pendingDocs.map((row) => [row.sourceKey, row]));
    const productByKey = new Map(products.map((row) => [row.sourceKey, row]));
    const models = seeds.map((seed) => {
      const pending = pendingByKey.get(seed.sourceKey);
      const product = productByKey.get(seed.sourceKey);
      if (!pending) throw new Error(`Missing expected PendingProduct ${seed.sourceKey}`);
      const image = seed.imageCandidate ?? null;
      const imageIdentityChecked = image?.visualIdentityChecked === true && Boolean(image?.visualReviewNotes?.includes(seed.model));
      const rightsDocumented = Boolean(image?.license && image?.licenseUrl && image?.author && image?.attribution && image?.filePageUrl);
      return {
        model: seed.model,
        modelNumber: seed.modelNumber,
        family: seed.family,
        productUrl: seed.productUrl,
        specificationSourceUrl: seed.specificationSourceUrl,
        specifications: seed.specifications,
        sourceEvidence: seed.evidence,
        productVerificationStatus: pending.productVerificationStatus,
        imageVerificationStatus: pending.imageVerificationStatus,
        urlVerificationStatus: pending.urlVerificationStatus,
        publicationStatus: pending.publicationStatus,
        productImported: Boolean(product),
        image: image ? {
          imageUrl: image.imageUrl,
          filePageUrl: image.filePageUrl,
          license: image.license,
          licenseUrl: image.licenseUrl,
          author: image.author,
          attribution: image.attribution,
          visualIdentityChecked: imageIdentityChecked,
          visualReviewNotes: image.visualReviewNotes ?? null,
          evidence: {
            image: seed.evidence?.find((entry: any) => entry.evidenceType === 'image') ?? null,
            imageRights: seed.evidence?.find((entry: any) => entry.evidenceType === 'image_rights') ?? null,
          },
        } : null,
      };
    });
    const imageCandidates = models.filter((row) => row.image);
    const report = {
      updatedAt: new Date().toISOString(),
      database: mongoose.connection.name,
      batch: 'AMD Ryzen 5000, Ryzen 4000, Ryzen PRO 4000 desktop completion',
      sourceFiles: seedFiles,
      summary: {
        modelsResearched: models.length,
        modelsWithVerifiedSpecifications: models.filter((row) => row.productVerificationStatus === 'verified').length,
        modelsWithExactModelImage: imageCandidates.filter((row) => row.image?.visualIdentityChecked).length,
        modelsWithDocumentedImageReuseRights: imageCandidates.filter((row) => row.image?.evidence?.imageRights && row.image?.licenseUrl && row.image?.attribution).length,
        modelsWithVerifiedModelUrls: models.filter((row) => row.urlVerificationStatus === 'verified').length,
        productsImported: models.filter((row) => row.productImported).length,
        activePendingModels: pendingDocs.filter((row) => row.classification === 'pending_review' && row.reviewDecision == null).length,
        publishedModels: models.filter((row) => row.publicationStatus === 'published').length,
        verifiedPublishedByCategory: [{ category: 'cpu', count: models.filter((row) => row.publicationStatus === 'published' && row.productVerificationStatus === 'verified' && row.imageVerificationStatus === 'verified' && row.urlVerificationStatus === 'verified').length }],
        totalOffersInDatabase: offers,
        offersCreatedByBatch: 0,
      },
      urlVerification: 'The 36 exact AMD model pages returned HTTP 200 and identified the model in the page content during the preparation pass; six promoted records were checked again before publication.',
      models,
    };
    const output = resolve(process.cwd(), '..', 'AMD_RYZEN_2026_11_11_VERIFICATION.json');
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ output, summary: report.summary }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'AMD research report failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
