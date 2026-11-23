import assert from 'node:assert/strict';
import test from 'node:test';
import type { TechApiSocRecord } from '../repositories/techApiRepository';
import {
  runTechApiSocImport,
  SocProductRecord,
  SocProductStore,
  SocSyncRun,
  SocSyncRunStore,
  TechApiSocImportError,
} from './techApiSocImport';

const snapshotDate = new Date('2025-04-01T00:00:00.000Z');

function socRecord(slug: string, name: string, overrides: Record<string, unknown> = {}): TechApiSocRecord {
  return {
    sourceKey: `techapi:soc:${slug}`,
    sourceCategory: 'soc',
    sourceSlug: slug,
    name,
    sourceRecordUrl: `https://gettechapi.github.io/TechAPI/v1/soc/${slug}/index.json`,
    raw: {
      slug,
      name,
      manufacturer: 'qualcomm',
      release_date: '2025-01-10',
      verified: true,
      source_urls: [`https://www.qualcomm.com/products/${slug}`],
      cpu_cores: 8,
      ...overrides,
    },
    lastSeenAt: snapshotDate,
  };
}

function harness(records: TechApiSocRecord[]) {
  const products: Array<Record<string, unknown>> = [];
  const runs = new Map<string, SocSyncRun>();
  let failCreateAt: number | undefined;
  let createCalls = 0;
  let failSuccessfulRunOnce = false;
  let sourceFailure: unknown;
  const productStore: SocProductStore = {
    async findPublishedVerified() {
      return products.map((document) => ({ brand: document.brand, model: document.model, name: document.name }));
    },
    async existsByIdentity({ brand, model }) {
      return products.some((product) => String(product.brand).toLowerCase() === brand.toLowerCase()
        && String(product.model).toLowerCase() === model.toLowerCase());
    },
    async create(document) {
      createCalls += 1;
      if (createCalls === failCreateAt) throw new Error('injected product write failure');
      products.push({ ...document });
    },
    async countPublishedVerified() { return products.length; },
  };
  const syncRunStore: SocSyncRunStore = {
    async upsert(run) {
      if (run.status === 'succeeded' && failSuccessfulRunOnce) {
        failSuccessfulRunOnce = false;
        throw new Error('injected SyncRun completion failure');
      }
      runs.set(run.sourceKey, { ...run, stats: { ...run.stats } });
    },
  };
  const sourceRepository = {
    async findVerifiedSocRecords() {
      if (sourceFailure) throw sourceFailure;
      return records;
    },
  };
  return {
    products, runs, productStore, syncRunStore, sourceRepository,
    failCreateOn(call: number) { failCreateAt = call; },
    failSuccessOnce() { failSuccessfulRunOnce = true; },
    failSource(error: unknown) { sourceFailure = error; },
  };
}

function run(h: ReturnType<typeof harness>, options: { sourceKey: string; target: number }) {
  return runTechApiSocImport({
    sourceRepository: h.sourceRepository,
    productStore: h.productStore,
    syncRunStore: h.syncRunStore,
    sourceStorage: 'sqlite',
    importMode: true,
    target: options.target,
    syncRunSourceKey: options.sourceKey,
    operationLock: { acquire: async () => async () => undefined },
    now: () => snapshotDate,
  });
}

test('import mode requires an operation-level lock before reading the source', async () => {
  const h = harness([socRecord('locked-chip', 'Locked Chip')]);
  let sourceReads = 0;
  h.sourceRepository.findVerifiedSocRecords = async () => { sourceReads += 1; return []; };
  await assert.rejects(runTechApiSocImport({
    sourceRepository: h.sourceRepository,
    productStore: h.productStore,
    syncRunStore: h.syncRunStore,
    sourceStorage: 'sqlite',
    importMode: true,
  }), /operation-level lock is required/);
  assert.equal(sourceReads, 0);
});

test('lock timeout retains the exact retry SyncRun key without beginning import work', async () => {
  const h = harness([socRecord('locked-chip', 'Locked Chip')]);
  let sourceReads = 0;
  h.sourceRepository.findVerifiedSocRecords = async () => { sourceReads += 1; return []; };
  await assert.rejects(runTechApiSocImport({
    sourceRepository: h.sourceRepository,
    productStore: h.productStore,
    syncRunStore: h.syncRunStore,
    sourceStorage: 'sqlite',
    importMode: true,
    syncRunSourceKey: 'phase5c1:stable-lock-retry',
    operationLock: { acquire: async () => { throw new Error('test lock busy'); } },
  }), (error: unknown) => {
    assert.ok(error instanceof TechApiSocImportError);
    assert.equal(error.phase, 'operation_lock');
    assert.equal(error.syncRunSourceKey, 'phase5c1:stable-lock-retry');
    assert.match(error.message, /no source or destination records were processed/);
    return true;
  });
  assert.equal(sourceReads, 0);
  assert.equal(h.runs.size, 0);
});

test('SoC import persists Mongo destinations, is idempotent across run keys, and preserves existing Products', async () => {
  const h = harness([socRecord('snapdragon-8-elite-gen-5', 'Snapdragon 8 Elite Gen 5')]);
  const first = await run(h, { sourceKey: 'phase5b1:run:first', target: 1 });
  const original = { ...h.products[0] };
  const sameKeyRetry = await run(h, { sourceKey: 'phase5b1:run:first', target: 1 });
  const differentKeyRun = await run(h, { sourceKey: 'phase5b1:run:second', target: 1 });

  assert.equal(first.sourceStorage, 'sqlite');
  assert.equal(first.sourceAccessMode, 'readonly');
  assert.equal(first.productDestination, 'mongo');
  assert.equal(first.syncRunDestination, 'mongo');
  assert.equal(first.created, 1);
  assert.equal(sameKeyRetry.created, 0);
  assert.equal(sameKeyRetry.skippedExisting, 1);
  assert.equal(differentKeyRun.created, 0);
  assert.equal(h.products.length, 1);
  assert.deepEqual(h.products[0], original);
  assert.equal(h.runs.size, 2, 'a retry reuses its SyncRun key while a new run preserves history');
  assert.equal(h.runs.get('phase5b1:run:first')?.status, 'succeeded');
  assert.equal(h.runs.get('phase5b1:run:second')?.status, 'succeeded');
});

test('unverified SoC rows are excluded from Mongo Product writes', async () => {
  const h = harness([socRecord('unverified-chip', 'Unverified Chip', { verified: false })]);
  const result = await run(h, { sourceKey: 'phase5b1:run:unverified', target: 1 });

  assert.equal(result.skippedUnverified, 1);
  assert.equal(result.created, 0);
  assert.equal(result.missingAfterPlan, 1);
  assert.equal(h.products.length, 0);
  assert.equal(h.runs.get('phase5b1:run:unverified')?.status, 'partial');
});

test('partial Product write can be retried without duplicating already committed Products', async () => {
  const h = harness([
    socRecord('snapdragon-8-elite-gen-5', 'Snapdragon 8 Elite Gen 5'),
    socRecord('dimensity-9500', 'Dimensity 9500'),
  ]);
  h.failCreateOn(2);

  await assert.rejects(run(h, { sourceKey: 'phase5b1:run:partial', target: 2 }), (error: unknown) => {
    assert.ok(error instanceof TechApiSocImportError);
    assert.equal(error.phase, 'product_write');
    assert.equal(error.productsCreated, 1);
    return true;
  });
  assert.equal(h.products.length, 1);
  assert.equal(h.runs.get('phase5b1:run:partial')?.status, 'partial');

  const retry = await run(h, { sourceKey: 'phase5b1:run:partial', target: 2 });
  assert.equal(retry.created, 1);
  assert.equal(retry.skippedExisting, 1);
  assert.equal(retry.missingAfterPlan, 0);
  assert.equal(h.products.length, 2);
  assert.equal(h.runs.get('phase5b1:run:partial')?.status, 'succeeded');
});

test('SyncRun completion failure after Product commit can be retried with the same run key', async () => {
  const h = harness([socRecord('snapdragon-8-elite-gen-5', 'Snapdragon 8 Elite Gen 5')]);
  h.failSuccessOnce();

  await assert.rejects(run(h, { sourceKey: 'phase5b1:run:sync-fail', target: 1 }), (error: unknown) => {
    assert.ok(error instanceof TechApiSocImportError);
    assert.equal(error.phase, 'sync_run_write');
    assert.equal(error.productsCreated, 1);
    return true;
  });
  assert.equal(h.products.length, 1, 'Mongo Product write remains committed after SyncRun failure');
  assert.equal(h.runs.get('phase5b1:run:sync-fail')?.status, 'running');

  const retry = await run(h, { sourceKey: 'phase5b1:run:sync-fail', target: 1 });
  assert.equal(retry.created, 0);
  assert.equal(h.products.length, 1);
  assert.equal(h.runs.get('phase5b1:run:sync-fail')?.status, 'succeeded');
});

test('source failure is recorded as failed without writing Products', async () => {
  const h = harness([socRecord('snapdragon-8-elite-gen-5', 'Snapdragon 8 Elite Gen 5')]);
  h.failSource(new Error('injected repository unavailable'));

  await assert.rejects(run(h, { sourceKey: 'phase5b1:run:source-fail', target: 1 }), (error: unknown) => {
    assert.ok(error instanceof TechApiSocImportError);
    assert.equal(error.phase, 'source_read');
    return true;
  });
  assert.equal(h.products.length, 0);
  assert.equal(h.runs.get('phase5b1:run:source-fail')?.status, 'failed');
});
