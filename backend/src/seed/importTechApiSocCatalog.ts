import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';
import { connectDB } from '../config/db';
import { createMongooseSocImportStores, runTechApiSocImport, TechApiSocImportError } from '../services/techApiSocImport';
import { getTechApiRuntimeRepository, resolveTechApiStorageConfig } from '../repositories/techApiRepositoryFactory';
import { createTechApiSocOperationLock, defaultTechApiSocLockDirectory } from '../services/techApiSocOperationLock';
import { resolveTechApiMongoDestination } from '../services/techApiMongoDestination';

const TARGET = 30;

function runSourceKey(args: string[], target: number): string {
  const inline = args.find((arg) => arg.startsWith('--run-key='));
  const nextIndex = args.indexOf('--run-key');
  let value: string | undefined;
  if (inline !== undefined) value = inline.slice('--run-key='.length);
  else if (nextIndex >= 0) {
    value = args[nextIndex + 1];
    if (!value || value.startsWith('--')) throw new Error('--run-key requires a value.');
  }
  if (inline !== undefined || nextIndex >= 0) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(value)) {
      throw new Error('--run-key must contain 1–160 letters, numbers, colon, underscore, or dash characters.');
    }
    return value;
  }
  return `techapi:soc:minimum-${target}:${Date.now()}-${randomUUID()}`;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const storageConfig = resolveTechApiStorageConfig();
  const destination = resolveTechApiMongoDestination(process.env, storageConfig.storage);
  const repository = getTechApiRuntimeRepository();
  const importMode = args.includes('--import');
  const syncRunSourceKey = runSourceKey(args, TARGET);
  const lockTimeoutValue = process.env.TECHAPI_SOC_IMPORT_LOCK_TIMEOUT_MS?.trim();
  const lockTimeoutMs = lockTimeoutValue ? Number(lockTimeoutValue) : undefined;
  if (lockTimeoutMs !== undefined && (!Number.isSafeInteger(lockTimeoutMs) || lockTimeoutMs < 0)) {
    throw new Error('TECHAPI_SOC_IMPORT_LOCK_TIMEOUT_MS must be a non-negative integer.');
  }
  const operationLock = createTechApiSocOperationLock(
    destination.databaseName,
    process.env.TECHAPI_SOC_IMPORT_LOCK_DIR?.trim() || defaultTechApiSocLockDirectory(),
    { timeoutMs: lockTimeoutMs },
  );
  let closeMongo: () => Promise<void> = async () => undefined;
  try {
    let stores: ReturnType<typeof createMongooseSocImportStores>;
    if (destination.mode === 'local') {
      await connectDB();
      closeMongo = async () => { await mongoose.disconnect(); };
      stores = createMongooseSocImportStores();
    } else {
      const connection = mongoose.createConnection(destination.uri, {
        dbName: destination.databaseName,
        serverSelectionTimeoutMS: 10_000,
      });
      try {
        await connection.asPromise();
      } catch {
        await connection.close().catch(() => undefined);
        throw new Error('Could not connect to the explicitly configured MongoDB SoC destination.');
      }
      closeMongo = async () => { await connection.close(); };
      const productModel = connection.model('TechApiSocProduct', Product.schema, 'products');
      const syncRunModel = connection.model('TechApiSocSyncRun', SyncRun.schema, 'syncruns');
      stores = createMongooseSocImportStores(productModel, syncRunModel);
    }
    const summary = await runTechApiSocImport({
      sourceRepository: repository,
      productStore: stores.products,
      syncRunStore: stores.syncRuns,
      sourceStorage: storageConfig.storage,
      importMode,
      target: TARGET,
      syncRunSourceKey,
      operationLock,
    });
    console.log(JSON.stringify({ ...summary, database: destination.databaseName, mongoDestination: destination.mode }, null, 2));
  } finally {
    await repository.close();
    await closeMongo();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    if (error instanceof TechApiSocImportError) {
      console.error(JSON.stringify({
        error: error.message,
        phase: error.phase,
        productsCreatedBeforeFailure: error.productsCreated,
        syncRunSourceKey: error.syncRunSourceKey,
        retry: `npm run catalog:import:techapi-soc -- --import --run-key=${error.syncRunSourceKey}`,
      }, null, 2));
    } else {
      console.error(error instanceof Error ? error.message : 'TechAPI SoC catalog import failed');
    }
    process.exitCode = 1;
  });
}
