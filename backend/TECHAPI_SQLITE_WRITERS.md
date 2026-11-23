# TechAPI SQLite access and writer operations

## Storage and access rules

- `TECHAPI_STORAGE` selects `mongo` or `sqlite`; the default remains `mongo`.
- `TECHAPI_ARCHIVE_DIR` is required for SQLite and must be an absolute directory outside this Git repository. The archive filename is `techapi_catalog.sqlite`.
- `TECHAPI_SQLITE_ACCESS` accepts `readonly` or `readwrite`; SQLite defaults to `readonly`.
- The HTTP backend always opens the SQLite repository read-only. Setting `TECHAPI_SQLITE_ACCESS=readwrite` in a web-server environment does not grant HTTP handlers write access.
- Only importer processes that explicitly request TechAPI writes honor `readwrite`. They fail before crawling/fetching if SQLite is selected without explicit write access. Invalid SQLite configuration never falls back to MongoDB.
- `TECHAPI_SQLITE_LOCK_TIMEOUT_MS` controls how long an importer waits for the single-writer lock. The default is 30 seconds.

The SQLite writer accepts only an existing archive with the supported schema and checks read/write access before taking a lock. It does not create or initialize a missing archive. Keep the archive on a local filesystem; concurrent writes over network drives are not supported by this policy.

## Importer data destinations

| Command | TechAPI catalog/checkpoints | Other persisted data |
| --- | --- | --- |
| `npm run import:techapi:index` | Selected storage; SQLite writes require explicit `readwrite` | `SyncRun` remains in local MongoDB; source requests go to TechAPI |
| `npm run import:techapi:full` | Selected storage; SQLite writes require explicit `readwrite` | `SyncRun` remains in local MongoDB; JSON source files are read locally |
| `npm run enrich:techapi:details` | Read-only preview by default; `--write` selects the configured writer | `SyncRun` remains in local MongoDB; detail requests go to TechAPI |
| `npm run catalog:import:techapi-soc` | Read-only source selected by `TECHAPI_STORAGE` | `Product` and `SyncRun` remain in local MongoDB |
| `npm run report:techapi:index` | Read-only source selected by `TECHAPI_STORAGE` | Product counts and `SyncRun` remain in local MongoDB; report JSON is written under `docs/` |

The importer commands that use the default `MONGODB_URI` validate it with the repository's loopback-only guard before connecting. `TECHAPI_SQLITE_ACCESS` does not control Product, Offer, or `SyncRun` writes. The SoC importer has a separate, explicit remote destination profile described below; it does not relax `assertLocalMongoUri` or `connectDB`.

For `catalog:import:techapi-soc`, the TechAPI source repository is read-only. With `TECHAPI_STORAGE=sqlite`, source records come from the existing SQLite archive while published `Product` and `SyncRun` records go to the configured Mongo destination. A normal run receives a unique `SyncRun.sourceKey`; if a run fails after a Product commit, rerun with the exact `--run-key` printed in the error output to reconcile the same run. Product identity and its existing unique `dedupeKey` make sequential retries idempotent. This workflow does not write `techapicatalogrecords` or `techapiimportcheckpoints` when SQLite is selected.

### SoC operation lock and destination profile

Every import-mode SoC service call requires an operation lock before it reads source records or writes `SyncRun`/`Product`. The default lock directory is under the operating system temp directory; configure `TECHAPI_SOC_IMPORT_LOCK_DIR` to an absolute shared local directory if importer processes run under different users. `TECHAPI_SOC_IMPORT_LOCK_TIMEOUT_MS` defaults to 30 seconds. The lock covers the database name and uses atomic directory creation, an owner token, PID, hostname, and conservative same-host stale-owner recovery. Unreadable, malformed, foreign-host, or otherwise unverified locks are left untouched.

This filesystem lock protects processes on one host that share the same lock directory and filesystem. It does not coordinate multiple hosts, containers with private temp volumes, or network filesystems. A multi-host production topology requires an external distributed lock before allowing concurrent SoC imports. The current repo does not establish whether production has one or multiple hosts.

By default, the SoC Product/SyncRun destination uses `MONGODB_URI` and remains loopback-only. An explicit remote destination is rejected unless all of these are set in the importer process:

- `TECHAPI_STORAGE=sqlite` so catalog source and Product/SyncRun destination are separate.
- `TECHAPI_MONGO_DESTINATION_URI` whose database path exactly matches `TECHAPI_MONGO_DESTINATION_DATABASE`.
- `TECHAPI_MONGO_DESTINATION_ALLOWED_HOSTS` with exact comma-separated hostnames and no wildcards.
- TLS: `mongodb+srv` with TLS enabled by default, or `mongodb://` with `tls=true`/`ssl=true`.

Only the SoC importer consumes this destination profile. It opens a separate Mongoose connection and binds only the existing `products` and `syncruns` collections. The application-wide `MONGODB_URI` and `connectDB` remain localhost-only. Do not set the remote writer credential in the web backend. Use a least-privilege MongoDB user limited to the target database and collections, and supply secrets through the deployment secret manager. This Phase 5C.1 change validates configuration only; no remote connection or write was attempted.

`TECHAPI_SOURCE_READONLY_URI` is not used as a Product/SyncRun destination. With SQLite source mode, the TechAPI archive is opened read-only. A configured source URI alone never enables a remote destination.

To run the local lock/config/rollback tests without dotenv loading a workspace `.env` file:

```powershell
$env:DOTENV_CONFIG_PATH = Join-Path $env:TEMP ('phase5c1-no-dotenv-' + [Guid]::NewGuid().ToString('N'))
try {
  npm test
} finally {
  Remove-Item Env:DOTENV_CONFIG_PATH -ErrorAction SilentlyContinue
}
```

The required Phase 5B.1 local Mongo integration test is described above. It reads only the independent SQLite test copy and uses a uniquely owned `127.0.0.1` database; it does not read `.env`, connect to Atlas, or use the remote destination profile.

### Phase 5B.1 local Mongo integration test

The opt-in integration test reads only an independent archive copy and connects to a standalone MongoDB service at `127.0.0.1`. It creates a uniquely named test database, verifies an ownership marker before cleanup, and asserts the database has been dropped. It refuses the official archive path and requires a test-copy filename.

```powershell
$env:PHASE5B1_LOCAL_MONGO_INTEGRATION = '1'
$env:PHASE5B1_SQLITE_ARCHIVE_COPY = 'D:\SmartElectronicsData\techapi_catalog.phase5b-test.sqlite'
$env:DOTENV_CONFIG_PATH = Join-Path $env:TEMP ('phase5b1-no-dotenv-' + [Guid]::NewGuid().ToString('N'))
try {
  npm run test:techapi:soc-mongo
  if ($LASTEXITCODE -ne 0) { throw 'Phase 5B.1 integration test failed.' }
} finally {
  Remove-Item Env:PHASE5B1_LOCAL_MONGO_INTEGRATION -ErrorAction SilentlyContinue
  Remove-Item Env:PHASE5B1_SQLITE_ARCHIVE_COPY -ErrorAction SilentlyContinue
  Remove-Item Env:DOTENV_CONFIG_PATH -ErrorAction SilentlyContinue
}
```

The regular `npm test` suite leaves this integration test skipped unless the explicit opt-in flag and test-copy path are provided. The test also probes an unreachable loopback port and a missing SQLite file; it does not load application credentials or contact TechAPI/Atlas.

## Windows setup for a dedicated importer process

Configure environment variables only in the importer process. Do not put the writer access flag in a long-running backend service environment.

```powershell
$env:TECHAPI_STORAGE = 'sqlite'
$env:TECHAPI_ARCHIVE_DIR = 'D:\SmartElectronicsData'
$env:TECHAPI_SQLITE_ACCESS = 'readwrite'
$env:TECHAPI_SQLITE_LOCK_TIMEOUT_MS = '30000'
# MONGODB_URI must point to a local database for SyncRun/report data.
```

After checking the selected archive and local MongoDB target, run only the importer that is intended. The index and detail-enrichment commands call the TechAPI service; do not use them as part of the isolated Phase 5B verification.

For ordinary backend runtime, leave `TECHAPI_SQLITE_ACCESS` unset or set it to `readonly`. For direct host startup, set the same archive variables in the backend process environment; the backend remains read-only. MongoDB remains the default when `TECHAPI_STORAGE` is unset.

## Single-writer lock

Each SQLite write process atomically creates `<archive>.writer-lock/owner.json`, containing the process ID, host, start time, random ownership token, and canonical archive path. A second writer waits up to the configured timeout and then exits with the current owner details. It does not delete a live, foreign-host, malformed, or unverified lock.

Stale recovery is restricted to a lock whose owner metadata is valid, whose hostname is the current host, and whose process ID is proven absent. Recovery obtains a separate atomic recovery mutex, rechecks the exact owner token, renames that lock directory to a unique quarantine name, then removes only the quarantined stale directory. If the recovery mutex or ownership proof is ambiguous, the process times out and leaves the lock untouched. On normal shutdown, the current owner releases only the lock with its own token after SQLite closes.

## Verification and backup/restore

`npm run validate:techapi:sqlite-phase5b` uses SQLite's Backup API to create `D:\SmartElectronicsData\techapi_catalog.phase5b-test.sqlite` from the official archive if that test copy does not already exist. It never overwrites an existing test or restore file. The validation writes only reserved `phase5b-test:*` fixtures in that copy, checks resume/upsert/rollback behavior, restores to a new uniquely named test file, and compares counts, schema, payload hashes, and `integrity_check`.

The validation does not load `.env`, connect to MongoDB or Atlas, contact TechAPI, run an importer, or change the official archive. Existing test and restore copies are retained. If the expected test copy already exists, the script will inspect and reuse it; it refuses to replace it.

To make an independent backup manually, use SQLite's online backup mechanism while opening the source read-only. Do not use a plain file copy while SQLite/WAL may be active. Record the backup path and checksum, run `PRAGMA integrity_check`, compare schema and payload checksums, and perform a restore into a new path before relying on a backup.

## Rollback design (not executed)

1. Stop all importer writers and verify no writer lock is active.
2. Identify the exact archive snapshot and collect catalog/checkpoint deltas by `sourceKey` and `fileKey`, including changed payloads and records missing from either snapshot. Compare canonical Extended JSON while preserving BSON types and array order; compare SHA-256 hashes for payloads and checkpoint contents.
3. Compare each delta against the Mongo source snapshot and review conflicting updates; do not overwrite Product or Offer data as part of this process.
4. Prepare a reverse-sync into an isolated local MongoDB restore database, then compare counts, identities, checkpoint hashes, and payload checksums.
5. The pure comparator `compareTechApiSnapshots` returns a dry-run delta, including canonical Extended JSON for added/changed records and a non-deletable marker for missing records. It performs no database connection or write. The current repository has no TechAPI delete operation, so missing records are reported for review and are never automatically deleted.
6. Only after that isolated comparison is approved can a separately authorized migration plan switch TechAPI storage back to MongoDB.

This is a design only. No production cutover or rollback was performed.
