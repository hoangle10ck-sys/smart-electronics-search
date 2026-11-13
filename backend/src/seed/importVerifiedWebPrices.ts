import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Offer } from '../models/Offer';
import { Product } from '../models/Product';

type OfferRow = {
  brand: string;
  category: string;
  model: string;
  sellerName?: string;
  storageGb?: number;
  variantLabel?: string;
  sku?: string | null;
  price: number;
  originalPrice?: number | null;
  productUrl: string;
  availability: string;
  evidence: string;
  retrievedAt?: string;
};
type Batch = {
  batchId: string;
  researchedAt: string;
  source: string;
  sellerName: string;
  currency: string;
  offers: OfferRow[];
};

const APPROVED_RETAILERS = new Map([
  ['fptshop.com.vn', 'FPT Shop'],
  ['hacom.vn', 'HACOM'],
  ['tncstore.vn', 'TNC Store'],
  ['gearvn.com', 'GEARVN'],
  ['phongvu.vn', 'Phong Vũ'],
  ['bncamera.com', 'BNCamera'],
  ['doloicomputer.vn', 'Đỗ Lợi Computer'],
  ['tuongvui.vn', 'Tường Vui'],
  ['mediamart.vn', 'MediaMart'],
  ['agtek.vn', 'AGTEK'],
  ['www.chotot.com', 'Chợ Tốt'],
  ['imax.com.vn', 'iMax'],
  ['tuanlocstore.vn', 'Tu\u1ea5n L\u1ed9c Store'],
  ['store.sony.com.vn', 'Sony Store Online'],
  ['www.kindlesaigon.vn', 'Kindle Saigon'],
  ['logico.com.vn', 'LOGICO'],
  ['www.8matter.com', '8MATTER'],
]);

function validateBatch(batch: Batch) {
  const retrievedAt = new Date(batch.researchedAt);
  const age = Date.now() - retrievedAt.getTime();
  if (!batch.batchId || batch.source !== 'web-research' || !batch.sellerName?.trim() || batch.currency !== 'VND') {
    throw new Error('Invalid batch source or currency metadata.');
  }
  if (!Number.isFinite(retrievedAt.getTime()) || age < -5 * 60_000 || age > 24 * 60 * 60_000) {
    throw new Error('Price batch is missing a valid recent retrieval timestamp (maximum age: 24 hours).');
  }
  if (!batch.offers.length) throw new Error('Price batch is empty.');
  const seen = new Set<string>();
  for (const row of batch.offers) {
    const key = `${row.brand.toLowerCase()}|${row.model.toLowerCase()}|${row.storageGb}`;
    if (seen.has(key)) throw new Error(`Duplicate model/variant in batch: ${key}`);
    seen.add(key);
    const url = new URL(row.productUrl);
    const sellerName = row.sellerName ?? batch.sellerName;
    const rowRetrievedAt = row.retrievedAt ? new Date(row.retrievedAt) : retrievedAt;
    const rowAge = Date.now() - rowRetrievedAt.getTime();
    if (!Number.isFinite(rowRetrievedAt.getTime()) || rowAge < -5 * 60_000 || rowAge > 24 * 60 * 60_000) {
      throw new Error(`${row.model}: missing or stale retrieval timestamp.`);
    }
    if (url.protocol !== 'https:' || APPROVED_RETAILERS.get(url.hostname) !== sellerName || url.pathname === '/') {
      throw new Error(`${row.model}: seller name and HTTPS retailer domain do not match an approved source.`);
    }
    if ((row.storageGb !== undefined && (!Number.isInteger(row.storageGb) || row.storageGb <= 0))
      || (!row.variantLabel && row.storageGb === undefined) || !Number.isFinite(row.price) || row.price <= 0
      || (row.originalPrice != null && (!Number.isFinite(row.originalPrice) || row.originalPrice < row.price)) || !row.evidence.includes(row.model)
      || (row.sku && !row.evidence.includes(row.sku))) {
      throw new Error(`${row.model}: incomplete or invalid variant, price, or SKU evidence.`);
    }
  }
  return retrievedAt;
}

function matchesStorageGb(catalogStorage: unknown, targetGb: number) {
  if (Number(catalogStorage) === targetGb) return true;
  if (typeof catalogStorage !== 'string') return false;
  return new RegExp(`(^|\\D)${targetGb}\\s*GB(?=\\D|$)`, 'i').test(catalogStorage);
}

async function main() {
  const batchFileArgument = process.argv.find((argument) => argument.startsWith('--batch-file='))?.slice('--batch-file='.length);
  const batchFile = resolve(__dirname, batchFileArgument ?? 'price-research-batch-2026-11-11.json');
  const batch = JSON.parse(await readFile(batchFile, 'utf8')) as Batch;
  const retrievedAt = validateBatch(batch);
  const apply = process.argv.includes('--apply');
  await connectDB();
  try {
    const prepared: Array<{ row: OfferRow; retrievedAt: Date; productId: mongoose.Types.ObjectId; existingOfferId?: mongoose.Types.ObjectId }> = [];
    for (const row of batch.offers) {
      const products = await Product.find({ brand: row.brand, category: row.category, model: row.model }).select(
        '_id name publicationStatus productVerificationStatus verified specs'
      ).lean();
      if (products.length !== 1) throw new Error(`${row.model}: expected one exact Product, found ${products.length}; refusing import.`);
      const product = products[0];
      if (product.publicationStatus !== 'published' || product.productVerificationStatus !== 'verified' || product.verified !== true) {
        throw new Error(`${row.model}: Product must already be published and model-verified.`);
      }
      if (row.storageGb !== undefined && !matchesStorageGb((product.specs as Record<string, unknown> | null)?.storage, row.storageGb)) {
        throw new Error(`${row.model}: catalog storage does not match the researched ${row.storageGb} GB variant.`);
      }
      const sellerName = row.sellerName ?? batch.sellerName;
      const existingOffers = await Offer.find({ productId: product._id, sellerName }).select(
        '_id source sourceRetrievedAt'
      ).lean();
      if (existingOffers.length > 1) throw new Error(`${row.model}: multiple offers from this seller already exist; refusing ambiguous update.`);
      const existing = existingOffers[0];
      const rowRetrievedAt = row.retrievedAt ? new Date(row.retrievedAt) : retrievedAt;
      if (existing?.sourceRetrievedAt && existing.sourceRetrievedAt > rowRetrievedAt) {
        throw new Error(`${row.model}: stored seller price is newer than this research batch; refusing to overwrite it.`);
      }
      prepared.push({ row, retrievedAt: rowRetrievedAt, productId: product._id, existingOfferId: existing?._id });
    }

    const results: Array<{ model: string; variant: string; price: number; action: string; retrievedAt: string }> = [];
    for (const item of prepared) {
      const { row, retrievedAt: rowRetrievedAt, productId, existingOfferId } = item;
      const update = {
        productId,
        sellerName: row.sellerName ?? batch.sellerName,
        variantLabel: row.variantLabel ?? `${row.storageGb} GB`,
        source: batch.source,
        price: row.price,
        originalPrice: row.originalPrice ?? null,
        discount: row.originalPrice != null ? row.originalPrice - row.price : null,
        currency: batch.currency,
        productUrl: row.productUrl,
        affiliateUrl: null,
        availability: row.availability,
        sourceProductId: row.sku ?? null,
        verified: true,
        priceVerificationStatus: 'verified',
        verificationNote: `${row.evidence} Price captured ${rowRetrievedAt.toISOString()}; retailer prices and availability can change.`,
        sourceRetrievedAt: rowRetrievedAt,
        verifiedAt: new Date(),
        lastUpdated: new Date(),
      };
      const action = existingOfferId ? 'update' : 'insert';
      if (apply) {
        if (existingOfferId) {
          await Offer.updateOne({ _id: existingOfferId }, { $set: update });
        } else {
          await Offer.updateOne(
            { productId, source: batch.source, sellerName: row.sellerName ?? batch.sellerName },
            { $set: update, $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
          );
        }
      }
      results.push({ model: row.model, variant: row.variantLabel ?? `${row.storageGb} GB`, price: row.price, action, retrievedAt: rowRetrievedAt.toISOString() });
    }
    console.log(JSON.stringify({ batchId: batch.batchId, mode: apply ? 'apply' : 'dry-run', retrievedAt: retrievedAt.toISOString(), rows: results }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Price import failed.');
  await mongoose.disconnect();
  process.exitCode = 1;
});
