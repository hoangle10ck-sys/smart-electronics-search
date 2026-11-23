# Project Acceptance Report

> **Historical report:** This acceptance snapshot predates removal of the WaterCrawl-to-Silo ingestion path. Its collector, Docker, and Silo commands describe the earlier implementation and are not current setup instructions. The external WaterCrawl repository/deployment was not changed.

**Ngày:** 2026-11-12  
**Repository:** `smart-electronics-search`  
**Kết luận:** **BLOCKED cho controlled ingestion.** Backend, search/advisor, Docker runtime và kiểm thử local đã hoạt động; tích hợp Silo có xác thực và quyền bucket chưa thể nghiệm thu vì cấu hình credential/bucket còn thiếu. Không có live crawl hoặc production write trong lần nghiệm thu này.

## A. Tổng quan

Đã kiểm tra và tiếp tục hoàn thiện phần WaterCrawl → Silo → MongoDB trên source hiện có, giữ lại các thay đổi chưa commit. Đã sửa lỗi xác thực WaterCrawl: API key của WaterCrawl self-hosted phải gửi qua `X-API-Key`; gửi đồng thời Bearer JWT làm crawl endpoint trả HTTP 401. GET kiểm tra xác thực chỉ đọc hiện trả HTTP 200.

Đã bổ sung Docker runtime overlay, MongoDB local mặc định cho backend container, health check, kiểm tra cấu hình không in secret, kiểm tra WaterCrawl chỉ đọc, validation URL chặt hơn, tài liệu và báo cáo này. Frontend được nâng lên Vite 6.4.6 để xử lý các advisory từ `npm audit`; backend không đổi framework hoặc database.

Các phần còn mở: Silo raw bucket, quyền private/anonymous, upload/download bằng app credential, full E2E với Silo thật, browser acceptance, conversation owner authorization, và đánh giá người/model cho recommendation/explanation.

## B. Kiến trúc thực tế

```mermaid
flowchart LR
  FE[React + Vite frontend] -->|HTTP /api| BE[Express + TypeScript backend]
  BE -->|MongoDB URI local/test| MDB[(MongoDB)]
  BE -->|X-API-Key; REST| WC[WaterCrawl self-hosted]
  BE -->|S3 API over docker_default| Silo[Silo / minio:9000]
  WC -->|crawl jobs| Retailer[Registered retailer domain]
  WC -->|fixture result in tests| Pipe[Product ingestion pipeline]
  Retailer -->|only after source permission| WC
  Pipe -->|raw JSON first| Silo
  Pipe -->|object key + hash metadata| Artifact[(RawCrawlArtifact)]
  Pipe --> Parser[Retailer parser + canonical draft]
  Parser --> Pending[(PendingProduct)]
  Parser --> Product[(Product, unverified until review)]
  Parser --> Offer[(Offer pending) + PriceHistory]
```

- Backend: Node.js 22, Express, TypeScript, Mongoose.
- Frontend: React, TypeScript, Vite 6.4.6.
- Database: MongoDB. Automated repository integration uses only `smart_electronics_ingestion_test`; Docker overlay defaults to MongoDB on the Windows host and can be overridden with `SMART_ELECTRONICS_MONGODB_URI`. It does not inherit `MONGODB_URI` from `backend/.env` in the Docker backend service.
- Vector retrieval in the existing search architecture uses MongoDB Atlas Vector Search when explicitly enabled; Qdrant is not configured. No Atlas connection was made in this task.
- WaterCrawl stack already running on external Docker bridge `docker_default`; the Smart Docker overlay attaches backend to it using service DNS `nginx` and `minio`.
- Active Silo service has container port `9000/tcp` and no host-published S3 port. Backend API publishes only on `127.0.0.1:5000`. Backend container health check waits for `/api/health`.
- Test Mongo container has no published port or volume. Test container and temporary backend runtime were removed after verification; existing WaterCrawl services were left running.

## C. Thay đổi quan trọng

- `smart-electronics-docker-compose.yml`: private Docker service DNS, local/test Mongo override, loopback-only API port, backend health check, and isolated test Mongo profile.
- `backend/Dockerfile`, `backend/.dockerignore`: multi-stage backend images; `.env` excluded from build context and runtime image.
- `backend/src/services/ingestion/watercrawlClient.ts`: sends Team API key only through `X-API-Key`; adds a read-only auth check; errors do not include response body or key.
- `backend/src/services/ingestion/watercrawlClient.test.ts`: asserts auth header and that the auth check uses a GET list request without creating a crawl job.
- `backend/src/services/accesstradeSync.ts` and `backend/src/services/accesstrade.test.ts`: reject IP-literal URLs and local/internal/test hostnames. WaterCrawl registration also restricts the current parser to its registered HTTPS domain.
- `backend/src/seed/checkWatercrawlConfig.ts`, `backend/src/seed/checkWatercrawlAuth.ts`: status-only config check and read-only auth command.
- `backend/src/services/mongoIngestionRepository.test.ts`, `backend/src/services/ingestion/productIngestionPipeline.test.ts`, `backend/tests/ingestionEndToEnd.integration.test.ts`: local Mongo, ordering, failure, deduplication, historical-price, and private-bucket assertions.
- `backend/.env.example`: local Mongo example, raw bucket left blank until owner confirms its identity; no real secrets.
- `backend/WATERCRAWL_INGESTION.md`, `README.md`, `AGENTS.md`: operational modes, safe configuration, tests, and working rules.
- `frontend/package.json`, `frontend/package-lock.json`: Vite updated from 5.4.21 to 6.4.6; React plugin peer range supports Vite 6. The current advisories list Vite 6.4.6 as patched; see [Vite security advisory](https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7).

The workspace contains many earlier uncommitted catalog, AI Advisor, and frontend changes. They remain intact; no reset, checkout, clean, or broad rewrite was run. `backend/.env` was not opened, printed, edited, or copied. Presence checks report only configured/missing statuses.

## D. Kiểm thử và build

| Kiểm tra | Kết quả | Giới hạn |
|---|---|---|
| Backend `npm test` | **174 PASS, 0 FAIL** | Includes current regression/unit tests. The real Silo E2E case is conditional and did not execute without Silo test configuration. |
| Mongo repository integration | **1 PASS, 0 FAIL** | Ran against a temporary MongoDB 8 container bound to loopback and only database `smart_electronics_ingestion_test`; container and database were discarded. Covers artifact/product/PendingProduct upsert, Offer history, and preservation of verified records. |
| Backend TypeScript build | **PASS** | `npm run build`. |
| Frontend production build | **PASS** | `npm run build` with Vite 6.4.6. |
| Docker images | **PASS** | `backend` and `backend-test` built. |
| Docker Compose validation | **PASS** | `docker compose -f smart-electronics-docker-compose.yml --profile test config --quiet`. |
| Docker runtime smoke | **PASS** | Temporary backend became `healthy` on the isolated Mongo test service; `/api/health` and Silo `/minio/health/live` each returned HTTP 200 from inside the backend container. No S3 operation occurred. |
| WaterCrawl API auth | **PASS** | GET succeeded from Docker mode and Windows host using the adapter header (`X-API-Key`). No crawl request or product data was written; WaterCrawl may update API-key last-used metadata. Bearer-only probe returned HTTP 401. |
| `npm audit` backend | **0 vulnerabilities** | Full dependency tree. |
| `npm audit` frontend | **0 vulnerabilities** | Full dependency tree after Vite update. |
| Lint / browser tests | **NOT CONFIGURED / NOT RUN** | Neither package has a lint or browser E2E script. |
| Real Silo E2E | **BLOCKED / NOT RUN** | App Silo access key, secret, raw bucket, and separate test bucket are absent. No PASS is inferred. |

The wider existing acceptance artifacts report a 200-query search corpus (Recall@10 97.5%, MRR 97.5%, exact-model top-1 100%, 0% explicit constraint violations, and 40/40 no-result controls). They are catalog-derived regression metrics, not human relevance judgments. The advisor corpus has 50 scenarios / 52 turns; deterministic cases pass, while model-, catalog-, and human-review cases remain unscored. See `backend/ADVISOR_TASK7_ACCEPTANCE_REPORT.md`, `backend/SEARCH_ENGINE.md`, and `backend/ADVISOR_TASK5_PERFORMANCE_REPORT.md`.

## E. Kết quả Silo

- **Backend runtime:** temporary official backend container could resolve `minio` and receive HTTP 200 from Silo health endpoint over `docker_default`. This proves network reachability only, not application S3 authorization.
- **Raw bucket:** unknown. `SILO_BUCKET` is missing; no raw bucket name is guessed, selected, or changed.
- **Test bucket:** `SILO_TEST_BUCKET` is missing. No bucket was created, no ACL/policy changed, and no object was uploaded/downloaded against the active Silo.
- **Credentials:** `SILO_ACCESS_KEY` and `SILO_SECRET_KEY` are missing. Test-only loopback credentials are also missing.
- **Private / anonymous checks:** not run against the actual raw or test bucket. Active Silo's port is not published to host, but that alone does not prove bucket policy or anonymous denial.
- **Upload/download/hash/metadata:** unit tests cover the S3 client contract; the actual app-credential round trip remains unverified.

The configuration check reports WaterCrawl key and Docker-overridden endpoints as present, but exits nonzero because Silo app credentials/bucket are missing, robots obedience is disabled, and download delay is absent/below the minimum. Scheduler is reported disabled. Region and path-style behavior use application defaults.

## F. Kết quả WaterCrawl

- Installed stack reports frontend image `watercrawl/frontend:v0.12.3`; the API auth endpoint was tested with an idempotent GET only.
- The actual Team API key authenticates through `X-API-Key`; the adapter previously sent both Bearer and X-API-Key, which caused the self-hosted DRF endpoint to reject the request. The adapter now sends only the verified Team key header.
- API key variable is non-empty and authentication succeeded. The GET probe may update WaterCrawl's API-key `last_used_at` metadata, but does not create a crawl request. The key was visible in an image shared earlier in this conversation; rotate it in the WaterCrawl dashboard before controlled ingestion. This repository did not rotate or revoke it.
- Mock tests cover create, monitor, pagination, cancellation, timeout, retry behavior, ambiguous POST handling, and fixture parsing. No live crawl job or retailer URL was submitted.
- Source permission, terms/robots review, `WATERCRAWL_ROBOTS_OBEY=true`, and minimum delay are not established, so live crawling remains disabled.

## G. Kết quả MongoDB và dữ liệu

- Repository integration uses the exact isolated database `smart_electronics_ingestion_test` on a disposable local MongoDB container; no Atlas URI was used.
- Artifact/product identity upserts and PendingProduct dedup pass. A verified Product and Offer survive later unverified crawl observations.
- Price-history mechanics pass with explicitly synthetic test-only pending observations. Historical fixture prices are marked historical and do not become current Offers.
- The temporary backend runtime used the Compose `mongodb-test` service and the same dedicated test database; no persistent volume or non-test database was touched.
- Full fixture E2E that combines mocked WaterCrawl, active Silo test bucket, and local MongoDB did not run because Silo credentials/bucket are missing.

## H. Tiêu chí nghiệm thu tổng thể

| # | Tiêu chí | Trạng thái | Bằng chứng / giới hạn |
|---:|---|---|---|
| 1 | Backend chạy trong Docker | **PASS (local test runtime)** | Temporary runtime healthy with isolated Mongo test DB. It was removed after test. |
| 2 | Backend kết nối Silo thật | **PARTIAL** | Backend container reaches active Silo health endpoint; authenticated S3 not tested. |
| 3 | Raw bucket private | **BLOCKED** | Raw bucket unknown and unconfigured. |
| 4 | Test bucket private | **BLOCKED** | No pre-provisioned test bucket configured. |
| 5 | Anonymous access denied | **BLOCKED** | Not tested against an actual object/bucket. |
| 6 | App credential upload/download | **BLOCKED** | Silo app credentials missing. |
| 7 | WaterCrawl API authentication | **PASS** | Read-only GET returned 200 using X-API-Key. |
| 8 | WaterCrawl mock E2E | **PARTIAL** | Pipeline and parser fixture tests pass; integrated active-Silo path did not run. |
| 9 | Silo integration E2E | **BLOCKED** | Missing credentials and separate test bucket. |
| 10 | MongoDB integration | **PASS** | Dedicated local test database; 1/1 integration test. |
| 11 | Product dedup | **PASS** | Repository and pipeline tests. |
| 12 | Price history | **PASS (test mechanics)** | Synthetic pending observations; no live pricing assertion. |
| 13 | Verified data protection | **PASS (test coverage)** | Tests preserve verified Product/Offer from unverified observations. |
| 14 | Admin Collector API | **PASS (automated tests)** | Route tests pass; no external crawl started. |
| 15 | Admin Console | **PARTIAL** | TypeScript/build and source checks; no browser/mobile interaction run. |
| 16 | Scheduler mặc định disabled | **PASS for checked config** | Presence checker reported disabled; test runtime explicitly forced disabled. |
| 17 | Search API | **PASS (existing acceptance evidence)** | Search regression corpus and prior read-only API checks; catalog coverage remains incomplete. |
| 18 | Frontend build | **PASS** | Vite 6.4.6 production build. |
| 19 | Backend build | **PASS** | TypeScript build. |
| 20 | Security checks | **PARTIAL** | Full npm audits clean, key server-side, S3 unexposed, IP-literal URL blocks; Silo privacy unverified, conversation IDs lack account-bound ownership, and DNS resolution pinning is not implemented. |
| 21 | Deployment documentation | **PARTIAL** | Docker/host/runtime and E2E instructions updated; controlled-ingestion values and bucket privacy remain owner-configured. |

## I. Vận hành và blocker

### Lệnh local

```powershell
cd backend
npm test
npm run build
npm run check:watercrawl-config
npm run check:watercrawl-auth

cd ..\frontend
npm run build
```

### Docker runtime

After confirming a local MongoDB is available on the Windows host:

```powershell
docker compose -f smart-electronics-docker-compose.yml build backend
docker compose -f smart-electronics-docker-compose.yml up -d backend
docker compose -f smart-electronics-docker-compose.yml ps
```

Docker uses `host.docker.internal` MongoDB by default, overridden only by `SMART_ELECTRONICS_MONGODB_URI`. The host Vite dev server uses the loopback backend API port. Host-mode ingestion is unavailable while Silo has no host endpoint.

### Real Silo E2E

First configure a least-privilege Silo app identity, the owner-confirmed existing private raw bucket, and a separately pre-provisioned private test bucket with the required test naming prefix. Do not use the raw bucket for tests. Then run the commands in `backend/WATERCRAWL_INGESTION.md`; the test performs `HeadBucket` before dropping the dedicated local Mongo test database, and cleans only its unique test prefix.

### Cần chủ dự án cung cấp/xác nhận

1. Configure Silo access/secret credentials without sending them in chat.
2. Identify the existing private raw bucket and confirm its app identity scope.
3. Provision/configure a separate private test bucket and provide the name through `SILO_TEST_BUCKET`.
4. Rotate the WaterCrawl API key that was visible in the earlier image; this repository has not rotated it.
5. Confirm source data-use rights and WaterCrawl worker robots/delay settings before any live crawl.

No production approval or production write was requested or performed.

## J. Kết luận

**Overall: BLOCKED for controlled ingestion.** The project is **READY FOR LOCAL TESTING** of backend, frontend, search/advisor, Mongo integration, Docker networking, and read-only WaterCrawl authentication. It is **not READY FOR CONTROLLED INGESTION** until real private Silo bucket access and full S3 E2E pass. It is **not READY FOR PRODUCTION REVIEW** until the remaining security, browser, catalog-quality, and owner-authorization gaps are reviewed.
