import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { normalizeProduct } from '../services/productNormalizer';
import { detectDuplicateCandidates } from '../services/duplicateDetection';

type Candidate = { _id: unknown; name?: string; brand?: string; model?: string; modelNumber?: string; sku?: string; [key: string]: any };

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  mongoose.set('autoIndex', false);
  const apply = process.argv.includes('--apply');
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : 0;
  if (limitArg && (!Number.isInteger(limit) || limit < 1)) throw new Error('--limit must be a positive integer');
  await mongoose.connect(process.env.MONGODB_URI);
  if (process.argv.includes('--indexes-only')) {
    await Product.createIndexes();
    console.log(JSON.stringify({ mode: 'indexes-only', note: 'Product data was not changed.' }, null, 2));
    await mongoose.disconnect();
    return;
  }

  const cursor = Product.find({}).select('_id name brand model modelNumber sku aliases variants specs specifications')
    .sort({ _id: 1 }).lean().cursor();
  const counts = { scanned: 0, updated: 0, withModel: 0, withAliases: 0, withNormalizedSpecs: 0 };
  const scannedProducts: Candidate[] = [];
  const pending: any[] = [];
  for await (const product of cursor) {
    if (limit && counts.scanned >= limit) break;
    const row = product as Candidate;
    scannedProducts.push(row);
    const fields = normalizeProduct(row);
    counts.scanned += 1;
    if (fields.normalizedModel || fields.normalizedModelNumber) counts.withModel += 1;
    if (fields.aliases.length) counts.withAliases += 1;
    if (Object.keys(fields.normalizedSpecs).length) counts.withNormalizedSpecs += 1;
    if (apply) pending.push({ updateOne: { filter: { _id: row._id }, update: { $set: fields } } });
    if (pending.length >= 500) {
      await Product.bulkWrite(pending.splice(0), { ordered: false });
    }
  }
  if (pending.length) await Product.bulkWrite(pending, { ordered: false });
  if (apply) await Product.createIndexes();
  counts.updated = apply ? counts.scanned : 0;
  const duplicateReview = detectDuplicateCandidates(scannedProducts);
  const report = {
    generatedAt: new Date().toISOString(), mode: apply ? 'apply' : 'dry-run', counts,
    potentialDuplicateModelGroups: duplicateReview.length,
    duplicateReview,
    note: 'No product or offer records were merged or deleted. Original source fields are preserved.',
  };
  const outputDir = resolve(process.cwd(), 'reports');
  await mkdir(outputDir, { recursive: true });
  const outputFile = resolve(outputDir, `normalization-${apply ? 'applied' : 'dry-run'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(outputFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ ...report, reportFile: outputFile }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Catalog normalization failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
