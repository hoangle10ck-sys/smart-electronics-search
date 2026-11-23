import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoTechApiRepository } from '../repositories/mongoTechApiRepository';
import { TechApiImportCheckpoint } from '../repositories/techApiRepository';
import { canSkipTechApiFile } from './techApiImportResume';

type FakeOptions = {
  catalogRows?: any[];
  checkpointRows?: any[];
  categoryRows?: any[];
  count?: number;
  modifiedCount?: number;
  failFirstCheckpointWrite?: boolean;
};

function createRepository(options: FakeOptions = {}) {
  const calls: Array<Record<string, any>> = [];
  const catalogBulkWrites: any[][] = [];
  const checkpointBulkWrites: any[][] = [];
  let checkpointWriteAttempts = 0;
  const makeQuery = (model: string, filter: unknown, rows: any[]) => {
    const call: Record<string, any> = { model, filter };
    calls.push(call);
    return {
      select(value: string) { call.select = value; return this; },
      sort(value: Record<string, number>) { call.sort = value; return this; },
      skip(value: number) { call.skip = value; return this; },
      limit(value: number) { call.limit = value; return this; },
      lean() { return Promise.resolve(rows); },
    };
  };
  const catalog: any = {
    collection: {
      name: 'techapicatalogrecords',
      async bulkWrite(operations: any[]) { catalogBulkWrites.push(operations); return { upsertedCount: 2, modifiedCount: 3 }; },
    },
    async init() {},
    find(filter: unknown) { return makeQuery('catalog', filter, options.catalogRows ?? []); },
    async updateOne(filter: unknown, update: unknown, settings: unknown) {
      calls.push({ model: 'catalog-update', filter, update, settings });
      return { modifiedCount: options.modifiedCount ?? 1 };
    },
    async aggregate(pipeline: unknown) { calls.push({ model: 'catalog-aggregate', pipeline }); return options.categoryRows ?? []; },
    async countDocuments(filter: unknown) { calls.push({ model: 'catalog-count', filter }); return options.count ?? 0; },
  };
  const checkpoint: any = {
    collection: {
      name: 'techapiimportcheckpoints',
      async bulkWrite(operations: any[]) {
        checkpointWriteAttempts += 1;
        checkpointBulkWrites.push(operations);
        if (options.failFirstCheckpointWrite && checkpointWriteAttempts === 1) throw new Error('fixture checkpoint write failure');
        return { upsertedCount: operations.length, modifiedCount: 0 };
      },
    },
    async init() {},
    find(filter: unknown) { return makeQuery('checkpoint', filter, options.checkpointRows ?? []); },
  };
  return {
    repository: new MongoTechApiRepository(catalog, checkpoint),
    calls,
    catalogBulkWrites,
    checkpointBulkWrites,
  };
}

test('discovery preserves category, per-term, brand paths, projection and the 500-row cap', async () => {
  const { repository, calls } = createRepository({ catalogRows: [{ name: 'ZenBook' }] });
  const rows = await repository.findDiscoveryCandidates({
    categories: ['laptop'], queryTerms: ['zen book', '14'], brandTerms: ['ASUS', 'A.B'], limit: 500, offset: 250,
  });
  const call = calls.find((item) => item.model === 'catalog')!;
  assert.equal(rows.length, 1);
  assert.deepEqual(call.filter.sourceCategory, { $in: ['laptop'] });
  assert.equal(call.filter.$and.length, 3);
  assert.equal(call.filter.$and[0].$or[0].name.$regex, 'zen book');
  assert.equal(call.filter.$and[1].$or[1].searchText.$regex, '14');
  assert.equal(call.filter.$and[2].$or.length, 4);
  assert.equal(call.limit, 500);
  assert.equal(call.skip, 250);
  assert.match(call.select, /raw/);
  assert.match(call.select, /sourceKey/);
});

test('stable discovery ordering and candidate counting use the same Mongo predicate', async () => {
  const { repository, calls } = createRepository({ count: 27 });
  const query = { categories: ['cpu'], queryTerms: ['C++'], brandTerms: ['A.B'] };
  assert.equal(await repository.countDiscoveryCandidates(query), 27);
  await repository.findDiscoveryCandidates({ ...query, limit: 500, candidateOrdering: 'stable_v1' });
  const countCall = calls.find((item) => item.model === 'catalog-count')!;
  const findCall = calls.find((item) => item.model === 'catalog')!;
  assert.deepEqual(countCall.filter, findCall.filter);
  assert.deepEqual(findCall.sort, { sourceKey: 1 });
  assert.equal(findCall.filter.$and[0].$or[0].name.$regex, 'C\\+\\+');
  assert.equal(findCall.filter.$and[1].$or[0].name.$regex, 'A\\.B');
});

test('index upsert updates index metadata but only inserts raw/search detail fields', async () => {
  const { repository, catalogBulkWrites } = createRepository();
  const now = new Date('2026-01-01T00:00:00Z');
  const result = await repository.upsertIndexRecords([{
    sourceKey: 'techapi:cpu:sample', sourceCategory: 'cpu', sourceSlug: 'sample', name: 'Sample CPU',
    sourceRecordUrl: 'https://example.test/cpu/sample', sourceListUrl: 'https://example.test/cpus',
    dataAttribution: 'TechAPI', dataSourceUrl: 'https://example.test', dataLicense: 'CC BY-SA 4.0',
    dataLicenseUrl: 'https://example.test/license', licenseTermsUrl: 'https://example.test/terms',
    workflowStatus: 'discovery_only', lastSeenAt: now, raw: { name: 'Sample CPU' }, searchText: 'Sample CPU',
  }]);
  assert.deepEqual(result, { created: 2, updated: 3 });
  const operation = catalogBulkWrites[0][0].updateOne;
  assert.deepEqual(operation.filter, { sourceKey: 'techapi:cpu:sample' });
  assert.equal(operation.upsert, true);
  assert.equal(operation.update.$set.lastSeenAt, now);
  assert.deepEqual(operation.update.$setOnInsert.raw, { name: 'Sample CPU' });
  assert.equal(operation.update.$setOnInsert.searchText, 'Sample CPU');
  assert.equal(operation.update.$setOnInsert.detailsFetchedAt, null);
});

test('full dataset upsert replaces raw details and reports counts separately from checkpoint writes', async () => {
  const { repository, catalogBulkWrites } = createRepository();
  const now = new Date('2026-02-01T00:00:00Z');
  const result = await repository.upsertFullDatasetRecords([{
    sourceKey: 'techapi:cpu:sample', sourceCategory: 'cpu', sourceSlug: 'sample', name: 'Sample CPU',
    sourceRecordUrl: 'https://example.test/cpu/sample', sourceListUrl: 'https://example.test/cpus',
    dataAttribution: 'TechAPI', dataSourceUrl: 'https://example.test', dataLicense: 'CC BY-SA 4.0',
    dataLicenseUrl: 'https://example.test/license', licenseTermsUrl: 'https://example.test/terms',
    workflowStatus: 'discovery_only', raw: { cores: 8 }, searchText: 'cores 8', detailsFetchedAt: now,
    detailsSha256: 'abc', lastSeenAt: now, createdAt: now, updatedAt: now,
  }]);
  assert.deepEqual(result, { created: 2, updated: 3 });
  const operation = catalogBulkWrites[0][0].updateOne;
  assert.deepEqual(operation.update.$set.raw, { cores: 8 });
  assert.equal(operation.update.$set.detailsSha256, 'abc');
  assert.equal(operation.update.$setOnInsert.createdAt, now);
});

test('enrichment query preserves null filter, ordering and requested batch limit', async () => {
  const { repository, calls } = createRepository();
  await repository.findCatalogReferencesForEnrichment({ category: 'gpu', refresh: false, limit: 200 });
  const call = calls.find((item) => item.model === 'catalog')!;
  assert.deepEqual(call.filter, { detailsFetchedAt: null, sourceCategory: 'gpu' });
  assert.deepEqual(call.sort, { lastSeenAt: -1, sourceCategory: 1, sourceSlug: 1 });
  assert.equal(call.limit, 200);
  assert.equal(call.select, 'sourceKey sourceCategory sourceSlug name sourceRecordUrl');
});

test('enrichment update retains conditional guard unless refresh was requested', async () => {
  const { repository, calls } = createRepository();
  const detailsFetchedAt = new Date();
  const base = { sourceKey: 'techapi:gpu:sample', raw: { memory: '8 GB' }, searchText: 'memory 8 GB', detailsFetchedAt, detailsSha256: 'hash' };
  assert.equal(await repository.updateEnrichedRecord({ ...base, onlyIfNotEnriched: true }), 1);
  assert.deepEqual(calls[calls.length - 1]?.filter, { sourceKey: base.sourceKey, detailsFetchedAt: null });
  assert.equal(await repository.updateEnrichedRecord({ ...base, onlyIfNotEnriched: false }), 1);
  assert.deepEqual(calls[calls.length - 1]?.filter, { sourceKey: base.sourceKey });
});

test('verified SoC query keeps category and nested verified predicate', async () => {
  const { repository, calls } = createRepository();
  await repository.findVerifiedSocRecords();
  const call = calls.find((item) => item.model === 'catalog')!;
  assert.deepEqual(call.filter, { sourceCategory: 'soc', 'raw.verified': true });
  assert.match(call.select, /raw/);
  assert.match(call.select, /sourceKey/);
});

test('stable category and slug identity lookup is supported independently of sourceKey', async () => {
  const { repository, calls } = createRepository({ catalogRows: [{ sourceCategory: 'gpu', sourceSlug: 'sample' }] });
  const identities = await repository.findExistingCatalogIdentities([{ sourceCategory: 'gpu', sourceSlug: 'sample' }]);
  assert.deepEqual(calls.find((item) => item.model === 'catalog')?.filter, {
    $or: [{ sourceCategory: 'gpu', sourceSlug: 'sample' }],
  });
  assert.equal(identities.has(JSON.stringify(['gpu', 'sample'])), true);
});

test('catalog report preserves total and category aggregation', async () => {
  const { repository, calls } = createRepository({ count: 7, categoryRows: [{ _id: 'cpu', records: 5 }, { _id: 'gpu', records: 2 }] });
  assert.equal(await repository.countCatalogRecords(), 7);
  assert.deepEqual(await repository.countCatalogRecordsByCategory(), [
    { category: 'cpu', records: 5 }, { category: 'gpu', records: 2 },
  ]);
  assert.deepEqual(calls.find((item) => item.model === 'catalog-aggregate')?.pipeline, [
    { $group: { _id: '$sourceCategory', records: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
});

test('checkpoint lookup retains file key and SHA fields', async () => {
  const { repository, calls } = createRepository({ checkpointRows: [{ fileKey: 'commit:cpu/a.json', sha256: 'hash' }] });
  const rows = await repository.findCheckpoints(['commit:cpu/a.json']);
  const call = calls.find((item) => item.model === 'checkpoint')!;
  assert.equal(rows[0].sha256, 'hash');
  assert.deepEqual(call.filter, { fileKey: { $in: ['commit:cpu/a.json'] } });
  assert.match(call.select, /sourceCommit/);
});

test('checkpoint upsert preserves all resume metadata and unique file key', async () => {
  const { repository, checkpointBulkWrites } = createRepository();
  const now = new Date();
  const checkpoint: TechApiImportCheckpoint = {
    fileKey: 'commit:cpu/a.json', sourcePath: 'cpu/a.json', sourceCommit: 'commit', sha256: 'hash',
    recordCount: 1, importedAt: now, createdAt: now, updatedAt: now,
  };
  await repository.upsertCheckpoints([checkpoint]);
  const operation = checkpointBulkWrites[0][0].updateOne;
  assert.deepEqual(operation.filter, { fileKey: checkpoint.fileKey });
  assert.equal(operation.update.$set.sha256, 'hash');
  assert.equal(operation.update.$set.sourcePath, checkpoint.sourcePath);
  assert.equal(operation.update.$set.recordCount, 1);
  assert.equal(operation.update.$setOnInsert.createdAt, now);
});

test('resume requires matching checkpoint hash and existing catalog row', () => {
  const candidate = { fileKey: 'commit:cpu/a.json', sourceKey: 'techapi:cpu:a', sha256: 'same' };
  assert.equal(canSkipTechApiFile(candidate, new Map([[candidate.fileKey, { checkpointSha256: 'same', catalogRecordExists: true }]])), true);
  assert.equal(canSkipTechApiFile(candidate, new Map([[candidate.fileKey, { checkpointSha256: 'same', catalogRecordExists: false }]])), false);
  assert.equal(canSkipTechApiFile(candidate, new Map([[candidate.fileKey, { checkpointSha256: 'different', catalogRecordExists: true }]])), false);
  assert.equal(canSkipTechApiFile(candidate, new Map()), false);
});

test('resume state joins checkpoint hash with sourceKey existence', async () => {
  const { repository, calls } = createRepository({
    checkpointRows: [{ fileKey: 'commit:cpu/a.json', sha256: 'hash' }],
    catalogRows: [{ sourceKey: 'techapi:cpu:a' }],
  });
  const states = await repository.findImportResumeStates([
    { fileKey: 'commit:cpu/a.json', sourceKey: 'techapi:cpu:a' },
    { fileKey: 'commit:cpu/b.json', sourceKey: 'techapi:cpu:b' },
  ]);
  assert.deepEqual(states.get('commit:cpu/a.json'), { checkpointSha256: 'hash', catalogRecordExists: true });
  assert.deepEqual(states.get('commit:cpu/b.json'), { catalogRecordExists: false });
  assert.equal(calls.filter((call) => call.model === 'catalog').length, 1);
});

test('catalog upsert can be retried after checkpoint persistence fails', async () => {
  const { repository, catalogBulkWrites } = createRepository({ failFirstCheckpointWrite: true });
  const now = new Date();
  const record = {
    sourceKey: 'techapi:cpu:retry', sourceCategory: 'cpu', sourceSlug: 'retry', name: 'Retry CPU',
    sourceRecordUrl: 'https://example.test/cpu/retry', sourceListUrl: 'https://example.test/cpus',
    dataAttribution: 'TechAPI', dataSourceUrl: 'https://example.test', dataLicense: 'CC BY-SA 4.0',
    dataLicenseUrl: 'https://example.test/license', licenseTermsUrl: 'https://example.test/terms',
    workflowStatus: 'discovery_only' as const, raw: { name: 'Retry CPU' }, searchText: 'Retry CPU',
    detailsFetchedAt: now, detailsSha256: 'hash', lastSeenAt: now, createdAt: now, updatedAt: now,
  };
  const checkpoint: TechApiImportCheckpoint = {
    fileKey: 'commit:cpu/retry.json', sourcePath: 'cpu/retry.json', sourceCommit: 'commit', sha256: 'hash',
    recordCount: 1, importedAt: now,
  };
  await repository.upsertFullDatasetRecords([record]);
  await assert.rejects(repository.upsertCheckpoints([checkpoint]), /fixture checkpoint write failure/);
  await repository.upsertFullDatasetRecords([record]);
  await repository.upsertCheckpoints([checkpoint]);
  assert.equal(catalogBulkWrites.length, 2);
  assert.deepEqual(catalogBulkWrites[0][0].updateOne.filter, catalogBulkWrites[1][0].updateOne.filter);
  assert.equal(catalogBulkWrites[1][0].updateOne.upsert, true);
});

test('Mongo full-dataset plus checkpoint save keeps catalog-first non-transaction semantics', async () => {
  const { repository, catalogBulkWrites, checkpointBulkWrites } = createRepository({ failFirstCheckpointWrite: true });
  const now = new Date();
  const record = {
    sourceKey: 'techapi:cpu:compound-save', sourceCategory: 'cpu', sourceSlug: 'compound-save', name: 'Compound Save CPU',
    sourceRecordUrl: 'https://example.test/cpu/compound-save', sourceListUrl: 'https://example.test/cpus',
    dataAttribution: 'TechAPI', dataSourceUrl: 'https://example.test', dataLicense: 'CC BY-SA 4.0',
    dataLicenseUrl: 'https://example.test/license', licenseTermsUrl: 'https://example.test/terms',
    workflowStatus: 'discovery_only' as const, raw: { name: 'Compound Save CPU' }, searchText: 'Compound Save CPU',
    detailsFetchedAt: now, detailsSha256: 'compound-hash', lastSeenAt: now, createdAt: now, updatedAt: now,
  };
  const checkpoint: TechApiImportCheckpoint = {
    fileKey: 'commit:cpu/compound-save.json', sourcePath: 'cpu/compound-save.json', sourceCommit: 'commit',
    sha256: 'compound-hash', recordCount: 1, importedAt: now,
  };
  await assert.rejects(repository.saveFullDatasetRecordsWithCheckpoints([record], [checkpoint]), /fixture checkpoint write failure/);
  assert.equal(catalogBulkWrites.length, 1, 'the completed Mongo catalog write remains committed if checkpoint write fails');
  assert.equal(checkpointBulkWrites.length, 1, 'checkpoint persistence is attempted after the catalog write');
});
