import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';
import { normalize } from '../utils/text';
import { normalizeSpecs } from '../utils/specs';

const TARGET = 30;
const AMAZON_SOURCE = 'https://digprjsurvey.amazon.com/csad/help/node/Tnx3eeuXDtZL0Q91ms';
const KOBO_SOURCE = 'https://help.kobo.com/hc/en-us/articles/360019127133-Supported-eReader-models';
const RETRIEVED_AT = new Date('2026-11-11T00:00:00.000Z');

type EreaderCandidate = {
  brand: 'Amazon' | 'Kobo';
  model: string;
  modelNumber?: string;
  family: string;
  releaseYear?: number;
  sourceUrl: string;
  specifications?: Record<string, unknown>;
};

const candidates: EreaderCandidate[] = [
  { brand: 'Amazon', model: 'Kindle Colorsoft (2026 Release)', family: 'Kindle Colorsoft', releaseYear: 2026, sourceUrl: AMAZON_SOURCE, specifications: { display: '7-inch color E Ink', storageGB: 16, waterproofRating: 'IPX8', batteryLife: 'up to 8 weeks', replaceableBattery: true } },
  { brand: 'Amazon', model: 'Kindle Colorsoft Signature Edition (2026 Release)', family: 'Kindle Colorsoft Signature Edition', releaseYear: 2026, sourceUrl: AMAZON_SOURCE, specifications: { display: '7-inch color E Ink', storageGB: 32, waterproofRating: 'IPX8', batteryLife: 'up to 8 weeks', replaceableBattery: true } },
  { brand: 'Amazon', model: 'Amazon Kids Kindle Colorsoft (2026 Release)', family: 'Kindle Colorsoft Kids', releaseYear: 2026, sourceUrl: AMAZON_SOURCE, specifications: { display: '7-inch color E Ink', storageGB: 16, waterproofRating: 'IPX8', batteryLife: 'up to 8 weeks', includedSubscription: '1 year Amazon Kids+' } },
  { brand: 'Amazon', model: 'Kindle Paperwhite (2026 Release)', family: 'Kindle Paperwhite', releaseYear: 2026, sourceUrl: AMAZON_SOURCE, specifications: { display: '7-inch E Ink', resolution: '300 ppi', storageGB: 16, waterproofRating: 'IPX8', batteryLife: 'up to 12 weeks', replaceableBattery: true } },
  { brand: 'Amazon', model: 'Kindle Paperwhite Signature Edition (2026 Release)', family: 'Kindle Paperwhite Signature Edition', releaseYear: 2026, sourceUrl: AMAZON_SOURCE, specifications: { display: '7-inch E Ink', resolution: '300 ppi', storageGB: 32, waterproofRating: 'IPX8', batteryLife: 'up to 12 weeks', wirelessCharging: true } },
  { brand: 'Amazon', model: 'Amazon Kids Kindle Paperwhite (2026 Release)', family: 'Kindle Paperwhite Kids', releaseYear: 2026, sourceUrl: AMAZON_SOURCE, specifications: { display: '7-inch E Ink', resolution: '300 ppi', storageGB: 16, waterproofRating: 'IPX8', batteryLife: 'up to 12 weeks', kidFriendlyCover: true, includedSubscription: '1 year Amazon Kids+' } },
  { brand: 'Amazon', model: 'Kindle (2026 Release)', family: 'Kindle', releaseYear: 2026, sourceUrl: AMAZON_SOURCE, specifications: { display: '6-inch E Ink', resolution: '300 ppi', storageGB: 16, batteryLife: 'up to 6 weeks', replaceableBattery: true } },
  { brand: 'Amazon', model: 'Amazon Kids Kindle (2026 Release)', family: 'Kindle Kids', releaseYear: 2026, sourceUrl: AMAZON_SOURCE, specifications: { display: '6-inch E Ink', resolution: '300 ppi', storageGB: 16, batteryLife: 'up to 6 weeks', kidFriendlyCover: true, includedSubscription: '1 year Amazon Kids+' } },
  { brand: 'Amazon', model: 'Kindle (Aluminum, 2026 Release)', family: 'Kindle Aluminum', releaseYear: 2026, sourceUrl: AMAZON_SOURCE, specifications: { display: '6-inch E Ink', resolution: '300 ppi', storageGB: 32, batteryLife: 'up to 6 weeks', replaceableBattery: true } },
  { brand: 'Amazon', model: 'Kindle Scribe Colorsoft (1st Generation)', family: 'Kindle Scribe Colorsoft', releaseYear: 2025, sourceUrl: AMAZON_SOURCE, specifications: { display: 'color E Ink', storageOptionsGB: [32, 64], stylusIncluded: true } },
  { brand: 'Amazon', model: 'Kindle Scribe (3rd Generation)', family: 'Kindle Scribe', releaseYear: 2025, sourceUrl: AMAZON_SOURCE, specifications: { storageOptionsGB: [32, 64], stylusIncluded: true } },
  { brand: 'Amazon', model: 'Kindle Scribe without Front Light', family: 'Kindle Scribe', releaseYear: 2026, sourceUrl: AMAZON_SOURCE, specifications: { storageGB: 16, stylusIncluded: true, frontLight: false } },
  { brand: 'Amazon', model: 'Kindle Colorsoft Signature Edition (1st Generation)', family: 'Kindle Colorsoft Signature Edition', releaseYear: 2024, sourceUrl: AMAZON_SOURCE, specifications: { display: 'color E Ink', storageGB: 32, wirelessCharging: true, autoAdjustingFrontLight: true } },
  { brand: 'Amazon', model: 'Kindle Colorsoft (1st Generation)', family: 'Kindle Colorsoft', releaseYear: 2025, sourceUrl: AMAZON_SOURCE, specifications: { display: 'color E Ink', storageGB: 16, wirelessCharging: true, autoAdjustingFrontLight: true } },
  { brand: 'Kobo', model: 'Kobo Libra Colour', modelNumber: 'N428', family: 'Kobo Libra', sourceUrl: KOBO_SOURCE, specifications: { display: '7-inch color E Ink', storageGB: 32, pageTurnButtons: true, stylusCompatible: true } },
  { brand: 'Kobo', model: 'Kobo Clara Colour', modelNumber: 'N367', family: 'Kobo Clara', sourceUrl: KOBO_SOURCE, specifications: { display: '6-inch color E Ink', storageGB: 16, waterproof: true } },
  { brand: 'Kobo', model: 'Kobo Clara BW', modelNumber: 'N365/N365B/P365', family: 'Kobo Clara', sourceUrl: KOBO_SOURCE, specifications: { display: '6-inch E Ink Carta 1300 HD', storageGB: 16, waterproof: true } },
  { brand: 'Kobo', model: 'Kobo Elipsa 2E', modelNumber: 'N605', family: 'Kobo Elipsa', sourceUrl: KOBO_SOURCE, specifications: { display: '10.3-inch E Ink', storageGB: 32, stylusIncluded: true } },
  { brand: 'Kobo', model: 'Kobo Clara 2E', modelNumber: 'N506', family: 'Kobo Clara', sourceUrl: KOBO_SOURCE },
  { brand: 'Kobo', model: 'Kobo Sage', modelNumber: 'N778/N778K', family: 'Kobo Sage', sourceUrl: KOBO_SOURCE, specifications: { display: '8-inch E Ink Carta 1200 HD', storageGB: 32, waterproof: true, stylusCompatible: true } },
  { brand: 'Kobo', model: 'Kobo Libra 2', modelNumber: 'N418', family: 'Kobo Libra', sourceUrl: KOBO_SOURCE },
  { brand: 'Kobo', model: 'Kobo Elipsa', modelNumber: 'N604', family: 'Kobo Elipsa', sourceUrl: KOBO_SOURCE },
  { brand: 'Kobo', model: 'Kobo Nia', modelNumber: 'N306', family: 'Kobo Nia', sourceUrl: KOBO_SOURCE },
  { brand: 'Kobo', model: 'Kobo Libra H2O', modelNumber: 'N873', family: 'Kobo Libra', sourceUrl: KOBO_SOURCE },
  { brand: 'Kobo', model: 'Kobo Forma', modelNumber: 'N782', family: 'Kobo Forma', sourceUrl: KOBO_SOURCE },
  { brand: 'Kobo', model: 'Kobo Clara HD', modelNumber: 'N249', family: 'Kobo Clara', sourceUrl: KOBO_SOURCE },
  { brand: 'Kobo', model: 'Kobo Aura H2O Edition 2', modelNumber: 'N867', family: 'Kobo Aura', sourceUrl: KOBO_SOURCE },
  { brand: 'Kobo', model: 'Kobo Aura ONE', modelNumber: 'N709', family: 'Kobo Aura', sourceUrl: KOBO_SOURCE },
];

function identityKey(brand: string, model: string) {
  return `${normalize(brand)}|${normalize(model)}`;
}

async function main() {
  const importMode = process.argv.includes('--import');
  await connectDB();
  try {
    const current = await Product.find({ category: 'ereader', publicationStatus: 'published' })
      .select('brand model name').lean() as Array<{ brand?: string | null; model?: string | null; name?: string | null }>;
    const existing = new Set(current.map((product) => identityKey(product.brand ?? '', product.model ?? product.name ?? '')));
    const selected = candidates.filter((candidate) => !existing.has(identityKey(candidate.brand, candidate.model)));
    if (!importMode) {
      console.log(JSON.stringify({ mode: 'dry-run', currentPublished: current.length, candidates: candidates.length, selected: selected.length, projectedTotal: current.length + selected.length, remainingToTarget: Math.max(0, TARGET - current.length - selected.length), sourcePages: { Amazon: AMAZON_SOURCE, Kobo: KOBO_SOURCE }, note: 'Only device names, model identifiers and listed technical facts are imported. No price or image is supplied by these source pages.' }, null, 2));
      return;
    }

    let created = 0;
    let skipped = 0;
    for (const candidate of selected) {
      const sourceEvidence = [
        { evidenceType: 'identity', sourceName: `${candidate.brand} official support`, sourceUrl: candidate.sourceUrl, retrievedAt: RETRIEVED_AT, verifiedAt: RETRIEVED_AT, notes: `Official device identification/support page lists ${candidate.model}${candidate.modelNumber ? ` (model ${candidate.modelNumber})` : ''}.` },
        ...(candidate.specifications ? [{ evidenceType: 'specifications', sourceName: `${candidate.brand} official support`, sourceUrl: candidate.sourceUrl, retrievedAt: RETRIEVED_AT, verifiedAt: RETRIEVED_AT, notes: 'Technical details are transcribed from the official identification/support entry for this model.' }] : []),
      ];
      const specifications = { ...(candidate.specifications ?? {}), ...(candidate.modelNumber ? { manufacturerModelNumber: candidate.modelNumber } : {}) };
      const specs = normalizeSpecs(specifications);
      const sourceKey = `official-support:${normalize(candidate.brand)}:${normalize(candidate.model).replace(/[^a-z0-9]+/g, '-')}`;
      if (await Product.exists({ $or: [{ sourceKey }, { dedupeKey: sourceKey }] })) { skipped += 1; continue; }
      await Product.create({
        name: `${candidate.brand} ${candidate.model}`, brand: candidate.brand, model: candidate.model,
        modelNumber: candidate.modelNumber ?? null, family: candidate.family, releaseYear: candidate.releaseYear ?? null,
        productStatus: 'unknown', category: 'ereader', description: `Thiết bị đọc sách điện tử; model và thông tin được đối chiếu với trang hỗ trợ chính thức của ${candidate.brand}.`,
        imageUrl: null, imageSource: null, imageSourceUrl: null, imageAuthor: null, imageRetrievedAt: null,
        imageUsagePermission: 'not_provided', imagePermissionEvidence: null, imageLicense: null, imageLicenseUrl: null,
        imageAttribution: null, imageVisualIdentityChecked: false, imageVerificationBasis: null,
        sourceUrl: candidate.sourceUrl, productUrl: candidate.sourceUrl, specificationSourceUrl: candidate.sourceUrl,
        verified: true, verifiedAt: RETRIEVED_AT, verificationScope: 'manufacturer', productVerificationStatus: 'verified',
        imageVerificationStatus: 'pending', urlVerificationStatus: 'verified', publicationStatus: 'published',
        specifications: Object.keys(specifications).length ? specifications : null, specs, normalizedSpecs: specs, variants: [], sourceEvidence,
        dataAttribution: `${candidate.brand} official support page`, dataSourceUrl: candidate.sourceUrl,
        source: 'curated', sourceProductId: sourceKey, sourceProductIds: [sourceKey], sourceKey, dedupeKey: sourceKey,
        electronicStatus: 'approved', price: null, originalPrice: null, rating: null, sold: null, stock: null,
        tags: ['ereader', 'e-reader', candidate.brand.toLowerCase()],
        searchText: normalize([candidate.brand, candidate.model, candidate.modelNumber, candidate.family, 'e-reader ereader ebook reader', JSON.stringify(specifications)].filter(Boolean).join(' ')),
      });
      created += 1;
    }
    const published = await Product.countDocuments({ category: 'ereader', publicationStatus: 'published' });
    await SyncRun.create({ source: 'manufacturer-support', sourceKey: 'official-support:ereader-amazon-kobo', mode: 'import', status: 'succeeded', startedAt: RETRIEVED_AT, finishedAt: new Date(), stats: { candidates: candidates.length, selected: selected.length, created, skipped, publishedEreaders: published, target: TARGET, sources: [AMAZON_SOURCE, KOBO_SOURCE] } });
    console.log(JSON.stringify({ mode: 'import', database: mongoose.connection.name, created, skipped, publishedEreaders: published, target: TARGET }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'eReader catalog import failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
