import { TechApiCatalogRecord as CatalogModel } from '../models/TechApiCatalogRecord';
import { TechApiImportCheckpoint as CheckpointModel } from '../models/TechApiImportCheckpoint';
import { escapeRegex } from '../utils/text';
import {
  TechApiCatalogReference,
  TechApiCatalogIdentity,
  TechApiCatalogRecord as TechApiCatalogRecordData,
  TechApiDiscoveryQuery,
  TechApiDiscoveryRecord,
  TechApiEnrichedUpdate,
  TechApiFullDatasetUpsert,
  TechApiImportCheckpoint,
  TechApiImportResumeState,
  TechApiIndexUpsert,
  TechApiRepository,
  TechApiSocRecord,
  TechApiWriteCounts,
} from './techApiRepository';

type CatalogBulkOperation = {
  updateOne: {
    filter: Record<string, unknown>;
    update: Record<string, unknown>;
    upsert: true;
  };
};

export function buildMongoDiscoveryFilter(query: Pick<TechApiDiscoveryQuery, 'categories' | 'queryTerms' | 'brandTerms'>): Record<string, any> {
  const filter: Record<string, any> = { sourceCategory: { $in: query.categories } };
  if (query.queryTerms.length) {
    filter.$and = query.queryTerms.map((term) => ({ $or: [
      { name: { $regex: escapeRegex(term), $options: 'i' } },
      { searchText: { $regex: escapeRegex(term), $options: 'i' } },
    ] }));
  }
  if (query.brandTerms.length) {
    const brandPattern = query.brandTerms.map(escapeRegex).join('|');
    filter.$and ??= [];
    filter.$and.push({ $or: [
      { name: { $regex: brandPattern, $options: 'i' } },
      { 'raw.manufacturer': { $regex: brandPattern, $options: 'i' } },
      { 'raw.manufacturer.name': { $regex: brandPattern, $options: 'i' } },
      { 'raw.brand': { $regex: brandPattern, $options: 'i' } },
    ] });
  }
  return filter;
}

/** MongoDB persistence adapter. No Mongoose query/document escapes this class. */
export class MongoTechApiRepository implements TechApiRepository {
  constructor(
    private readonly catalogModel: typeof CatalogModel = CatalogModel,
    private readonly checkpointModel: typeof CheckpointModel = CheckpointModel,
  ) {}

  get catalogCollectionName() { return this.catalogModel.collection.name; }
  get checkpointCollectionName() { return this.checkpointModel.collection.name; }

  async initializeCatalog(): Promise<void> {
    await this.catalogModel.init();
  }

  async initializeCheckpoints(): Promise<void> {
    await this.checkpointModel.init();
  }

  async close(): Promise<void> {
    // Mongoose connection lifetime is managed by the application, not this adapter.
  }

  async findCatalogRecordBySourceKey(sourceKey: string): Promise<TechApiCatalogRecordData | null> {
    const record = await this.catalogModel.findOne({ sourceKey }).lean();
    return record as unknown as TechApiCatalogRecordData | null;
  }

  async findDiscoveryCandidates(query: TechApiDiscoveryQuery): Promise<TechApiDiscoveryRecord[]> {
    const cursor = this.catalogModel.find(buildMongoDiscoveryFilter(query))
      .select('sourceKey sourceCategory sourceSlug name sourceRecordUrl dataAttribution dataSourceUrl dataLicense dataLicenseUrl searchText raw');
    if (query.candidateOrdering === 'stable_v1') cursor.sort({ sourceKey: 1 });
    if (query.offset && query.offset > 0) cursor.skip(query.offset);
    const rows = await cursor.limit(query.limit).lean();
    return rows as unknown as TechApiDiscoveryRecord[];
  }

  async countDiscoveryCandidates(query: Pick<TechApiDiscoveryQuery, 'categories' | 'queryTerms' | 'brandTerms'>): Promise<number> {
    return this.catalogModel.countDocuments(buildMongoDiscoveryFilter(query));
  }

  async upsertIndexRecords(records: TechApiIndexUpsert[]): Promise<TechApiWriteCounts> {
    if (!records.length) return { created: 0, updated: 0 };
    const operations: CatalogBulkOperation[] = records.map((record) => ({
      updateOne: {
        filter: { sourceKey: record.sourceKey },
        update: {
          $set: {
            sourceKey: record.sourceKey,
            sourceCategory: record.sourceCategory,
            sourceSlug: record.sourceSlug,
            name: record.name,
            sourceRecordUrl: record.sourceRecordUrl,
            sourceListUrl: record.sourceListUrl,
            dataAttribution: record.dataAttribution,
            dataSourceUrl: record.dataSourceUrl,
            dataLicense: record.dataLicense,
            dataLicenseUrl: record.dataLicenseUrl,
            licenseTermsUrl: record.licenseTermsUrl,
            workflowStatus: record.workflowStatus,
            lastSeenAt: record.lastSeenAt,
          },
          $setOnInsert: {
            createdAt: record.lastSeenAt,
            raw: record.raw,
            searchText: record.searchText,
            detailsFetchedAt: null,
            detailsSha256: null,
          },
        },
        upsert: true,
      },
    }));
    const result = await this.catalogModel.collection.bulkWrite(operations as any[], { ordered: false });
    return { created: result.upsertedCount, updated: result.modifiedCount };
  }

  async upsertFullDatasetRecords(records: TechApiFullDatasetUpsert[]): Promise<TechApiWriteCounts> {
    if (!records.length) return { created: 0, updated: 0 };
    const operations: CatalogBulkOperation[] = records.map((record) => ({
      updateOne: {
        filter: { sourceKey: record.sourceKey },
        update: {
          $set: {
            sourceKey: record.sourceKey,
            sourceCategory: record.sourceCategory,
            sourceSlug: record.sourceSlug,
            name: record.name,
            sourceRecordUrl: record.sourceRecordUrl,
            sourceListUrl: record.sourceListUrl,
            dataAttribution: record.dataAttribution,
            dataSourceUrl: record.dataSourceUrl,
            dataLicense: record.dataLicense,
            dataLicenseUrl: record.dataLicenseUrl,
            licenseTermsUrl: record.licenseTermsUrl,
            workflowStatus: record.workflowStatus,
            raw: record.raw,
            searchText: record.searchText,
            detailsFetchedAt: record.detailsFetchedAt,
            detailsSha256: record.detailsSha256,
            lastSeenAt: record.lastSeenAt,
            updatedAt: record.updatedAt,
          },
          $setOnInsert: { createdAt: record.createdAt ?? record.lastSeenAt },
        },
        upsert: true,
      },
    }));
    const result = await this.catalogModel.collection.bulkWrite(operations as any[], { ordered: false });
    return { created: result.upsertedCount, updated: result.modifiedCount };
  }

  async saveFullDatasetRecordsWithCheckpoints(
    records: TechApiFullDatasetUpsert[],
    checkpoints: TechApiImportCheckpoint[],
  ): Promise<TechApiWriteCounts> {
    const result = await this.upsertFullDatasetRecords(records);
    await this.upsertCheckpoints(checkpoints);
    return result;
  }

  async findCatalogReferencesForEnrichment(options: { category?: string; refresh: boolean; limit: number }): Promise<TechApiCatalogReference[]> {
    const filter: Record<string, unknown> = {
      ...(options.refresh ? {} : { detailsFetchedAt: null }),
      ...(options.category ? { sourceCategory: options.category } : {}),
    };
    const rows = await this.catalogModel.find(filter)
      .select('sourceKey sourceCategory sourceSlug name sourceRecordUrl')
      .sort({ lastSeenAt: -1, sourceCategory: 1, sourceSlug: 1 })
      .limit(options.limit)
      .lean();
    return rows as unknown as TechApiCatalogReference[];
  }

  async updateEnrichedRecord(update: TechApiEnrichedUpdate): Promise<number> {
    const result = await this.catalogModel.updateOne(
      { sourceKey: update.sourceKey, ...(update.onlyIfNotEnriched ? { detailsFetchedAt: null } : {}) },
      { $set: {
        raw: update.raw,
        searchText: update.searchText,
        detailsFetchedAt: update.detailsFetchedAt,
        detailsSha256: update.detailsSha256,
        lastSeenAt: update.detailsFetchedAt,
      } },
      { runValidators: true },
    );
    return result.modifiedCount;
  }

  async findVerifiedSocRecords(): Promise<TechApiSocRecord[]> {
    const rows = await this.catalogModel.find({ sourceCategory: 'soc', 'raw.verified': true })
      .select('sourceKey sourceSlug name sourceRecordUrl raw lastSeenAt')
      .lean();
    return rows as unknown as TechApiSocRecord[];
  }

  async findExistingCatalogIdentities(identities: TechApiCatalogIdentity[]): Promise<Set<string>> {
    if (!identities.length) return new Set();
    const rows = await this.catalogModel.find({ $or: identities })
      .select('sourceCategory sourceSlug')
      .lean();
    return new Set((rows as TechApiCatalogIdentity[]).map((row) => JSON.stringify([row.sourceCategory, row.sourceSlug])));
  }

  async countCatalogRecords(): Promise<number> {
    return this.catalogModel.countDocuments();
  }

  async countCatalogRecordsByCategory(): Promise<Array<{ category: string; records: number }>> {
    const rows = await this.catalogModel.aggregate([
      { $group: { _id: '$sourceCategory', records: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    return rows.map((row: { _id: string; records: number }) => ({ category: row._id, records: row.records }));
  }

  async findCheckpoints(fileKeys: string[]): Promise<TechApiImportCheckpoint[]> {
    if (!fileKeys.length) return [];
    const rows = await this.checkpointModel.find({ fileKey: { $in: fileKeys } })
      .select('fileKey sourcePath sourceCommit sha256 recordCount importedAt createdAt updatedAt')
      .lean();
    return rows as unknown as TechApiImportCheckpoint[];
  }

  async findExistingCatalogSourceKeys(sourceKeys: string[]): Promise<Set<string>> {
    if (!sourceKeys.length) return new Set();
    const rows = await this.catalogModel.find({ sourceKey: { $in: sourceKeys } }).select('sourceKey').lean();
    return new Set((rows as Array<{ sourceKey: string }>).map((row) => row.sourceKey));
  }

  async findImportResumeStates(candidates: Array<{ fileKey: string; sourceKey: string }>): Promise<Map<string, TechApiImportResumeState>> {
    const states = new Map<string, TechApiImportResumeState>();
    if (!candidates.length) return states;
    const checkpoints = await this.findCheckpoints(candidates.map((candidate) => candidate.fileKey));
    const checkpointByFileKey = new Map(checkpoints.map((checkpoint) => [checkpoint.fileKey, checkpoint]));
    const checkpointMatches = candidates.filter((candidate) => checkpointByFileKey.has(candidate.fileKey));
    const existingSourceKeys = await this.findExistingCatalogSourceKeys(checkpointMatches.map((candidate) => candidate.sourceKey));
    for (const candidate of candidates) {
      const checkpoint = checkpointByFileKey.get(candidate.fileKey);
      states.set(candidate.fileKey, {
        ...(checkpoint ? { checkpointSha256: checkpoint.sha256 } : {}),
        catalogRecordExists: existingSourceKeys.has(candidate.sourceKey),
      });
    }
    return states;
  }

  async upsertCheckpoints(checkpoints: TechApiImportCheckpoint[]): Promise<void> {
    if (!checkpoints.length) return;
    const operations = checkpoints.map((checkpoint) => ({
      updateOne: {
        filter: { fileKey: checkpoint.fileKey },
        update: {
          $set: {
            fileKey: checkpoint.fileKey,
            sourcePath: checkpoint.sourcePath,
            sourceCommit: checkpoint.sourceCommit,
            sha256: checkpoint.sha256,
            recordCount: checkpoint.recordCount,
            importedAt: checkpoint.importedAt,
            updatedAt: checkpoint.updatedAt ?? checkpoint.importedAt,
          },
          $setOnInsert: { createdAt: checkpoint.createdAt ?? checkpoint.importedAt },
        },
        upsert: true,
      },
    }));
    await this.checkpointModel.collection.bulkWrite(operations as any[], { ordered: false });
  }
}

export const mongoTechApiRepository: TechApiRepository = new MongoTechApiRepository();
