import 'dotenv/config';
import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { normalizeSpecs } from '../utils/specs';

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  await mongoose.connect(process.env.MONGODB_URI);

  const cursor = Product.find({ 'specs.ram': { $type: 'string' } })
    .select('_id name specs specifications')
    .lean()
    .cursor();
  const counts = { scanned: 0, installedConverted: 0, optionsSeparated: 0, maxSeparated: 0, skipped: 0 };

  for await (const product of cursor) {
    counts.scanned += 1;
    const originalRam = product.specs?.ram;
    const normalized = normalizeSpecs(product.specs);
    const update: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};

    if (typeof normalized.ram === 'number') {
      update['specs.ram'] = normalized.ram;
      if (typeof normalized.ramMaxGB === 'number') update['specs.ramMaxGB'] = normalized.ramMaxGB;
      counts.installedConverted += 1;
    } else if (normalized.ramVariantsGB) {
      unset['specs.ram'] = 1;
      update['specs.ramVariantsGB'] = normalized.ramVariantsGB;
      counts.optionsSeparated += 1;
    } else if (typeof normalized.ramMaxGB === 'number' && normalized.ram === undefined) {
      unset['specs.ram'] = 1;
      update['specs.ramMaxGB'] = normalized.ramMaxGB;
      counts.maxSeparated += 1;
    } else {
      counts.skipped += 1;
      continue;
    }

    const priorSpecifications = product.specifications && typeof product.specifications === 'object' && !Array.isArray(product.specifications)
      ? product.specifications as Record<string, unknown>
      : {};
    if (!Object.prototype.hasOwnProperty.call(priorSpecifications, 'ram')) {
      update.specifications = { ...priorSpecifications, ram: originalRam };
    }

    const operation: Record<string, unknown> = {};
    if (Object.keys(update).length) operation.$set = update;
    if (Object.keys(unset).length) operation.$unset = unset;
    await Product.updateOne({ _id: product._id }, operation);
  }

  console.log(JSON.stringify({ ...counts, note: 'Original RAM text preserved under specifications.ram where absent.' }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'RAM normalization failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
