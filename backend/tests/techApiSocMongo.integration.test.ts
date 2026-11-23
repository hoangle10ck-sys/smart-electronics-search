import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import test from 'node:test';
import mongoose from 'mongoose';
import { Product } from '../src/models/Product';
import { SyncRun } from '../src/models/SyncRun';
import { SqliteTechApiRepository } from '../src/repositories/sqliteTechApiRepository';
import type { TechApiSocRecord } from '../src/repositories/techApiRepository';
import {
  createMongooseSocImportStores,
  runTechApiSocImport,
  SocProductStore,
  SocSyncRunStore,
  TechApiSocImportError,
} from '../src/services/techApiSocImport';
import { assertLocalMongoUri } from '../src/services/techApiCatalog';
import { createTechApiSocOperationLock } from '../src/services/techApiSocOperationLock';

const enabled = process.env.PHASE5B1_LOCAL_MONGO_INTEGRATION === '1';

test('Phase 5B.1 SQLite verified SoC to isolated local Mongo Product/SyncRun integration', { skip: !enabled }, async (t) => {
  const archivePath = process.env.PHASE5B1_SQLITE_ARCHIVE_COPY?.trim();
  assert.ok(archivePath, 'Set PHASE5B1_SQLITE_ARCHIVE_COPY to an independent SQLite test copy.');
  const resolvedArchivePath = resolve(archivePath);
  assert.ok(existsSync(resolvedArchivePath), 'SQLite test copy must already exist.');
  const archiveStatBefore = statSync(resolvedArchivePath);
  assert.match(basename(resolvedArchivePath), /phase5b-test/i, 'Refusing to use an archive path not clearly marked as a test copy.');
  assert.notEqual(
    resolvedArchivePath.toLowerCase(),
    resolve('D:\\SmartElectronicsData\\techapi_catalog.sqlite').toLowerCase(),
    'The official archive is not an integration-test source.',
  );

  const runToken = randomUUID().replace(/-/g, '');
  const ownerId = new mongoose.Types.ObjectId();
  const databaseName = `smart_elec_phase5b1_${runToken}`;
  const lockDirectory = join(tmpdir(), `phase5c1-soc-lock-${runToken}`);
  const mongoUri = `mongodb://127.0.0.1:27017/${databaseName}?directConnection=true`;
  assertLocalMongoUri(mongoUri);
  const connection = mongoose.createConnection(mongoUri, { serverSelectionTimeoutMS: 2_500 });
  let databaseOwned = false;
  let sqlite: SqliteTechApiRepository | undefined;

  try {
    await connection.asPromise();
    const database = connection.db!;
    const hello = await database.admin().command({ hello: 1 });
    assert.notEqual(hello.msg, 'isdbgrid', 'A mongos endpoint is not accepted as local MongoDB.');
    assert.equal(hello.setName, undefined, 'A replica-set endpoint is not accepted for this loopback-only test.');
    assert.equal(database.databaseName, databaseName);
    assert.deepEqual(await database.listCollections().toArray(), [], 'The unique test database must be empty before ownership claim.');

    await database.collection('phase5b1_ownership').insertOne({ _id: ownerId, token: runToken, createdAt: new Date() });
    databaseOwned = true;

    const ProductModel = connection.model('Phase5b1Product', Product.schema, 'products');
    const SyncRunModel = connection.model('Phase5b1SyncRun', SyncRun.schema, 'syncruns');
    await Promise.all([ProductModel.init(), SyncRunModel.init()]);
    const stores = createMongooseSocImportStores(ProductModel, SyncRunModel);

    sqlite = new SqliteTechApiRepository(resolvedArchivePath, { readOnly: true });
    const records = await sqlite.findVerifiedSocRecords();
    assert.ok(records.length > 0, 'The independent SQLite copy must contain verified SoC records.');
    const manufacturerHosts = new Set([
      'apple.com', 'qualcomm.com', 'mediatek.com', 'samsung.com', 'google.com', 'huawei.com', 'honor.com',
      'xiaomi.com', 'oppo.com', 'vivo.com', 'motorola.com', 'unisoc.com', 'lenovo.com',
    ]);
    const firstRealRecord = records.find((record) => {
      const releaseYear = Number(String(record.raw.release_date ?? '').slice(0, 4));
      const urls = Array.isArray(record.raw.source_urls) ? record.raw.source_urls : [];
      return record.raw.verified === true && Number.isInteger(releaseYear) && releaseYear >= 2023
        && urls.some((value) => {
          if (typeof value !== 'string') return false;
          try {
            const url = new URL(value);
            const host = url.hostname.toLowerCase().replace(/^www\./, '');
            return url.protocol === 'https:' && [...manufacturerHosts].some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
          } catch { return false; }
        });
    });
    assert.ok(firstRealRecord, 'The independent copy must contain a verified, recent, manufacturer-sourced SoC record.');
    assert.equal(firstRealRecord.raw.verified, true);

    const sourceWithUnverified = {
      async findVerifiedSocRecords(): Promise<TechApiSocRecord[]> {
        return [...records, {
          ...firstRealRecord,
          sourceKey: `${firstRealRecord.sourceKey}:unverified-test-copy`,
          sourceSlug: `${firstRealRecord.sourceSlug}-unverified-test-copy`,
          raw: { ...firstRealRecord.raw, slug: `${firstRealRecord.sourceSlug}-unverified-test-copy`, verified: false },
        }];
      },
    };
    const run = (sourceRepository: { findVerifiedSocRecords(): Promise<TechApiSocRecord[]> }, sourceKey: string, target: number, productStore: SocProductStore = stores.products, syncRunStore: SocSyncRunStore = stores.syncRuns) =>
      runTechApiSocImport({
        sourceRepository,
        productStore,
        syncRunStore,
        sourceStorage: 'sqlite',
        importMode: true,
        target,
        syncRunSourceKey: sourceKey,
        operationLock: createTechApiSocOperationLock(databaseName, lockDirectory, { timeoutMs: 1_000 }),
      });

    const mixedStorageResult = await run(sourceWithUnverified, `phase5b1:${runToken}:verified`, 1);
    assert.equal(mixedStorageResult.sourceStorage, 'sqlite');
    assert.equal(mixedStorageResult.sourceAccessMode, 'readonly');
    assert.equal(mixedStorageResult.productDestination, 'mongo');
    assert.equal(mixedStorageResult.syncRunDestination, 'mongo');
    assert.equal(mixedStorageResult.created, 1);
    assert.ok(mixedStorageResult.skippedUnverified >= 1, 'Unverified source rows must be counted and excluded.');
    assert.equal(await ProductModel.countDocuments({}), 1);

    const selectedSlug = mixedStorageResult.candidates[0]?.slug;
    assert.ok(selectedSlug, 'The import plan must identify the selected verified source record.');
    const importedProduct = await ProductModel.findOne({ dedupeKey: `techapi:soc:${selectedSlug}` }).lean();
    assert.ok(importedProduct, 'A real verified SQLite record must be represented by a Mongo Product.');
    assert.equal(await ProductModel.countDocuments({ dedupeKey: `techapi:soc:${firstRealRecord.sourceSlug}-unverified-test-copy` }), 0);
    const productSnapshot = JSON.stringify(importedProduct);

    const sameKeyRetry = await run({ findVerifiedSocRecords: () => sqlite!.findVerifiedSocRecords() }, `phase5b1:${runToken}:verified`, 1);
    const newRunKey = await run({ findVerifiedSocRecords: () => sqlite!.findVerifiedSocRecords() }, `phase5b1:${runToken}:new-key`, 1);
    assert.equal(sameKeyRetry.created, 0);
    assert.equal(sameKeyRetry.skippedExisting, 1);
    assert.equal(newRunKey.created, 0);
    assert.equal(await ProductModel.countDocuments({}), 1, 'A different SyncRun source key must not duplicate a Product.');
    assert.equal(JSON.stringify(await ProductModel.findById(importedProduct._id).lean()), productSnapshot, 'Existing Product content must not be overwritten.');
    assert.equal(await SyncRunModel.countDocuments({ sourceKey: `phase5b1:${runToken}:verified` }), 1);
    assert.equal(await SyncRunModel.countDocuments({ sourceKey: `phase5b1:${runToken}:new-key` }), 1);

    let productCreateCalls = 0;
    const failSecondProductWrite: SocProductStore = {
      ...stores.products,
      create: async (document) => {
        productCreateCalls += 1;
        if (productCreateCalls === 2) throw new Error('injected Product write failure');
        await stores.products.create(document);
      },
    };
    const partialRunKey = `phase5b1:${runToken}:partial`;
    await assert.rejects(run({ findVerifiedSocRecords: () => sqlite!.findVerifiedSocRecords() }, partialRunKey, 3, failSecondProductWrite), (error: unknown) => {
      assert.ok(error instanceof TechApiSocImportError);
      assert.equal(error.phase, 'product_write');
      assert.equal(error.productsCreated, 1);
      return true;
    });
    assert.equal(await ProductModel.countDocuments({}), 2, 'The successful write before a partial failure must remain committed exactly once.');
    assert.equal((await SyncRunModel.findOne({ sourceKey: partialRunKey }).lean())?.status, 'partial');

    const partialRetry = await run({ findVerifiedSocRecords: () => sqlite!.findVerifiedSocRecords() }, partialRunKey, 3);
    assert.equal(partialRetry.created, 1);
    assert.equal(partialRetry.missingAfterPlan, 0);
    assert.equal(await ProductModel.countDocuments({}), 3);
    assert.equal((await SyncRunModel.findOne({ sourceKey: partialRunKey }).lean())?.status, 'succeeded');

    let failSuccess = true;
    const failSyncRunCompletionOnce: SocSyncRunStore = {
      upsert: async (syncRun) => {
        if (syncRun.status === 'succeeded' && failSuccess) {
          failSuccess = false;
          throw new Error('injected SyncRun completion failure');
        }
        await stores.syncRuns.upsert(syncRun);
      },
    };
    const syncRunFailureKey = `phase5b1:${runToken}:syncrun-failure`;
    await assert.rejects(run({ findVerifiedSocRecords: () => sqlite!.findVerifiedSocRecords() }, syncRunFailureKey, 4, stores.products, failSyncRunCompletionOnce), (error: unknown) => {
      assert.ok(error instanceof TechApiSocImportError);
      assert.equal(error.phase, 'sync_run_write');
      assert.equal(error.productsCreated, 1);
      return true;
    });
    assert.equal(await ProductModel.countDocuments({}), 4, 'Product commits are not rolled back by a later SyncRun failure.');
    assert.equal((await SyncRunModel.findOne({ sourceKey: syncRunFailureKey }).lean())?.status, 'running');

    const syncRunRetry = await run({ findVerifiedSocRecords: () => sqlite!.findVerifiedSocRecords() }, syncRunFailureKey, 4);
    assert.equal(syncRunRetry.created, 0);
    assert.equal(await ProductModel.countDocuments({}), 4);
    assert.equal((await SyncRunModel.findOne({ sourceKey: syncRunFailureKey }).lean())?.status, 'succeeded');

    const missingArchive = join(tmpdir(), `phase5b1-missing-${runToken}`, 'techapi_catalog.sqlite');
    assert.throws(() => new SqliteTechApiRepository(missingArchive, { readOnly: true }), /directory does not exist|unable to open database file|no such file|ENOENT/i);

    const unreachable = mongoose.createConnection(
      `mongodb://127.0.0.1:1/phase5b1_unreachable_${runToken}?directConnection=true`,
      { serverSelectionTimeoutMS: 350 },
    );
    await assert.rejects(unreachable.asPromise());
    await unreachable.close().catch(() => undefined);

    const collectionNames = (await database.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name);
    assert.equal(collectionNames.includes('techapicatalogrecords'), false);
    assert.equal(collectionNames.includes('techapiimportcheckpoints'), false);
    assert.equal(await ProductModel.countDocuments({}), 4);
    assert.equal(await SyncRunModel.countDocuments({}), 4);

    await t.test('SQLite archive is opened readonly and is not used as a writer', () => {
      assert.ok(sqlite);
      const archiveStatAfter = statSync(resolvedArchivePath);
      assert.equal(archiveStatAfter.size, archiveStatBefore.size);
      assert.equal(archiveStatAfter.mtimeMs, archiveStatBefore.mtimeMs);
    });
  } finally {
    await sqlite?.close();
    if (databaseOwned && connection.readyState === 1) {
      const db = connection.db!;
      const marker = await db.collection('phase5b1_ownership').findOne({ _id: ownerId, token: runToken });
      assert.ok(marker, 'Cleanup is allowed only while the exact test ownership marker is present.');
      await db.dropDatabase();
      const remainingDatabaseNames = (await db.admin().listDatabases({ nameOnly: true })).databases.map(({ name }) => name);
      assert.equal(remainingDatabaseNames.includes(databaseName), false, 'The test-owned database must be absent after cleanup.');
    }
    await connection.close();
    rmSync(lockDirectory, { recursive: true, force: true });
  }
});
