import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { buildSearchText, normalize } from '../utils/text';
import { CatalogProduct, loadAndValidateCatalog } from './catalogValidation';
import { normalizeSpecs } from '../utils/specs';
import { normalizeProduct } from '../services/productNormalizer';

function normalizeId(product: CatalogProduct) {
  return `catalog:${normalize(`${product.brand}-${product.model}`).replace(/\s+/g, '-')}`;
}

async function main() {
  const products = await loadAndValidateCatalog();

  await connectDB();
  let created = 0;
  let updated = 0;
  for (const product of products) {
    const dedupeKey = normalizeId(product);
    const value = {
      ...product,
      specs: normalizeSpecs({ ...product.specifications, ...product.specs }),
      sourceKey: dedupeKey,
      dedupeKey,
      sourceUrl: product.productUrl,
      searchText: normalize(buildSearchText({ ...product, category: product.category, specs: { ...product.specs, ...product.specifications } })),
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

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Catalog seed failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
