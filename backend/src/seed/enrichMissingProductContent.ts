import 'dotenv/config';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';
import { buildProductDescription } from '../services/productDescription';

type ImageEntry = {
  brand: string; model: string; category: string; name: string; productUrl: string;
  imageFile: string; imageUrl: string; imageSource: string; imageSourcePage: string; exactVariantEvidenceUrl: string;
};

const SEED_DIR = resolve(__dirname);
const IMAGE_DIR = resolve(__dirname, '../../../frontend/public/catalog-images');
const DESCRIPTION_EVIDENCE = 'description';

function isImageBytes(fileName: string, bytes: Buffer) {
  const extension = fileName.split('.').at(-1)?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === 'webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

async function prepareImage(entry: ImageEntry) {
  if (!/^[-a-z0-9]+\.(jpg|jpeg|webp)$/i.test(entry.imageFile)) throw new Error(`${entry.name}: invalid local image filename`);
  const localPath = resolve(IMAGE_DIR, entry.imageFile);
  if (dirname(localPath) !== IMAGE_DIR) throw new Error(`${entry.name}: image path escapes the catalog image directory`);
  const [bytes, imageStat] = await Promise.all([readFile(localPath), stat(localPath)]);
  if (imageStat.size < 10_000 || !isImageBytes(entry.imageFile, bytes)) throw new Error(`${entry.name}: image is missing, too small, or has the wrong file type`);
  for (const url of [entry.imageUrl, entry.imageSourcePage, entry.exactVariantEvidenceUrl, entry.productUrl]) {
    if (new URL(url).protocol !== 'https:') throw new Error(`${entry.name}: all image and product source URLs must use HTTPS`);
  }
  return { ...entry, localPath: `/catalog-images/${entry.imageFile}` };
}

async function main() {
  const descriptionsOnly = process.argv.includes('--descriptions-only');
  const imageConfig = descriptionsOnly ? [] : JSON.parse(await readFile(resolve(SEED_DIR, 'missing-content-image-2026-11-11.json'), 'utf8')) as ImageEntry[];
  const imageEntries = await Promise.all(imageConfig.map(prepareImage));
  await connectDB();
  const startedAt = new Date();
  try {
    const products = await Product.find({ publicationStatus: 'published', verified: true, description: { $in: [null, ''] } })
      .select('name brand model category description specifications specificationSourceUrl sourceEvidence verifiedAt updatedAt')
      .lean() as any[];
    const descriptions = products.flatMap((product) => {
      if (!product.brand || !product.model || !product.specificationSourceUrl) return [];
      const description = buildProductDescription(product.name, product.specifications);
      return description ? [{ product, description }] : [];
    });

    const imageTargets = [];
    for (const entry of imageEntries) {
      const matches = await Product.find({
        brand: entry.brand, model: entry.model, category: entry.category, name: entry.name, productUrl: entry.productUrl,
        publicationStatus: 'published', productVerificationStatus: 'verified',
      }).select('_id brand model category name productUrl imageUrl localOnlyAsset sourceEvidence').lean() as any[];
      if (matches.length !== 1) throw new Error(`${entry.name}: expected one published verified product record, found ${matches.length}`);
      const current = matches[0];
      if (current.imageUrl && !(current.localOnlyAsset === true && current.imageUrl === entry.localPath)) {
        throw new Error(`${entry.name}: record already has a different image; refusing to replace it automatically`);
      }
      imageTargets.push({ entry, product: current });
    }

    if (process.argv.includes('--dry-run')) {
      console.log(JSON.stringify({
        mode: 'dry-run', database: mongoose.connection.name,
        descriptionsToFill: descriptions.length,
        descriptionPreviews: descriptions.slice(0, 12).map(({ product, description }) => ({ name: product.name, description })),
        localImagesToAttach: imageTargets.map(({ entry }) => ({ name: entry.name, file: entry.imageFile, source: entry.imageSource })),
      }, null, 2));
      return;
    }

    const now = new Date();
    let descriptionsUpdated = 0;
    for (const { product, description } of descriptions) {
      const evidenceDate = product.verifiedAt ?? product.updatedAt ?? now;
      const sourceEvidence = [...(product.sourceEvidence ?? [])];
      if (!sourceEvidence.some((item: any) => item.evidenceType === DESCRIPTION_EVIDENCE && item.sourceUrl === product.specificationSourceUrl)) {
        sourceEvidence.push({
          evidenceType: DESCRIPTION_EVIDENCE,
          sourceName: 'Existing product specification record',
          sourceUrl: product.specificationSourceUrl,
          retrievedAt: evidenceDate,
          verifiedAt: evidenceDate,
          notes: 'Description synthesized only from the specifications already stored for this product; no new specifications or claims were added.',
        });
      }
      const result = await Product.updateOne(
        { _id: product._id, publicationStatus: 'published', description: { $in: [null, ''] } },
        { $set: { description, sourceEvidence } },
        { runValidators: true },
      );
      descriptionsUpdated += result.modifiedCount;
    }

    let imagesUpdated = 0;
    for (const { entry, product } of imageTargets) {
      if (product.localOnlyAsset === true && product.imageUrl === entry.localPath) continue;
      const sourceEvidence = [...(product.sourceEvidence ?? [])]
        .filter((item: any) => !['image', 'image_rights', 'image_license', 'image_local_copy'].includes(item.evidenceType));
      sourceEvidence.push({
        evidenceType: 'image_local_copy', sourceName: entry.imageSource, sourceUrl: entry.imageUrl,
        retrievedAt: now, verifiedAt: now,
        notes: `Copied from the public page ${entry.imageSourcePage} after a normal image request succeeded. The product image was visually checked; exact variant evidence is recorded at ${entry.exactVariantEvidenceUrl}. Reuse permission is not verified.`,
      });
      const result = await Product.updateOne({ _id: product._id }, { $set: {
        imageUrl: entry.localPath, localOnlyAsset: true,
        imageSource: entry.imageSource, imageSourceUrl: entry.imageUrl, imageAuthor: null,
        imageRetrievedAt: now, imageUsagePermission: 'not_provided', imagePermissionEvidence: null,
        imageLicense: null, imageLicenseUrl: null, imageAttribution: null,
        imageVisualIdentityChecked: true, imageVerificationStatus: 'pending', sourceEvidence,
      } }, { runValidators: true });
      imagesUpdated += result.modifiedCount;
    }

    const finishedAt = new Date();
    await SyncRun.create({
      source: 'catalog_enrichment', sourceKey: `catalog-content-enrichment:${startedAt.toISOString()}`, mode: 'import', page: 1,
      status: 'succeeded', startedAt, finishedAt,
      stats: { fetched: descriptions.length + imageTargets.length, created: 0, updated: descriptionsUpdated + imagesUpdated, descriptionsUpdated, imagesUpdated, pendingReview: 0 },
    });
    console.log(JSON.stringify({
      database: mongoose.connection.name, descriptionsUpdated, imagesUpdated,
      publishedProductsMissingDescription: await Product.countDocuments({ publicationStatus: 'published', description: { $in: [null, ''] } }),
      publishedProductsMissingImage: await Product.countDocuments({ publicationStatus: 'published', $or: [{ imageUrl: null }, { imageUrl: '' }] }),
      productCount: await Product.countDocuments(),
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Catalog content enrichment failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
