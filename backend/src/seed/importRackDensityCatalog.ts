import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';
import { normalize } from '../utils/text';
import { normalizeSpecs } from '../utils/specs';

const DATA_URL = 'https://rack-density.com/devices/rack-density-devices.json';
const DATASET_URL = 'https://rack-density.com/devices/';
const LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';
const ATTRIBUTION = 'DC Sim device catalog by RACKDENSITY (rack-density.com), CC BY 4.0';
const TARGET = 30;

type RackDevice = {
  id?: string;
  vendor?: string;
  model?: string;
  name?: string;
  category?: string;
  status?: string;
  rack_units?: number | null;
  form_factor?: string | null;
  dimensions_mm?: Record<string, number> | null;
  weight_kg?: number | null;
  power_w?: Record<string, number | null> | null;
  ports?: Array<{ kind: string; count: number }>;
  ports_summary?: string | null;
  airflow?: string | null;
  list_price?: { usd?: number; date?: string; kind?: string; config?: string; source?: string } | null;
  sources?: Array<{ tier?: number; title?: string; url?: string; retrieved?: string }>;
  estimated?: string[];
  updated?: string;
};

type RackDataset = {
  license?: string;
  license_url?: string;
  attribution?: string;
  devices?: RackDevice[];
};

function identityKey(brand: string, model: string) {
  return `${normalize(brand)}|${normalize(model)}`;
}

function mapCategory(category: string | undefined): 'desktop' | 'nas' | 'ups' | null {
  if (category === 'mini_pc') return 'desktop';
  if (category === 'nas') return 'nas';
  if (category === 'ups') return 'ups';
  return null;
}

async function fetchDataset(): Promise<RackDataset> {
  const response = await fetch(DATA_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'smart-electronics-search-catalog-import/1.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`RACKDENSITY dataset HTTP ${response.status}`);
  const dataset = await response.json() as RackDataset;
  if (!Array.isArray(dataset.devices) || dataset.license !== 'CC BY 4.0' || dataset.license_url !== LICENSE_URL) {
    throw new Error('RACKDENSITY dataset shape or declared license changed; no data was written.');
  }
  return dataset;
}

async function main() {
  const importMode = process.argv.includes('--import');
  const dataset = await fetchDataset();
  const devices = dataset.devices ?? [];
  await connectDB();
  try {
    const current = await Product.find({ category: { $in: ['desktop', 'nas', 'ups'] }, publicationStatus: 'published' })
      .select('category brand model name').lean() as Array<{ category: string; brand?: string | null; model?: string | null; name?: string | null }>;
    const currentByCategory = new Map<string, Set<string>>();
    for (const product of current) {
      const identities = currentByCategory.get(product.category) ?? new Set<string>();
      identities.add(identityKey(product.brand ?? '', product.model ?? product.name ?? ''));
      currentByCategory.set(product.category, identities);
    }

    const candidates: Array<{ device: RackDevice; category: 'desktop' | 'nas' | 'ups'; brand: string; model: string; name: string; sourceUrl: string; identity: string }> = [];
    const seen = new Set<string>();
    for (const device of devices) {
      const category = mapCategory(device.category);
      const brand = device.vendor?.trim();
      const model = device.model?.trim();
      const name = device.name?.trim();
      const primarySource = device.sources?.find((source) => source.tier === 1 && source.url)?.url;
      if (device.status !== 'done' || !category || !brand || !model || !name || !device.id || !primarySource) continue;
      let source: URL;
      try { source = new URL(primarySource); } catch { continue; }
      if (source.protocol !== 'https:') continue;
      const identity = identityKey(brand, model);
      const categorySeen = currentByCategory.get(category) ?? new Set<string>();
      const dedupeKey = `${category}|${identity}`;
      if (categorySeen.has(identity) || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      candidates.push({ device, category, brand, model, name, sourceUrl: primarySource, identity });
    }

    const remaining = new Map<string, number>(['desktop', 'nas', 'ups'].map((category) => [category, Math.max(0, TARGET - (currentByCategory.get(category)?.size ?? 0))]));
    const selected = candidates.filter((candidate) => {
      const slots = remaining.get(candidate.category) ?? 0;
      if (slots <= 0) return false;
      remaining.set(candidate.category, slots - 1);
      return true;
    });

    if (!importMode) {
      console.log(JSON.stringify({ mode: 'dry-run', datasetRecords: devices.length, attribution: dataset.attribution ?? ATTRIBUTION, license: dataset.license, currentPublished: Object.fromEntries(['desktop', 'nas', 'ups'].map((category) => [category, currentByCategory.get(category)?.size ?? 0])), candidatesByCategory: Object.fromEntries(['desktop', 'nas', 'ups'].map((category) => [category, candidates.filter((item) => item.category === category).length])), selected: selected.map(({ device, category, brand, model, name, sourceUrl }) => ({ category, brand, model, name, sourceUrl, retrieved: device.sources?.find((source) => source.url === sourceUrl)?.retrieved ?? device.updated, datedListPriceIgnored: device.list_price?.date ? { date: device.list_price.date, kind: device.list_price.kind ?? 'list price' } : null })), missingAfterPlan: Object.fromEntries([...remaining].map(([category, count]) => [category, count])), note: 'Import retains specifications and source dates. Dated USD list prices are excluded from the current-price field; the dataset does not supply product photos.' }, null, 2));
      return;
    }

    const startedAt = new Date();
    let created = 0;
    let skipped = 0;
    for (const candidate of selected) {
      const { device, category, brand, model, name, sourceUrl } = candidate;
      const sourceRetrievedAt = device.sources?.find((source) => source.url === sourceUrl)?.retrieved ?? device.updated;
      const verifiedAt = sourceRetrievedAt && !Number.isNaN(Date.parse(sourceRetrievedAt)) ? new Date(sourceRetrievedAt) : startedAt;
      const sourceKey = `rackdensity:${device.id}`;
      if (await Product.exists({ $or: [{ sourceKey }, { dedupeKey: sourceKey }] })) { skipped += 1; continue; }
      const estimated = new Set(device.estimated ?? []);
      const specifications = {
        formFactor: device.form_factor ?? null,
        rackUnits: device.rack_units ?? null,
        dimensionsMM: device.dimensions_mm ?? null,
        weightKG: device.weight_kg ?? null,
        powerW: device.power_w ?? null,
        ports: device.ports?.length ? device.ports : null,
        portsSummary: device.ports_summary ?? null,
        airflow: device.airflow ?? null,
        dataStatus: device.status ?? null,
        estimatedSourceFields: estimated.size ? [...estimated] : null,
      };
      const specs = normalizeSpecs(specifications);
      const allSources = (device.sources ?? []).filter((source) => source.url && /^https:\/\//i.test(source.url));
      const sourceEvidence = [
        ...allSources.slice(0, 5).map((source) => ({
          evidenceType: source === allSources[0] ? 'specifications' : 'supplemental_source',
          sourceName: source.title || brand,
          sourceUrl: source.url!,
          retrievedAt: source.retrieved && !Number.isNaN(Date.parse(source.retrieved)) ? new Date(source.retrieved) : startedAt,
          verifiedAt: source.retrieved && !Number.isNaN(Date.parse(source.retrieved)) ? new Date(source.retrieved) : startedAt,
          notes: `Listed by RACKDENSITY as a cited public source for ${model}.`,
        })),
        { evidenceType: 'data_license', sourceName: ATTRIBUTION, sourceUrl: DATASET_URL, retrievedAt: startedAt, verifiedAt: new Date(device.updated ?? startedAt), notes: `Structured device specifications reused under CC BY 4.0. Attribution: ${ATTRIBUTION}.` },
      ];
      const description = `${name}. Specifications are sourced from the CC BY 4.0 RACKDENSITY device catalog; no current Vietnam retail offer or licensed product photo is included.`;
      await Product.create({
        name, brand, model, modelNumber: model, category,
        family: category === 'desktop' ? 'Mini PC' : category === 'nas' ? 'Network attached storage' : 'Uninterruptible power supply',
        productStatus: 'unknown', releaseYear: null, description,
        imageUrl: null, imageSource: null, imageSourceUrl: null, imageAuthor: null, imageRetrievedAt: null,
        imageUsagePermission: 'not_provided', imagePermissionEvidence: null, imageLicense: null, imageLicenseUrl: null,
        imageAttribution: null, imageVisualIdentityChecked: false, imageVerificationBasis: null,
        sourceUrl, productUrl: sourceUrl, specificationSourceUrl: sourceUrl,
        verified: true, verifiedAt, verificationScope: 'open_dataset', productVerificationStatus: 'verified',
        imageVerificationStatus: 'pending', urlVerificationStatus: 'verified', publicationStatus: 'published',
        specifications, specs, normalizedSpecs: specs, variants: [], sourceEvidence,
        dataAttribution: dataset.attribution ?? ATTRIBUTION, dataSourceUrl: DATASET_URL, dataLicense: dataset.license, dataLicenseUrl: dataset.license_url,
        source: 'curated', sourceProductId: device.id, sourceProductIds: [device.id], sourceKey,
        dedupeKey: sourceKey, electronicStatus: 'approved', price: null, originalPrice: null,
        rating: null, sold: null, stock: null, tags: [category, 'open data', 'CC BY 4.0'],
        searchText: normalize([name, brand, model, category, device.ports_summary, JSON.stringify(specifications)].filter(Boolean).join(' ')),
      });
      created += 1;
    }

    const publishedCounts = await Product.aggregate([
      { $match: { category: { $in: ['desktop', 'nas', 'ups'] }, publicationStatus: 'published' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(publishedCounts.map(({ _id, count }) => [_id, count]));
    await SyncRun.create({ source: 'RACKDENSITY', sourceKey: 'rackdensity:mini-pc-nas-ups', mode: 'import', status: 'succeeded', startedAt, finishedAt: new Date(), stats: { datasetRecords: devices.length, selected: selected.length, created, skipped, publishedCounts: countMap, target: TARGET, attribution: dataset.attribution ?? ATTRIBUTION, license: dataset.license } });
    console.log(JSON.stringify({ mode: 'import', database: mongoose.connection.name, datasetRecords: devices.length, created, skipped, publishedCounts: countMap, target: TARGET, attribution: dataset.attribution ?? ATTRIBUTION, license: dataset.license }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'RACKDENSITY catalog import failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
