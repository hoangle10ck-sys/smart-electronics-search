# Backend Architecture Audit

Audit date: 2026-11-11  
Scope: existing `backend/`, the API-facing parts of `frontend/`, MongoDB collections/indexes, and local Ollama/Qdrant availability. This audit was completed before backend implementation changes for the master prompt.

## Architecture found

- Frontend: React 18, TypeScript, Vite.
- Backend: Node.js, Express 4, TypeScript, Mongoose 8.
- Primary database: MongoDB Atlas, database `smart_electronics`, server version 8.0.37.
- AI query understanding: local Ollama `/api/chat`, configured model `qwen3:4b`, JSON-schema response, deterministic parser fallback, a 60-second maximum request timeout, and an in-process 15-minute cache.
- Local Ollama inventory: `qwen3:4b` and `qwen3:8b` are installed and reachable. A natural-language query returned structured category, brand, budget, and RAM fields. Its first measured call took 19.6 seconds.
- Embeddings: no embedding service or embedding-model configuration existed in the backend. `bge-m3` was not installed.
- Vector database: Qdrant was not configured or reachable. MongoDB Atlas Vector Search is available in the existing deployment, but the database has no Search or Vector Search indexes. The implementation can therefore use the existing MongoDB deployment without adding Qdrant.
- No API keys or MongoDB connection string values were read into this report.

## MongoDB state at audit

| Collection | Documents |
|---|---:|
| products | 169 |
| offers | 122 |
| pendingproducts | 161 |
| techapicatalogrecords | 128,042 |
| datasources | 0 |
| syncruns | 41 |

There were no exact duplicate groups by case-insensitive `brand + model`. This check cannot find duplicates whose model field is missing or whose names differ substantially. Product has ordinary field indexes and one MongoDB text index; Offer has a unique `(productId, source, sellerName)` index. Offers retain a seller's latest price and timestamps, but there is no immutable price-history collection.

## Findings by requested area

### 1. Hybrid search — PARTIAL

**Already present:** `/api/products/search` remains the frontend-compatible endpoint; deterministic Vietnamese normalization and query parsing; Ollama structured query understanding; filters for category, named brand, RAM, and verified VND budgets; verified-product visibility rules; keyword scoring and use-case evidence checks; TechAPI discovery results are clearly marked unverified; web search is optional, rate-limited, cached, and not promoted into verified products.

**Needs improvement:** there is no semantic retrieval or Reciprocal Rank Fusion. The existing text index is not used by `searchService`; it loads up to 300 product documents and scores keyword/tag matches in process. Exact model handling is a model-code filter layered beside the same candidate ranking, not an independent exact-search tier; product SKUs are not indexed as top-level product identifiers. Only RAM is used as a technical hard filter; storage, storage type, CPU/GPU identity, and VRAM are not parsed as constraints. Budget filtering happens after candidate retrieval. Ollama is called even for simple exact queries. A measured `Ryzen 7 7800X3D` API request returned the exact product, but took 9.7 seconds and attached the reason “Trong ngân sách” although the query contained no budget.

**Observed query-understanding gap:** `laptop Dell dưới 20 triệu RAM 16GB để lập trình` produced the category, brand, budget, and RAM, but no programming use-case tag; “lập trình” remained as the keywords `lap`, `trinh`.

### 2. Product normalization — PARTIAL

**Already present:** canonical category taxonomy and legacy aliases; accent-insensitive text normalization; conservative RAM normalization; separate Product and Offer records; a unique Offer key per seller/source; curated Product dedupe keys based on brand/model; CSV/ACCESSTRADE ingestion, catalog review, and idempotent price upserts.

**Needs improvement:** Product has no normalized name/model fields or alias list. SKU is available only on variants/source feeds, not as a normalized first-class Product identifier. Normalized specifications currently focus on RAM and do not consistently represent storage capacity/type, VRAM, CPU, and GPU identity. There is no explicit duplicate-candidate report that distinguishes exact matches from review-required near matches. Offer upserts replace the current price for a seller and do not retain immutable price history.

### 3. Search evaluation — NOT STARTED

There was no labeled search-query corpus, ranking benchmark, precision/recall/MRR/nDCG/exact-model report, hard-constraint violation metric, or p50/p95 benchmark command. Existing tests cover collector validation, CSV parsing, catalog taxonomy, and live-search controls, but not query parsing/search ranking or Ollama/vector fallback.

## API, ingestion, and compatibility

- Existing API routes are under `/api/products`, `/api/admin/accesstrade`, `/api/admin/collector`, and `/api/admin/catalog`; `/api/health` is a basic liveness response.
- Search returns the shape consumed by the current frontend. No `/api/v1` search, similar-products, query-understanding, or feedback routes existed.
- Admin routes use `ADMIN_API_TOKEN`; collector integrations and optional web-search keys are environment configured. The `.env.example` contains no real credentials.
- Product updates/upserts come from catalog scripts, research promotion, CSV/ACCESSTRADE, and API routes. Migration must be additive, dry-run capable, idempotent, and preserve source fields and offers.
- The frontend uses existing endpoints and product fields. New search behavior must keep those endpoints and response fields compatible.

## Baseline checks

- `backend/npm test`: 16 passed, 0 failed.
- `backend/npm run build`: passed.
- `frontend/npm run build`: passed.
- Ollama Qwen3 4B structured query: active response; first measured call 19.6 seconds.
- MongoDB exact-model API query (`Ryzen 7 7800X3D`): one exact product returned; measured request 9.7 seconds.
- Qdrant health check: unavailable; no Qdrant configuration exists.

## Implementation direction

Keep Express, MongoDB, the existing Product/Offer collections, and all current routes. Add an additive normalized identity/specs representation and a dry-run/backfill report; do not merge or delete products automatically. Add exact/keyword/vector retrieval as separate ranked lists and merge them with RRF after hard filters. Use local Ollama embeddings with BGE-M3 and the existing Atlas Vector Search capability in a separate vector collection, with a deterministic keyword fallback when the embedding model or index is unavailable. Add a labeled 100+ query corpus and report real measurements rather than asserting improvements without results.

## Existing workspace state

The repository already contained extensive uncommitted catalog, backend, frontend, and documentation changes before this audit. They are part of the shared workspace and must be preserved; this work should modify only the files required by the phases above.

## Implementation closeout — 2026-11-11

| Phase | Status | Evidence |
|---|---|---|
| Architecture and data audit | Complete | Baseline and collection/index review above. |
| Additive normalization and duplicate review | Complete | 169 products scanned; 169 updated; normalized model/alias data for 128; conservative normalized specs for 134; 0 duplicate groups. A repeat dry run reported 0 updates. No products or offers were merged or deleted. |
| Exact, keyword, and semantic retrieval | Complete | BGE-M3 embeddings are stored in `productsearchvectors`; Atlas index `product_embedding_vector_index` is `READY` and queryable. Hybrid ranking uses RRF and retains exact/keyword fallbacks. |
| Versioned API | Complete | `/api/v1/search`, products, similar, query understanding, feedback validation, and dependency health routes are mounted alongside legacy routes. Local HTTP checks passed. |
| Search evaluation | Complete | 200-query corpus: 160 positive catalog targets plus 40 no-result controls. Metrics and limitations are recorded in `backend/SEARCH_ENGINE.md`. |
| Price-history coverage | Partial | Existing seller offers still provide current verified VND prices and timestamps. No immutable price-history collection exists, so historical prices cannot be reconstructed from this database. |

### Evaluation result

The same 160 positive query cases were used for the pre-upgrade and current ranking reports. The 40 negative controls were separately replayed through the legacy candidate filters for the before comparison.

| Metric | Before | After | Direction |
|---|---:|---:|---|
| P@5 | 0.1925 | 0.1950 | Improved slightly |
| Recall@10 | 0.9875 | 0.9750 | Lower by 0.0125 |
| MRR | 0.8231 | 0.9750 | Improved |
| nDCG@10 | 0.8642 | 0.9750 | Improved |
| Exact model at rank 1 | 0.7750 | 1.0000 | Improved |
| Explicit constraint violation rate | 0.0950 | 0.0000 | Improved |
| No-result controls correctly empty | 0/40 | 40/40 | Improved |
| Retrieval latency p50 / p95 | 116 / 533 ms | 107 / 426 ms | Faster |

The corpus is generated from the current verified catalog and is useful for regression checks, but it is not a manually judged production click log. The positive target is one catalog product per generated query. Ollama intent parsing is excluded from retrieval latency; Atlas embedding and vector retrieval are included. Query understanding returns deterministic rules when Ollama output is malformed or fails local schema validation.

### Final verification

- Backend tests: 24 passed, 0 failed.
- Backend TypeScript build: passed.
- Frontend production build: passed.
- Local API checks: exact-model GET search, structured POST search, product listing, similar products, query understanding, health, and invalid-feedback validation.
- API health after the model-tag fix: MongoDB connected, Qwen and BGE-M3 installed, Atlas vector index `READY`, overall status `ok`.
- After the final normalization, 9 stale BGE-M3 vectors were refreshed; 119 were already current.
- Pre-migration database snapshot: `D:\Temp\smart-electronics-search-mongo-backup-2026-11-11T09-46-57-504Z` (8 collections, 128,663 documents).
