# AI Advisor Task 7 Acceptance Report

**Date:** 2026-11-12  
**Repository:** `smart-electronics-search`  
**Decision:** **Not fully accepted.** Context, deterministic intent, grounded-response unit checks, search regression, and builds pass. Product coverage, account-bound conversation authorization, live API/browser acceptance, and human/model-dependent evaluation remain open.

## Acceptance matrix

| Group | Status | Evidence |
|---|---|---|
| Context management | PASS | Six-turn regression passes: ASUS → Lenovo; budget and programming purpose retained; RAM 32GB → 16GB; lighter and cheaper refinements retained. Empty new search replaces current results while archiving prior product IDs. |
| Vietnamese intent detection | PASS | 50 scenarios / 52 turns. All 21 code-deterministic turns pass: intent 21/21, requirement extraction 315/315 fields, retention 295/295, updates 20/20, clarification 21/21. The separate intent suite includes accented, unaccented, English-term, and out-of-scope messages. |
| Grounded AI answers | PASS (automated checks) | Backend verification tests cover missing/expired/invalid prices, unknown specifications, budget failures, unsupported numbers/URLs/compatibility claims, and unknown product IDs. This does not establish that every natural-language statement is hallucination-free. |
| Product recommendation | FAIL | 200 live-catalog retrieval cases: Recall@10 97.5%, exact-model top-1 100%, no-result accuracy 100%, measured constraint violation 0%; Precision@5 19.5% under a one-target-per-query dataset. Live probes found no verified headphone-study, standalone RAM, or standalone SSD results. |
| Conversation evaluation | BLOCKED | 15 model-dependent turns, 12 catalog-dependent turns, and 4 human-review turns are in the corpus but were not scored by the deterministic runner. Product relevance and explanation/follow-up factuality need catalog snapshots, captured model responses, or human labels. |
| Performance | PASS (measured paths) | 200 search cases: p50 203 ms, p95 836 ms. Earlier read-only advisor service run: total p50 390 ms / p95 1,015 ms; details and Ollama inference measurements are in the Task 5 report. These are separate runs and are not a before/after claim for the full HTTP endpoint. |
| Security | BLOCKED | Conversation state is isolated by UUID and per-conversation queue tests pass. Conversation GET/reset/delete routes use a UUID v4 bearer identifier but have no account-bound owner authorization; access depends on keeping that identifier private. |
| Frontend | BLOCKED | Frontend TypeScript and production build pass; source inspection confirms streaming status/error/retry handling, theme selection, comparison, and responsive CSS breakpoints. No browser/device run was available, so mobile, theme, retry, and visual product-card behavior were not exercised end to end. |
| Build | PASS | Backend `tsc` build and frontend `tsc && vite build` both pass. |

## Tests and measurements run

- Backend `npm test`: **147 passed, 0 failed**.
- Backend `npm run evaluate:advisor`: 50 scenarios / 52 turns; zero deterministic mismatches. The 31 remaining non-deterministic or review turns are reported separately, not counted as passing.
- Backend `npm run evaluate:search -- --label=task7-acceptance-r2`: **200 queries** (160 positive examples and 40 no-result controls); Recall@10 97.5%, MRR 97.5%, nDCG@10 97.5%, exact-model top-1 100%, no-result accuracy 100%, constraint violation 0%, Precision@5 19.5%, latency p50 203 ms / p95 836 ms. Since positive cases label one product ID while other retrieved products are not independently judged, Precision@5 is not a human relevance score.
- Backend `npm run build`: PASS.
- Frontend `npm run build`: PASS.
- Read-only MongoDB `smartSearch` probes were run for laptop programming, laptop gaming, smartphone photography, headphones for study, CPU gaming, GPU design, gaming monitor, RAM, SSD, router, and gaming mouse. The sampled returned products had verified product identities and URLs; some images were pending and one laptop had no verified price, so those fields remain unavailable rather than being asserted.
- The dated catalog coverage snapshot (`SEARCH_CATALOG_COVERAGE_2026_11_12.json`) records 19/27 advisor probes with verified products and 8 without. The dated field-quality snapshot records 28.23% fully verified specification coverage, 61.64% verified image coverage, 67.99% verified price coverage, and 3.43% fully verified source-provenance coverage. Those coverage gaps limit claims across all categories.
- There is no configured lint, integration-test, or API-test script. No Qdrant service/client is configured; vector retrieval uses MongoDB Atlas Vector Search.

## Live category probes

Counts below are verified catalog search results at the time of the read-only probe; zero means the advisor should report no verified product rather than reuse unrelated results.

| Query | Results |
|---|---:|
| Laptop programming | 6 |
| Laptop gaming | 1 |
| Smartphone photography | 30 |
| Headphones for online study | 0 |
| CPU gaming | 1 |
| GPU design | 1 |
| Gaming monitor | 33 |
| Standalone RAM 16GB | 0 |
| Standalone SSD 1TB | 0 |
| Wi-Fi router | 59 |
| Gaming mouse | 22 |

The laptop query with a 16GB RAM minimum returned laptop products and treated 16GB as a minimum, so a verified 24GB model was not incorrectly rejected. Component-only RAM/SSD queries are now classified as their own search categories and return an empty result when the verified catalog has no match.

## Defects fixed during acceptance

The first deterministic evaluation produced **37 mismatches**. The failures exposed these causes:

- Sentence punctuation prevented exact brand dictionary matches, so “Chuyển sang Lenovo.” could leave ASUS active and trigger a clarification.
- A model-code regex allowed spaces and interpreted fragments of budget/GB phrases as model identifiers.
- RAM minimum phrases and standalone RAM/SSD capacities were consumed before category recognition; RAM could be mistaken for storage or a new product category during a laptop follow-up.
- Removal rules missed “Bỏ điều kiện loại trừ GPU rời đi.”; model replacement and removal did not preserve the full model phrase.
- “Thực ra 16GB cũng được” was treated as storage rather than a contextual relaxation of a 32GB RAM requirement.
- Alternative-brand requests added “thương hiệu khác” as a stored selection criterion, and explicit add/keep wording was misclassified.

The deterministic suite now reports zero mismatches. The search parser keeps decimal notation such as `3.2` while treating sentence-ending punctuation as a word boundary. Consumer storage capacity uses decimal units (`1 TB = 1,000 GB`).

## Changed files for this acceptance

- `backend/src/utils/text.ts`
- `backend/src/services/queryParser.ts`
- `backend/src/services/queryParser.test.ts`
- `backend/src/services/advisorIntent.ts`
- `backend/src/services/advisorIntent.test.ts`
- `backend/src/services/productAdvisor.ts`
- `backend/src/services/advisorConversationState.test.ts`
- `backend/reports/search-evaluation-task7-acceptance.json`
- `backend/reports/search-evaluation-task7-acceptance-r2.json`

The existing performance record is [ADVISOR_TASK5_PERFORMANCE_REPORT.md](./ADVISOR_TASK5_PERFORMANCE_REPORT.md). Search metrics are in the two acceptance report JSON files above.

## Remaining blockers and risks

1. Headphone-for-study, standalone RAM, and standalone SSD verified catalog results were empty; recommendation coverage across the requested categories is therefore incomplete.
2. Conversation endpoints authorize by possession of a random UUID, not an authenticated owner. The current deployment has no account identity to bind to a conversation, so owner permissions cannot be accepted as verified.
3. A full six-turn HTTP/SSE acceptance run was not sent to the configured database because the route persists conversations and no isolated test database was configured. Equivalent requirement/state behavior and stream failure paths were tested at service/client level; the live catalog probes were read-only.
4. Ollama outage/timeout and client cancellation are covered by unit tests, but service outages were not induced in the live environment. Qdrant is not part of this deployment.
5. Frontend visuals and interactions were not exercised in a real browser or mobile viewport. Product relevance and natural-language explanation quality still require captured catalog/model runs and human review.

## Run instructions

- Backend development server: from `backend/`, run `npm run dev` (default port 5000).
- Frontend development server: from `frontend/`, run `npm run dev` (Vite default port 5173, `/api` proxied to backend).
- Regression tests: from `backend/`, run `npm test`.
- Advisor corpus evaluation: from `backend/`, run `npm run evaluate:advisor`.
- Search evaluation: from `backend/`, run `npm run evaluate:search -- --label=<new-report-label>`; each label writes a separate report under `backend/reports/`.
- Builds: run `npm run build` from each of `backend/` and `frontend/`.
