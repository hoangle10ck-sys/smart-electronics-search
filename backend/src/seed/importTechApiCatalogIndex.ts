import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { SyncRun } from '../models/SyncRun';
import { TechApiCatalogRecord } from '../models/TechApiCatalogRecord';
import { assertLocalMongoUri, buildTechApiSearchText } from '../services/techApiCatalog';

type CatalogRef = { slug: string; name: string; url: string; [key: string]: unknown };
type CatalogPage = { count: number; results: CatalogRef[] };

const API_ROOT = 'https://gettechapi.github.io/TechAPI';
const API_VERSION = `${API_ROOT}/v1`;
const REPOSITORY = 'https://github.com/GetTechAPI/TechAPI';
const LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
const LICENSE_TERMS_URL = 'https://github.com/GetTechAPI/TechAPI/blob/develop/data/LICENSE.md';
const ATTRIBUTION = 'Data from TechAPI';
const PAGE_SIZE = 100;
const CONCURRENCY = 2;
const RUN_KEY = `techapi-catalog-index-${new Date().toISOString().slice(0, 10)}`;

const categories = [
  { key: 'smartphone', endpoint: 'smartphones' },
  { key: 'tablet', endpoint: 'tablets' },
  { key: 'smartwatch', endpoint: 'watches' },
  { key: 'pda', endpoint: 'pdas' },
  { key: 'gpu', endpoint: 'gpus' },
  { key: 'cpu', endpoint: 'cpus' },
  { key: 'laptop', endpoint: 'laptops' },
  { key: 'monitor', endpoint: 'monitors' },
  { key: 'device_catalog', endpoint: 'device-catalog' },
  { key: 'soc', endpoint: 'socs' },
] as const;

async function fetchPage(endpoint: string, offset: number): Promise<CatalogPage> {
  const url = `${API_VERSION}/${endpoint}?limit=${PAGE_SIZE}&offset=${offset}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'smart-electronics-search-catalog-import/1.0' },
        signal: AbortSignal.timeout(30000),
      });
      if (response.status === 429 || response.status >= 500) {
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status} from ${url}`);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
      const body = await response.json() as CatalogPage;
      if (!Number.isInteger(body.count) || !Array.isArray(body.results)) throw new Error(`Invalid TechAPI list response at ${url}`);
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch TechAPI ${endpoint} offset ${offset}`);
}

async function runWithConcurrency<T>(items: T[], worker: (item: T) => Promise<void>) {
  let next = 0;
  const failures: unknown[] = [];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        await worker(items[index]);
      } catch (error) {
        failures.push(error);
      }
    }
  }));
  if (failures.length) throw new Error(`${failures.length} TechAPI page(s) failed. First error: ${failures[0] instanceof Error ? failures[0].message : String(failures[0])}`);
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing from the process environment; this command does not load .env.');
  assertLocalMongoUri(process.env.MONGODB_URI);
  await connectDB();
  await TechApiCatalogRecord.init();
  const startedAt = new Date();
  await SyncRun.create({ source: 'techapi', sourceKey: RUN_KEY, mode: 'import', status: 'running', startedAt, stats: { categories: categories.length } });

  const totals = new Map<string, number>();
  const firstPages = new Map<string, CatalogPage>();
  const categoryFetched = new Map<string, number>();
  const tasks: Array<{ category: typeof categories[number]; offset: number; expectedCount: number }> = [];
  let fetched = 0;
  let created = 0;
  let updated = 0;
  let failedPages = 0;

  try {
    for (const category of categories) {
      const firstPage = await fetchPage(category.endpoint, 0);
      totals.set(category.key, firstPage.count);
      firstPages.set(category.key, firstPage);
      const pageOffsets = firstPage.results.length >= firstPage.count
        ? [0]
        : Array.from({ length: Math.ceil(firstPage.count / PAGE_SIZE) }, (_, page) => page * PAGE_SIZE);
      for (const offset of pageOffsets) {
        tasks.push({ category, offset, expectedCount: firstPage.count });
      }
    }

    const seen = new Set<string>();
    await runWithConcurrency(tasks, async ({ category, offset, expectedCount }) => {
      const currentPage = offset === 0 ? firstPages.get(category.key)! : await fetchPage(category.endpoint, offset);
      if (currentPage.count !== expectedCount) throw new Error(`TechAPI count changed during ${category.endpoint}: ${expectedCount} -> ${currentPage.count}`);

      const now = new Date();
      const operations: any[] = [];
      for (const item of currentPage.results) {
        if (!item?.slug || !item?.name || !item?.url || !/^\/v1\//.test(item.url)) throw new Error(`Malformed ${category.endpoint} ref at offset ${offset}`);
        const sourceKey = `techapi:${category.key}:${item.slug}`;
        if (seen.has(sourceKey)) continue;
        seen.add(sourceKey);
        fetched += 1;
        categoryFetched.set(category.key, (categoryFetched.get(category.key) ?? 0) + 1);
        const sourceRecordUrl = `${API_ROOT}${item.url}`;
        const sourceListUrl = `${API_VERSION}/${category.endpoint}`;
        const update = {
          sourceKey,
          sourceCategory: category.key,
          sourceSlug: item.slug,
          name: item.name,
          sourceRecordUrl,
          sourceListUrl,
          dataAttribution: ATTRIBUTION,
          dataSourceUrl: REPOSITORY,
          dataLicense: 'CC BY-SA 4.0',
          dataLicenseUrl: LICENSE_URL,
          licenseTermsUrl: LICENSE_TERMS_URL,
          workflowStatus: 'discovery_only',
          lastSeenAt: now,
        };
        operations.push({
          updateOne: {
            filter: { sourceKey },
            update: { $set: update, $setOnInsert: { createdAt: now, raw: item, searchText: buildTechApiSearchText(item), detailsFetchedAt: null, detailsSha256: null } },
            upsert: true,
          },
        });
      }

      if (operations.length) {
        for (let index = 0; index < operations.length; index += 500) {
          const result = await TechApiCatalogRecord.collection.bulkWrite(operations.slice(index, index + 500), { ordered: false });
          created += result.upsertedCount;
          updated += result.modifiedCount;
        }
      }
      if (offset % (PAGE_SIZE * 20) === 0 || currentPage.results.length >= expectedCount) {
        console.log(JSON.stringify({ category: category.key, offset, pageRecords: currentPage.results.length, categoryFetched: categoryFetched.get(category.key) ?? 0, fetched, created, updated }));
      }
    });

    const categoryResults = Object.fromEntries([...totals].map(([key, expected]) => [key, { expected, fetched: categoryFetched.get(key) ?? 0, complete: (categoryFetched.get(key) ?? 0) === expected }]));
    if (Object.values(categoryResults).some((result) => !result.complete)) throw new Error(`Some TechAPI categories were only partially indexed: ${JSON.stringify(categoryResults)}`);

    const summary = {
      source: 'TechAPI',
      sourceRepository: REPOSITORY,
      attribution: ATTRIBUTION,
      license: 'CC BY-SA 4.0',
      licenseUrl: LICENSE_URL,
      licenseTermsUrl: LICENSE_TERMS_URL,
      checkedAt: new Date().toISOString(),
      listCounts: Object.fromEntries(totals),
      categoryResults,
      expectedRefs: [...totals.values()].reduce((sum, value) => sum + value, 0),
      uniqueRefsFetched: fetched,
      created,
      updated,
      failedPages,
      collection: TechApiCatalogRecord.collection.name,
      workflow: 'discovery_only; not verified, not published, no image or offer imported',
    };
    const reportDirectory = resolve(__dirname, '../../reports');
    await mkdir(reportDirectory, { recursive: true });
    const reportStamp = new Date().toISOString().replace(/[:.]/g, '-');
    await writeFile(resolve(reportDirectory, `techapi-catalog-index-${reportStamp}.json`), JSON.stringify(summary, null, 2), { encoding: 'utf8', flag: 'wx' });
    await SyncRun.create({ source: 'techapi', sourceKey: RUN_KEY, mode: 'import', status: 'succeeded', startedAt, finishedAt: new Date(), stats: summary });
    console.log(JSON.stringify({ status: 'succeeded', database: mongoose.connection.name, runKey: RUN_KEY, ...summary }, null, 2));
  } catch (error) {
    failedPages += 1;
    await SyncRun.create({ source: 'techapi', sourceKey: `${RUN_KEY}:failure`, mode: 'import', status: 'failed', startedAt, finishedAt: new Date(), error: error instanceof Error ? error.message : 'TechAPI import failed', stats: { fetched, created, updated, failedPages, listCounts: Object.fromEntries(totals) } });
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'TechAPI catalog import failed');
  process.exitCode = 1;
});
