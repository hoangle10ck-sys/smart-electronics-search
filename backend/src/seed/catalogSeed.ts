import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { buildSearchText, normalize } from '../utils/text';
import { CatalogProduct, loadAndValidateCatalog } from './catalogValidation';
import { normalizeSpecs } from '../utils/specs';
import { normalizeProduct } from '../services/productNormalizer';
import { buildProductDescription } from '../services/productDescription';

function normalizeId(product: CatalogProduct) {
  return `catalog:${normalize(`${product.brand}-${product.model}`).replace(/\s+/g, '-')}`;
}

export async function seedCatalog(options: { verifyUrls?: boolean } = {}) {
  const products = await loadAndValidateCatalog(options);

  await connectDB();
  let created = 0;
  let updated = 0;
  for (const product of products) {
    const dedupeKey = normalizeId(product);
    const description = buildProductDescription(product.name, product.specifications);
    if (!description) throw new Error(`${product.sourceProductId}: cannot build a description from the sourced specifications`);
    const verifiedAt = new Date(product.verifiedAt);
    const sourceEvidence = [
      { evidenceType: 'identity', sourceName: 'Manufacturer product page', sourceUrl: product.productUrl },
      { evidenceType: 'product_page', sourceName: 'Manufacturer product page', sourceUrl: product.productUrl },
      { evidenceType: 'specifications', sourceName: 'Manufacturer specifications', sourceUrl: product.specificationSourceUrl },
      { evidenceType: 'description', sourceName: 'Description summarized from catalog specifications', sourceUrl: product.specificationSourceUrl, notes: 'Contains only facts from the specifications field; no new claims were added.' },
      { evidenceType: 'image', sourceName: 'Wikimedia Commons file page', sourceUrl: product.imageSource },
      { evidenceType: 'image_rights', sourceName: 'Wikimedia Commons file page', sourceUrl: product.imageSource },
    ].map((evidence) => ({ ...evidence, retrievedAt: verifiedAt, verifiedAt }));
    const value = {
      ...product,
      description,
      sourceEvidence,
      specs: normalizeSpecs({ ...product.specifications, ...product.specs }),
      sourceKey: dedupeKey,
      dedupeKey,
      sourceUrl: product.productUrl,
      searchText: normalize(buildSearchText({ ...product, description, category: product.category, specs: { ...product.specs, ...product.specifications } })),
      electronicStatus: 'approved',
      productVerificationStatus: 'verified',
      imageVerificationStatus: 'verified',
      urlVerificationStatus: 'verified',
      publicationStatus: 'published',
      rating: null,
      sold: null,
      stock: null,
      price: null,
      originalPrice: null,
    };
    Object.assign(value, normalizeProduct(value));
    const result = await Product.updateOne({ dedupeKey }, { $set: value }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
    if (result.upsertedCount) created += 1;
    else updated += 1;
  }
  console.log(JSON.stringify({ verifiedProducts: products.length, created, updated, removed: 0 }, null, 2));
  await mongoose.disconnect();
}

if (require.main === module) seedCatalog().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Catalog seed failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
