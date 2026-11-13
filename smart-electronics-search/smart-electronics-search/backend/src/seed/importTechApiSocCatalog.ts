import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';
import { TechApiCatalogRecord } from '../models/TechApiCatalogRecord';
import { normalize } from '../utils/text';
import { normalizeSpecs } from '../utils/specs';

const TARGET = 30;
const TECHAPI_REPOSITORY = 'https://github.com/GetTechAPI/TechAPI';
const TECHAPI_LICENSE_URL = 'https://github.com/GetTechAPI/TechAPI/blob/main/data/LICENSE.md';
const CC_BY_SA_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
const DATA_ATTRIBUTION = 'Data from TechAPI';
const MANUFACTURER_HOSTS = [
  'apple.com', 'qualcomm.com', 'mediatek.com', 'samsung.com', 'google.com', 'huawei.com', 'honor.com',
  'xiaomi.com', 'oppo.com', 'vivo.com', 'motorola.com', 'unisoc.com', 'lenovo.com',
];

function brandName(value: unknown, name: string, sourceUrl: string): string {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const known: Record<string, string> = {
    apple: 'Apple', qualcomm: 'Qualcomm', mediatek: 'MediaTek', samsung: 'Samsung', google: 'Google',
    hisilicon: 'HiSilicon', huawei: 'Huawei', honor: 'Honor', xiaomi: 'Xiaomi', oppo: 'OPPO', vivo: 'vivo',
    unisoc: 'UNISOC', motorola: 'Motorola', lenovo: 'Lenovo',
  };
  if (known[raw]) return known[raw];
  if (/snapdragon/i.test(name)) return 'Qualcomm';
  if (/dimensity|helio/i.test(name)) return 'MediaTek';
  if (/exynos/i.test(name)) return 'Samsung';
  if (/tensor/i.test(name)) return 'Google';
  if (/kirin/i.test(name)) return 'HiSilicon';
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, '');
    const matched = MANUFACTURER_HOSTS.find((candidate) => host === candidate || host.endsWith(`.${candidate}`));
    if (matched) return ({ 'apple.com': 'Apple', 'qualcomm.com': 'Qualcomm', 'mediatek.com': 'MediaTek', 'samsung.com': 'Samsung', 'google.com': 'Google', 'huawei.com': 'Huawei', 'honor.com': 'Honor', 'xiaomi.com': 'Xiaomi', 'oppo.com': 'OPPO', 'vivo.com': 'vivo', 'motorola.com': 'Motorola', 'unisoc.com': 'UNISOC', 'lenovo.com': 'Lenovo' } as Record<string, string>)[matched];
  } catch { /* primary URL validation below rejects invalid URLs */ }
  return 'Unknown';
}

function isManufacturerUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return url.protocol === 'https:' && MANUFACTURER_HOSTS.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
  } catch { return false; }
}

function sourcedSpecifications(raw: Record<string, any>) {
  const excluded = new Set(['slug', 'name', 'manufacturer', 'release_date', 'msrp_usd', 'verified', 'source_urls', 'image_url', 'logo_url', 'image_license', 'image_attribution']);
  return Object.fromEntries(Object.entries(raw).filter(([key, value]) => !excluded.has(key) && value !== null && value !== undefined));
}

async function main() {
  const importMode = process.argv.includes('--import');
  await connectDB();
  const startedAt = new Date();
  const records = await TechApiCatalogRecord.find({ sourceCategory: 'soc', 'raw.verified': true })
    .select('sourceSlug name sourceRecordUrl raw lastSeenAt').lean() as any[];
  const current = await Product.find({ category: 'soc', verified: true, productVerificationStatus: 'verified', publicationStatus: 'published' })
    .select('brand model name').lean() as any[];
  const currentKeys = new Set(current.map((product) => `${normalize(product.brand ?? '')}|${normalize(product.model ?? product.name ?? '')}`));
  const candidates = records.flatMap((record) => {
    const raw = record.raw as Record<string, any>;
    const sourceUrls = Array.isArray(raw.source_urls) ? raw.source_urls.filter(isManufacturerUrl) : [];
    const primaryUrl = sourceUrls[0];
    const releaseYear = Number(String(raw.release_date ?? '').slice(0, 4));
    const brand = primaryUrl ? brandName(raw.manufacturer, String(raw.name ?? record.name), primaryUrl) : 'Unknown';
    if (!record.sourceSlug || !raw.name || raw.verified !== true || !primaryUrl || brand === 'Unknown' || releaseYear < 2023) return [];
    const key = `${normalize(brand)}|${normalize(String(raw.name))}`;
    if (currentKeys.has(key)) return [];
    return [{ record, raw, sourceUrls, primaryUrl, brand, releaseYear, key }];
  }).sort((a, b) => String(b.raw.release_date).localeCompare(String(a.raw.release_date)) || a.record.name.localeCompare(b.record.name));

  const selected = candidates.slice(0, Math.max(0, TARGET - currentKeys.size));
  if (!selected.length && currentKeys.size < TARGET) throw new Error(`No manufacturer-sourced verified SoC candidates available; current ${currentKeys.size}/${TARGET}`);
  if (!importMode) {
    console.log(JSON.stringify({ mode: 'dry-run', current: currentKeys.size, target: TARGET, candidates: selected.map(({ record, raw, brand, primaryUrl, releaseYear }) => ({ slug: record.sourceSlug, name: raw.name, brand, releaseYear, manufacturerSourceUrl: primaryUrl })), missingAfterPlan: Math.max(0, TARGET - currentKeys.size - selected.length) }, null, 2));
    await mongoose.disconnect();
    return;
  }

  let created = 0;
  let skippedExisting = 0;
  for (const entry of selected) {
    const { record, raw, sourceUrls, primaryUrl, brand, releaseYear } = entry;
    const recordUrl = typeof record.sourceRecordUrl === 'string' && /^https:\/\//i.test(record.sourceRecordUrl) ? record.sourceRecordUrl : null;
    const verifiedAt = record.lastSeenAt instanceof Date ? record.lastSeenAt : new Date(record.lastSeenAt ?? startedAt);
    if (!recordUrl || Number.isNaN(verifiedAt.getTime())) throw new Error(`${record.sourceSlug}: TechAPI record URL or snapshot date is invalid`);
    const existing = await Product.findOne({ category: 'soc', brand: new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), model: new RegExp(`^${String(raw.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).select('_id').lean();
    if (existing) { skippedExisting += 1; continue; }
    const specifications = sourcedSpecifications(raw);
    const specs = normalizeSpecs(specifications);
    const sourceEvidence = [
      { evidenceType: 'identity', sourceName: 'TechAPI', sourceUrl: recordUrl, retrievedAt: verifiedAt, verifiedAt, notes: `TechAPI record ${record.sourceSlug} is marked verified; its source_urls include a manufacturer page.` },
      { evidenceType: 'specifications', sourceName: brand, sourceUrl: primaryUrl, retrievedAt: verifiedAt, verifiedAt, notes: 'Manufacturer page is listed in the verified TechAPI record source_urls; the stored fields are from the CC BY-SA dataset.' },
      { evidenceType: 'data_license', sourceName: 'TechAPI data license', sourceUrl: TECHAPI_LICENSE_URL, retrievedAt: verifiedAt, verifiedAt, notes: 'Data from TechAPI; CC BY-SA 4.0. Attribution is retained on this product record.' },
      ...sourceUrls.filter((url: string) => url !== primaryUrl).slice(0, 2).map((url: string) => ({ evidenceType: 'supplemental_source', sourceName: 'TechAPI source_urls', sourceUrl: url, retrievedAt: verifiedAt, verifiedAt, notes: 'Additional source listed by TechAPI for this SoC record.' })),
    ];
    await Product.create({
      name: raw.name, brand, model: raw.name, modelNumber: null, family: null, generation: null,
      releaseYear, productStatus: 'unknown', category: 'soc', description: null,
      imageUrl: null, imageSource: null, imageSourceUrl: null, imageAuthor: null, imageRetrievedAt: null,
      imageUsagePermission: 'not_provided', imagePermissionEvidence: null, imageLicense: null, imageLicenseUrl: null,
      imageAttribution: null, imageVisualIdentityChecked: false, imageVerificationBasis: null,
      sourceUrl: recordUrl, productUrl: recordUrl, specificationSourceUrl: primaryUrl,
      verified: true, verifiedAt, verificationScope: 'open_dataset', productVerificationStatus: 'verified',
      imageVerificationStatus: 'pending', urlVerificationStatus: 'verified', publicationStatus: 'published',
      specifications, specs, normalizedSpecs: specs, variants: [], sourceEvidence,
      dataAttribution: DATA_ATTRIBUTION, dataSourceUrl: TECHAPI_REPOSITORY, dataLicense: 'CC BY-SA 4.0', dataLicenseUrl: CC_BY_SA_URL,
      source: 'curated', sourceProductId: record.sourceSlug, sourceProductIds: [record.sourceSlug], sourceKey: `techapi:soc:${record.sourceSlug}`,
      dedupeKey: `techapi:soc:${record.sourceSlug}`, electronicStatus: 'approved',
      price: null, originalPrice: null, rating: null, sold: null, stock: null, tags: ['soc', 'mobile chipset'],
      searchText: normalize([raw.name, brand, 'soc mobile chipset', JSON.stringify(specifications)].join(' ')),
    });
    created += 1;
  }
  const count = await Product.countDocuments({ category: 'soc', verified: true, productVerificationStatus: 'verified', urlVerificationStatus: 'verified', publicationStatus: 'published' });
  await SyncRun.create({ source: 'TechAPI', sourceKey: 'techapi:soc:minimum-30', mode: 'import', page: 1, status: 'succeeded', startedAt, finishedAt: new Date(), stats: { candidates: candidates.length, selected: selected.length, created, skippedExisting, publishedSoc: count, target: TARGET, license: 'CC BY-SA 4.0' } });
  console.log(JSON.stringify({ mode: 'import', database: mongoose.connection.name, candidates: candidates.length, selected: selected.length, created, skippedExisting, publishedSoc: count, target: TARGET, attribution: DATA_ATTRIBUTION }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'TechAPI SoC catalog import failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
