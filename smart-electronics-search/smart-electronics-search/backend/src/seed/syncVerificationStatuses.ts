import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { PendingProduct } from '../models/PendingProduct';

type UrlCheck = { sourceProductId: string; imageUrl: string; productUrl: string; specificationSourceUrl: string };

async function main() {
  await connectDB();
  try {
    const report = JSON.parse(await readFile(resolve(__dirname, '../../../CATALOG_URL_VERIFICATION.json'), 'utf8')) as { entries?: UrlCheck[] };
    const checked = new Map((report.entries ?? []).map((entry) => [entry.sourceProductId, entry]));
    const products = await Product.find({}).lean() as any[];
    const byCategory = new Map<string, { total: number; verified: number; published: number; pending: number; hidden: number }>();
    let productStatusVerified = 0;
    let imageStatusVerified = 0;
    let urlStatusVerified = 0;
    let published = 0;
    let hidden = 0;

    for (const product of products) {
      const catalogUrls = product.sourceProductId ? checked.get(product.sourceProductId) : null;
      const hasSpecs = Boolean(product.specifications && typeof product.specifications === 'object' && Object.keys(product.specifications).length);
      const productVerified = product.verified === true && Boolean(product.verifiedAt) && Boolean(product.brand && product.model && hasSpecs);
      const imageVerified = product.imageUsagePermission === 'granted' && Boolean(product.imageUrl && product.imageSource)
        && Boolean(product.imagePermissionEvidence || (product.imageLicenseUrl && product.imageAttribution));
      const urlVerified = Boolean(catalogUrls && catalogUrls.imageUrl === product.imageUrl && catalogUrls.productUrl === product.productUrl && catalogUrls.specificationSourceUrl === product.specificationSourceUrl);
      const isPublishable = productVerified && imageVerified && urlVerified && ['accesstrade', 'csv', 'curated'].includes(product.source)
        && product.electronicStatus !== 'pending_review' && Boolean(product.productUrl && product.specificationSourceUrl && product.brand && product.model);
      const publicationStatus = isPublishable ? 'published' : product.verified === true ? 'pending' : 'hidden';

      await Product.updateOne({ _id: product._id }, { $set: {
        productVerificationStatus: productVerified ? 'verified' : 'pending',
        imageVerificationStatus: imageVerified ? 'verified' : 'pending',
        urlVerificationStatus: urlVerified ? 'verified' : 'pending',
        publicationStatus,
      } }, { runValidators: true });

      if (productVerified) productStatusVerified += 1;
      if (imageVerified) imageStatusVerified += 1;
      if (urlVerified) urlStatusVerified += 1;
      if (isPublishable) published += 1;
      if (publicationStatus === 'hidden') hidden += 1;
      const row = byCategory.get(product.category) ?? { total: 0, verified: 0, published: 0, pending: 0, hidden: 0 };
      row.total += 1;
      row.verified += productVerified ? 1 : 0;
      row.published += publicationStatus === 'published' ? 1 : 0;
      row.pending += publicationStatus === 'pending' ? 1 : 0;
      row.hidden += publicationStatus === 'hidden' ? 1 : 0;
      byCategory.set(product.category, row);
    }

    const pendingProducts = await PendingProduct.find({}).lean() as any[];
    let researchPending = 0;
    let researchVerified = 0;
    let researchRejected = 0;
    for (const item of pendingProducts) {
      const rejected = item.classification === 'rejected' || item.reviewDecision === 'rejected';
      const productStatus = rejected ? 'rejected' : item.productVerificationStatus ?? item.raw?.productVerificationStatus ?? 'pending';
      const imageStatus = rejected ? 'pending' : item.imageVerificationStatus ?? item.raw?.imageVerificationStatus ?? 'pending';
      const urlStatus = rejected ? 'pending' : item.urlVerificationStatus ?? item.raw?.urlVerificationStatus ?? 'pending';
      const previouslyPublished = item.reviewDecision === 'approved' && item.publicationStatus === 'published'
        && productStatus === 'verified' && imageStatus === 'verified' && urlStatus === 'verified';
      const publicationStatus = rejected ? 'hidden' : previouslyPublished ? 'published' : 'pending';
      await PendingProduct.updateOne({ _id: item._id }, { $set: {
        productVerificationStatus: productStatus,
        imageVerificationStatus: imageStatus,
        urlVerificationStatus: urlStatus,
        publicationStatus,
      } }, { runValidators: true });
      if (rejected) researchRejected += 1;
      else {
        researchPending += 1;
        if (productStatus === 'verified') researchVerified += 1;
      }
    }
    console.log(JSON.stringify({
      database: mongoose.connection.name,
      products: products.length,
      productStatusVerified,
      imageStatusVerified,
      urlStatusVerified,
      published,
      productPublicationPending: products.filter((product) => product.verified === true && !checked.has(product.sourceProductId ?? '')).length,
      hidden,
      pendingResearch: researchPending,
      pendingResearchProductVerified: researchVerified,
      rejectedResearch: researchRejected,
      categories: [...byCategory.entries()].map(([category, counts]) => ({ category, ...counts })),
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Verification status synchronization failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
