import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';
import type { TechApiRepository, TechApiSocRecord } from '../repositories/techApiRepository';
import { normalize } from '../utils/text';
import { normalizeSpecs } from '../utils/specs';
import type { TechApiSocOperationLock } from './techApiSocOperationLock';

const TARGET = 30;
const TECHAPI_REPOSITORY = 'https://github.com/GetTechAPI/TechAPI';
const TECHAPI_LICENSE_URL = 'https://github.com/GetTechAPI/TechAPI/blob/main/data/LICENSE.md';
const CC_BY_SA_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
const DATA_ATTRIBUTION = 'Data from TechAPI';
const MANUFACTURER_HOSTS = [
  'apple.com', 'qualcomm.com', 'mediatek.com', 'samsung.com', 'google.com', 'huawei.com', 'honor.com',
  'xiaomi.com', 'oppo.com', 'vivo.com', 'motorola.com', 'unisoc.com', 'lenovo.com',
];

export type SocImportPhase = 'operation_lock' | 'source_read' | 'product_read' | 'product_write' | 'sync_run_write';
export type SocImportStatus = 'running' | 'succeeded' | 'partial' | 'failed';

export type SocProductIdentity = {
  brand: string;
  model: string;
};

export type SocProductRecord = {
  brand?: unknown;
  model?: unknown;
  name?: unknown;
};

export type SocProductStore = {
  findPublishedVerified(): Promise<SocProductRecord[]>;
  existsByIdentity(identity: SocProductIdentity): Promise<boolean>;
  create(document: Record<string, unknown>): Promise<void>;
  countPublishedVerified(): Promise<number>;
};

export type SocSyncRun = {
  source: 'TechAPI';
  sourceKey: string;
  mode: 'import';
  page: 1;
  status: SocImportStatus;
  startedAt: Date;
  finishedAt: Date | null;
  stats: Record<string, unknown>;
  error: string | null;
};

export type SocSyncRunStore = {
  upsert(run: SocSyncRun): Promise<void>;
};

export type SocImportSummary = {
  mode: 'dry-run' | 'import';
  sourceStorage: 'mongo' | 'sqlite';
  sourceAccessMode: 'readonly';
  productDestination: 'mongo';
  syncRunDestination: 'mongo';
  current: number;
  target: number;
  candidates: Array<{ slug: string; name: string; brand: string; releaseYear: number; manufacturerSourceUrl: string }>;
  selected: number;
  created: number;
  skippedExisting: number;
  skippedUnverified: number;
  duplicateSourceIdentities: number;
  publishedSoc: number;
  missingAfterPlan: number;
  sourceKey: string;
  attribution: string;
};

export type RunTechApiSocImportOptions = {
  sourceRepository: Pick<TechApiRepository, 'findVerifiedSocRecords'>;
  productStore: SocProductStore;
  syncRunStore: SocSyncRunStore;
  sourceStorage: 'mongo' | 'sqlite';
  importMode: boolean;
  target?: number;
  syncRunSourceKey?: string;
  now?: () => Date;
  operationLock?: TechApiSocOperationLock;
};

export class TechApiSocImportError extends Error {
  readonly phase: SocImportPhase;
  readonly productsCreated: number;
  readonly syncRunSourceKey: string;
  readonly originalError: unknown;

  constructor(phase: SocImportPhase, productsCreated: number, syncRunSourceKey: string, originalError: unknown) {
    const safeMessages: Record<SocImportPhase, string> = {
      operation_lock: 'Could not acquire the SoC import operation lock; no source or destination records were processed.',
      source_read: 'Unable to read verified SoC records from the selected TechAPI repository.',
      product_read: 'Unable to read existing SoC products from MongoDB.',
      product_write: 'A MongoDB Product write failed; retrying is safe and will skip products already present.',
      sync_run_write: 'MongoDB SyncRun could not be updated; Product writes already committed remain and retry is safe.',
    };
    super(safeMessages[phase]);
    this.name = 'TechApiSocImportError';
    this.phase = phase;
    this.productsCreated = productsCreated;
    this.syncRunSourceKey = syncRunSourceKey;
    this.originalError = originalError;
  }
}

export function createMongooseSocImportStores(
  productModel: any = Product,
  syncRunModel: any = SyncRun,
): { products: SocProductStore; syncRuns: SocSyncRunStore } {
  const products: SocProductStore = {
    async findPublishedVerified() {
      return await productModel.find({
        category: 'soc', verified: true, productVerificationStatus: 'verified',
        urlVerificationStatus: 'verified', publicationStatus: 'published',
      }).select('brand model name').lean() as SocProductRecord[];
    },
    async existsByIdentity(identity) {
      return Boolean(await productModel.findOne({
        category: 'soc',
        brand: new RegExp(`^${escapeRegex(identity.brand)}$`, 'i'),
        model: new RegExp(`^${escapeRegex(identity.model)}$`, 'i'),
      }).select('_id').lean());
    },
    async create(document) {
      await productModel.create(document);
    },
    async countPublishedVerified() {
      return productModel.countDocuments({
        category: 'soc', verified: true, productVerificationStatus: 'verified',
        urlVerificationStatus: 'verified', publicationStatus: 'published',
      });
    },
  };

  const syncRuns: SocSyncRunStore = {
    async upsert(run) {
      await syncRunModel.updateOne(
        { source: run.source, sourceKey: run.sourceKey },
        { $set: run },
        { upsert: true },
      ).exec();
    },
  };
  return { products, syncRuns };
}

export async function runTechApiSocImport(options: RunTechApiSocImportOptions): Promise<SocImportSummary> {
  if (!options.importMode) return runTechApiSocImportUnlocked(options);
  if (!options.operationLock) {
    throw new Error('An operation-level lock is required before importing SoC Products and SyncRun records.');
  }
  const sourceKey = options.syncRunSourceKey ?? `techapi:soc:minimum-${options.target ?? TARGET}`;
  let releaseLock: () => Promise<void>;
  try {
    releaseLock = await options.operationLock.acquire();
  } catch (error) {
    throw new TechApiSocImportError('operation_lock', 0, sourceKey, error);
  }
  try {
    return await runTechApiSocImportUnlocked(options);
  } finally {
    await releaseLock();
  }
}

async function runTechApiSocImportUnlocked(options: RunTechApiSocImportOptions): Promise<SocImportSummary> {
  const target = options.target ?? TARGET;
  if (!Number.isSafeInteger(target) || target < 1) throw new Error('SoC import target must be a positive integer.');
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const sourceKey = options.syncRunSourceKey ?? `techapi:soc:minimum-${target}`;
  const destinations = {
    sourceStorage: options.sourceStorage,
    sourceAccessMode: 'readonly' as const,
    productDestination: 'mongo' as const,
    syncRunDestination: 'mongo' as const,
  };
  const counters = { created: 0, skippedExisting: 0, skippedUnverified: 0, duplicateSourceIdentities: 0 };
  const runningStats: Record<string, unknown> = { ...destinations, target, ...counters, candidates: 0, selected: 0 };

  if (options.importMode) {
    try {
      await saveSyncRun(options.syncRunStore, {
        source: 'TechAPI', sourceKey, mode: 'import', page: 1, status: 'running', startedAt,
        finishedAt: null, stats: runningStats, error: null,
      });
    } catch (error) {
      throw new TechApiSocImportError('sync_run_write', 0, sourceKey, error);
    }
  }

  let sourceRecords: TechApiSocRecord[];
  try {
    sourceRecords = await options.sourceRepository.findVerifiedSocRecords();
  } catch (error) {
    if (options.importMode) await trySaveFailure(options.syncRunStore, sourceKey, startedAt, 'failed', runningStats);
    throw new TechApiSocImportError('source_read', 0, sourceKey, error);
  }

  let existingProducts: SocProductRecord[];
  try {
    existingProducts = await options.productStore.findPublishedVerified();
  } catch (error) {
    if (options.importMode) await trySaveFailure(options.syncRunStore, sourceKey, startedAt, 'failed', runningStats);
    throw new TechApiSocImportError('product_read', 0, sourceKey, error);
  }

  const existingIdentities = new Set(existingProducts.map((product) => identityKey(
    String(product.brand ?? ''), String(product.model ?? product.name ?? ''),
  )));
  const { candidates, skippedExisting, skippedUnverified, duplicateSourceIdentities } = prepareCandidates(sourceRecords, existingIdentities);
  counters.skippedExisting = skippedExisting;
  counters.skippedUnverified = skippedUnverified;
  counters.duplicateSourceIdentities = duplicateSourceIdentities;
  const selected = candidates.slice(0, Math.max(0, target - existingIdentities.size));
  const summaryBase = {
    ...destinations,
    current: existingIdentities.size,
    target,
    candidates: candidates.map(({ record, brand, releaseYear, primaryUrl }) => ({
      slug: record.sourceSlug, name: record.name, brand, releaseYear, manufacturerSourceUrl: primaryUrl,
    })),
    selected: selected.length,
    ...counters,
    sourceKey,
    attribution: DATA_ATTRIBUTION,
  };

  if (!options.importMode) {
    return {
      mode: 'dry-run', ...summaryBase,
      created: 0, skippedExisting: counters.skippedExisting,
      publishedSoc: await countProductsSafely(options.productStore),
      missingAfterPlan: Math.max(0, target - existingIdentities.size - selected.length),
    };
  }

  try {
    for (const candidate of selected) {
      const { brand, primaryUrl, releaseYear, record, raw, sourceUrls } = candidate;
      const identity = { brand, model: String(raw.name) };
      try {
        if (await options.productStore.existsByIdentity(identity)) {
          counters.skippedExisting += 1;
        } else {
          await options.productStore.create(buildProductDocument(candidate, now()));
          counters.created += 1;
          existingIdentities.add(identityKey(identity.brand, identity.model));
        }
      } catch (error) {
        if (isDuplicateKeyError(error) && await options.productStore.existsByIdentity(identity)) {
          counters.skippedExisting += 1;
        } else {
          const partialStats = { ...summaryBase, ...counters, productsCreated: counters.created };
          await trySaveFailure(options.syncRunStore, sourceKey, startedAt, 'partial', partialStats);
          throw new TechApiSocImportError('product_write', counters.created, sourceKey, error);
        }
      }

      try {
        await saveSyncRun(options.syncRunStore, {
          source: 'TechAPI', sourceKey, mode: 'import', page: 1, status: 'running', startedAt,
          finishedAt: null,
          stats: { ...summaryBase, ...counters, productsCreated: counters.created, lastProcessedSlug: record.sourceSlug },
          error: null,
        });
      } catch (error) {
        throw new TechApiSocImportError('sync_run_write', counters.created, sourceKey, error);
      }
    }
  } catch (error) {
    if (error instanceof TechApiSocImportError) throw error;
    await trySaveFailure(options.syncRunStore, sourceKey, startedAt, 'partial', {
      ...summaryBase, ...counters, productsCreated: counters.created,
    });
    throw new TechApiSocImportError('product_write', counters.created, sourceKey, error);
  }

  let publishedSoc: number;
  try {
    publishedSoc = await countProductsSafely(options.productStore);
  } catch (error) {
    await trySaveFailure(options.syncRunStore, sourceKey, startedAt, 'partial', {
      ...summaryBase, ...counters, productsCreated: counters.created,
    });
    throw new TechApiSocImportError('product_read', counters.created, sourceKey, error);
  }
  const missingAfterPlan = Math.max(0, target - existingIdentities.size);
  const finalStatus: SocImportStatus = missingAfterPlan === 0 ? 'succeeded' : 'partial';
  const finalStats = { ...summaryBase, ...counters, publishedSoc, productsCreated: counters.created, missingAfterPlan };
  try {
    await saveSyncRun(options.syncRunStore, {
      source: 'TechAPI', sourceKey, mode: 'import', page: 1, status: finalStatus, startedAt,
      finishedAt: now(), stats: finalStats,
      error: finalStatus === 'partial' ? 'Import completed with eligible verified products still below the requested target.' : null,
    });
  } catch (error) {
    // Product writes are already committed in MongoDB. Keep the run as running
    // and surface the exact recovery behavior: retry will re-read Product and
    // update this same SyncRun key without creating the Products again.
    throw new TechApiSocImportError('sync_run_write', counters.created, sourceKey, error);
  }

  return {
    mode: 'import', ...summaryBase,
    created: counters.created,
    skippedExisting: counters.skippedExisting,
    skippedUnverified: counters.skippedUnverified,
    duplicateSourceIdentities: counters.duplicateSourceIdentities,
    publishedSoc,
    missingAfterPlan,
  };
}

type SocCandidate = {
  record: TechApiSocRecord;
  raw: Record<string, any>;
  sourceUrls: string[];
  primaryUrl: string;
  brand: string;
  releaseYear: number;
};

function prepareCandidates(records: TechApiSocRecord[], existingIdentities: Set<string>) {
  let skippedExisting = 0;
  let skippedUnverified = 0;
  let duplicateSourceIdentities = 0;
  const candidates: SocCandidate[] = [];
  const seenIdentities = new Set<string>();
  for (const record of records) {
    const raw = record.raw as Record<string, any>;
    const sourceUrls = Array.isArray(raw.source_urls) ? raw.source_urls.filter(isManufacturerUrl) as string[] : [];
    const primaryUrl = sourceUrls[0];
    const releaseYear = Number(String(raw.release_date ?? '').slice(0, 4));
    const brand = primaryUrl ? brandName(raw.manufacturer, String(raw.name ?? record.name), primaryUrl) : 'Unknown';
    if (!record.sourceSlug || !raw.name || raw.verified !== true || !primaryUrl || brand === 'Unknown' || !Number.isInteger(releaseYear) || releaseYear < 2023) {
      skippedUnverified += 1;
      continue;
    }
    const key = identityKey(brand, String(raw.name));
    if (existingIdentities.has(key)) {
      skippedExisting += 1;
      continue;
    }
    if (seenIdentities.has(key)) {
      duplicateSourceIdentities += 1;
      continue;
    }
    seenIdentities.add(key);
    candidates.push({ record, raw, sourceUrls, primaryUrl, brand, releaseYear });
  }
  candidates.sort((left, right) => String(right.raw.release_date).localeCompare(String(left.raw.release_date)) || left.record.name.localeCompare(right.record.name));
  return { candidates, skippedExisting, skippedUnverified, duplicateSourceIdentities };
}

function buildProductDocument(candidate: SocCandidate, verifiedAt: Date): Record<string, unknown> {
  const { record, raw, sourceUrls, primaryUrl, brand, releaseYear } = candidate;
  const recordUrl = typeof record.sourceRecordUrl === 'string' && /^https:\/\//i.test(record.sourceRecordUrl) ? record.sourceRecordUrl : null;
  const lastSeenAt = record.lastSeenAt instanceof Date ? record.lastSeenAt : new Date(record.lastSeenAt ?? verifiedAt);
  if (!recordUrl || Number.isNaN(lastSeenAt.getTime())) throw new Error(`TechAPI record ${record.sourceSlug} has an invalid URL or snapshot date.`);
  const specifications = sourcedSpecifications(raw);
  const specs = normalizeSpecs(specifications);
  const sourceEvidence = [
    { evidenceType: 'identity', sourceName: 'TechAPI', sourceUrl: recordUrl, retrievedAt: lastSeenAt, verifiedAt: lastSeenAt, notes: `TechAPI record ${record.sourceSlug} is marked verified; its source_urls include a manufacturer page.` },
    { evidenceType: 'specifications', sourceName: brand, sourceUrl: primaryUrl, retrievedAt: lastSeenAt, verifiedAt: lastSeenAt, notes: 'Manufacturer page is listed in the verified TechAPI record source_urls; the stored fields are from the CC BY-SA dataset.' },
    { evidenceType: 'data_license', sourceName: 'TechAPI data license', sourceUrl: TECHAPI_LICENSE_URL, retrievedAt: lastSeenAt, verifiedAt: lastSeenAt, notes: 'Data from TechAPI; CC BY-SA 4.0. Attribution is retained on this product record.' },
    ...sourceUrls.filter((url) => url !== primaryUrl).slice(0, 2).map((url) => ({ evidenceType: 'supplemental_source', sourceName: 'TechAPI source_urls', sourceUrl: url, retrievedAt: lastSeenAt, verifiedAt: lastSeenAt, notes: 'Additional source listed by TechAPI for this SoC record.' })),
  ];
  const sourceKey = `techapi:soc:${record.sourceSlug}`;
  return {
    name: raw.name, brand, model: raw.name, modelNumber: null, family: null, generation: null,
    releaseYear, productStatus: 'unknown', category: 'soc', description: null,
    imageUrl: null, imageSource: null, imageSourceUrl: null, imageAuthor: null, imageRetrievedAt: null,
    imageUsagePermission: 'not_provided', imagePermissionEvidence: null, imageLicense: null, imageLicenseUrl: null,
    imageAttribution: null, imageVisualIdentityChecked: false, imageVerificationBasis: null,
    sourceUrl: recordUrl, productUrl: recordUrl, specificationSourceUrl: primaryUrl,
    verified: true, verifiedAt: lastSeenAt, verificationScope: 'open_dataset', productVerificationStatus: 'verified',
    imageVerificationStatus: 'pending', urlVerificationStatus: 'verified', publicationStatus: 'published',
    specifications, specs, normalizedSpecs: specs, variants: [], sourceEvidence,
    dataAttribution: DATA_ATTRIBUTION, dataSourceUrl: TECHAPI_REPOSITORY, dataLicense: 'CC BY-SA 4.0', dataLicenseUrl: CC_BY_SA_URL,
    source: 'curated', sourceProductId: record.sourceSlug, sourceProductIds: [record.sourceSlug], sourceKey,
    dedupeKey: sourceKey, electronicStatus: 'approved',
    price: null, originalPrice: null, rating: null, sold: null, stock: null, tags: ['soc', 'mobile chipset'],
    searchText: normalize([raw.name, brand, 'soc mobile chipset', JSON.stringify(specifications)].join(' ')),
  };
}

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
  } catch { /* Invalid URLs are filtered before this helper is used. */ }
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

function identityKey(brand: string, model: string): string {
  return `${normalize(brand)}|${normalize(model)}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 11000);
}

async function saveSyncRun(store: SocSyncRunStore, run: SocSyncRun): Promise<void> {
  await store.upsert(run);
}

async function trySaveFailure(
  store: SocSyncRunStore,
  sourceKey: string,
  startedAt: Date,
  status: 'partial' | 'failed',
  stats: Record<string, unknown>,
): Promise<void> {
  try {
    await saveSyncRun(store, {
      source: 'TechAPI', sourceKey, mode: 'import', page: 1, status, startedAt,
      finishedAt: new Date(), stats, error: status === 'partial' ? 'Import stopped after a Product write error; retry is safe.' : 'Import failed before Product processing completed.',
    });
  } catch {
    // The original product/source error is more useful; retry can reconcile the SyncRun.
  }
}

async function countProductsSafely(store: SocProductStore): Promise<number> {
  return store.countPublishedVerified();
}
