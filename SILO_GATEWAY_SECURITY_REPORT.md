# Nginx / Silo Gateway Security Audit

> **Historical audit:** The WaterCrawl-to-Silo ingestion integration has been removed from Smart Electronic Search. This report records a separate external WaterCrawl deployment and is retained as historical security evidence. Project-local commands below refer to code that no longer exists; do not use them to configure this application. The external WaterCrawl repository and containers were not changed.

**Date:** 2026-11-12  
**Overall:** **FAIL for external-exposure hardening; BLOCKED for S3 object-level authentication/privacy acceptance.** I did not change or restart the running WaterCrawl stack.

## Executive findings

- Nginx is host-published on `0.0.0.0:8088` and `[::]:8088`, serving plain HTTP on container port 80. The active configuration has no TLS listener and no Nginx `auth_basic`/`auth_request` controls.
- The active gateway has `/private/` and `/public/` routes to Silo on `minio:9000`, and `/minio-console/` to Silo's console on `minio:9001`. Nginx routes requests; the Silo service makes S3 signature and bucket-policy decisions.
- A no-credential HEAD to `http://127.0.0.1:8088/public/` returned 200; a HEAD to `/private/` returned 403. These were bucket-root checks, not requests to a known object. Neither result establishes object privacy. The `public` route appears intended for public objects, but its policy and contents were not inspected.
- Direct S3 port 9000 is not host-published. The active `docker_default` network is not marked internal and contains 10 containers, so all attached containers can reach Silo's S3 service.
- Windows Firewall profiles are enabled with default inbound action `Block`, but reading port-specific rules failed with Access Denied. Local host access is confirmed; access from another LAN host or the Internet is not.
- The active WaterCrawl Compose source contains fallback Silo root credentials if the operator variables are absent. Runtime values were not inspected. This is a **FAIL in source fail-closed configuration** and needs an owner/admin review.
- Valid, invalid, and anonymous same-object tests are implemented for a dedicated test bucket. They are **BLOCKED** because the test bucket and scoped credentials are absent. No production object was used.

## Active Nginx routes and reachability

The full running configuration was inspected with `docker exec docker-nginx-1 nginx -T`; Nginx reported syntax OK and configuration test successful. Source template: `C:\Users\DELL\tools\watercrawl\docker\nginx\nginx.conf`.

| Route | Upstream | Host observation | Security interpretation |
|---|---|---|---|
| `/` | `frontend:80` | No-credential HEAD: 200 | Frontend is reachable through the published listener. |
| `/api/` | `app:9000` | `/api/health` HEAD: 404 | Proxy route exists; that specific path is not an exposed health endpoint. Other API authorization was not audited here. |
| `/sse`, `/messages` | `mcp:3000` | Not probed to avoid opening an event stream or posting data. | Route is externally addressable through Nginx; application authentication was not assessed. |
| `/private/` | `minio:9000/private/` | No-credential bucket-root HEAD: 403 | The bucket-root response is not proof that a known object is private. |
| `/public/` | `minio:9000/public/` | No-credential bucket-root HEAD: 200 | Anonymous bucket-level response is reachable; object listing/content was not requested. This may be intentional for public media. |
| `/minio-console/` | `minio:9001/` | No-credential HEAD: 200 | Console route is reachable. This proves the route responds, not that an unauthenticated user can administer Silo. Restrict this path to a private admin network/VPN. |
| `/minio/api/` | None | Commented out in the template | No direct S3 catch-all route is active at this path. Bucket-specific routes remain active. |

The route locations are in the source template at lines 7, 16, 24, 48, 58, and 78. The active substituted bucket route names are `/private/` and `/public/`.

The active Docker mapping is `0.0.0.0:8088->80/tcp` and `[::]:8088->80/tcp`. The host listener is bound on IPv6 wildcard interfaces. Silo itself exposes only container port `9000/tcp`; its console port is also not directly host-published. Nginx is the host entry point to the bucket routes and console.

The shared `docker_default` bridge reports `internal=false` and has 10 attached containers. This is private from direct Internet routing by itself, but it is not a dedicated Silo-only network boundary.

## Authentication and SigV4

1. Nginx contains no S3 authentication directives. It does not itself verify `Authorization` signatures or decide S3 permissions; the bucket routes proxy to Silo.
2. The backend S3 client uses AWS SDK for JavaScript v3, which signs requests with AWS Signature Version 4 using the configured access-key/secret-key pair.
3. The active Silo release source (`RELEASE.2026-11-09T00-00-00Z`) has S3 auth handling for Signature V4 and distinguishes anonymous requests. The Silo code is the layer that must validate signatures and evaluate the bucket policy ([release auth handler](https://github.com/pgsty/silo/blob/RELEASE.2026-11-09T00-00-00Z/cmd/auth-handler.go)). This is source-level evidence, not a live accepted/rejected credential test.
4. Nginx sets upstream `Host` to `$host`. For externally signed requests using a non-default port, this may differ from the authority used in the client's SigV4 canonical request. A successful valid-credential gateway test is needed before relying on this path.
5. Nginx access logging uses `$request`, which includes query parameters, and `$http_referer`. A presigned S3 URL can contain signature material in its query string. Do not enable presigned URLs through this gateway until S3-route logging is changed to omit query strings and referers.

## Firewall and external reachability limits

| Check | Status | Evidence / limit |
|---|---|---|
| Nginx Docker bind | **FAIL for loopback-only expectation** | Docker publishes 8088 on all IPv4 and IPv6 interfaces. |
| Local host route reachability | **PASS** | Host HEAD requests returned responses for `/`, `/minio-console/`, `/private/`, and `/public/`. |
| Windows Firewall profiles | **PARTIAL** | Domain, Private, Public profiles are enabled; default inbound action is Block. |
| Port-specific firewall rule | **BLOCKED** | `Get-NetFirewallPortFilter -PolicyStore ActiveStore` returned Access Denied. No conclusion about a Docker-generated allow rule. |
| LAN/Internet reachability | **BLOCKED** | No second machine, router/NAT, cloud firewall, or external scan was used. A wildcard Docker bind is not proof that a remote host can connect, and default firewall policy is not proof that every Docker path is blocked. |
| TLS | **FAIL** | Active Nginx server listens on port 80 only; published host port 8088 maps to that listener. No TLS termination is configured in this Nginx container. |

## S3 security tests

The repeatable test `backend/tests/siloVerification.integration.test.ts` now exercises one unique object in a dedicated test bucket:

- **Valid credential:** upload/download, exact byte hash and metadata; valid `HeadObject` via Nginx if that exact test bucket has a configured gateway route.
- **No credential:** anonymous HEAD against the same object after authenticated retrieval verifies the object exists.
- **Wrong credential:** a synthetic invalid SigV4 identity performs HEAD against that same object; no real or production credential is used.
- **Gateway:** once valid SigV4 proves that Nginx routes the exact object, anonymous and invalid-credential requests are tested against that same path. If Nginx returns 404 for the test bucket route, the gateway portion is marked BLOCKED; it is not interpreted as private.
- **Raw-bucket scope:** the separate read-only verifier first confirms the configured raw bucket, then the test credential must be denied `HeadBucket` on that same raw bucket. This is a bucket-level scope check; Silo's effective policy still needs review for object-level wildcard grants.
- Cleanup deletes only the unique test object created by this run. The test never creates or deletes a bucket, lists object keys, or writes to the raw bucket.

Current result: `npm run verify:silo` reports **BLOCKED / skipped** for missing `SILO_TEST_ENDPOINT`, `SILO_TEST_BUCKET`, `SILO_BUCKET`, `SILO_TEST_ACCESS_KEY`, `SILO_TEST_SECRET_KEY`, `SILO_VERIFY_ACCESS_KEY`, and `SILO_VERIFY_SECRET_KEY`. Consequently, no authenticated S3 request or same-object anonymous/wrong-credential check was run. No test is marked PASS for real S3.

The latest Docker-runtime preflight confirms `SILO_ENDPOINT=http://minio:9000` and reports the raw bucket, raw writer credentials, test bucket/identity, and raw verifier as missing. It does not print or inspect their values. The preflight exits nonzero because required settings are absent.

The raw writer is not used for upload/download testing: this audit must not write to the raw bucket. Its configuration presence is checked by preflight; its effective policy must be reviewed by the Silo administrator. Real upload/download uses only the test identity and pre-created test bucket.

## Source configuration finding

`C:\Users\DELL\tools\watercrawl\docker\docker-compose.yml` lines 37-38 and 179-180 use fallback values for the Silo access key/root identity when deployment variables are missing. The active container environment was not inspected, so whether the fallback is currently active is **BLOCKED**. Recommended remediation during an approved maintenance window:

- Replace fallback credentials with required variables/secrets that fail Compose startup when missing.
- Ensure the Silo root/admin identity is not reused by the Smart backend.
- Rotate any default/fallback credentials if they were active, using the Silo administrator's controlled process.
- Provision separate raw-writer, test-only, and read-only verifier identities with bucket/prefix-limited policies.

## Recommended configuration, not applied

No active configuration was changed to avoid disrupting the WaterCrawl deployment.

1. If the UI is only needed locally, bind the Nginx published port to loopback, e.g. `127.0.0.1:${NGINX_PORT}:80`. Confirm all clients before applying because remote access will stop.
2. If remote UI access is required, place Nginx behind a TLS-terminating reverse proxy or private VPN, restrict inbound firewall rules to approved client networks, and do not publish Silo ports 9000/9001 directly.
3. Remove `/minio-console/` from the general Nginx listener or restrict it to the admin VPN/IP allowlist.
4. Keep raw artifacts in a private bucket policy with no anonymous list/get. Keep public media in a separately named and reviewed public bucket.
5. Preserve the S3 `Host` header for signed requests if external S3 access is intentionally supported, then prove valid/invalid SigV4 through the same route before enabling it.
6. Redact query strings and referrers from access logs on bucket routes to prevent presigned URL signature leakage.
7. Consider a dedicated internal Docker network for Smart backend-to-Silo traffic. The current shared bridge is used by the WaterCrawl stack, so changing it requires a coordinated Compose/network maintenance plan.

## Checks run

| Check | Result |
|---|---|
| `docker exec docker-nginx-1 nginx -T` | **PASS** syntax/config test; active routes inspected |
| Host no-credential HEAD route probes | **PASS as reachability checks**; statuses recorded above, not treated as object privacy tests |
| Windows Firewall profile query | **PASS** profiles enabled/default inbound block; rule enumeration **BLOCKED** by Access Denied |
| Docker port and network inspection | **PASS**; shows wildcard Nginx publish, no direct Silo host port, shared non-internal bridge |
| `npm test` from `backend/` | **175 PASS, 0 FAIL, 2 BLOCKED skips** |
| `npm run build` from `backend/` | **PASS** |
| Docker backend and backend-test image build | **PASS** |
| Docker runtime Silo preflight | **BLOCKED**; endpoint is set, required bucket and credential variables are missing |
| `npm run verify:silo` | **BLOCKED / skipped**; missing test/raw/verifier configuration |
| Docker `backend-test` profile | **BLOCKED / skipped** both integration tests before any MongoDB or S3 operation |
| `docker compose ... --profile test config --quiet` | **PASS** |
| `git diff --check` | **PASS**; only existing LF/CRLF warnings |

No `.env` file was opened, printed, or modified. No S3 object contents, MongoDB Atlas, production writes, or live crawl were used.

## Owner actions before S3 acceptance

- Confirm whether Nginx should be local-only or remotely reachable; have an authorized host administrator inspect the active Docker firewall rule and test from an approved second machine.
- Confirm whether anonymous access to `/public/` is intentional. Confirm that `/private/` is not expected to serve public content.
- Confirm the exact raw bucket and dedicated test bucket; configure separate raw-writer, test, and read-only verifier identities locally. Do not send secrets through chat.
- Provide a known existing raw object key (key only, not content) for raw object-level privacy testing.
- Decide whether the dedicated test bucket must be routed through Nginx. Do not map it to a production/public bucket to make a test pass.
- Have the Silo administrator review/remove source Compose credential fallbacks and review effective policy inheritance.
- Complete the source-rights checklist in `SILO_PROVISIONING_CHECKLIST.md` before any live crawl.

After provisioning, rerun from the repository root / `backend/` as appropriate:

```powershell
# Status only; no S3 write
docker compose -f smart-electronics-docker-compose.yml run --rm --no-deps backend node dist/seed/siloPreflight.js

# Read-only raw-bucket verification with SILO_VERIFY_*; no object contents downloaded
docker compose -f smart-electronics-docker-compose.yml run --rm --no-deps backend node dist/seed/siloPreflight.js --verify-raw

# Same-object valid, invalid, and no-credential checks using SILO_TEST_* only
docker compose -f smart-electronics-docker-compose.yml --profile test run --rm --no-deps backend-test npm exec -- tsx --test tests/siloVerification.integration.test.ts

# Full WaterCrawl mock + test-bucket + isolated local Mongo E2E (start Mongo test first)
docker compose -f smart-electronics-docker-compose.yml --profile test up -d mongodb-test
docker compose -f smart-electronics-docker-compose.yml --profile test run --rm --no-deps backend-test
docker compose -f smart-electronics-docker-compose.yml --profile test stop mongodb-test
docker compose -f smart-electronics-docker-compose.yml --profile test rm -f mongodb-test
```

The raw writer key is never used to create a test object. No credentials or object-key values should be supplied in chat or printed in test output.
