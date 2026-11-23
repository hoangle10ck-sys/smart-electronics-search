# Phase 5B — Controlled TechAPI SQLite Writers Report

Date: 2026-11-14

## Result

**PASS for controlled SQLite writer implementation and isolated archive-copy validation. NO-GO for production cutover.** MongoDB remains the default TechAPI storage and continues to own `Product`, `Offer`, and `SyncRun` data.

| Area | Status | Evidence |
| --- | --- | --- |
| Storage/access configuration | PASS | Mongo default; SQLite access defaults to `readonly`; invalid modes are rejected |
| HTTP runtime access | PASS | Runtime repository factory always opens SQLite read-only, even if a process has `TECHAPI_SQLITE_ACCESS=readwrite` |
| Controlled SQLite writer | PASS | Explicit importer factory requires SQLite plus `TECHAPI_SQLITE_ACCESS=readwrite`; no Mongo fallback on bad SQLite configuration |
| Single-writer safety | PASS | Ownership-token lock, a competing independent Node process, timeout, same-host dead-process recovery, and fail-closed foreign/malformed lock tests |
| Importer selection matrix | PASS, config-level | Environment tests cover index, full dataset, enrichment preview/write, SoC read-only source, and report read-only source |
| SQLite test-copy write semantics | PASS | Index upsert, enrichment preservation, full dataset/checkpoint transaction, hash mismatch, missing catalog row, rollback/retry, unique/NOT NULL, BSON values, close/reopen |
| Backup and restore | PASS | SQLite Backup API restore matched counts, schema fingerprint, catalog/checkpoint payload checksums, and `integrity_check` |
| Local Mongo `SyncRun`/`Product` integration | NOT RUN | No MongoDB process was connected by this phase; targets are described in code/docs and guarded to loopback |
| Live TechAPI importer requests | NOT RUN | No importer command was run; no TechAPI HTTP requests were made |
| Atlas / production cutover | NOT RUN | No Atlas connection, production write, cutover, or collection removal was performed |
| Historical migration/audit scripts | OPEN | Dedicated Phase 3 migration and Phase 4 verification tools retain low-level Mongo collection access for source snapshots/test fixtures; they are not used by the five current importer/runtime paths listed below |

## Configuration and writer controls

- `TECHAPI_STORAGE` remains `mongo` by default; accepted values are `mongo` and `sqlite`.
- For SQLite, `TECHAPI_ARCHIVE_DIR` must be an absolute, readable directory outside the repository and contain an existing `techapi_catalog.sqlite`.
- `TECHAPI_SQLITE_ACCESS` accepts `readonly` or `readwrite`, defaulting to `readonly`.
- The HTTP/runtime factory ignores write permission as an authority and always opens SQLite read-only.
- Importer write requests fail clearly unless SQLite and `readwrite` are explicitly selected. An invalid archive or permission failure stops the importer; it does not select Mongo instead.
- A controlled writer requires an existing supported schema and opens the file with `fileMustExist`; it cannot initialize a blank archive.
- `TECHAPI_SQLITE_LOCK_TIMEOUT_MS` defaults to 30,000 ms.

The lock directory is named `<canonical archive path>.writer-lock`. Its owner record includes process ID, hostname, start time, random token, and database path. A live, foreign-host, malformed, or ambiguous lock is never removed. Stale recovery uses a separate atomic recovery mutex, verifies the same owner token again, and only removes a same-host lock after the owner process is proven absent. Normal close releases only the current process's matching token, after closing SQLite.

## Importer behavior

| Command | TechAPI repository | Other database use |
| --- | --- | --- |
| `import:techapi:index` | Repository writer when selected; SQLite requires explicit `readwrite` | Local Mongo `SyncRun`; source fetches are unchanged |
| `import:techapi:full` | Repository writer when selected; catalog and checkpoint remain one SQLite transaction | Local Mongo `SyncRun`; source JSON is read locally |
| `enrich:techapi:details` | Preview is read-only; `--write` requests the selected writer | Local Mongo connection retained; TechAPI detail requests were not run |
| `catalog:import:techapi-soc` | Read-only TechAPI source selected by `TECHAPI_STORAGE` | Product and SyncRun writes remain Mongo; URI is checked as loopback first |
| `report:techapi:index` | Read-only TechAPI source selected by `TECHAPI_STORAGE` | Mongo catalog counts/SyncRun remain unchanged; URI is checked as loopback first |

`importTechApiCatalogIndex.ts`, `importTechApiFullDataset.ts`, and `enrichTechApiCatalogDetails.ts` no longer write through the runtime singleton. `importTechApiSocCatalog.ts` and `reportTechApiCatalogIndex.ts` use the lazy runtime repository, which is read-only for SQLite. Reports identify the selected TechAPI storage and Mongo destinations.

### Direct collection access audit note

The five command paths above use the repository abstraction for TechAPI catalog/checkpoint access. Specialized historical utilities `migrateTechApiMongoToSqlite.ts` and `validateTechApiSqlitePhase4.ts` still use Mongo collection cursors/queries directly for migration-source comparison and isolated validation fixture work. They were not executed or rewritten in this phase to avoid changing completed migration tooling; if “all accesses” is intended to include these offline utilities too, centralizing those calls is still required before retiring the Mongo source collections.

## Files changed for Phase 5B

- `backend/src/repositories/techApiRepositoryFactory.ts` — access mode parsing, runtime read-only behavior, importer-only writer factory, archive checks, and lazy runtime repository.
- `backend/src/repositories/sqliteTechApiRepository.ts` — existing-schema writer mode and lock release on close/error.
- `backend/src/repositories/sqliteTechApiWriterLock.ts` — atomic single-writer lock and safe stale-owner recovery.
- `backend/src/seed/importTechApiCatalogIndex.ts`, `importTechApiFullDataset.ts`, `enrichTechApiCatalogDetails.ts`, `importTechApiSocCatalog.ts`, `reportTechApiCatalogIndex.ts` — explicit repository roles and storage reporting; SoC/report validate local Mongo targets.
- `backend/src/seed/validateTechApiSqlitePhase5B.ts` — Backup API copy, isolated writer checks, and restore verification.
- `backend/src/services/sqliteTechApiRepository.test.ts`, `sqliteTechApiWriterLock.test.ts`, `techApiSqliteAccess.test.ts` — repository, lock, and process-environment tests.
- `backend/package.json`, `backend/.env.example`, `backend/TECHAPI_SQLITE_WRITERS.md` — command, safe variable names/defaults, and operations guidance.
- No Product or Offer schema, frontend, `.env`, archive manifest, or official archive file was edited.

## Checks run

- Baseline before Phase 5B: `npm test` **PASS 211/211**; `npm run build` **PASS**.
- Final `npm test`: **PASS 220/220**, zero failures, skips, or cancellations.
- Final `npm run build`: **PASS**.
- Final `npx tsc --noEmit`: **PASS**.
- Final `git diff --check`: **PASS** (Git emitted existing LF/CRLF conversion warnings for modified working-tree files).
- `npm run validate:techapi:sqlite-phase5b`: **PASS** on the local SQLite copy; rerun preserved catalog/checkpoint counts, confirming idempotent test writes.
- No lint script is configured for the backend.
- Filesystem write-denial behavior was not simulated by changing Windows ACLs; missing path and invalid-schema failures were tested without modifying protected data.

The first isolated validation attempt found a duplicate test-only `(sourceCategory, sourceSlug)` pair in the rollback fixture before reaching its intended NOT NULL failure. The fixture identity was corrected, and the validation then passed twice. That attempt changed only the isolated test copy; the official archive checksum was unchanged.

## Test-copy and backup evidence

Official archive:

- Path: `D:\SmartElectronicsData\techapi_catalog.sqlite`
- SHA-256 before and after validation: `0710c2e9a993dd740c8917a8735d0c2690bf6b33e56c248e5eabec5040c45314`
- Size before and after validation: `679530496` bytes
- Baseline source counts: 131,064 catalog records and 104,666 checkpoints
- The official archive was opened read-only by the validation script.

Dedicated copy and restore:

- Test copy: `D:\SmartElectronicsData\techapi_catalog.phase5b-test.sqlite`
- Latest backup restore: `D:\SmartElectronicsData\techapi_catalog.phase5b-restore-2026-11-14T13-53-57-094Z-5b8f3f21.sqlite`
- Counts before and after the final repeat run: 131,067 catalog records and 104,668 checkpoints
- Restored counts: 131,067 catalog records and 104,668 checkpoints
- Catalog payload SHA-256: `4acb65d39a69d54bcbb0c14f25236f1844c69e16add3e258504ff3114529b70a`
- Checkpoint payload SHA-256: `24c8359905f8ee2961446f740e5dcf64b0ca19dd2c7d4b3a095cccffcd54514c`
- Schema fingerprint: `3254b3232721727579776f76ea9ac6752a6783691f8f64625493b62942150b6b`
- Both database files passed `PRAGMA integrity_check`; the writer lock was released.

The extra three catalog rows and two checkpoint rows in the copy are reserved `phase5b-test:controlled-writer:*` fixtures. The copy and restore files were retained; no backup was deleted or overwritten.

The Phase 5B test script uses SQLite's Backup API only. It does not load `.env`, connect to MongoDB/Atlas, contact TechAPI, invoke a live importer, or create Product/Offer data.

## Rollback plan (design only; not executed)

1. Stop importer writers and confirm no active writer lock.
2. Compare the selected SQLite snapshot with the last Mongo snapshot using `sourceKey` and `fileKey`; inventory new, changed, missing, and checkpoint records.
3. Resolve conflicts and verify record payloads/checkpoint hashes before preparing reverse-sync.
4. Apply reverse-sync only to an isolated local Mongo restore database, then compare counts, identities, and payload checksums.
5. Approve a separate storage switch only after parity is verified. Product/Offer are outside this TechAPI reverse-sync.

No rollback, production cutover, Atlas access, importer run, or collection deletion was performed.

## Remaining limitations

- This proves safe SQLite writes against the backup copy, not writer behavior on a production host, shared/network disk, or concurrent multi-host deployment.
- Mongo `SyncRun`/`Product` destinations were not integration-tested because no MongoDB connection was opened. Verify them later against an explicitly selected local test database with credentials supplied through process environment, not chat or reports.
- Live TechAPI request behavior was not exercised in this phase.
- The offline migration/Phase 4 utilities noted above still need repository centralization if required by the eventual archive-retirement checklist.
- Mongo remains the default and Atlas collections must not be removed based on this Phase 5B result. Production readiness remains NO-GO pending Phase 5A blockers and deployment validation.

## Phase 5B.1 follow-up

The Mongo `Product`/`SyncRun` destination and retry gap listed above was subsequently exercised against an isolated local Mongo database using the independent SQLite test copy. See [`TECHAPI_SQLITE_PHASE5B1_REPORT.md`](TECHAPI_SQLITE_PHASE5B1_REPORT.md) for the integration outcomes, direct-collection inventory, and updated retirement blockers. This follow-up did not change the storage default or perform a production cutover.
