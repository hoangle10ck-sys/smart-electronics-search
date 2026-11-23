# Silo provisioning and source-rights checklist

> **Archived:** The WaterCrawl-to-Silo ingestion integration and its project-local setup commands have been removed from Smart Electronic Search. This document is retained as historical reference only. The separate WaterCrawl repository/deployment was not changed.

This checklist prepares the private object-storage path for WaterCrawl ingestion. It does not create buckets, issue credentials, change policies, or authorize a retailer crawl.

## Current application contract

- Docker Silo endpoint: `http://minio:9000` on the existing private WaterCrawl Docker network. The endpoint is set by `smart-electronics-docker-compose.yml`; the S3 port is not published to the host.
- Runtime port inspection showed Silo has no host-published S3 port, but WaterCrawl Nginx is bound on all host interfaces at port 8088 and has bucket-path proxy routes. Firewall/Internet reachability was not checked. Do not treat the missing direct Silo port as proof that bucket objects are private; verify the same known object through the configured Nginx route and review network/firewall policy.
- Windows-host backend mode has no Silo endpoint in the current topology. Do not publish port 9000 to make it work; use the private Docker runtime.
- Backend S3 client: AWS SDK for JavaScript v3, AWS Signature Version 4, access-key/secret-key pair, region default `us-east-1`, path-style addressing enabled unless `SILO_FORCE_PATH_STYLE=false`.
- Raw bucket name is supplied by `SILO_BUCKET`. Source code and Compose do not define the current raw bucket name. The owner must identify the existing bucket and confirm it is the intended private raw-artifact bucket.
- Raw object writer uses `PutObject` under `raw/crawls/<source>/<date>/<sha256>.json`. It does not need bucket administration or bucket creation permissions.

## Provisioning steps (Silo administrator only)

Use the Silo Console on its private administrative route. Silo's supported Console includes bucket, user/service-account, and policy management; its admin API is separate from ordinary S3 operations ([Silo Console project](https://github.com/pgsty/silo-console), [Silo compatibility and deployment documentation](https://github.com/pgsty/silo)). Do not put root/admin credentials in the backend environment.

1. Identify and confirm the existing raw bucket with the project owner. Do not rename, create, delete, or change its policy/ACL during this task.
2. Create one dedicated test bucket, for example `smart-electronics-ingestion-test-<project-suffix>`. Set it private and confirm anonymous/public access is disabled. Do not reuse a WaterCrawl media bucket.
3. Create a **raw-writer application identity** scoped to the raw bucket and `raw/crawls/*`; grant only `s3:PutObject`. The ingestion service must not receive bucket-admin, policy, user, bucket-create, or bucket-delete permissions.
4. Create a **test application identity** scoped only to the dedicated test bucket. For the repeatable verification, grant `s3:ListBucket` on that bucket, and `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` only on `raw/crawls/*`. It must have no permissions on the raw bucket or any other bucket. Do not grant bucket create/delete, ACL, policy, or user-management actions.
5. Create a **read-only raw verifier identity** separate from the application writer. Grant bucket-level metadata access needed for `HeadBucket` on the exact raw bucket. If an existing raw object key is supplied for object privacy verification, grant `s3:GetObject`/`s3:HeadObject` only for that exact object. Do not grant list-objects unless the Silo implementation requires it for the chosen check. This identity is for verification only, not runtime ingestion.
6. Review the effective Silo policy in the Console. Confirm the test identity has no allow policy covering the raw bucket and that no group, inherited policy, or wildcard identity overrides the intended scope. The automated test checks S3 bucket-level denial; it does not replace this effective-policy review or prove denial of every object-level action.
7. Store the generated access keys locally in the approved secret store/runtime environment. Never send them through chat or add them to source control. Configure the variable names listed below.

The policy resource shape for review is:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::<TEST_BUCKET>"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::<TEST_BUCKET>/raw/crawls/*"
    }
  ]
}
```

This is a review template, not a policy applied by this repository. Confirm Silo's policy condition behavior in its Console before attaching it. The raw writer policy should be narrower and include only `s3:PutObject` on `<RAW_BUCKET>/raw/crawls/*`.

## Runtime variable names

Configure locally; do not send any value in chat:

- Runtime writer: `SILO_ENDPOINT`, `SILO_REGION`, `SILO_ACCESS_KEY`, `SILO_SECRET_KEY`, `SILO_BUCKET`, `SILO_FORCE_PATH_STYLE`.
- Test endpoint and bucket: `SILO_TEST_ENDPOINT`, `SILO_TEST_BUCKET`.
- Test-only scoped identity: `SILO_TEST_ACCESS_KEY`, `SILO_TEST_SECRET_KEY`.
- Read-only raw verifier: `SILO_VERIFY_ACCESS_KEY`, `SILO_VERIFY_SECRET_KEY`.
- Optional known existing raw object: `SILO_VERIFY_OBJECT_KEY` (only the key; do not paste its contents).
- Optional private reverse-proxy route: `SILO_PUBLIC_BASE_URL` (Docker mode usually resolves the WaterCrawl Nginx service as `http://nginx`).
- E2E local database: `MONGODB_TEST_URI` must target only `smart_electronics_ingestion_test` on loopback or the private `mongodb-test` service.

The sample `backend/.env.example` contains names and empty placeholders only. The preflight prints endpoint, bucket name, auth configuration status, and missing variable names; it never prints keys, secret keys, object-key values, response bodies, or exception messages.

## Repeatable checks

From the backend directory, with values already present in the process environment:

```powershell
npm run silo:preflight
npm run silo:verify:raw
npm run verify:silo
npm run verify:ingestion-e2e
```

The CLI does not load or display `.env`. In Docker mode, run the preflight in the Compose service, whose environment is already injected by Compose:

```powershell
cd ..
docker compose -f smart-electronics-docker-compose.yml build backend backend-test
docker compose -f smart-electronics-docker-compose.yml run --rm --no-deps backend node dist/seed/siloPreflight.js
docker compose -f smart-electronics-docker-compose.yml run --rm --no-deps backend node dist/seed/siloPreflight.js --verify-raw
```

`--verify-raw` performs signed `HeadBucket` with the read-only verifier, checks anonymous listing against that same raw bucket, and—when `SILO_VERIFY_OBJECT_KEY` identifies a real object—does authenticated and anonymous `HEAD` for that exact object both at Silo and through the configured Nginx route. Anonymous listing denial alone is not reported as proof that object reads are private.

The Silo integration test uses only a pre-created dedicated test bucket and the test identity. It checks `HeadBucket`, upload, download, byte SHA-256, metadata, anonymous GET of the exact uploaded object, and denial of test-identity bucket access to the already verified raw bucket. It optionally checks the exact object through the configured Nginx route. It deletes only the unique object key it created; it never creates, lists, or deletes a bucket.

The Docker fixture E2E uses a mocked WaterCrawl adapter, the dedicated Silo test bucket, and disposable MongoDB `smart_electronics_ingestion_test`. It never calls WaterCrawl and enforces raw upload before Mongo artifact metadata. The test identity must be configured before running:

```powershell
docker compose -f smart-electronics-docker-compose.yml --profile test build backend-test
docker compose -f smart-electronics-docker-compose.yml --profile test up -d mongodb-test
docker compose -f smart-electronics-docker-compose.yml --profile test ps
docker compose -f smart-electronics-docker-compose.yml --profile test run --rm --no-deps backend-test
docker compose -f smart-electronics-docker-compose.yml --profile test stop mongodb-test
docker compose -f smart-electronics-docker-compose.yml --profile test rm -f mongodb-test
```

Wait for `mongodb-test` to report healthy. The backend-test service blanks the raw writer key and WaterCrawl key, has no `MONGODB_URI`, and only receives the test and read-only verifier credentials needed by the fixture checks. The E2E drops only the exact isolated test database and cleans exact unique test object keys.

## WaterCrawl authentication check

`npm run check:watercrawl-auth` performs a read-only GET against the WaterCrawl API; it does not create a crawl request. The self-hosted Team API key is sent only in `X-API-Key`. WaterCrawl may update its key `last_used_at` field as authentication metadata. The check suppresses values and response bodies.

## Owner source-rights checklist (must be complete before any live crawl)

- [ ] The website owner, catalog provider, or license explicitly permits automated collection and the planned internal use.
- [ ] The permission covers storing raw pages in this Silo and retaining normalized product/specification data in MongoDB.
- [ ] The permission covers price and availability fields and refresh frequency.
- [ ] Image URLs, image downloading, caching, and display rights are confirmed separately.
- [ ] Current terms and `robots.txt` have been reviewed; WaterCrawl worker robots and per-domain delays match the reviewed limits.
- [ ] Allowed domains, URL paths, request rate, daily volume, retention, and deletion contact are documented.
- [ ] A human has recorded source permission evidence in the Admin DataSource before enabling a run.

A WaterCrawl API key, a successful crawl, public web access, or a robots allow rule does not grant data-use rights. Until every applicable item is confirmed, use fixture-only tests and keep scheduled ingestion disabled.
