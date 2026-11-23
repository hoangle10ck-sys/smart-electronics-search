import 'dotenv/config';
import mongoose from 'mongoose';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { buildProductDescription } from '../services/productDescription';
import { normalizeProduct } from '../services/productNormalizer';
import { normalizeSpecs } from '../utils/specs';
import { buildSearchText, escapeRegex, normalize } from '../utils/text';
import { CatalogProduct, checkCatalogUrl, validateCatalogProducts } from './catalogValidation';

const EXPECTED_DATABASE = 'smart_electronics';
const BATCH_PRODUCT_IDS = new Set([
  'samsung-galaxy-s24-sm-s921',
  'samsung-galaxy-a55-5g-8gb-128gb',
  'google-pixel-8',
]);

function catalogDedupeKey(product: CatalogProduct) {
  return `catalog:${normalize(`${product.brand}-${product.model}`).replace(/\s+/g, '-')}`;
}

function existingProductFilter(product: CatalogProduct, dedupeKey: string) {
  const normalizedBrand = normalize(product.brand);
  const normalizedModel = normalize(product.model);
  return {
    $or: [
      { sourceProductId: product.sourceProductId },
      { sourceKey: dedupeKey },
      { dedupeKey },
      { normalizedBrand, normalizedModel },
      {
        brand: new RegExp(`^${escapeRegex(product.brand)}$`, 'i'),
        model: new RegExp(`^${escapeRegex(product.model)}$`, 'i'),
      },
    ],
  };
}

function makeProductRecord(product: CatalogProduct, dedupeKey: string) {
  const description = buildProductDescription(product.name, product.specifications);
  if (!description) throw new Error(`${product.sourceProductId}: sourced specs cannot produce a description`);

  const verifiedAt = new Date(product.verifiedAt);
  const sourceEvidence = [
    { evidenceType: 'identity', sourceName: 'Manufacturer product documentation', sourceUrl: product.productUrl },
    { evidenceType: 'product_page', sourceName: 'Manufacturer product documentation', sourceUrl: product.productUrl },
    { evidenceType: 'specifications', sourceName: 'Manufacturer specifications', sourceUrl: product.specificationSourceUrl },
    { evidenceType: 'description', sourceName: 'Description summarized from manufacturer specifications', sourceUrl: product.specificationSourceUrl, notes: 'Description only summarizes facts present in specifications.' },
    { evidenceType: 'image', sourceName: 'Wikimedia Commons file page', sourceUrl: product.imageSource },
    { evidenceType: 'image_rights', sourceName: 'Wikimedia Commons file page', sourceUrl: product.imageSource, notes: `${product.imageLicense}; attribution: ${product.imageAttribution}` },
  ].map((evidence) => ({ ...evidence, retrievedAt: verifiedAt, verifiedAt }));

  const value: Record<string, any> = {
    ...product,
    description,
    sourceEvidence,
    specs: normalizeSpecs({ ...product.specifications, ...product.specs }),
    sourceKey: dedupeKey,
    dedupeKey,
    sourceUrl: product.productUrl,
    imageSourceUrl: product.imageSource,
    imageAuthor: product.imageAttribution.split(', via ')[0],
    imageRetrievedAt: verifiedAt,
    imagePermissionEvidence: `${product.imageLicense}; ${product.imageAttribution}; see Wikimedia file page`,
    imageVisualIdentityChecked: true,
    imageVerificationBasis: 'Exact model name checked on source page and image visually reviewed.',
    searchText: normalize(buildSearchText({ ...product, description, category: product.category, specs: { ...product.specs, ...product.specifications } })),
    electronicStatus: 'approved',
    productVerificationStatus: 'verified',
    imageVerificationStatus: 'verified',
    urlVerificationStatus: 'verified',
    publicationStatus: 'published',
    verificationScope: 'curated',
    verified: true,
    verifiedAt,
    rating: null,
    sold: null,
    stock: null,
    price: null,
    originalPrice: null,
  };
  Object.assign(value, normalizeProduct(value));
  return value;
}

async function main() {
  const catalog = JSON.parse(await readFile(resolve(__dirname, 'catalog.json'), 'utf8')) as CatalogProduct[];
  validateCatalogProducts(catalog);
  const products = catalog.filter((product) => BATCH_PRODUCT_IDS.has(product.sourceProductId));
  if (products.length !== BATCH_PRODUCT_IDS.size) throw new Error('Catalog expansion batch is incomplete or contains unexpected IDs');

  for (const product of products) {
    await checkCatalogUrl(product.imageUrl, true);
    await checkCatalogUrl(product.productUrl);
    await checkCatalogUrl(product.specificationSourceUrl);
  }

  await connectDB();
  if (mongoose.connection.name !== EXPECTED_DATABASE) {
    throw new Error(`Refusing catalog import into unexpected database; expected ${EXPECTED_DATABASE}`);
  }

  const candidates: Array<{ product: CatalogProduct; dedupeKey: string; existing: boolean }> = [];
  for (const product of products) {
    const dedupeKey = catalogDedupeKey(product);
    const existing = await Product.exists(existingProductFilter(product, dedupeKey));
    candidates.push({ product, dedupeKey, existing: Boolean(existing) });
  }

  const apply = process.argv.includes('--apply');
  const report: { database: string; mode: string; found: string[]; alreadyPresent: string[]; inserted: string[] } = {
    database: mongoose.connection.name,
    mode: apply ? 'apply' : 'dry-run',
    found: products.map((product) => product.name),
    alreadyPresent: candidates.filter((item) => item.existing).map((item) => item.product.name),
    inserted: [],
  };

  if (apply) {
    for (const item of candidates.filter((candidate) => !candidate.existing)) {
      try {
        await Product.create(makeProductRecord(item.product, item.dedupeKey));
        report.inserted.push(item.product.name);
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
        report.alreadyPresent.push(item.product.name);
      }
    }
  }

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Curated catalog import failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
