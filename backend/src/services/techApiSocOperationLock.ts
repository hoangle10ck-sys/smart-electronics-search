import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 200;

type LockOwner = {
  pid: number;
  hostname: string;
  startedAt: string;
  token: string;
  resourceKey: string;
};

export type TechApiSocOperationLockOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
  isProcessAlive?: (pid: number) => boolean;
};

export type TechApiSocOperationLock = {
  acquire(): Promise<() => Promise<void>>;
};

export function defaultTechApiSocLockDirectory(): string {
  return join(tmpdir(), 'smart-electronics-search', 'techapi-soc-import-locks');
}

export function getTechApiSocOperationLockPath(lockDirectory: string, databaseName: string): string {
  const resourceKey = createHash('sha256').update(databaseName).digest('hex').slice(0, 24);
  return join(resolve(lockDirectory), `techapi-soc-${resourceKey}.lock`);
}

export function createTechApiSocOperationLock(
  databaseName: string,
  lockDirectory = defaultTechApiSocLockDirectory(),
  options: TechApiSocOperationLockOptions = {},
): TechApiSocOperationLock {
  if (!databaseName.trim()) throw new Error('MongoDB destination database identity is required for the SoC operation lock.');
  if (!isAbsolute(lockDirectory)) throw new Error('TECHAPI_SOC_IMPORT_LOCK_DIR must be an absolute path.');

  const canonicalLockDirectory = resolve(lockDirectory);
  const lockPath = getTechApiSocOperationLockPath(canonicalLockDirectory, databaseName);
  const resourceKey = lockPath.slice(lockPath.lastIndexOf('techapi-soc-') + 'techapi-soc-'.length).replace(/\.lock$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) throw new Error('TECHAPI_SOC_IMPORT_LOCK_TIMEOUT_MS must be a non-negative integer.');
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1) throw new Error('SoC operation lock poll interval must be a positive integer.');

  return {
    async acquire() {
      await mkdir(canonicalLockDirectory, { recursive: true });
      const owner: LockOwner = {
        pid: process.pid,
        hostname: hostname(),
        startedAt: new Date().toISOString(),
        token: randomUUID(),
        resourceKey,
      };
      const deadline = Date.now() + timeoutMs;

      while (true) {
        try {
          await mkdir(lockPath);
          try {
            await writeFile(join(lockPath, 'owner.json'), `${JSON.stringify(owner)}\n`, {
              encoding: 'utf8', flag: 'wx', mode: 0o600,
            });
          } catch (error) {
            // This invocation created the directory and can prove ownership.
            await rm(lockPath, { recursive: true, force: true });
            throw error;
          }

          return async () => {
            const current = await readOwner(lockPath);
            if (!sameOwner(current, owner)) {
              throw new Error('Refusing to release a SoC operation lock that this process does not own.');
            }
            await rm(lockPath, { recursive: true, force: false });
          };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }

        const current = await readOwner(lockPath);
        if (current && await recoverStaleLock(lockPath, current, isProcessAlive)) continue;
        if (Date.now() >= deadline) {
          const ownerDescription = current
            ? `pid ${current.pid} on ${current.hostname}`
            : 'owner metadata is missing or invalid';
          throw new Error(`Timed out waiting for the SoC operation lock; ${ownerDescription}. The lock was left untouched.`);
        }
        await new Promise((resolveTimer) => setTimeout(resolveTimer, Math.min(pollIntervalMs, Math.max(1, deadline - Date.now()))));
      }
    },
  };
}

function ownerPath(lockPath: string): string {
  return join(lockPath, 'owner.json');
}

async function readOwner(lockPath: string): Promise<LockOwner | null> {
  try {
    const parsed = JSON.parse(await readFile(ownerPath(lockPath), 'utf8')) as Partial<LockOwner>;
    if (!Number.isSafeInteger(parsed.pid) || (parsed.pid ?? 0) < 1
      || typeof parsed.hostname !== 'string' || !parsed.hostname
      || typeof parsed.startedAt !== 'string' || !parsed.startedAt
      || typeof parsed.token !== 'string' || !parsed.token
      || typeof parsed.resourceKey !== 'string' || !parsed.resourceKey) return null;
    return parsed as LockOwner;
  } catch {
    return null;
  }
}

function sameOwner(left: LockOwner | null, right: LockOwner): boolean {
  return left?.pid === right.pid && left.hostname === right.hostname
    && left.token === right.token && left.resourceKey === right.resourceKey;
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    // EPERM and unknown results fail closed: never assume a process is dead.
    return true;
  }
}

async function recoverStaleLock(
  lockPath: string,
  expected: LockOwner,
  isProcessAlive: (pid: number) => boolean,
): Promise<boolean> {
  if (expected.hostname !== hostname() || isProcessAlive(expected.pid)) return false;

  const recoveryPath = `${lockPath}.recovery`;
  const recoveryOwner: LockOwner = {
    pid: process.pid,
    hostname: hostname(),
    startedAt: new Date().toISOString(),
    token: randomUUID(),
    resourceKey: expected.resourceKey,
  };
  try {
    await mkdir(recoveryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }

  try {
    await writeFile(ownerPath(recoveryPath), `${JSON.stringify(recoveryOwner)}\n`, {
      encoding: 'utf8', flag: 'wx', mode: 0o600,
    });
    const current = await readOwner(lockPath);
    if (!current || !sameOwner(current, expected) || current.hostname !== hostname() || isProcessAlive(current.pid)) return false;

    const quarantine = `${lockPath}.stale-${expected.token}-${randomUUID()}`;
    try {
      await rename(lockPath, quarantine);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
      throw error;
    }
    await rm(quarantine, { recursive: true, force: false });
    return true;
  } finally {
    const currentRecoveryOwner = await readOwner(recoveryPath);
    if (sameOwner(currentRecoveryOwner, recoveryOwner)) await rm(recoveryPath, { recursive: true, force: false });
  }
}
