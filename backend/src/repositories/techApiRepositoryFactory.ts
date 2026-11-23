import { constants } from 'node:fs';
import { accessSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { mongoTechApiRepository } from './mongoTechApiRepository';
import type { TechApiRepository } from './techApiRepository';
import { acquireTechApiWriterLock } from './sqliteTechApiWriterLock';

export type TechApiStorage = 'mongo' | 'sqlite';
export type TechApiSqliteAccess = 'readonly' | 'readwrite';

export type TechApiStorageConfig = {
  storage: TechApiStorage;
  archiveDir?: string;
  sqliteAccess?: TechApiSqliteAccess;
  sqliteLockTimeoutMs?: number;
};

function isWithinDirectory(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);
  return relativePath === '' || (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath));
}

export function resolveTechApiStorageConfig(environment: NodeJS.ProcessEnv = process.env): TechApiStorageConfig {
  const requestedStorage = environment.TECHAPI_STORAGE?.trim().toLowerCase() || 'mongo';
  if (requestedStorage !== 'mongo' && requestedStorage !== 'sqlite') {
    throw new Error('TECHAPI_STORAGE must be either "mongo" or "sqlite".');
  }
  const requestedAccess = environment.TECHAPI_SQLITE_ACCESS?.trim().toLowerCase() || 'readonly';
  if (requestedAccess !== 'readonly' && requestedAccess !== 'readwrite') {
    throw new Error('TECHAPI_SQLITE_ACCESS must be either "readonly" or "readwrite".');
  }
  const config: TechApiStorageConfig = { storage: requestedStorage };
  if (requestedStorage === 'sqlite') {
    if (!environment.TECHAPI_ARCHIVE_DIR?.trim()) {
      throw new Error('TECHAPI_ARCHIVE_DIR is required when TECHAPI_STORAGE=sqlite.');
    }
    config.archiveDir = environment.TECHAPI_ARCHIVE_DIR.trim();
    config.sqliteAccess = requestedAccess;
    const timeoutValue = environment.TECHAPI_SQLITE_LOCK_TIMEOUT_MS?.trim();
    if (timeoutValue) {
      const timeout = Number(timeoutValue);
      if (!Number.isSafeInteger(timeout) || timeout < 0) {
        throw new Error('TECHAPI_SQLITE_LOCK_TIMEOUT_MS must be a non-negative integer.');
      }
      config.sqliteLockTimeoutMs = timeout;
    }
  }
  return config;
}

export function validateTechApiArchiveDirectory(archiveDir: string): string {
  if (!isAbsolute(archiveDir)) throw new Error('TECHAPI_ARCHIVE_DIR must be an absolute directory path.');
  let realArchiveDir: string;
  let realProjectRoot: string;
  try {
    const stats = statSync(archiveDir);
    if (!stats.isDirectory()) throw new Error('configured path is not a directory');
    accessSync(archiveDir, constants.R_OK);
    realArchiveDir = realpathSync(archiveDir);
    realProjectRoot = realpathSync(resolve(__dirname, '../../..'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown filesystem error';
    throw new Error(`TECHAPI_ARCHIVE_DIR must name an existing readable directory (${detail}).`);
  }
  if (isWithinDirectory(realProjectRoot, realArchiveDir)) {
    throw new Error('TECHAPI_ARCHIVE_DIR must be outside the Git repository.');
  }
  return realArchiveDir;
}

export function createTechApiRepository(config: TechApiStorageConfig): TechApiRepository {
  if (config.storage === 'mongo') return mongoTechApiRepository;
  if (!config.archiveDir) throw new Error('TECHAPI_ARCHIVE_DIR is required when TECHAPI_STORAGE=sqlite.');
  const { SqliteTechApiRepository } = require('./sqliteTechApiRepository') as typeof import('./sqliteTechApiRepository');
  const archivePath = getExistingArchivePath(config.archiveDir, false);
  return new SqliteTechApiRepository(archivePath, { readOnly: true });
}

function getExistingArchivePath(archiveDir: string, writable: boolean): string {
  const archivePath = join(validateTechApiArchiveDirectory(archiveDir), 'techapi_catalog.sqlite');
  try {
    const archive = statSync(archivePath);
    if (!archive.isFile()) throw new Error('configured archive path is not a file');
    accessSync(archivePath, writable ? constants.R_OK | constants.W_OK : constants.R_OK);
    if (writable) accessSync(archiveDir, constants.R_OK | constants.W_OK);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown filesystem error';
    const access = writable ? 'readable and writable' : 'readable';
    throw new Error(`TechAPI SQLite archive must be an existing ${access} file (${detail}).`);
  }
  return realpathSync(archivePath);
}

export type TechApiImporterRepositoryOptions = {
  /** True only when this process writes TechApiCatalogRecord or TechApiImportCheckpoint. */
  writeTechApi: boolean;
  environment?: NodeJS.ProcessEnv;
};

/**
 * Importer-only factory. HTTP/runtime callers must use createTechApiRepository,
 * which always opens SQLite read-only regardless of environment access flags.
 */
export async function createTechApiImporterRepository(
  options: TechApiImporterRepositoryOptions,
): Promise<TechApiRepository> {
  const config = resolveTechApiStorageConfig(options.environment);
  if (config.storage === 'mongo') return mongoTechApiRepository;
  if (!config.archiveDir) throw new Error('TECHAPI_ARCHIVE_DIR is required when TECHAPI_STORAGE=sqlite.');
  if (options.writeTechApi && config.sqliteAccess !== 'readwrite') {
    throw new Error('This TechAPI importer writes catalog/checkpoint data. Set TECHAPI_STORAGE=sqlite and TECHAPI_SQLITE_ACCESS=readwrite explicitly, or select MongoDB storage.');
  }

  const archivePath = getExistingArchivePath(config.archiveDir, options.writeTechApi);
  const { SqliteTechApiRepository } = require('./sqliteTechApiRepository') as typeof import('./sqliteTechApiRepository');
  if (!options.writeTechApi) return new SqliteTechApiRepository(archivePath, { readOnly: true });

  const releaseLock = await acquireTechApiWriterLock(archivePath, {
    timeoutMs: config.sqliteLockTimeoutMs,
  });
  try {
    return new SqliteTechApiRepository(archivePath, {
      requireExistingSchema: true,
      onClose: releaseLock,
    });
  } catch (error) {
    await releaseLock();
    const detail = error instanceof Error ? error.message : 'unknown SQLite open error';
    throw new Error(`Unable to open TechAPI archive for controlled writing: ${detail}`);
  }
}

let runtimeRepository: TechApiRepository | undefined;

/** Lazily create the application repository; SQLite is always opened read-only here. */
export function getTechApiRuntimeRepository(): TechApiRepository {
  runtimeRepository ??= createTechApiRepository(resolveTechApiStorageConfig());
  return runtimeRepository;
}
