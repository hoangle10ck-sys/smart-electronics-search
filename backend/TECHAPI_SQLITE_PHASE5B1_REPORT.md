# Phase 5B.1 — Mongo Product/SyncRun Integration and Retirement Audit

Date: 2026-11-14
Scope: local/test only. No Atlas connection, production write, importer run against a shared database, `.env` access, or archive mutation.

## Executive status

| Area | Status | Evidence |
| --- | --- | --- |
| SQLite TechAPI source → Mongo Product | PASS | Opt-in integration test used verified records from the independent Phase 5B test copy and a real local standalone `mongod`. |
| Mongo SyncRun lifecycle | PASS | Running, partial, success, same-key retry, and failure after Product commit were verified in the isolated database. |
| Product idempotency across SyncRun keys | PASS | A second distinct run key did not create or update a Product. |
| Unverified/ineligible SoC exclusion | PASS | Unverified test copy was not persisted; repository eligibility checks also excluded rows without required recency/manufacturer evidence. |
| SQLite missing-file handling | PASS | Opening a new nonexistent test path in read-only mode failed without creating a database. |
| Mongo unavailable handling | PASS | A direct loopback connection to an unused local port failed within the configured timeout. |
| Runtime retirement from Mongo | BLOCKED | `TECHAPI_STORAGE` still defaults to `mongo`; no application deployment/cutover was requested or performed. |
| Retiring historical Mongo source collections | BLOCKED | Offline migration and validation tools still need the restore source collections if those tools are to be rerun. |

The official archive checksum was read after the tests and matches the prior Phase 5B report: `0710c2e9a993dd740c8917a8735d0c2690bf6b33e56c248e5eabec5040c45314` (679,530,496 bytes). The integration test used only `D:\SmartElectronicsData\techapi_catalog.phase5b-test.sqlite`, opened read-only; size and modification time matched before and after. The isolated Mongo database contained four Products and four SyncRuns at the end of assertions, then was dropped only after its unique ownership marker was verified. The test confirmed the database was absent after cleanup.

## A. Product/SyncRun implementation

`src/seed/importTechApiSocCatalog.ts` now delegates the import workflow to `src/services/techApiSocImport.ts`. The CLI obtains the TechAPI source through `getTechApiRuntimeRepository()` and uses the selected storage configuration only for source reads. `createMongooseSocImportStores()` is the explicit Mongo adapter for Product and SyncRun writes.

The data policy is unchanged for existing products: matching SoC Products are skipped and never overwritten. A Product is created with the existing schema, provenance fields, and unique `dedupeKey`; no Product, Offer, or SyncRun schema was changed. SyncRun uses an upsert keyed by `(source, sourceKey)` so an explicitly repeated run key reconciles the same attempt. Normal CLI starts get a new unique key, preserving run history. The failure output includes a retry command using the same run key.

Recovery behavior:

- A Product write failure after earlier Product writes marks the SyncRun `partial`. Retry re-reads Products, skips committed identities, and continues toward the target.
- If Product commit succeeds but the completion SyncRun write fails, Product remains committed and the run remains `running` (or reflects the last acknowledged progress update). Retrying with the same key does not duplicate Product and can complete the SyncRun.
- If insufficient eligible Products exist, the import returns `partial` with `missingAfterPlan`; it does not claim full completion.
- Source repository failure is recorded as `failed` when Mongo is available to store the SyncRun.

### Mixed-storage behavior

With `TECHAPI_STORAGE=sqlite`, the TechAPI source repository is opened read-only. Product and SyncRun destinations remain MongoDB. `TECHAPI_SQLITE_ACCESS` does not authorize writes to Product or SyncRun. The import service has no code path that writes `techapicatalogrecords` or `techapiimportcheckpoints`; the opt-in integration database contained neither collection.

`TECHAPI_STORAGE` still defaults to `mongo`. This work did not change the default or perform production cutover. Deployment must place the archive on the backend host and configure `TECHAPI_ARCHIVE_DIR` there; a local Windows file is not automatically available to another server.

## B. Integration and failure test results

### Real local integration run

Command: `npm run test:techapi:soc-mongo`, with explicit opt-in variables for the SQLite test copy. `DOTENV_CONFIG_PATH` was pointed at a nonexistent temporary path so the test did not load `.env`.

The test used a unique database name on `127.0.0.1:27017`, asserted that the server was standalone `mongod` (not `mongos` or a replica-set endpoint), claimed the initially empty database with a random ownership marker, and used the real Product and SyncRun schemas on that isolated connection.

| Scenario | Result |
| --- | --- |
| Verified SoC from SQLite test copy creates Product in Mongo | PASS |
| Source SQLite remains read-only; file size and mtime unchanged | PASS |
| Existing Product is not rewritten on same-key rerun | PASS |
| New/different SyncRun key does not create a duplicate Product | PASS |
| Unverified source copy is excluded | PASS |
| Partial Product failure, partial status, and retry | PASS |
| SyncRun completion failure after Product commit and retry | PASS |
| SQLite file missing/unavailable | PASS |
| MongoDB unavailable on loopback | PASS |
| No TechAPI catalog/checkpoint collection is created in the mixed-storage test database | PASS |
| Ownership-checked cleanup and database absence after cleanup | PASS |

Product and SyncRun failures were deterministic injected adapter failures around real Mongo stores; the Products that succeeded before failure were real records derived from the SQLite catalog copy. The unavailable-Mongo test was a real socket/server-selection failure against `127.0.0.1:1`. No failure was simulated by writing to production or restore data.

The dedicated Node test runner reported **2 PASS, 0 FAIL, 0 SKIP** (the parent integration case plus a nested archive-read-only/cleanup assertion).

### Backend regression/build checks

- Baseline before this phase: `npm test` **PASS 220/220**; `npm run build` **PASS**.
- Final `npm test`: **225 PASS, 0 FAIL, 1 SKIP**. The one intentional skip is the opt-in local Mongo integration test, which was run separately and passed.
- `npm run build`: **PASS** (`tsc`).
- Explicit strict typecheck of both changed test files: **PASS**.
- `git diff --check`: **PASS**. Git emitted the repository's existing LF/CRLF conversion warnings for changed working-tree files.
- No backend lint script is configured.

No frontend files or scripts were changed for Phase 5B.1.

## C. Direct TechAPI Mongo access inventory

| Code location | Access and role | Runtime/user impact | Retirement note |
| --- | --- | --- | --- |
| `src/repositories/mongoTechApiRepository.ts` | Mongoose adapter reads/writes the two TechAPI collections through repository methods. | Used only when the selected repository is Mongo; not used for SQLite source mode. | Keep as the legacy Mongo adapter until Mongo-source mode is formally retired. |
| `src/repositories/sqliteTechApiRepository.ts` | Reads/writes the SQLite archive using typed repository methods; no Mongo collection access. | Runtime SQLite access is read-only; import writers require explicit configuration. | Archive runtime and controlled importer implementation. |
| `src/repositories/techApiRepositoryFactory.ts` | Selects Mongo or SQLite; application factory always opens SQLite read-only. | Central production/runtime selection point. | All runtime/importer source access should continue through this factory/repository boundary. |
| `src/models/TechApiCatalogRecord.ts`, `src/models/TechApiImportCheckpoint.ts` | Model/schema declarations; no operations on their own. | Bound to the legacy Mongo collections when used by the Mongo adapter or maintenance scripts. | Still required by Mongo adapter and migration/recovery tooling. |
| `src/seed/migrateTechApiMongoToSqlite.ts` | Direct raw Mongo source reads and SQLite staging writes. It pins source to loopback `smart_electronics_restore_test`, rejects credentials/other hosts/databases/ports, and checks destination preconditions. | Offline migration only; not a request path. | Keep for historical recovery, but it cannot be rerun after its Mongo source collections are removed unless a restore is provided. Not run in this phase. |
| `src/seed/verifyTechApiSqliteStaging.ts` | Direct read-only Mongo source queries/checksum comparison and read-only SQLite verification; source URI/database are pinned locally. | Offline verification only. | Keep for pre-retirement parity checks; not run in this phase. |
| `src/seed/validateTechApiSqlitePhase4.ts` | Reads the local restore source directly; creates/uses an explicitly named Phase 4 local test database with known fixtures and ownership checks, and cleans it only after successful verification. | Historical integration harness, not a production path. | Keep as validation tooling; source-dependent reruns require the restore collections. Not run in this phase. |
| `src/seed/auditTechApiCandidateOrdering.ts` | Direct read-only Mongo candidate-ordering comparison against SQLite; URI/database are hardcoded to loopback restore test; SQLite repository is opened read-only. | Offline parity audit only. | Keep for historical parity review; not run in this phase. |
| `src/seed/importTechApiFullDataset.ts` | Uses repository data types and the repository factory; `TechApiImportCheckpoint` occurrences are types, not direct model operations. | Production import command follows the selected repository. | No direct Mongo dependency outside the repository. |
| `src/seed/importTechApiCatalogIndex.ts`, `src/seed/enrichTechApiCatalogDetails.ts`, `src/seed/importTechApiSocCatalog.ts`, `src/seed/reportTechApiCatalogIndex.ts` | TechAPI catalog/checkpoint reads/writes use the repository factory. SoC import additionally uses Mongo Product/SyncRun stores. | Production importer/report command paths. | No direct TechAPI collection operation in importer code. |
| `src/seed/backupMongo.ts` | Generic backup enumerates and reads every collection from `MONGODB_URI`, so it can include TechAPI collections if present; exports EJSON files, does not modify Mongo. | Generic operator backup, not required by app/runtime. It has no TechAPI-specific database guard and must not be run against an unintended connection. | Does not require these collections to exist; classify as optional backup utility, not an application dependency. Not run. |
| `src/seed/backupCatalogCollections.ts` | Backs up Product, Offer, and SyncRun only. | Catalog backup; not a TechAPI-source archive. | No dependency on the two TechAPI collections. |
| `src/seed/techApiSqliteArchiveVerification.ts`, `validateTechApiSqlitePhase5B.ts` | SQLite-only structure, integrity, writer, and restore validation. | Offline archive validation. | No direct Mongo TechAPI collection operations. |
| `tests/techApiSocMongo.integration.test.ts` | Uses Mongo Product/SyncRun only in a unique marker-owned loopback database; asserts the TechAPI source collections are absent. | Opt-in local integration test. | No source-collection dependency. |

Repository-wide search found no production route/controller/worker/cron path directly using the two Mongo collections outside the repository adapter. Historical direct source access is limited to the offline migration, verification, and audit programs listed above. No migration or backup utility was deleted.

## D. Retirement risks and remaining blockers

1. `TECHAPI_STORAGE` defaults to `mongo`, so a deployed app that omits configuration continues to require the Mongo source collections. Set and verify SQLite selection on each backend/importer host before any collection retirement.
2. Migration and parity tools use the old restore source. Preserve an independent Mongo backup/restore snapshot if those tools may need to be rerun after archive publication.
3. Product has a unique sparse `dedupeKey`, but there is no unique normalized `(brand, model)` index and SyncRun has no unique `(source, sourceKey)` index. Sequential reruns with different run keys were tested and are safe; concurrent import processes with different source aliases have not been proven race-free. Run one SoC importer at a time until a separate concurrency strategy is designed.
4. The test used a local SQLite copy and standalone local Mongo only. It did not validate Atlas deployment configuration, production access policy, archive deployment/persistence, external backup scheduling, or live TechAPI networking.
5. No collection was deleted, no storage default changed, and no cutover or Atlas access was performed. Production collection retirement remains **NO-GO** until deployment configuration and rollback/recovery ownership are separately approved and verified.

## E. Files changed in this phase

- `src/seed/importTechApiSocCatalog.ts` — delegates to the service; unique default run keys and explicit same-key retry support.
- `src/services/techApiSocImport.ts` — injectable import workflow, Mongo Product/SyncRun adapters, precise mixed-storage reporting, partial/failure/retry handling, and no-overwrite identity policy.
- `src/services/techApiSocImport.test.ts` — unit regression coverage for idempotency, existing Products, unverified rows, partial writes/retry, SyncRun failure/retry, and source failure.
- `tests/techApiSocMongo.integration.test.ts` — opt-in real SQLite-copy/local-Mongo integration test with ownership-verified cleanup.
- `package.json` — dedicated `test:techapi:soc-mongo` script.
- `TECHAPI_SQLITE_WRITERS.md` — mixed-storage, retry-key, and test instructions.
- `TECHAPI_SQLITE_PHASE5B1_REPORT.md` — this audit and evidence report.

The working tree already contained many unrelated edits and deletions before this phase. They were preserved; no destructive Git operation or commit was performed.

## F. Safety confirmation

- Mongo endpoint used by integration: literal loopback only, with a fresh random database name. Local OS process `mongod` was present, and Mongo `hello` identified a standalone server rather than `mongos` or a replica-set endpoint.
- No MongoDB Atlas URI was loaded or contacted. No `.env` file was inspected, modified, or loaded by the test commands; `DOTENV_CONFIG_PATH` was set to a nonexistent temporary path.
- The restore test database was not used. Test data was written only to the newly owned Phase 5B.1 database and removed after assertions.
- Official archive hash matches the prior Phase 5B recorded hash; the independent SQLite test copy stayed unchanged during integration.
- No live TechAPI request, live web crawl, product import outside the isolated test, production deployment, or collection deletion occurred.
