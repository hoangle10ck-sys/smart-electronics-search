# Task 5: Advisor latency and safe streaming

## Measurement method

- The Ollama benchmark makes one warm-up call and then five sequential structured-response calls to the installed `qwen3:4b` model. It measures inference only, without MongoDB or product facts.
- The code-only stage benchmark measures 2,000 iterations of validation, deterministic context/requirement handling, a blank unknown-candidate evaluation, deterministic no-result response generation, and the combined offline code path. It does not use catalog rows.
- `npm run benchmark:advisor:catalog-readonly` runs five normal advisor service searches against MongoDB with a read-only query for a sentinel conversation ID. It does not create or update conversations or products. Its recorded sample used “Tìm laptop Lenovo dưới 25 triệu để lập trình”; verified retrieval returned zero product cards, so its evaluation/response measurements are for the no-result path.
- Percentiles use the nearest-rank method. Timings vary by machine, connection, cache, and model warm state. A phase without samples is reported as not measured. No Qdrant client or collection exists in this repository; vector retrieval is MongoDB Atlas Vector Search.

## Before and after

| Measurement | Before | After | Notes |
|---|---:|---:|---|
| Qwen structured inference p50 / p95 | 8,743.93 / 8,957.80 ms | 8,591.32 / 9,049.95 ms | Five measured calls after one warm-up. Per-call speed is effectively unchanged within run variance. |
| Request validation p50 / p95, code-only | 0.0004 / 0.0007 ms | 0.0005 / 0.0010 ms | 2,000 iterations. |
| Context rules + requirement merge p50 / p95, code-only | 0.1212 / 0.2240 ms | 0.1798 / 0.3579 ms | 2,000 iterations; no model inference. |
| Product evaluation p50 / p95, code-only | 0.0083 / 0.0149 ms | 0.0062 / 0.0135 ms | Blank candidate fixture only. |
| Deterministic no-result response p50 / p95, code-only | 0.0006 / 0.0008 ms | 0.0004 / 0.0010 ms | No catalog access. |
| Offline code path total p50 / p95 | 0.2002 / 0.3530 ms | 0.2563 / 0.5221 ms | Microbenchmark only; not full request latency. |

The saved latency comes from eliminating an unnecessary inference call, not from making Qwen itself faster. Simple product search, price, and budget responses use verified backend copy and make zero Qwen chat calls. Comparison, compatibility, specification, and explicit explanation turns retain the validated Qwen path. This is covered by policy and advisor-service tests. The live read-only run observed zero chat calls for all five simple turns; it observed one embedding call on the first search and none on the four repeated cached searches.

## Read-only catalog run

| Phase | Samples | p50 | p95 |
|---|---:|---:|---:|
| Request validation | 5 | 0.01 ms | 0.02 ms |
| Conversation lookup | 5 | 37.25 ms | 190.03 ms |
| Context understanding | 5 | 1.49 ms | 5.45 ms |
| Ollama chat inference | 0 | n/a | n/a |
| Embedding inference | 1 | 113.19 ms | 113.19 ms |
| Mongo retrieval | 5 | 129.49 ms | 438.65 ms |
| Atlas vector retrieval | 5 | 218.65 ms | 370.08 ms |
| Product evaluation | 5 | 0.01 ms | 0.01 ms |
| Response generation | 5 | 0.31 ms | 5.79 ms |
| Response assembly | 5 | 0.03 ms | 0.04 ms |
| Service path total | 5 | 389.51 ms | 1,015.36 ms |
| Qdrant retrieval | n/a | n/a | n/a |

An earlier cold-model run measured the first embedding at 3,537.57 ms and the corresponding vector phase at 3,792.46 ms; the table above is the later warm-model run. Repeated identical requests reused the embedding cache. Vector timing includes embedding plus Atlas retrieval, so those two measurements overlap and should not be added. Mongo timings accumulate timed retrieval operations; total is wall-clock time. The tested query produced no verified products; a multi-card verified result is covered by an isolated service test using explicitly test-only fixtures, not by a live catalog match.

## Runtime performance report

The backend exposes `GET /api/v1/chat/performance` behind the existing admin authorization middleware. It keeps a rolling in-memory window of 512 requests per process and reports p50/p95 by phase and Ollama calls per request. It resets when the process restarts and is not a durable analytics store. It records validation, conversation load, context understanding, Ollama and embedding inference, MongoDB and Atlas vector retrieval, product evaluation, response generation/assembly, and total response. Qdrant is explicitly marked unused.

## Streaming and safety behavior

- The request remains POST JSON and returns SSE when the client sends `Accept: text/event-stream`. Non-streaming callers keep the JSON response.
- Status events identify queued, understanding, and searching phases. A 15-second SSE comment heartbeat keeps quiet model waits alive.
- Product cards are emitted only after backend verification, filtering, and fit evaluation. A changed/new empty search emits an empty product list.
- Qwen output remains buffered until the existing schema and verified-fact checks pass. Only then does the backend split the validated explanation into Unicode-safe text chunks. Raw model tokens are not exposed before validation. Therefore status and cards can arrive before a complex explanation; text chunks for that explanation begin after inference and validation complete.
- Disconnects abort Ollama and embedding fetches. The UI removes incomplete text/cards on failure, shows a retry path, and supports cancel. Client message IDs retain idempotent recovery if the server saved the turn before the connection dropped. The UI permits only one in-flight turn per conversation.

## Validation

- Backend unit tests: **139 passed, 0 failed**.
- Backend TypeScript build: **passed**.
- Frontend TypeScript and production build: **passed**.
- Live service benchmark: **5 read-only runs**, no verified cards for the selected query; no conversation or catalog writes were made.
- No standalone lint or frontend test script is configured. Full HTTP multi-turn streaming was not exercised because the live route persists conversations; the route itself was not sent a request that would write to the connected database. Client cancellation, deterministic fallback, verified-card selection, empty-result behavior, SSE framing, and multi-turn serialization are covered at unit level.
