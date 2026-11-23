import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { TechApiCatalogRecord as CatalogModel } from '../models/TechApiCatalogRecord';
import { TechApiImportCheckpoint as CheckpointModel } from '../models/TechApiImportCheckpoint';
import { MongoTechApiRepository } from '../repositories/mongoTechApiRepository';
import { SqliteTechApiRepository } from '../repositories/sqliteTechApiRepository';
import { TechApiDiscoveryRecord, TechApiRepository } from '../repositories/techApiRepository';
import { BRANDS } from '../services/dictionary';
import { normalize } from '../utils/text';

const LOCAL_MONGO_URI = 'mongodb://127.0.0.1:27017/?directConnection=true';
const SOURCE_DATABASE = 'smart_electronics_restore_test';
const ARCHIVE_PATH = 'D:\\SmartElectronicsData\\techapi_catalog.sqlite';

type QueryPlan = {
  name: string;
  categories: string[];
  queryTerms: string[];
  brandTerms: string[];
  rankingKeywords?: string[];
  rankingBrands?: string[];
  rankingCategory?: string;
};

const QUERY_PLANS: QueryPlan[] = [
  { name: 'category_only_cpu', categories: ['cpu'], queryTerms: [], brandTerms: [] },
  { name: 'keyword_ryzen', categories: ['cpu'], queryTerms: ['Ryzen'], brandTerms: [], rankingKeywords: ['ryzen'], rankingCategory: 'cpu' },
  { name: 'manufacturer_amd', categories: ['cpu', 'gpu'], queryTerms: [], brandTerms: ['AMD'], rankingBrands: ['amd'] },
  { name: 'brand_plus_category_amd_cpu', categories: ['cpu'], queryTerms: [], brandTerms: ['AMD'], rankingBrands: ['amd'], rankingCategory: 'cpu' },
  { name: 'unicode_case_fuer', categories: ['brand'], queryTerms: ['FÜR'], brandTerms: [], rankingKeywords: ['für'] },
  { name: 'case_insensitive_nvidia', categories: ['gpu'], queryTerms: ['NVIDIA'], brandTerms: [], rankingKeywords: ['nvidia'], rankingCategory: 'gpu' },
  { name: 'no_result', categories: ['laptop'], queryTerms: ['phase4-guaranteed-no-match'], brandTerms: [], rankingKeywords: ['phase4-guaranteed-no-match'], rankingCategory: 'laptop' },
  { name: 'over_500_smartphones', categories: ['smartphone'], queryTerms: [], brandTerms: [] },
];

function ids(rows: TechApiDiscoveryRecord[]) {
  return rows.map((row) => row.sourceKey);
}

function compare(left: string[], right: string[]) {
  const rightSet = new Set(right);
  const leftSet = new Set(left);
  return {
    orderEqual: JSON.stringify(left) === JSON.stringify(right),
    onlyLeftCount: left.filter((item) => !rightSet.has(item)).length,
    onlyRightCount: right.filter((item) => !leftSet.has(item)).length,
    examples: {
      onlyLeft: left.filter((item) => !rightSet.has(item)).slice(0, 5),
      onlyRight: right.filter((item) => !leftSet.has(item)).slice(0, 5),
    },
  };
}

function rankedTop8(plan: QueryPlan, candidates: TechApiDiscoveryRecord[]) {
  const keywords = (plan.rankingKeywords ?? []).map(normalize);
  const brands = plan.rankingBrands ?? [];
  if (!keywords.length && !brands.length) return [];
  const ranked = candidates.map((item) => {
    const name = normalize(item.name);
    const searchable = normalize([item.name, item.searchText].filter(Boolean).join(' '));
    const keywordHits = keywords.filter((term) => searchable.includes(term));
    const rawManufacturer = typeof item.raw?.manufacturer === 'string'
      ? item.raw.manufacturer
      : item.raw?.manufacturer?.name ?? item.raw?.brand?.name ?? item.raw?.brand;
    const manufacturer = normalize(String(rawManufacturer ?? ''));
    const brandHits = brands.filter((brand) => [brand, ...(BRANDS[brand] ?? [])].map(normalize)
      .some((term) => term && (` ${name} `.includes(` ${term} `) || ` ${manufacturer} `.includes(` ${term} `))));
    if ((keywords.length && keywordHits.length !== keywords.length) || (brands.length && !brandHits.length)) return null;
    const score = keywordHits.length * 5 + brandHits.length * 4 + (plan.rankingCategory ? 3 : 0) + (item.raw?.verified === true ? 0.25 : 0);
    return { item, score };
  }).filter((row): row is { item: TechApiDiscoveryRecord; score: number } => row !== null)
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name) || left.item.sourceKey.localeCompare(right.item.sourceKey));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of ranked) {
    const identity = normalize(row.item.name);
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(row.item.sourceKey);
    if (result.length === 8) break;
  }
  return result;
}

async function run() {
  const connection = mongoose.createConnection(LOCAL_MONGO_URI, { serverSelectionTimeoutMS: 5_000 });
  const sqlite = new SqliteTechApiRepository(ARCHIVE_PATH, { readOnly: true });
  try {
    await connection.asPromise();
    const source = connection.useDb(SOURCE_DATABASE, { useCache: true });
    const catalog = source.model('Phase4OrderingAuditCatalog', CatalogModel.schema, 'techapicatalogrecords') as any;
    const checkpoints = source.model('Phase4OrderingAuditCheckpoint', CheckpointModel.schema, 'techapiimportcheckpoints') as any;
    const mongo: TechApiRepository = new MongoTechApiRepository(catalog, checkpoints);
    const queries = [];

    for (const plan of QUERY_PLANS) {
      const queryBase = { categories: plan.categories, queryTerms: plan.queryTerms, brandTerms: plan.brandTerms };
      const [mongoTotal, sqliteTotal] = await Promise.all([
        mongo.countDiscoveryCandidates(queryBase),
        sqlite.countDiscoveryCandidates(queryBase),
      ]);
      assert.equal(mongoTotal, sqliteTotal, `${plan.name}: total matching count`);
      const refs: Record<'legacy' | 'stable_v1', { mongo: TechApiDiscoveryRecord[]; sqlite: TechApiDiscoveryRecord[] }> = {
        legacy: { mongo: [], sqlite: [] },
        stable_v1: { mongo: [], sqlite: [] },
      };
      const strategies: Record<string, any> = {};
      for (const ordering of ['legacy', 'stable_v1'] as const) {
        const query = { ...queryBase, limit: 500, candidateOrdering: ordering } as const;
        const [mongoRows, sqliteRows] = await Promise.all([
          mongo.findDiscoveryCandidates(query),
          sqlite.findDiscoveryCandidates(query),
        ]);
        refs[ordering] = { mongo: mongoRows, sqlite: sqliteRows };
        const mongoIds = ids(mongoRows);
        const sqliteIds = ids(sqliteRows);
        const parity = compare(mongoIds, sqliteIds);
        if (ordering === 'stable_v1') {
          assert.equal(parity.orderEqual, true, `${plan.name}: stable_v1 candidate IDs and ordering`);
          assert.equal(parity.onlyLeftCount + parity.onlyRightCount, 0, `${plan.name}: stable_v1 candidate set`);
        }
        strategies[ordering] = {
          returnedAfterLimit500: mongoIds.length,
          mongoSqliteParity: parity,
          candidateIdsAfterLimit500: { mongo: mongoIds, sqlite: sqliteIds },
        };
      }

      const rankingApplicable = Boolean((plan.rankingKeywords?.length ?? 0) + (plan.rankingBrands?.length ?? 0));
      const top8 = rankingApplicable ? {
        legacy: {
          mongo: rankedTop8(plan, refs.legacy.mongo),
          sqlite: rankedTop8(plan, refs.legacy.sqlite),
        },
        stable_v1: {
          mongo: rankedTop8(plan, refs.stable_v1.mongo),
          sqlite: rankedTop8(plan, refs.stable_v1.sqlite),
        },
      } : null;
      if (top8) {
        assert.deepEqual(top8.stable_v1.mongo, top8.stable_v1.sqlite, `${plan.name}: stable_v1 ranked top 8 parity`);
      }
      const legacyToStableTop8 = top8 ? {
        mongo: compare(top8.legacy.mongo, top8.stable_v1.mongo),
        sqlite: compare(top8.legacy.sqlite, top8.stable_v1.sqlite),
      } : null;
      queries.push({
        query: plan.name,
        totalMatchingBeforeLimit: mongoTotal,
        cap: 500,
        strategies,
        rankingApplicable,
        top8AfterRanking: top8,
        legacyToStableTop8,
      });
    }

    process.stdout.write(`${JSON.stringify({
      mode: 'read-only supplemental candidate ordering and top-8 audit',
      source: { host: '127.0.0.1', database: SOURCE_DATABASE },
      sqliteArchive: ARCHIVE_PATH,
      atlasConnected: false,
      writesPerformed: false,
      stableV1ExactMongoSqliteParity: true,
      queries,
    }, null, 2)}\n`);
  } finally {
    await sqlite.close();
    await connection.close();
  }
}

if (require.main === module) void run().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : 'Ordering audit failed.');
  process.exitCode = 1;
});
