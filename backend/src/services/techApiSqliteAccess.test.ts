import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteTechApiRepository } from '../repositories/sqliteTechApiRepository';
import { TechApiIndexUpsert } from '../repositories/techApiRepository';

const fixture: TechApiIndexUpsert = {
  sourceKey: 'techapi:test:readonly', sourceCategory: 'test', sourceSlug: 'readonly', name: 'Test',
  sourceRecordUrl: 'https://example.invalid/record', sourceListUrl: 'https://example.invalid/list',
  dataAttribution: 'fixture', dataSourceUrl: 'https://example.invalid', dataLicense: 'fixture',
  dataLicenseUrl: 'https://example.invalid/license', licenseTermsUrl: 'https://example.invalid/terms',
  workflowStatus: 'discovery_only', lastSeenAt: new Date(), raw: { fixture: true }, searchText: 'test',
};

test('process environment gates index, full, enrich, SoC, and report access modes independently', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'techapi-access-matrix-test-'));
  const archivePath = join(directory, 'techapi_catalog.sqlite');
  const setup = new SqliteTechApiRepository(archivePath);
  await setup.close();
  t.after(() => rm(directory, { recursive: true, force: true }));

  const keys = ['TECHAPI_STORAGE', 'TECHAPI_ARCHIVE_DIR', 'TECHAPI_SQLITE_ACCESS', 'TECHAPI_SQLITE_LOCK_TIMEOUT_MS'] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  const factory = await import('../repositories/techApiRepositoryFactory');
  try {
    process.env.TECHAPI_STORAGE = 'sqlite';
    process.env.TECHAPI_ARCHIVE_DIR = directory;
    process.env.TECHAPI_SQLITE_ACCESS = 'readonly';
    process.env.TECHAPI_SQLITE_LOCK_TIMEOUT_MS = '50';

    for (const command of ['import:techapi:index', 'import:techapi:full', 'enrich:techapi:details --write']) {
      await assert.rejects(
        factory.createTechApiImporterRepository({ writeTechApi: true }),
        /TECHAPI_SQLITE_ACCESS=readwrite explicitly/,
        `${command} must not write under readonly process configuration`,
      );
    }

    process.env.TECHAPI_SQLITE_ACCESS = 'readwrite';
    const indexWriter = await factory.createTechApiImporterRepository({ writeTechApi: true });
    await indexWriter.close();
    const fullDatasetWriter = await factory.createTechApiImporterRepository({ writeTechApi: true });
    await fullDatasetWriter.close();
    const enrichmentWriter = await factory.createTechApiImporterRepository({ writeTechApi: true });
    await enrichmentWriter.close();

    // `enrich` preview remains read-only even when the process inherited a
    // readwrite flag for another explicitly selected operation.
    const enrichmentPreview = await factory.createTechApiImporterRepository({ writeTechApi: false });
    await assert.rejects(enrichmentPreview.upsertIndexRecords([fixture]), /read-only/);
    await enrichmentPreview.close();

    // SoC import and index reporting consume TechAPI as a source only; their
    // Product/SyncRun destination remains MongoDB in their command code.
    const socSource = factory.createTechApiRepository(factory.resolveTechApiStorageConfig());
    await assert.rejects(socSource.upsertIndexRecords([fixture]), /read-only/);
    await socSource.close();
    const reportSource = factory.createTechApiRepository(factory.resolveTechApiStorageConfig());
    await assert.rejects(reportSource.upsertIndexRecords([fixture]), /read-only/);
    await reportSource.close();

    assert.deepEqual(factory.resolveTechApiStorageConfig({}), { storage: 'mongo' }, 'Mongo remains the default');
    await assert.rejects(factory.createTechApiImporterRepository({
      writeTechApi: true,
      environment: { TECHAPI_STORAGE: 'sqlite', TECHAPI_ARCHIVE_DIR: directory, TECHAPI_SQLITE_ACCESS: 'unexpected' },
    }), /TECHAPI_SQLITE_ACCESS must be either/);
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
