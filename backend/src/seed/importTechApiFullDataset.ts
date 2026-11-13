import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { SyncRun } from '../models/SyncRun';
import { TechApiCatalogRecord } from '../models/TechApiCatalogRecord';
import { TechApiImportCheckpoint } from '../models/TechApiImportCheckpoint';
import { assertLocalMongoUri, buildTechApiSearchText } from '../services/techApiCatalog';

const API_ROOT = 'https://gettechapi.github.io/TechAPI';
const API_VERSION = `${API_ROOT}/v1`;
const REPOSITORY = 'https://github.com/GetTechAPI/TechAPI';
const LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
const LICENSE_TERMS_URL = 'https://github.com/GetTechAPI/TechAPI/blob/main/data/LICENSE.md';
const ATTRIBUTION = 'Data from TechAPI';
const CATEGORIES = ['brand', 'smartphone', 'cpu', 'gpu', 'soc'] as const;
const LIST_ENDPOINTS: Record<(typeof CATEGORIES)[number], string> = {
  brand: 'brands', smartphone: 'smartphones', cpu: 'cpus', gpu: 'gpus', soc: 'socs',
};
const BATCH_SIZE = 400;
const DATA_ROOT = resolve(process.env.TECHAPI_DATA_DIR ?? '');
const SOURCE_COMMIT = process.env.TECHAPI_COMMIT?.trim() || 'unspecified';
const RUN_KEY = `techapi-full-${SOURCE_COMMIT}-${new Date().toISOString()}`;

type JsonRecord = Record<string, unknown> & { slug?: string; name?: string; url?: string };

async function listJsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return listJsonFiles(fullPath);
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) return [];
    return [fullPath];
  }));
  return files.flat().sort((a, b) => a.localeCompare(b));
}

function categoryForFile(filePath: string) {
  const relativePath = relative(DATA_ROOT, filePath);
  const category = relativePath.split(sep)[0] as (typeof CATEGORIES)[number];
  if (!CATEGORIES.includes(category)) throw new Error(`Unsupported TechAPI data category: ${relativePath}`);
  return { category, relativePath: relativePath.split(sep).join('/') };
}

async function prepareFile(filePath: string, sourceCommit: string) {
  const { category, relativePath } = categoryForFile(filePath);
  const contents = await readFile(filePath);
  const sha256 = createHash('sha256').update(contents).digest('hex');
  const fileKey = `${sourceCommit}:${relativePath}`;
  const parsed = JSON.parse(contents.toString('utf8')) as JsonRecord;
  const slug = typeof parsed.slug === 'string' && parsed.slug.trim() ? parsed.slug.trim() : basename(filePath, '.json');
  const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : '';
  if (!name || !/^[a-z0-9-]+$/i.test(slug)) throw new Error(`Malformed TechAPI data record: ${relativePath}`);
  const sourceRecordPath = typeof parsed.url === 'string' ? parsed.url : `/v1/${LIST_ENDPOINTS[category]}/${slug}`;
  if (!new RegExp(`^/v1/${LIST_ENDPOINTS[category]}/${slug}/?$`, 'i').test(sourceRecordPath)) throw new Error(`Invalid TechAPI record URL for ${relativePath}: ${sourceRecordPath}`);
  const sourceRecordUrl = `${API_ROOT}${sourceRecordPath.replace(/\/?$/, '/')}`;
  const sourceListUrl = `${API_VERSION}/${LIST_ENDPOINTS[category]}`;
  const now = new Date();
  const sourceKey = `techapi:${category}:${slug}`;
  const update = {
    sourceKey,
    sourceCategory: category,
    sourceSlug: slug,
    name,
    sourceRecordUrl,
    sourceListUrl,
    dataAttribution: ATTRIBUTION,
    dataSourceUrl: REPOSITORY,
    dataLicense: 'CC BY-SA 4.0',
    dataLicenseUrl: LICENSE_URL,
    licenseTermsUrl: LICENSE_TERMS_URL,
    workflowStatus: 'discovery_only',
    raw: parsed,
    searchText: buildTechApiSearchText(parsed),
    detailsFetchedAt: now,
    detailsSha256: sha256,
    lastSeenAt: now,
    updatedAt: now,
  };
  return {
    category,
    fileKey,
    sourcePath: relativePath,
    sha256,
    productOperation: { updateOne: { filter: { sourceKey }, update: { $set: update, $setOnInsert: { createdAt: now } }, upsert: true } },
    checkpointOperation: { updateOne: { filter: { fileKey }, update: { $set: { fileKey, sourcePath: relativePath, sourceCommit, sha256, recordCount: 1, importedAt: now, updatedAt: now }, $setOnInsert: { createdAt: now } }, upsert: true } },
  };
}

async function main() {
  if (!process.env.TECHAPI_DATA_DIR?.trim()) throw new Error('Set TECHAPI_DATA_DIR to the extracted TechAPI data directory.');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing from the process environment; this command does not load .env.');
  assertLocalMongoUri(process.env.MONGODB_URI);
  const filesByCategory = await Promise.all(CATEGORIES.map(async (category) => {
    const directory = join(DATA_ROOT, category);
    return { category, files: await listJsonFiles(directory) };
  }));
  const files = filesByCategory.flatMap(({ files: categoryFiles }) => categoryFiles);
  if (!files.length) throw new Error(`No TechAPI JSON files found under ${DATA_ROOT}`);

  await connectDB();
  await Promise.all([TechApiCatalogRecord.init(), TechApiImportCheckpoint.init()]);
  const startedAt = new Date();
  const run = await SyncRun.create({ source: 'techapi', sourceKey: RUN_KEY, mode: 'import', status: 'running', startedAt, stats: { sourceCommit: SOURCE_COMMIT, files: files.length, categories: CATEGORIES } });
  const totals = { files: files.length, importedFiles: 0, skippedFiles: 0, records: 0, created: 0, updated: 0 };
  const byCategory: Record<string, { files: number; records: number }> = Object.fromEntries(CATEGORIES.map((category) => [category, { files: 0, records: 0 }]));

  try {
    for (let index = 0; index < files.length; index += BATCH_SIZE) {
      const batch = files.slice(index, index + BATCH_SIZE);
      const prepared = await Promise.all(batch.map((filePath) => prepareFile(filePath, SOURCE_COMMIT)));
      const savedCheckpoints = await TechApiImportCheckpoint.find({ fileKey: { $in: prepared.map((item) => item.fileKey) } })
        .select('fileKey sha256').lean() as Array<{ fileKey: string; sha256: string }>;
      const savedHashes = new Map(savedCheckpoints.map((item) => [item.fileKey, item.sha256]));
      const changed = prepared.filter((item) => savedHashes.get(item.fileKey) !== item.sha256);
      const productResult = changed.length
        ? await TechApiCatalogRecord.collection.bulkWrite(changed.map((item) => item.productOperation), { ordered: false })
        : null;
      if (changed.length) await TechApiImportCheckpoint.collection.bulkWrite(changed.map((item) => item.checkpointOperation), { ordered: false });
      const skipped = prepared.length - changed.length;
      totals.importedFiles += changed.length;
      totals.skippedFiles += skipped;
      totals.records += changed.length;
      totals.created += productResult?.upsertedCount ?? 0;
      totals.updated += productResult?.modifiedCount ?? 0;
      for (const item of changed) {
        byCategory[item.category].files += 1;
        byCategory[item.category].records += 1;
      }
      const progress = { ...totals, processedFiles: Math.min(index + batch.length, files.length) };
      await SyncRun.updateOne({ _id: run._id }, { $set: { stats: { sourceCommit: SOURCE_COMMIT, byCategory, ...progress } } });
      if (progress.processedFiles % 10000 === 0 || progress.processedFiles === files.length) console.log(JSON.stringify(progress));
    }

    const summary = {
      source: 'TechAPI', sourceRepository: REPOSITORY, sourceCommit: SOURCE_COMMIT,
      attribution: ATTRIBUTION, license: 'CC BY-SA 4.0', licenseUrl: LICENSE_URL,
      imageHandling: 'Image assets are not copied or served. Per-image metadata stays in raw source records for later rights review.',
      workflow: 'Full source records are stored in TechApiCatalogRecord as discovery_only. They are not published Products, Offers, or search vectors.',
      checkedAt: new Date().toISOString(), dataDirectory: DATA_ROOT,
      categories: CATEGORIES, byCategory, ...totals,
      collection: TechApiCatalogRecord.collection.name,
      checkpointCollection: TechApiImportCheckpoint.collection.name,
    };
    await SyncRun.updateOne({ _id: run._id }, { $set: { status: 'succeeded', finishedAt: new Date(), stats: summary } });
    if (totals.importedFiles || totals.created || totals.updated) {
      const reportDirectory = resolve(__dirname, '../../reports');
      await mkdir(reportDirectory, { recursive: true });
      const reportStamp = new Date().toISOString().replace(/[:.]/g, '-');
      await writeFile(resolve(reportDirectory, `techapi-full-import-${reportStamp}.json`), JSON.stringify(summary, null, 2), { encoding: 'utf8', flag: 'wx' });
    }
    console.log(JSON.stringify({ status: 'succeeded', database: mongoose.connection.name, ...summary }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TechAPI full-data import failed';
    await SyncRun.updateOne({ _id: run._id }, { $set: { status: 'failed', finishedAt: new Date(), error: message, stats: { sourceCommit: SOURCE_COMMIT, byCategory, ...totals } } });
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'TechAPI full-data import failed');
  process.exitCode = 1;
});
