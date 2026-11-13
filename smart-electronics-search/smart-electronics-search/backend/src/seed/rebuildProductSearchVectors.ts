import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { ProductSearchVector } from '../models/ProductSearchVector';
import { embedTexts, embeddingContentHash, embeddingModel, productEmbeddingText } from '../services/productEmbeddings';

const BATCH_SIZE = 12;

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  const apply = process.argv.includes('--apply');
  mongoose.set('autoIndex', false);
  await mongoose.connect(process.env.MONGODB_URI);
  if (apply) await ProductSearchVector.collection.createIndex({ productId: 1 }, { unique: true });
  const products = await Product.find({
    source: { $in: ['accesstrade', 'csv', 'curated'] }, verified: true,
    productVerificationStatus: 'verified', urlVerificationStatus: 'verified', publicationStatus: 'published',
    verifiedAt: { $ne: null }, brand: { $type: 'string', $ne: '' }, model: { $type: 'string', $ne: '' },
  }).select('_id name brand normalizedBrand model modelNumber sku aliases category description specs normalizedSpecs specifications tags source imageUrl imageUsagePermission imageVerificationStatus publicationStatus productVerificationStatus').lean() as any[];

  const counts = { scanned: products.length, eligible: 0, unchanged: 0, metadataUpdated: 0, embedded: 0, written: 0, failed: 0 };
  let dimensions: number | null = null;
  for (let start = 0; start < products.length; start += BATCH_SIZE) {
    const batch = products.slice(start, start + BATCH_SIZE);
    const rows = batch.map((product) => {
      const content = productEmbeddingText(product);
      return { product, content, hash: embeddingContentHash(content) };
    });
    const current = await ProductSearchVector.find({ productId: { $in: rows.map(({ product }) => product._id) } })
      .select('productId contentHash embeddingModel normalizedBrand category publicationStatus productVerificationStatus').lean() as any[];
    const currentById = new Map(current.map((row) => [String(row.productId), row]));
    const changed = rows.filter(({ product, hash }) => {
      const existing = currentById.get(String(product._id));
      const unchanged = existing?.contentHash === hash && existing?.embeddingModel === embeddingModel();
      if (unchanged) counts.unchanged += 1;
      return !unchanged;
    });
    const metadataChanged = rows.filter(({ product, hash }) => {
      const existing = currentById.get(String(product._id));
      return existing?.contentHash === hash && existing?.embeddingModel === embeddingModel()
        && (existing.normalizedBrand !== (product.normalizedBrand ?? null)
          || existing.category !== product.category
          || existing.publicationStatus !== product.publicationStatus
          || existing.productVerificationStatus !== product.productVerificationStatus);
    });
    counts.eligible += rows.length;
    if (apply && metadataChanged.length) {
      await ProductSearchVector.bulkWrite(metadataChanged.map(({ product }) => ({
        updateOne: {
          filter: { productId: product._id },
          update: { $set: {
            normalizedBrand: product.normalizedBrand ?? null,
            category: product.category,
            publicationStatus: product.publicationStatus,
            productVerificationStatus: product.productVerificationStatus,
          } },
        },
      })) as any, { ordered: false });
      counts.metadataUpdated += metadataChanged.length;
    }
    if (!apply || !changed.length) continue;
    try {
      const vectors = await embedTexts(changed.map(({ content }) => content));
      dimensions = dimensions ?? vectors[0]?.length ?? null;
      if (vectors.some((vector) => vector.length !== dimensions)) throw new Error('Embedding dimensions changed inside the run');
      const operations = changed.map(({ product, hash }, index) => ({
        updateOne: {
          filter: { productId: product._id },
          update: { $set: {
            productId: product._id, embedding: vectors[index], contentHash: hash,
            embeddingModel: embeddingModel(), normalizedBrand: product.normalizedBrand ?? null,
            category: product.category, publicationStatus: product.publicationStatus,
            productVerificationStatus: product.productVerificationStatus,
          } },
          upsert: true,
        },
      }));
      await ProductSearchVector.bulkWrite(operations as any, { ordered: false });
      counts.embedded += changed.length;
      counts.written += changed.length;
    } catch (error) {
      counts.failed += changed.length;
      console.error(`Embedding batch at offset ${start} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      if (counts.failed) throw error;
    }
    console.log(JSON.stringify({ processed: Math.min(start + batch.length, products.length), total: products.length, ...counts, dimensions }));
  }
  const report = {
    generatedAt: new Date().toISOString(), mode: apply ? 'apply' : 'dry-run', model: embeddingModel(), dimensions, counts,
    note: 'Embeddings are separate from Product/Offer records; product facts and prices are not changed.',
  };
  const reportDir = resolve(process.cwd(), 'reports');
  await mkdir(reportDir, { recursive: true });
  const reportFile = resolve(reportDir, `product-vectors-${apply ? 'applied' : 'dry-run'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(reportFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ ...report, reportFile }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Product vector backfill failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
