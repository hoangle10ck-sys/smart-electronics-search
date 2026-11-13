import mongoose from 'mongoose';
import { TechApiCatalogRecord } from '../models/TechApiCatalogRecord';
import { assertLocalMongoUri, buildTechApiSearchText, techApiDetailSha256, techApiDetailUrl, validateTechApiDetail } from '../services/techApiCatalog';

const CONCURRENCY = 2;
const MAX_BATCH = 1000;
const ALLOWED_CATEGORIES = new Set(['smartphone', 'tablet', 'smartwatch', 'pda', 'gpu', 'cpu', 'laptop', 'monitor', 'device_catalog', 'soc']);

type CatalogRow = {
  sourceKey: string;
  sourceCategory: string;
  sourceSlug: string;
  name: string;
  sourceRecordUrl: string;
};

function option(name: string): string | undefined {
  const position = process.argv.indexOf(name);
  return position >= 0 ? process.argv[position + 1] : undefined;
}

function parseLimit(): number {
  const value = option('--limit');
  const limit = value === undefined ? 200 : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH) throw new Error(`--limit must be an integer from 1 to ${MAX_BATCH}.`);
  return limit;
}

async function fetchDetail(row: CatalogRow): Promise<Record<string, any>> {
  const url = techApiDetailUrl(row.sourceRecordUrl);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'smart-electronics-search-techapi-enricher/1.0' },
        signal: AbortSignal.timeout(20000),
      });
      if (response.status === 429 || response.status >= 500) {
        await response.body?.cancel();
        throw new Error(`retryable HTTP ${response.status}`);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return validateTechApiDetail(row, await response.json());
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 600 * (2 ** attempt)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('TechAPI detail fetch failed.');
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is missing from the process environment; this command does not load .env.');
  assertLocalMongoUri(uri);

  const limit = parseLimit();
  const category = option('--category');
  if (category && !ALLOWED_CATEGORIES.has(category)) throw new Error(`Unsupported --category: ${category}`);
  const write = process.argv.includes('--write');
  const refresh = process.argv.includes('--refresh');
  if (refresh && !write) throw new Error('--refresh requires --write.');

  await mongoose.connect(uri);
  try {
    const filter: Record<string, unknown> = {
      ...(refresh ? {} : { detailsFetchedAt: null }),
      ...(category ? { sourceCategory: category } : {}),
    };
    const rows = await TechApiCatalogRecord.find(filter)
      .select('sourceKey sourceCategory sourceSlug name sourceRecordUrl')
      .sort({ lastSeenAt: -1, sourceCategory: 1, sourceSlug: 1 })
      .limit(limit)
      .lean() as CatalogRow[];

    let fetched = 0;
    let updated = 0;
    const failures: Array<{ category: string; slug: string }> = [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      while (next < rows.length) {
        const row = rows[next++];
        try {
          const detail = await fetchDetail(row);
          fetched += 1;
          if (write) {
            const detailsFetchedAt = new Date();
            const result = await TechApiCatalogRecord.updateOne(
              { sourceKey: row.sourceKey, ...(refresh ? {} : { detailsFetchedAt: null }) },
              { $set: { raw: detail, searchText: buildTechApiSearchText(detail), detailsFetchedAt, detailsSha256: techApiDetailSha256(detail), lastSeenAt: detailsFetchedAt } },
              { runValidators: true },
            );
            updated += result.modifiedCount;
          }
        } catch {
          failures.push({ category: row.sourceCategory, slug: row.sourceSlug });
        }
      }
    }));

    const summary = {
      mode: write ? 'local_mongo_write' : 'dry_run',
      database: mongoose.connection.name,
      source: 'TechAPI',
      sourceLicense: 'CC BY-SA 4.0',
      attribution: 'Data from TechAPI',
      category: category ?? 'all',
      requested: rows.length,
      fetched,
      updated,
      failed: failures.length,
      failedRecords: failures,
      limit,
      nextStep: 'Enriched records stay discovery_only. No price, offer, publication status, or image reuse permission is created by this import.',
    };
    console.log(JSON.stringify(summary, null, 2));
    if (failures.length) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'TechAPI detail enrichment failed.');
  await mongoose.disconnect();
  process.exitCode = 1;
});
