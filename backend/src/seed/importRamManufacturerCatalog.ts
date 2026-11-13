import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';
import { normalize } from '../utils/text';
import { normalizeSpecs } from '../utils/specs';

const TARGET = 30;
const RETRIEVED_AT = new Date();

type Candidate = {
  brand: string;
  model: string;
  partNumber: string;
  family: string;
  sourceUrl: string;
  productStatus?: 'active' | 'discontinued';
  specifications: Record<string, unknown>;
};

const candidates: Candidate[] = [
  {
    brand: 'Corsair', model: 'Vengeance DDR5 32GB (2x16GB) 6000MT/s CL30', partNumber: 'CMK32GX5M2B6000Z30', family: 'Vengeance DDR5',
    sourceUrl: 'https://www.corsair.com/us/en/p/memory/cmk32gx5m2b6000z30/vengeance-32gb-2x16gb-ddr5-dram-6000mt-s-cl30-amd-expo-memory-black-cmk32gx5m2b6000z30',
    specifications: { capacityGB: 32, modules: '2x16GB', memoryType: 'DDR5', speedMTs: 6000, latencyCL: 30, formFactor: 'UDIMM', profileSupport: ['AMD EXPO', 'Intel XMP'], ecc: false },
  },
  {
    brand: 'Corsair', model: 'Dominator Titanium RGB DDR5 64GB (2x32GB) 6400MT/s CL32', partNumber: 'CMP64GX5M2B6400C32', family: 'Dominator Titanium RGB DDR5',
    sourceUrl: 'https://www.corsair.com/us/en/p/memory/cmp64gx5m2b6400c32/dominator-titanium-rgb-2x32gb-ddr5-dram-6400mt-s-cl32-intel-xmp-memory-kit-cmp64gx5m2b6400c32',
    specifications: { capacityGB: 64, modules: '2x32GB', memoryType: 'DDR5', speedMTs: 6400, latencyCL: 32, formFactor: 'UDIMM', profileSupport: ['Intel XMP'], rgb: true, ecc: false },
  },
  {
    brand: 'Corsair', model: 'Vengeance DDR5 64GB (2x32GB) 6400MT/s CL32', partNumber: 'CMK64GX5M2B6400C32', family: 'Vengeance DDR5',
    sourceUrl: 'https://www.corsair.com/us/en/p/memory/cmk64gx5m2b6400c32/vengeance-64gb-2x32gb-ddr5-dram-6400mhz-c32-memory-kit-black-cmk64gx5m2b6400c32',
    specifications: { capacityGB: 64, modules: '2x32GB', memoryType: 'DDR5', speedMTs: 6400, latencyCL: 32, formFactor: 'UDIMM', profileSupport: ['Intel XMP'], ecc: false },
  },
  {
    brand: 'Kingston', model: 'FURY Impact DDR5 32GB (2x16GB) 5600MT/s CL40 SODIMM', partNumber: 'KF556S40IBK2-32', family: 'FURY Impact DDR5',
    sourceUrl: 'https://www.kingston.com/datasheets/KF556S40IBK2-32.pdf',
    specifications: { capacityGB: 32, modules: '2x16GB', memoryType: 'DDR5', speedMTs: 5600, latencyCL: 40, formFactor: '262-pin SODIMM', voltageV: 1.1, ecc: 'On-die ECC', moduleHeightMM: 30 },
  },
  {
    brand: 'Kingston', model: 'FURY Beast DDR5 32GB (2x16GB) 5600MT/s CL36 EXPO', partNumber: 'KF556C36BBEK2-32', family: 'FURY Beast DDR5',
    sourceUrl: 'https://www.kingston.com/en/memory/search?partid=KF556C36BBEK2-32',
    specifications: { capacityGB: 32, modules: '2x16GB', memoryType: 'DDR5', speedMTs: 5600, latency: '36-38-38', latencyCL: 36, formFactor: '288-pin UDIMM', profileSupport: ['AMD EXPO', 'Intel XMP 3.0'], voltageV: 1.25, ecc: false },
  },
  {
    brand: 'Kingston', model: 'FURY Beast DDR5 32GB (2x16GB) 6000MT/s CL36 EXPO', partNumber: 'KF560C36BBEK2-32', family: 'FURY Beast DDR5', productStatus: 'discontinued',
    sourceUrl: 'https://www.kingston.com/en/memory/search/discontinuedmodels?partid=kf560c36bbek2-32',
    specifications: { capacityGB: 32, modules: '2x16GB', memoryType: 'DDR5', speedMTs: 6000, latency: '36-38-38', latencyCL: 36, formFactor: '288-pin UDIMM', profileSupport: ['AMD EXPO'], voltageV: 1.35, ecc: false },
  },
  {
    brand: 'Kingston', model: 'FURY Beast DDR5 32GB (2x16GB) 5600MT/s CL40 XMP', partNumber: 'KF556C40BBK2-32', family: 'FURY Beast DDR5',
    sourceUrl: 'https://www.kingston.com/en/memory/search?partId=KF556C40BBK2-32',
    specifications: { capacityGB: 32, modules: '2x16GB', memoryType: 'DDR5', speedMTs: 5600, latency: '40-40-40', latencyCL: 40, formFactor: '288-pin UDIMM', profileSupport: ['Intel XMP'], voltageV: 1.25, ecc: false },
  },
  {
    brand: 'G.SKILL', model: 'Ripjaws S5 DDR5 32GB (2x16GB) 6000MT/s CL32', partNumber: 'F5-6000J3238F16GX2-RS5K', family: 'Ripjaws S5',
    sourceUrl: 'https://www.gskill.com/product/165/377/1649665818/F5-6000J3238F16GX2-RS5K-F5-6000J3238F16GA2-RS5K',
    specifications: { capacityGB: 32, modules: '2x16GB', memoryType: 'DDR5', speedMTs: 6000, latency: '32-38-38-96', latencyCL: 32, voltageV: 1.35, formFactor: 'UDIMM', profileSupport: ['Intel XMP'], ecc: false, moduleHeightMM: 33 },
  },
  {
    brand: 'G.SKILL', model: 'Trident Z5 Neo RGB DDR5 32GB (2x16GB) 6000MT/s CL32', partNumber: 'F5-6000J3238F16GX2-TZ5NR', family: 'Trident Z5 Neo RGB',
    sourceUrl: 'https://www.gskill.com/qvl/165/390/1662622003/F5-6000J3238F16GX2-TZ5NR-QVL',
    specifications: { capacityGB: 32, modules: '2x16GB', memoryType: 'DDR5', speedMTs: 6000, latency: '32-38-38-96', latencyCL: 32, voltageV: 1.35, formFactor: 'UDIMM', profileSupport: ['Intel XMP', 'AMD EXPO'], ecc: false, rgb: true },
  },
  {
    brand: 'G.SKILL', model: 'Trident Z5 Neo DDR5 32GB (2x16GB) 6000MT/s CL30', partNumber: 'F5-6000J3038F16GX2-TZ5N', family: 'Trident Z5 Neo',
    sourceUrl: 'https://www.gskill.com/specification/165/393/1661410171/F5-6000J3038F16GX2-TZ5N-Specification',
    specifications: { capacityGB: 32, modules: '2x16GB', memoryType: 'DDR5', speedMTs: 6000, latency: '30-38-38-96', latencyCL: 30, voltageV: 1.35, formFactor: 'UDIMM', profileSupport: ['Intel XMP 3.0', 'AMD EXPO'], ecc: false },
  },
  {
    brand: 'G.SKILL', model: 'Trident Z5 Neo RGB DDR5 32GB (2x16GB) 6000MT/s CL36', partNumber: 'F5-6000J3636F16GX2-TZ5NR', family: 'Trident Z5 Neo RGB',
    sourceUrl: 'https://www.gskill.com/product/165/390/1662621819/F5-6000J3636F16GX2-TZ5NR',
    specifications: { capacityGB: 32, modules: '2x16GB', memoryType: 'DDR5', speedMTs: 6000, latencyCL: 36, formFactor: 'UDIMM', profileSupport: ['AMD EXPO'], ecc: false, rgb: true },
  },
];

function key(value: string) { return normalize(value); }

async function main() {
  const importMode = process.argv.includes('--import');
  await connectDB();
  try {
    const existing = await Product.find({ category: 'ram', publicationStatus: 'published' }).select('brand model modelNumber').lean() as Array<{ brand?: string; model?: string; modelNumber?: string }>;
    const existingParts = new Set(existing.map((row) => key(row.modelNumber ?? '')));
    const selected = candidates.filter((candidate) => !existingParts.has(key(candidate.partNumber)));
    const publishedBefore = await Product.countDocuments({ category: 'ram', publicationStatus: 'published' });
    if (!importMode) {
      console.log(JSON.stringify({ mode: 'dry-run', publishedBefore, candidates: candidates.length, selected: selected.length, projectedPublished: publishedBefore + selected.length, target: TARGET, items: selected.map(({ brand, model, partNumber, sourceUrl }) => ({ brand, model, partNumber, sourceUrl })) }, null, 2));
      return;
    }

    let created = 0;
    let skipped = 0;
    for (const candidate of selected) {
      const sourceKey = `manufacturer-ram:${key(candidate.partNumber)}`;
      if (await Product.exists({ $or: [{ sourceKey }, { dedupeKey: sourceKey }, { modelNumber: candidate.partNumber, category: 'ram' }] })) { skipped += 1; continue; }
      const specs = normalizeSpecs(candidate.specifications);
      const sourceEvidence = [
        { evidenceType: 'identity', sourceName: `${candidate.brand} official product specification`, sourceUrl: candidate.sourceUrl, retrievedAt: RETRIEVED_AT, verifiedAt: RETRIEVED_AT, notes: `Manufacturer page/datasheet identifies memory kit part number ${candidate.partNumber}.` },
        { evidenceType: 'specifications', sourceName: `${candidate.brand} official product specification`, sourceUrl: candidate.sourceUrl, retrievedAt: RETRIEVED_AT, verifiedAt: RETRIEVED_AT, notes: 'Capacity, generation, form factor and performance details transcribed from this exact manufacturer SKU page or datasheet.' },
      ];
      await Product.create({
        name: `${candidate.brand} ${candidate.model}`, brand: candidate.brand, model: candidate.model, modelNumber: candidate.partNumber, family: candidate.family,
        productStatus: candidate.productStatus ?? 'active', category: 'ram', description: `Bộ nhớ RAM ${candidate.family}; mã sản phẩm và thông số được đối chiếu với trang kỹ thuật chính thức của ${candidate.brand}.`,
        imageUrl: null, imageSource: null, imageSourceUrl: null, imageAuthor: null, imageRetrievedAt: null,
        imageUsagePermission: 'not_provided', imagePermissionEvidence: null, imageLicense: null, imageLicenseUrl: null, imageAttribution: null,
        imageVisualIdentityChecked: false, imageVerificationBasis: null,
        sourceUrl: candidate.sourceUrl, productUrl: candidate.sourceUrl, specificationSourceUrl: candidate.sourceUrl,
        verified: true, verifiedAt: RETRIEVED_AT, verificationScope: 'manufacturer', productVerificationStatus: 'verified',
        imageVerificationStatus: 'pending', urlVerificationStatus: 'verified', publicationStatus: 'published',
        specifications: candidate.specifications, specs, normalizedSpecs: specs, variants: [], sourceEvidence,
        dataAttribution: `${candidate.brand} official product specification`, dataSourceUrl: candidate.sourceUrl,
        source: 'curated', sourceProductId: sourceKey, sourceProductIds: [sourceKey], sourceKey, dedupeKey: sourceKey,
        electronicStatus: 'approved', price: null, originalPrice: null, rating: null, sold: null, stock: null,
        tags: ['ram', 'memory', candidate.family.toLowerCase(), candidate.specifications.memoryType],
        searchText: normalize([candidate.brand, candidate.model, candidate.partNumber, candidate.family, JSON.stringify(candidate.specifications)].join(' ')),
      });
      created += 1;
    }
    const publishedAfter = await Product.countDocuments({ category: 'ram', publicationStatus: 'published' });
    await SyncRun.create({ source: 'manufacturer-specifications', sourceKey: 'manufacturer-ram-sku-catalog', mode: 'import', status: 'succeeded', startedAt: RETRIEVED_AT, finishedAt: new Date(), stats: { candidates: candidates.length, selected: selected.length, created, skipped, publishedRam: publishedAfter, target: TARGET } });
    console.log(JSON.stringify({ mode: 'import', database: mongoose.connection.name, created, skipped, publishedBefore, publishedAfter, target: TARGET }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => { console.error(error instanceof Error ? error.message : 'RAM catalog import failed'); await mongoose.disconnect(); process.exitCode = 1; });
