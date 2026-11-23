import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createTechApiSocOperationLock,
  getTechApiSocOperationLockPath,
} from './techApiSocOperationLock';

test('one SoC operation lock excludes a second operation until the owner releases it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'phase5c1-lock-unit-'));
  const first = createTechApiSocOperationLock('phase5c1-local-test', directory, { timeoutMs: 0 });
  const second = createTechApiSocOperationLock('phase5c1-local-test', directory, { timeoutMs: 0 });
  const release = await first.acquire();
  try {
    await assert.rejects(second.acquire(), /Timed out waiting/);
  } finally {
    await release();
  }
  const releaseSecond = await second.acquire();
  await releaseSecond();
  await rm(directory, { recursive: true, force: true });
});

test('stale recovery requires a verified dead same-host PID and exact owner token', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'phase5c1-lock-stale-'));
  const databaseName = 'phase5c1-stale-local-test';
  const lockPath = getTechApiSocOperationLockPath(directory, databaseName);
  await mkdir(lockPath);
  const staleOwner = {
    pid: 2147483647,
    hostname: hostname(),
    startedAt: new Date(0).toISOString(),
    token: 'stale-owner-test-token',
    resourceKey: lockPath.split('techapi-soc-').at(-1)?.replace(/\.lock$/, ''),
  };
  await writeFile(join(lockPath, 'owner.json'), JSON.stringify(staleOwner));
  const recoveryLock = createTechApiSocOperationLock(databaseName, directory, {
    timeoutMs: 500,
    pollIntervalMs: 5,
    isProcessAlive: () => false,
  });
  const release = await recoveryLock.acquire();
  try {
    const current = JSON.parse(await readFile(join(lockPath, 'owner.json'), 'utf8')) as { token: string; pid: number };
    assert.notEqual(current.token, staleOwner.token);
    assert.equal(current.pid, process.pid);
  } finally {
    await release();
    await rm(directory, { recursive: true, force: true });
  }
});

test('foreign-host and unverifiable locks are left untouched', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'phase5c1-lock-foreign-'));
  const databaseName = 'phase5c1-foreign-local-test';
  const lockPath = getTechApiSocOperationLockPath(directory, databaseName);
  await mkdir(lockPath);
  const owner = {
    pid: 2147483647,
    hostname: 'unverified-remote-host',
    startedAt: new Date(0).toISOString(),
    token: 'foreign-owner-test-token',
    resourceKey: lockPath.split('techapi-soc-').at(-1)?.replace(/\.lock$/, ''),
  };
  const ownerPath = join(lockPath, 'owner.json');
  await writeFile(ownerPath, JSON.stringify(owner));
  try {
    await assert.rejects(createTechApiSocOperationLock(databaseName, directory, {
      timeoutMs: 0,
      isProcessAlive: () => false,
    }).acquire(), /lock was left untouched/);
    assert.deepEqual(JSON.parse(await readFile(ownerPath, 'utf8')), owner);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('independent Node processes serialize SoC import and the next process proceeds after release', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'phase5c1-lock-processes-'));
  const databaseName = 'phase5c1-cross-process';
  const children: ChildHandle[] = [];
  t.after(async () => {
    for (const handle of children) if (handle.child.exitCode === null) handle.child.kill();
    await Promise.all(children.map((handle) => waitForClose(handle).catch(() => undefined)));
    await rm(directory, { recursive: true, force: true });
  });

  const owner = startImportProcess(directory, databaseName, 'hold', 5_000);
  children.push(owner);
  await waitForOutput(owner, 'SOURCE_STARTED');

  const blocked = startImportProcess(directory, databaseName, 'quick', 180);
  children.push(blocked);
  const blockedExit = await waitForClose(blocked);
  assert.notEqual(blockedExit.code, 0);
  assert.match(blocked.output, /no source or destination records were processed/);
  assert.match(blocked.output, /phase5c1:cross-process/);
  assert.equal(blocked.output.includes('SOURCE_STARTED'), false, 'the blocked process never begins reading/importing records');

  owner.child.stdin.end('\n');
  const ownerExit = await waitForClose(owner);
  assert.equal(ownerExit.code, 0, owner.output);
  assert.match(owner.output, /IMPORT_DONE/);

  const next = startImportProcess(directory, databaseName, 'quick', 2_000);
  children.push(next);
  const nextExit = await waitForClose(next);
  assert.equal(nextExit.code, 0, next.output);
  assert.match(next.output, /SOURCE_STARTED/);
  assert.match(next.output, /IMPORT_DONE/);
});

test('a crashed owner is reclaimed only after its local process is confirmed gone', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'phase5c1-lock-crash-'));
  const databaseName = 'phase5c1-crash-recovery';
  let owner: ChildHandle | undefined;
  let contender: ChildHandle | undefined;
  t.after(async () => {
    if (owner?.child.exitCode === null) owner.child.kill();
    if (contender?.child.exitCode === null) contender.child.kill();
    await Promise.all([owner, contender].filter(Boolean).map((handle) => waitForClose(handle!).catch(() => undefined)));
    await rm(directory, { recursive: true, force: true });
  });

  owner = startImportProcess(directory, databaseName, 'hold', 5_000);
  await waitForOutput(owner, 'SOURCE_STARTED');
  owner.child.kill();
  const crashedExit = await waitForClose(owner);
  assert.notEqual(crashedExit.code, 0);

  contender = startImportProcess(directory, databaseName, 'quick', 3_000);
  const recoveredExit = await waitForClose(contender);
  assert.equal(recoveredExit.code, 0, contender.output);
  assert.match(contender.output, /SOURCE_STARTED/);
  assert.match(contender.output, /IMPORT_DONE/);
});

type ChildHandle = {
  child: ChildProcessWithoutNullStreams;
  output: string;
  waiters: Array<{ text: string; resolve: () => void; reject: (error: Error) => void }>;
  closePromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
};

function startImportProcess(lockDirectory: string, databaseName: string, mode: 'hold' | 'quick', timeoutMs: number): ChildHandle {
  const source = [
    "const { runTechApiSocImport } = require('./src/services/techApiSocImport');",
    "const { createTechApiSocOperationLock } = require('./src/services/techApiSocOperationLock');",
    'const mode = process.env.PHASE5C1_CHILD_MODE;',
    'const lock = createTechApiSocOperationLock(process.env.PHASE5C1_CHILD_DATABASE, process.env.PHASE5C1_CHILD_LOCK_DIR, { timeoutMs: Number(process.env.PHASE5C1_CHILD_TIMEOUT) });',
    'const sourceRepository = { findVerifiedSocRecords: async () => { console.log("SOURCE_STARTED"); if (mode === "hold") await new Promise(resolve => process.stdin.once("data", resolve)); return []; } };',
    'const productStore = { findPublishedVerified: async () => [], existsByIdentity: async () => false, create: async () => undefined, countPublishedVerified: async () => 0 };',
    'const syncRunStore = { upsert: async () => undefined };',
    'runTechApiSocImport({ sourceRepository, productStore, syncRunStore, sourceStorage: "sqlite", importMode: true, target: 1, syncRunSourceKey: "phase5c1:cross-process", operationLock: lock }).then(() => console.log("IMPORT_DONE")).catch(error => { console.log("IMPORT_ERROR:" + error.message + ":" + (error.syncRunSourceKey || "")); process.exitCode = 1; });',
  ].join('\n');
  const child = spawn(process.execPath, ['-r', 'tsx/cjs', '-e', source], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PHASE5C1_CHILD_MODE: mode,
      PHASE5C1_CHILD_DATABASE: databaseName,
      PHASE5C1_CHILD_LOCK_DIR: lockDirectory,
      PHASE5C1_CHILD_TIMEOUT: String(timeoutMs),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const handle: ChildHandle = { child, output: '', waiters: [], closePromise: Promise.resolve({ code: null, signal: null }) };
  child.stdout.on('data', (chunk: Buffer) => appendOutput(handle, chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => appendOutput(handle, chunk.toString('utf8')));
  handle.closePromise = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  if (mode === 'quick') child.stdin.end();
  return handle;
}

function appendOutput(handle: ChildHandle, chunk: string): void {
  handle.output += chunk;
  handle.waiters = handle.waiters.filter((waiter) => {
    if (!handle.output.includes(waiter.text)) return true;
    waiter.resolve();
    return false;
  });
}

async function waitForOutput(handle: ChildHandle, text: string): Promise<void> {
  if (handle.output.includes(text)) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for child output: ${text}`)), 10_000);
    handle.waiters.push({
      text,
      resolve: () => { clearTimeout(timer); resolve(); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    handle.closePromise.then(() => {
      if (!handle.output.includes(text)) reject(new Error(`Child exited before output: ${text}. Output: ${handle.output}`));
    }).catch(reject);
  });
}

function waitForClose(handle: ChildHandle) {
  return handle.closePromise;
}
