import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { normalize } from '../utils/text';

const REVIEW_PAIRS = [
  {
    sourceId: '6af158a5bce1e40a8b8fc4ec',
    sourceName: 'MacBook Air 13 M2 2022',
    targetId: '6af1f4502b3ee012143096bb',
    targetName: 'MacBook Air 13-inch (M2, 2022)',
    tokens: ['macbook', 'air', 'm2', '2022'],
    basis: 'Same Apple MacBook Air M2 generation and 13-inch class; hidden legacy row has no model or source evidence.',
  },
  {
    sourceId: '6af158a5bce1e40a8b8fc4f5',
    sourceName: 'iPhone 15 128GB',
    targetId: '6af1f55b2b3ee012143096c1',
    targetName: 'iPhone 15',
    tokens: ['iphone', '15'],
    basis: 'Same Apple iPhone 15 model; legacy title includes 128 GB, which may be a variant of the published record.',
  },
  {
    sourceId: '6af158a5bce1e40a8b8fc501',
    sourceName: 'JBL Tune 520BT',
    targetId: '6af47f01c91fee01c7d6fb72',
    targetName: 'Tai nghe Bluetooth Chụp Tai JBL Tune 520BT',
    tokens: ['jbl', 'tune', '520bt'],
    basis: 'Same JBL Tune 520BT model; published record comes from the authorized ACCESSTRADE campaign feed.',
  },
  {
    sourceId: '6af158a5bce1e40a8b8fc508',
    sourceName: 'Logitech G502 X Plus',
    targetId: '6af205632b3ee012143096f7',
    targetName: 'Logitech G502 X PLUS LIGHTSPEED Wireless Gaming Mouse',
    tokens: ['logitech', 'g502', 'x', 'plus'],
    basis: 'Same Logitech G502 X PLUS model; legacy row has no model or source evidence.',
  },
  {
    sourceId: '6af158a5bce1e40a8b8fc509',
    sourceName: 'Logitech MX Master 3S',
    targetId: '6af1fac22b3ee012143096d9',
    targetName: 'Logitech MX Master 3S Wireless Mouse',
    tokens: ['logitech', 'mx', 'master', '3s'],
    basis: 'Same Logitech MX Master 3S model; legacy row has no model or source evidence.',
  },
] as const;

function hasTokens(value: string, tokens: readonly string[]) {
  const normalized = ` ${normalize(value)} `;
  return tokens.every((token) => normalized.includes(` ${normalize(token)} `));
}

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDB();
  try {
    const reviewedAt = new Date();
    const rows = [];
    for (const pair of REVIEW_PAIRS) {
      const [source, target] = await Promise.all([
        Product.findById(pair.sourceId).select('_id name brand model category source publicationStatus duplicateReview').lean() as any,
        Product.findById(pair.targetId).select('_id name brand model category verified productVerificationStatus publicationStatus').lean() as any,
      ]);
      if (!source || !target) throw new Error(`Missing product in suspected duplicate pair ${pair.sourceId} -> ${pair.targetId}.`);
      if (source.name !== pair.sourceName || target.name !== pair.targetName) throw new Error(`Product identity changed for pair ${pair.sourceId} -> ${pair.targetId}; refusing to mark it.`);
      if ((source.source && source.source !== 'unknown') || source.publicationStatus !== 'hidden' || source.model) {
        throw new Error(`${source.name}: source row is no longer the expected hidden legacy record (${JSON.stringify({ source: source.source, publicationStatus: source.publicationStatus, model: source.model })}).`);
      }
      if (normalize(source.brand ?? '') !== normalize(target.brand ?? '') || source.category !== target.category) throw new Error(`${source.name}: brand/category do not match the published candidate.`);
      if (target.verified !== true || target.productVerificationStatus !== 'verified' || target.publicationStatus !== 'published') throw new Error(`${target.name}: candidate is not a published verified Product.`);
      if (!hasTokens(source.name, pair.tokens) || !hasTokens([target.brand, target.model, target.name].filter(Boolean).join(' '), pair.tokens)) {
        throw new Error(`${source.name}: model-name evidence changed; refusing to mark it.`);
      }

      const duplicateReview = {
        status: 'suspected_duplicate',
        candidateProductId: String(target._id),
        candidateName: target.name,
        candidateModel: target.model ?? null,
        basis: pair.basis,
        reviewedAt,
      };
      const alreadyMarked = source.duplicateReview?.status === duplicateReview.status
        && String(source.duplicateReview?.candidateProductId) === duplicateReview.candidateProductId;
      if (apply && !alreadyMarked) {
        await Product.updateOne({ _id: source._id }, { $set: { duplicateReview } }, { runValidators: true });
      }
      rows.push({
        sourceProductId: String(source._id), sourceName: source.name, sourceStatus: source.publicationStatus,
        candidateProductId: duplicateReview.candidateProductId, candidateName: duplicateReview.candidateName,
        category: source.category, brand: source.brand, status: duplicateReview.status,
        action: alreadyMarked ? 'already_marked' : apply ? 'marked' : 'would_mark',
        basis: pair.basis,
      });
    }

    const report = { generatedAt: reviewedAt.toISOString(), database: mongoose.connection.name, mode: apply ? 'apply' : 'dry-run', reviewedPairs: rows.length, rows };
    const reportFile = resolve(process.cwd(), '..', 'PRODUCT_DUPLICATE_REVIEW_2026_11_12.json');
    await mkdir(resolve(process.cwd(), '..'), { recursive: true });
    await writeFile(reportFile, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({ ...report, reportFile }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Suspected duplicate review failed.');
  await mongoose.disconnect();
  process.exitCode = 1;
});
