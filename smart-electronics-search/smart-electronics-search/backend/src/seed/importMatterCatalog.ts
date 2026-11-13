import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';
import { normalize } from '../utils/text';
import { normalizeSpecs } from '../utils/specs';

const DATA_URL = 'https://mattercatalog.firebaseapp.com/data/matter-certified-products.json';
const DATASET_URL = 'https://mattercatalog.com/open-data';
const STATISTICS_URL = 'https://mattercatalog.com/matter-statistics';
const LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';
const ATTRIBUTION = 'Data from MatterCatalog';
const TARGET = 30;
const BRAND_ORDER = [
  'Aqara', 'Eve', 'TP-Link', 'Tapo', 'Philips Hue', 'Nanoleaf', 'IKEA', 'Google',
  'Amazon', 'Meross', 'SwitchBot', 'Sonoff', 'Leviton', 'Yale', 'Govee', 'WiZ',
];

type MatterRecord = {
  brand?: string;
  model?: string;
  category?: string;
  certificateId?: string;
  certifiedDate?: string;
  network?: string;
  usStoreLink?: boolean;
  url?: string;
};

type MatterDataset = {
  dataAsOf?: string;
  license?: string;
  records?: MatterRecord[];
};

function identityKey(brand: string, model: string) {
  return `${normalize(brand)}|${normalize(model)}`;
}

function brandRank(brand: string) {
  const index = BRAND_ORDER.findIndex((name) => name.toLowerCase() === brand.toLowerCase());
  return index < 0 ? BRAND_ORDER.length : index;
}

async function fetchDataset(): Promise<MatterDataset> {
  const response = await fetch(DATA_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'smart-electronics-search-catalog-import/1.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`MatterCatalog HTTP ${response.status}`);
  const dataset = await response.json() as MatterDataset;
  if (!Array.isArray(dataset.records) || dataset.license !== LICENSE_URL) {
    throw new Error('MatterCatalog dataset shape or declared license changed; no data was written.');
  }
  return dataset;
}

async function main() {
  const importMode = process.argv.includes('--import');
  const dataset = await fetchDataset();
  const records = dataset.records ?? [];
  await connectDB();
  try {
    const current = await Product.find({ category: 'smart_home', publicationStatus: 'published' })
      .select('brand model name').lean() as Array<{ brand?: string | null; model?: string | null; name?: string | null }>;
    const existing = new Set(current.map((product) => identityKey(product.brand ?? '', product.model ?? product.name ?? '')));

    const candidates = records.flatMap((record) => {
      const brand = record.brand?.trim();
      const model = record.model?.trim();
      const certificateId = record.certificateId?.trim();
      const sourceUrl = record.url?.trim();
      if (!brand || !model || !certificateId || record.usStoreLink !== true || !sourceUrl) return [];
      try {
        const parsed = new URL(sourceUrl);
        if (parsed.protocol !== 'https:' || parsed.hostname !== 'mattercatalog.com') return [];
      } catch { return []; }
      const key = identityKey(brand, model);
      if (existing.has(key)) return [];
      existing.add(key);
      return [{ record, brand, model, certificateId, sourceUrl, key }];
    });

    // Select across brands in round-robin order so one large brand cannot dominate the category.
    const byBrand = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      const key = candidate.brand.toLowerCase();
      const group = byBrand.get(key) ?? [];
      group.push(candidate);
      byBrand.set(key, group);
    }
    for (const group of byBrand.values()) {
      group.sort((a, b) => (b.record.certifiedDate ?? '').localeCompare(a.record.certifiedDate ?? '') || a.model.localeCompare(b.model));
    }
    const brands = [...byBrand.keys()].sort((a, b) => brandRank(byBrand.get(a)![0].brand) - brandRank(byBrand.get(b)![0].brand) || a.localeCompare(b));
    const selected: typeof candidates = [];
    let round = 0;
    while (selected.length < Math.max(0, TARGET - current.length)) {
      let addedInRound = false;
      for (const brand of brands) {
        const candidate = byBrand.get(brand)?.[round];
        if (!candidate) continue;
        selected.push(candidate);
        addedInRound = true;
        if (selected.length >= Math.max(0, TARGET - current.length)) break;
      }
      if (!addedInRound) break;
      round += 1;
    }

    if (!importMode) {
      console.log(JSON.stringify({ mode: 'dry-run', datasetAsOf: dataset.dataAsOf, attribution: ATTRIBUTION, license: 'CC BY 4.0', existingPublished: current.length, target: TARGET, eligibleCandidates: candidates.length, selected: selected.map(({ record, brand, model, certificateId, sourceUrl }) => ({ brand, model, category: record.category, certificateId, certifiedDate: record.certifiedDate || null, network: record.network || null, sourceUrl })), missingAfterPlan: Math.max(0, TARGET - current.length - selected.length), note: 'The licensed data file contains no price or photo fields; those remain empty.' }, null, 2));
      return;
    }

    const startedAt = new Date();
    let created = 0;
    let skipped = 0;
    for (const candidate of selected) {
      const { record, brand, model, certificateId, sourceUrl } = candidate;
      const verifiedAt = record.certifiedDate && !Number.isNaN(Date.parse(record.certifiedDate))
        ? new Date(`${record.certifiedDate}T00:00:00.000Z`)
        : new Date(dataset.dataAsOf ?? startedAt);
      const sourceEvidence = [
        { evidenceType: 'identity', sourceName: 'MatterCatalog', sourceUrl, retrievedAt: startedAt, verifiedAt, notes: `MatterCatalog lists the exact brand/model and matched CSA Matter certificate ${certificateId}.` },
        { evidenceType: 'certification', sourceName: 'Connectivity Standards Alliance via MatterCatalog', sourceUrl: STATISTICS_URL, retrievedAt: startedAt, verifiedAt, notes: `CSA certificate ${certificateId}${record.certifiedDate ? `, certified ${record.certifiedDate}` : ''}.` },
        { evidenceType: 'data_license', sourceName: 'MatterCatalog open data', sourceUrl: DATASET_URL, retrievedAt: startedAt, verifiedAt: new Date(dataset.dataAsOf ?? startedAt), notes: 'Product fact fields are reused under CC BY 4.0 with MatterCatalog attribution. Product photos, store links, and price are not included.' },
      ];
      const specifications = {
        smartHomeCategory: record.category ?? null,
        matterCertificateId: certificateId,
        matterCertifiedDate: record.certifiedDate || null,
        matterNetwork: record.network || null,
        usStoreLinkConfirmed: true,
      };
      const specs = normalizeSpecs(specifications);
      const sourceKey = `mattercatalog:${certificateId}`;
      const existingProduct = await Product.findOne({ $or: [{ sourceKey }, { dedupeKey: sourceKey }] }).select('_id').lean();
      if (existingProduct) { skipped += 1; continue; }
      await Product.create({
        name: model, brand, model, modelNumber: certificateId, category: 'smart_home',
        family: record.category ?? 'Matter smart-home device', productStatus: 'unknown', releaseYear: null,
        description: `Thiết bị nhà thông minh ${record.category ? `nhóm ${record.category}` : ''}; có chứng nhận Matter khớp model theo dữ liệu MatterCatalog. Bộ dữ liệu nguồn không cung cấp giá hoặc ảnh.`.trim(),
        imageUrl: null, imageSource: null, imageSourceUrl: null, imageAuthor: null, imageRetrievedAt: null,
        imageUsagePermission: 'not_provided', imagePermissionEvidence: null, imageLicense: null, imageLicenseUrl: null,
        imageAttribution: null, imageVisualIdentityChecked: false, imageVerificationBasis: null,
        sourceUrl, productUrl: sourceUrl, specificationSourceUrl: sourceUrl,
        verified: true, verifiedAt, verificationScope: 'open_dataset', productVerificationStatus: 'verified',
        imageVerificationStatus: 'pending', urlVerificationStatus: 'verified', publicationStatus: 'published',
        specifications, specs, normalizedSpecs: specs, variants: [], sourceEvidence,
        dataAttribution: ATTRIBUTION, dataSourceUrl: DATASET_URL, dataLicense: 'CC BY 4.0', dataLicenseUrl: LICENSE_URL,
        source: 'curated', sourceProductId: certificateId, sourceProductIds: [certificateId], sourceKey,
        dedupeKey: sourceKey, electronicStatus: 'approved',
        price: null, originalPrice: null, rating: null, sold: null, stock: null,
        tags: ['smart home', 'matter', String(record.category ?? '').toLowerCase()].filter(Boolean),
        searchText: normalize([model, brand, 'smart home Matter CSA', record.category, record.network, certificateId].filter(Boolean).join(' ')),
      });
      created += 1;
    }

    const publishedCount = await Product.countDocuments({ category: 'smart_home', publicationStatus: 'published' });
    await SyncRun.create({ source: 'MatterCatalog', sourceKey: `mattercatalog:smart-home:${dataset.dataAsOf ?? 'latest'}`, mode: 'import', status: 'succeeded', startedAt, finishedAt: new Date(), stats: { datasetAsOf: dataset.dataAsOf, eligibleCandidates: candidates.length, selected: selected.length, created, skipped, publishedSmartHome: publishedCount, target: TARGET, attribution: ATTRIBUTION, license: 'CC BY 4.0' } });
    console.log(JSON.stringify({ mode: 'import', database: mongoose.connection.name, datasetAsOf: dataset.dataAsOf, created, skipped, publishedSmartHome: publishedCount, target: TARGET, attribution: ATTRIBUTION, license: 'CC BY 4.0' }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'MatterCatalog import failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
