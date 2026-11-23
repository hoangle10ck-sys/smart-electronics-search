import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, resolve } from 'node:path';

const OWNER_FILE = 'owner.json';
const DEFAULT_LOCK_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 200;

export type TechApiWriterLockOwner = {
  pid: number;
  hostname: string;
  startedAt: string;
  token: string;
  databasePath: string;
};

export type TechApiWriterLockOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
  isProcessAlive?: (pid: number) => boolean;
};

export function getTechApiWriterLockPath(databasePath: string): string {
  return `${resolve(databasePath)}.writer-lock`;
}

function ownerFile(lockPath: string): string {
  return `${lockPath}/${OWNER_FILE}`;
}

function readOwner(lockPath: string): Promise<TechApiWriterLockOwner | null> {
  return readFile(ownerFile(lockPath), 'utf8').then((contents) => {
    const parsed = JSON.parse(contents) as Partial<TechApiWriterLockOwner>;
    if (!Number.isSafeInteger(parsed.pid) || (parsed.pid ?? 0) < 1
      || typeof parsed.hostname !== 'string' || !parsed.hostname
      || typeof parsed.startedAt !== 'string' || !parsed.startedAt
      || typeof parsed.token !== 'string' || !parsed.token
      || typeof parsed.databasePath !== 'string' || !parsed.databasePath) return null;
    return parsed as TechApiWriterLockOwner;
  }).catch(() => null);
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    // EPERM and any unrecognized result are treated as alive: recovery must fail closed.
    return true;
  }
}

async function writeOwner(lockPath: string, owner: TechApiWriterLockOwner): Promise<void> {
  await writeFile(ownerFile(lockPath), `${JSON.stringify(owner)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
}

function sameOwner(left: TechApiWriterLockOwner | null, right: TechApiWriterLockOwner): boolean {
  return left?.token === right.token && left.pid === right.pid
    && left.hostname === right.hostname && left.databasePath === right.databasePath;
}

async function tryRecoverStaleLock(
  lockPath: string,
  expected: TechApiWriterLockOwner,
  isProcessAlive: (pid: number) => boolean,
): Promise<boolean> {
  if (expected.hostname !== hostname() || isProcessAlive(expected.pid)) return false;

  // The recovery directory is itself an atomic mutex. If a prior recovery died
  // while holding it, fail closed rather than guessing that it is safe to remove.
  const recoveryPath = `${lockPath}.recovery`;
  try {
    await mkdir(recoveryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
  const recoveryOwner: TechApiWriterLockOwner = {
    pid: process.pid,
    hostname: hostname(),
    startedAt: new Date().toISOString(),
    token: randomUUID(),
    databasePath: expected.databasePath,
  };

  try {
    await writeOwner(recoveryPath, recoveryOwner);
    const current = await readOwner(lockPath);
    if (!current || !sameOwner(current, expected) || current.hostname !== hostname() || isProcessAlive(current.pid)) return false;

    const quarantinePath = `${lockPath}.stale-${expected.token}-${randomUUID()}`;
    try {
      await rename(lockPath, quarantinePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
      throw error;
    }
    // Removal is permitted only after the same-host process was proven ended
    // and its lock directory was atomically moved out of the active lock name.
    await rm(quarantinePath, { recursive: true, force: false });
    return true;
  } finally {
    const owner = await readOwner(recoveryPath);
    if (sameOwner(owner, recoveryOwner)) await rm(recoveryPath, { recursive: true, force: false });
  }
}

export async function acquireTechApiWriterLock(
  databasePath: string,
  options: TechApiWriterLockOptions = {},
): Promise<() => Promise<void>> {
  const canonicalDatabasePath = resolve(databasePath);
  const lockPath = getTechApiWriterLockPath(canonicalDatabasePath);
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) throw new Error('TECHAPI_SQLITE_LOCK_TIMEOUT_MS must be a non-negative integer.');
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1) throw new Error('SQLite writer lock poll interval must be a positive integer.');

  const owner: TechApiWriterLockOwner = {
    pid: process.pid,
    hostname: hostname(),
    startedAt: new Date().toISOString(),
    token: randomUUID(),
    databasePath: canonicalDatabasePath,
  };
  const expiresAt = Date.now() + timeoutMs;

  while (true) {
    try {
      await mkdir(lockPath);
      try {
        await writeOwner(lockPath, owner);
      } catch (error) {
        // This process created the directory and can prove ownership even if
        // writing its metadata failed before the lock could be returned.
        await rm(lockPath, { recursive: true, force: true });
        throw error;
      }
      return async () => {
        const current = await readOwner(lockPath);
        if (!sameOwner(current, owner)) {
          throw new Error(`Refusing to release a TechAPI SQLite writer lock not owned by this process (${basename(lockPath)}).`);
        }
        await rm(lockPath, { recursive: true, force: false });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }

    const current = await readOwner(lockPath);
    if (current && await tryRecoverStaleLock(lockPath, current, isProcessAlive)) continue;
    if (Date.now() >= expiresAt) {
      const detail = current
        ? `owner pid ${current.pid} on ${current.hostname}`
        : 'owner metadata is missing or invalid';
      throw new Error(`Timed out waiting for TechAPI SQLite writer lock; ${detail}. Lock left untouched at ${lockPath}.`);
    }
    await new Promise((resolveTimer) => setTimeout(resolveTimer, Math.min(pollIntervalMs, Math.max(1, expiresAt - Date.now()))));
  }
}
