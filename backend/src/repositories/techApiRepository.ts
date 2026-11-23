export type TechApiDiscoveryQuery = {
  categories: string[];
  queryTerms: string[];
  brandTerms: string[];
  limit: number;
  offset?: number;
  /** legacy preserves the adapter's historical natural order; stable_v1 uses sourceKey ASC. */
  candidateOrdering?: TechApiCandidateOrdering;
};

export type TechApiCandidateOrdering = 'legacy' | 'stable_v1';

export type TechApiDiscoveryRecord = {
  sourceKey: string;
  sourceCategory: string;
  sourceSlug: string;
  name: string;
  sourceRecordUrl: string;
  dataAttribution: string;
  dataSourceUrl: string;
  dataLicense: string;
  dataLicenseUrl: string;
  searchText?: string;
  raw: Record<string, any>;
};

export type TechApiCatalogReference = {
  sourceKey: string;
  sourceCategory: string;
  sourceSlug: string;
  name: string;
  sourceRecordUrl: string;
};

export type TechApiCatalogIdentity = { sourceCategory: string; sourceSlug: string };

export type TechApiCatalogRecord = TechApiDiscoveryRecord & {
  _id?: unknown;
  sourceKey: string;
  sourceListUrl: string;
  licenseTermsUrl: string;
  workflowStatus: 'discovery_only';
  detailsFetchedAt: Date | null;
  detailsSha256: string | null;
  lastSeenAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

export type TechApiSocRecord = TechApiCatalogReference & {
  raw: Record<string, any>;
  lastSeenAt: Date;
};

export type TechApiImportCheckpoint = {
  _id?: unknown;
  fileKey: string;
  sourcePath: string;
  sourceCommit: string;
  sha256: string;
  recordCount: number;
  importedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

export type TechApiImportResumeState = {
  checkpointSha256?: string;
  catalogRecordExists: boolean;
};

export type TechApiIndexUpsert = {
  sourceKey: string;
  sourceCategory: string;
  sourceSlug: string;
  name: string;
  sourceRecordUrl: string;
  sourceListUrl: string;
  dataAttribution: string;
  dataSourceUrl: string;
  dataLicense: string;
  dataLicenseUrl: string;
  licenseTermsUrl: string;
  workflowStatus: 'discovery_only';
  lastSeenAt: Date;
  raw: Record<string, unknown>;
  searchText: string;
};

export type TechApiFullDatasetUpsert = TechApiCatalogRecord;

export type TechApiEnrichedUpdate = {
  sourceKey: string;
  onlyIfNotEnriched: boolean;
  raw: Record<string, any>;
  searchText: string;
  detailsFetchedAt: Date;
  detailsSha256: string;
};

export type TechApiWriteCounts = { created: number; updated: number };

export interface TechApiRepository {
  readonly catalogCollectionName: string;
  readonly checkpointCollectionName: string;

  initializeCatalog(): Promise<void>;
  initializeCheckpoints(): Promise<void>;
  close(): Promise<void>;

  findDiscoveryCandidates(query: TechApiDiscoveryQuery): Promise<TechApiDiscoveryRecord[]>;
  countDiscoveryCandidates(query: Omit<TechApiDiscoveryQuery, 'limit' | 'offset' | 'candidateOrdering'>): Promise<number>;
  findCatalogRecordBySourceKey(sourceKey: string): Promise<TechApiCatalogRecord | null>;
  upsertIndexRecords(records: TechApiIndexUpsert[]): Promise<TechApiWriteCounts>;
  upsertFullDatasetRecords(records: TechApiFullDatasetUpsert[]): Promise<TechApiWriteCounts>;
  saveFullDatasetRecordsWithCheckpoints(
    records: TechApiFullDatasetUpsert[],
    checkpoints: TechApiImportCheckpoint[],
  ): Promise<TechApiWriteCounts>;
  findCatalogReferencesForEnrichment(options: { category?: string; refresh: boolean; limit: number }): Promise<TechApiCatalogReference[]>;
  updateEnrichedRecord(update: TechApiEnrichedUpdate): Promise<number>;
  findVerifiedSocRecords(): Promise<TechApiSocRecord[]>;
  findExistingCatalogIdentities(identities: TechApiCatalogIdentity[]): Promise<Set<string>>;
  countCatalogRecords(): Promise<number>;
  countCatalogRecordsByCategory(): Promise<Array<{ category: string; records: number }>>;
  findCheckpoints(fileKeys: string[]): Promise<TechApiImportCheckpoint[]>;
  findExistingCatalogSourceKeys(sourceKeys: string[]): Promise<Set<string>>;
  findImportResumeStates(candidates: Array<{ fileKey: string; sourceKey: string }>): Promise<Map<string, TechApiImportResumeState>>;
  upsertCheckpoints(checkpoints: TechApiImportCheckpoint[]): Promise<void>;
}
