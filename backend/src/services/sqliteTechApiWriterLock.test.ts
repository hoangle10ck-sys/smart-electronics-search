import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { hostname, tmpdir } from 'node:os';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { acquireTechApiWriterLock, getTechApiWriterLockPath } from '../repositories/sqliteTechApiWriterLock';

async function pathExists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

async function temporaryPath(t: import('node:test').TestContext): Promise<{ directory: string; databasePath: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'techapi-writer-lock-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, databasePath: join(directory, 'archive.sqlite') };
}

test('writer lock serializes two writers and leaves a live owner lock untouched on timeout', async (t) => {
  const { databasePath } = await temporaryPath(t);
  const releaseFirst = await acquireTechApiWriterLock(databasePath, { timeoutMs: 100, pollIntervalMs: 5 });
  try {
    await assert.rejects(
      acquireTechApiWriterLock(databasePath, { timeoutMs: 30, pollIntervalMs: 5 }),
      /Timed out waiting.*owner pid/,
    );
    assert.equal(await pathExists(join(getTechApiWriterLockPath(databasePath), 'owner.json')), true);
  } finally {
    await releaseFirst();
  }
  assert.equal(await pathExists(getTechApiWriterLockPath(databasePath)), false);
});

test('an independent Node process cannot acquire a writer lock held by another process', async (t) => {
  const { databasePath } = await temporaryPath(t);
  const release = await acquireTechApiWriterLock(databasePath, { timeoutMs: 100, pollIntervalMs: 5 });
  try {
    const script = [
      "const { acquireTechApiWriterLock } = require('./src/repositories/sqliteTechApiWriterLock');",
      "acquireTechApiWriterLock(process.argv[1], { timeoutMs: 35, pollIntervalMs: 5 }).then(() => { process.exitCode = 4; }).catch((error) => {",
      "  process.stdout.write(error.message.includes('Timed out waiting') ? 'LOCK_BUSY' : 'UNEXPECTED_ERROR');",
      '  process.exitCode = 0;',
      '});',
    ].join('\n');
    const child = spawnSync(process.execPath, ['-r', 'tsx/cjs', '-e', script, databasePath], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 5_000,
    });
    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, 'LOCK_BUSY');
  } finally {
    await release();
  }
});

test('stale lock recovery removes only a same-host lock whose owner is proven ended', async (t) => {
  const { directory, databasePath } = await temporaryPath(t);
  const lockPath = getTechApiWriterLockPath(databasePath);
  const deadOwner = {
    pid: 2_000_000_001,
    hostname: hostname(),
    startedAt: new Date(0).toISOString(),
    token: 'stale-test-owner',
    databasePath: resolve(databasePath),
  };
  await mkdir(lockPath);
  await writeFile(join(lockPath, 'owner.json'), JSON.stringify(deadOwner));
  const release = await acquireTechApiWriterLock(databasePath, {
    timeoutMs: 500,
    pollIntervalMs: 5,
    isProcessAlive: () => false,
  });
  try {
    assert.equal(await pathExists(lockPath), true);
    assert.equal((await readdir(directory)).some((name) => name.includes('.stale-')), false);
  } finally {
    await release();
  }
});

test('foreign-host and malformed lock owners fail closed and are not removed', async (t) => {
  const { databasePath } = await temporaryPath(t);
  const lockPath = getTechApiWriterLockPath(databasePath);
  const foreignOwner = {
    pid: 2_000_000_002,
    hostname: 'different-host',
    startedAt: new Date(0).toISOString(),
    token: 'foreign-test-owner',
    databasePath: resolve(databasePath),
  };
  await mkdir(lockPath);
  await writeFile(join(lockPath, 'owner.json'), JSON.stringify(foreignOwner));
  await assert.rejects(
    acquireTechApiWriterLock(databasePath, { timeoutMs: 20, pollIntervalMs: 5, isProcessAlive: () => false }),
    /Timed out waiting.*owner pid/,
  );
  assert.deepEqual(JSON.parse(await readFile(join(lockPath, 'owner.json'), 'utf8')), foreignOwner);
});

test('malformed owner metadata is never guessed stale or deleted', async (t) => {
  const { databasePath } = await temporaryPath(t);
  const lockPath = getTechApiWriterLockPath(databasePath);
  await mkdir(lockPath);
  await writeFile(join(lockPath, 'owner.json'), '{malformed');
  await assert.rejects(
    acquireTechApiWriterLock(databasePath, { timeoutMs: 20, pollIntervalMs: 5 }),
    /owner metadata is missing or invalid/,
  );
  assert.equal(await readFile(join(lockPath, 'owner.json'), 'utf8'), '{malformed');
});

test('lock release refuses to remove a lock whose ownership token changed', async (t) => {
  const { databasePath } = await temporaryPath(t);
  const lockPath = getTechApiWriterLockPath(databasePath);
  const release = await acquireTechApiWriterLock(databasePath);
  const ownerPath = join(lockPath, 'owner.json');
  const original = JSON.parse(await readFile(ownerPath, 'utf8')) as Record<string, unknown>;
  await writeFile(ownerPath, JSON.stringify({ ...original, token: 'other-owner' }));
  await assert.rejects(release(), /Refusing to release.*not owned/);
  await writeFile(ownerPath, JSON.stringify(original));
  await release();
});
