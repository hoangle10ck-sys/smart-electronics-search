# Phase 5C.1 — SoC importer operational hardening

## Scope and safety

This phase changes importer code, configuration templates, tests, and documentation only. It does not connect to Atlas, run the SoC importer, write Product/SyncRun data, cut over TechAPI storage, alter the official SQLite archive/manifest/staging data, or change MongoDB collections. Tests use ephemeral temporary directories and isolated fixture data. The opt-in local Mongo integration test is run only if the standalone local MongoDB service and the independent Phase 5B test-copy file are available.

The project `.env` file was not read or modified. `.env.example` was inspected through a redacted key-only check and credential-looking template values were replaced with placeholders. If any value previously present in that tracked template was a live credential, the project owner should revoke and rotate it with its provider; do not send secrets in chat.

## A. Operation-level lock

`runTechApiSocImport` now requires a lock in import mode and acquires it before reading source records or creating/updating SyncRun and Product records. It releases the lock in `finally`, including error and retry paths. The dedicated file lock stores PID, hostname, start time, resource identity, and random ownership token. Stale recovery is limited to same-host owner metadata whose PID is confirmed gone and whose exact token is rechecked under a recovery mutex. Unknown, malformed, live, or foreign-host lock owners cause a timeout and are not removed.

The lock is local filesystem coordination for processes on one host that share its lock directory. It is not a distributed lock and does not protect multiple servers or isolated container filesystems. Production topology remains unverified; a multi-host deployment must use a distributed lock before enabling concurrent importer jobs.

## B. Cross-process concurrency

Results will be recorded here after tests run:

| Check | Status | Evidence |
| --- | --- | --- |
| Process B is blocked while process A holds the SoC operation lock and does not start source reads | PASS | Node child-process test; B timed out before `SOURCE_STARTED` |
| Process B acquires after process A releases normally | PASS | Node child-process test; B completed the import after A exited |
| Live / foreign / malformed owners are not reclaimed | PASS | Unit tests preserve the owner directory and metadata |
| A killed same-host process is reclaimed only after PID absence is confirmed | PASS | Node child-process test kills A; B verifies the dead PID and completes |

## C. MongoDB source/destination separation

The global `assertLocalMongoUri` and `connectDB` behavior remain unchanged. The default `MONGODB_URI` destination is loopback-only. SoC remote Product/SyncRun writes are opt-in through `TECHAPI_MONGO_DESTINATION_URI`, `TECHAPI_MONGO_DESTINATION_DATABASE`, and exact `TECHAPI_MONGO_DESTINATION_ALLOWED_HOSTS`; they require `TECHAPI_STORAGE=sqlite`, database-path equality, and TLS. This prevents the remote writer URI from becoming the TechAPI source and keeps the SQLite archive read-only.

Remote configuration tests validate the gate without opening a network connection. Atlas is not contacted. No remote destination is configured or tested in this phase. The repository does not verify MongoDB account permissions remotely; deployment must provision a least-privilege destination identity separately.

`TECHAPI_SOURCE_READONLY_URI` is not interpreted as a destination. The SoC Mongo destination resolver ignores it. Remote source freshness comparison remains outside this phase.

## D. Product and SyncRun retry behavior

The existing Product `dedupeKey` policy and SyncRun upsert key (`source` + stable `sourceKey`) remain unchanged. No Product/SyncRun schema or index was changed. A failed Product or SyncRun write can be retried with the exact `--run-key` printed by the importer; Product records already committed are re-read and skipped. The operation lock prevents concurrent SoC imports on the same host when they share the configured lock directory. Without unique SyncRun indexes, multi-host concurrent writes remain unsafe.

## E. Credential hygiene

`.env.example` now uses placeholders for API-token fields and a loopback MongoDB example; the new lock and explicit destination variable names are present with empty values. `.env` remains ignored and untracked. No credential values are included in this report. A test checks the tracked template without printing values.

## F. Rollback dry-run

`compareTechApiSnapshots` compares catalog records by `sourceKey` and checkpoints by `fileKey`. It hashes canonical Extended JSON (BSON types preserved, object key order normalized, array order preserved), and reports added, changed, missing, and unchanged records. The return value includes a dry-run delta payload for additions/changes. Missing records are flagged with `missingIsDeletable: false`; the TechAPI repository has no delete operation. The comparator performs no database I/O and does not implement production reverse-sync.

## G. Changed files

- `backend/.env.example`
- `backend/TECHAPI_SQLITE_PHASE5C1_REPORT.md`
- `backend/TECHAPI_SQLITE_WRITERS.md`
- `backend/src/seed/importTechApiSocCatalog.ts`
- `backend/src/services/techApiCredentialHygiene.test.ts`
- `backend/src/services/techApiMongoDestination.ts`
- `backend/src/services/techApiMongoDestination.test.ts`
- `backend/src/services/techApiRollbackDryRun.ts`
- `backend/src/services/techApiRollbackDryRun.test.ts`
- `backend/src/services/techApiSocImport.ts`
- `backend/src/services/techApiSocImport.test.ts`
- `backend/src/services/techApiSocOperationLock.ts`
- `backend/src/services/techApiSocOperationLock.test.ts`
- `backend/tests/techApiSocMongo.integration.test.ts`

These are the Phase 5C.1 files touched in this turn; unrelated existing working-tree changes were preserved.

## H. Tests and build

| Command | Result |
| --- | --- |
| Focused Phase 5C.1 tests | PASS — 22 passed, 0 failed, 0 skipped |
| `npm test` | PASS — 242 passed, 0 failed, 1 skipped |
| `npm run test:techapi:soc-mongo` with the independent Phase 5B test copy and local standalone MongoDB | PASS — 2 passed, 0 failed, 0 skipped |
| `npm run build` | PASS |
| `npx tsc --noEmit` | PASS |
| `git diff --check` | PASS — no whitespace errors; Git emitted existing LF/CRLF normalization warnings for modified working-tree files |

The single skipped test in the full suite is the opt-in local Mongo integration; it was then run explicitly and passed. The local integration created and removed its uniquely named test database after checking its ownership marker. No remote MongoDB URI was used.

## I. Remaining blockers

- Production host/OS, process count, and persistent shared lock directory are not established by the repository.
- A multi-host deployment needs a distributed lock.
- Remote MongoDB destination access and least-privilege permissions are not tested here.
- A remote destination URI should only be supplied through a secret manager; do not use an Atlas credential in this phase.
- Reverse-sync is a dry-run comparator only. Missing records cannot be automatically deleted, and production reverse-sync is not implemented.

## J. Data modification confirmation

Atlas and the official SQLite archive/manifest/staging files were not modified. No production cutover or importer run occurred.
