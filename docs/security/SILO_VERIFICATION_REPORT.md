# Silo Provisioning & Verification Report

> **Historical verification:** The WaterCrawl-to-Silo ingestion integration has been removed from Smart Electronic Search. This report records checks from the former setup and is not the current application configuration. Project-local verification commands below no longer apply. The external WaterCrawl deployment was not changed.

**Date:** 2026-11-12  
**Overall:** **BLOCKED — no private bucket or S3 application credentials are configured for verification.** No bucket or policy was created or changed.

## Findings

| Area | Status | Evidence |
|---|---|---|
| Backend S3 endpoint | **PASS (configuration)** | Docker runtime preflight reports `http://minio:9000`; this is the Silo service name on the existing private Docker network. Windows-host mode has no direct Silo endpoint. |
| Backend S3 auth method | **PASS (code inspection)** | `@aws-sdk/client-s3` uses AWS Signature Version 4 with `SILO_ACCESS_KEY` and `SILO_SECRET_KEY`; region defaults to `us-east-1`; path-style is enabled by default. |
| Raw bucket identity | **BLOCKED** | Compose runtime preflight reports `SILO_BUCKET` missing. There is no configured raw bucket name to verify. |
| Raw bucket exists/access | **BLOCKED** | `SILO_VERIFY_ACCESS_KEY` and `SILO_VERIFY_SECRET_KEY` are missing, and no raw bucket name is configured. The read-only signed `HeadBucket` was therefore not sent. |
| Raw bucket anonymous listing/object privacy | **BLOCKED** | No raw bucket or verifier identity is configured. No 403 from another bucket was used as evidence. Object-level verification through both Silo and Nginx additionally needs `SILO_VERIFY_OBJECT_KEY` naming an existing object in that same raw bucket. |
| Test bucket and least-privilege test identity | **BLOCKED** | `SILO_TEST_BUCKET`, `SILO_TEST_ACCESS_KEY`, and `SILO_TEST_SECRET_KEY` are missing. No bucket or credential was provisioned. |
| Silo test integration | **BLOCKED** | The repeatable test is implemented, but it skipped with explicit missing-variable names. No authenticated S3 upload/download was attempted. |
| Mock WaterCrawl → Silo → Mongo E2E | **BLOCKED** | Docker test command skipped before database or S3 access because the test bucket/credentials and raw bucket name are missing. No MongoDB test container was started and no test data was written. |
| Docker network reachability | **PASS (health only)** | A temporary Node container on `docker_default` resolved `minio` and received HTTP 200 from `/minio/health/live`. This does not verify S3 auth, bucket existence, or object permissions. |
| WaterCrawl API key | **PASS (read-only GET)** | The backend runtime GET authentication probe returned PASS. It did not create a crawl job or write product data. WaterCrawl may update API-key `last_used_at` metadata. |
| No host-published S3 port | **PASS (direct port only)** | Active Silo container shows only `9000/tcp`, with no host port mapping. WaterCrawl Nginx is bound to `0.0.0.0:8088` and `[::]:8088` and has bucket-path proxy routes. Since no test object/bucket exists, anonymous access through that proxy remains **BLOCKED**, not proven private; firewall/Internet reachability was not checked. |
| Source-use authorization | **BLOCKED for live crawl** | The separate owner checklist is prepared. No website rights were inferred or attested. |
| Secret handling / production isolation | **PASS for this task** | `.env` was not opened or edited. Runtime checks printed only endpoint, bucket/configuration status, and missing variable names. No Atlas connection, production write, bucket mutation, or live crawl occurred. |

## Runtime configuration observed

The Docker Compose override sets the backend Silo endpoint to `http://minio:9000`. The backend code selects its target bucket from `SILO_BUCKET`; the Compose file does not define a raw bucket name. The actual Compose runtime preflight reported that `SILO_BUCKET`, backend writer credentials, the test bucket, test credentials, and read-only verifier credentials are missing. Therefore the exact raw bucket name is currently **not configured/unknown**.

The existing Silo service is reachable on the private Docker network. The direct S3 service port is not published on the host. Nginx is bound on all host interfaces at port 8088 and has configurable bucket routes, so the absence of a direct S3 port mapping alone does not prove anonymous object access is denied. This task did not change the WaterCrawl stack or its firewall; privacy through the Nginx route remains unverified until the same known test object is checked there.

The backend S3 writer currently only needs `PutObject` under `raw/crawls/*`. The test identity and raw verification identity are separated. The automated scope check will verify that the test identity can access its pre-existing test bucket and receives AccessDenied on `HeadBucket` for the same raw bucket after a read-only identity verifies that bucket exists. This is a bucket-level runtime check; review of the complete effective Silo policy is still required to confirm there are no object-level wildcard grants.

## Checks run

| Command/check | Result |
|---|---|
| `npm test` from `backend/` | **175 PASS, 0 FAIL, 2 BLOCKED skips** (real Silo verification and fixture E2E) |
| `npm run build` from `backend/` | **PASS** |
| `npm run verify:silo` | **BLOCKED / skipped** for missing Silo test/verifier settings |
| `npm run verify:ingestion-e2e` | **BLOCKED / skipped** for missing test Mongo/Silo settings |
| `npm run silo:preflight` from host process | **BLOCKED**, no Silo variables injected into that process; the command does not load `.env` |
| Docker backend `siloPreflight.js --verify-raw` | **BLOCKED**; confirmed Docker endpoint, but bucket and verifier credentials were missing |
| Docker `backend-test` run | **BLOCKED / skipped** before database or S3 operations |
| Docker Compose config validation | **PASS** |
| Backend and backend-test Docker image builds | **PASS** |
| WaterCrawl read-only auth GET in Docker | **PASS**; no crawl job |
| Silo Docker-network health GET | **PASS**, HTTP 200 only |
| `git diff --check` | **PASS**; Git emitted existing LF/CRLF normalization warnings only |

## Changes made

- Added `backend/src/seed/siloPreflight.ts` and `backend/src/services/ingestion/siloPreflight.ts`. Preflight prints endpoint/bucket and variable status only; `--verify-raw` performs read-only checks against the configured raw bucket and hides error details.
- Added `backend/src/services/ingestion/siloPreflight.test.ts` to assert that credentials never appear in preflight output.
- Added `backend/tests/siloVerification.integration.test.ts` for a pre-created test bucket: signed access, upload/download, SHA-256 and metadata verification, anonymous access to the exact uploaded object, and bucket-level denial against the verified raw bucket. Cleanup deletes only the unique object made by that test.
- Removed the previous optional Silo test path that dynamically created and deleted a bucket.
- Changed fixture E2E to require a pre-created test bucket and dedicated test-only identity; it deletes only object keys created by its own run. Missing environment now yields an explicit BLOCKED skip before touching MongoDB/Silo.
- Updated `smart-electronics-docker-compose.yml` to blank the raw writer and WaterCrawl keys in `backend-test`; the test profile does not use the raw writer identity.
- Added npm scripts and configuration placeholders/documentation. No credentials were added.
- Added [SILO_PROVISIONING_CHECKLIST.md](SILO_PROVISIONING_CHECKLIST.md), including the source-rights checklist for a future live crawl.

## Owner actions required

Do not send any secret through chat. Configure values in the approved local secret store or runtime environment.

1. Confirm the exact existing private raw bucket name and that this project may perform read-only verification against it.
2. Provide/configure the raw writer identity (`SILO_ACCESS_KEY` / `SILO_SECRET_KEY`) limited to `PutObject` under that raw bucket's `raw/crawls/*` prefix.
3. Pre-create one private test bucket with the `smart-electronics-ingestion-test-` name prefix. Do not reuse or change the raw bucket.
4. Create a separate test identity limited to the test bucket and test prefix; configure `SILO_TEST_ACCESS_KEY` / `SILO_TEST_SECRET_KEY`.
5. Create a separate read-only raw verifier (`SILO_VERIFY_ACCESS_KEY` / `SILO_VERIFY_SECRET_KEY`). If raw object-level privacy must be checked, configure `SILO_VERIFY_OBJECT_KEY` with an existing object key in that same raw bucket.
6. Have the Silo administrator review the effective policy for wildcard, group, and inherited grants. The automated bucket-level denial does not replace this review.
7. Confirm whether the published Nginx bucket route should include the test bucket. Configure `SILO_PUBLIC_BASE_URL` only when that route is intentionally available to the test runner; anonymous access must be checked against the same known object.
8. Confirm Silo root/admin credentials are unique and the deployed service is not using a source-compose fallback. Do not place root credentials in the Smart backend.
9. Complete every applicable item in `SILO_PROVISIONING_CHECKLIST.md` before enabling live crawl. The WaterCrawl API key does not establish website data-use rights.

## Rerun after provisioning

```powershell
cd backend
npm run silo:preflight
npm run silo:verify:raw
npm run verify:silo
npm run verify:ingestion-e2e
npm test
npm run build
```

For the official Docker network and isolated Mongo test profile, use the Docker commands in `SILO_PROVISIONING_CHECKLIST.md`. The Silo and full E2E rows can be changed to PASS only after those real authenticated checks execute successfully; a skipped test or health endpoint response is not a PASS for S3.
