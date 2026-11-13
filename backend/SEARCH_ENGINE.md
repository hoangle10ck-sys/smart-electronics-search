# Search engine operations

The existing `/api/products/*` routes remain available. The versioned API adds:

- `GET /api/v1/search?q=...` and `POST /api/v1/search` with query, category, brand, VND budget, RAM, SSD/HDD type and capacity, VRAM, display size, page, limit, sort, and search mode (`hybrid`, `exact`, `keyword`, or `semantic`).
- `GET /api/v1/products`, `GET /api/v1/products/:id`, and `GET /api/v1/products/:id/similar`.
- `POST /api/v1/ai/understand-query`, which returns validated intent and separates explicit hard constraints from soft preferences.
- `POST /api/v1/feedback`, with validation and per-IP rate limiting.
- `POST /api/v1/chat/message` for the catalog-grounded shopping advisor; `GET`/`DELETE /api/v1/chat/conversations/:id` restore or erase a session, and `POST /api/v1/chat/conversations/:id/reset` clears its context.
- `GET /api/v1/chat/suggestions` for starter prompts. Chat sessions use opaque UUIDs, are stored in MongoDB for up to 30 days, and retain only a bounded message history plus structured requirements.
- `GET /api/v1/health`, which reports MongoDB, Ollama model, and Atlas vector-index readiness without returning credentials.

## Catalog normalization

Normalization is additive. It stores normalized names, brand/model/SKU identifiers, model aliases, and conservative numeric specifications beside the original product fields. RAM options such as `8GB or 16GB` are not converted into a fixed capacity. The migration reports possible duplicate identities for manual review and never merges products or offers.

From `backend/`:

```sh
npm run backup:db                          # save all current collections first
npm run normalize:catalog                  # read-only dry run
npm run normalize:catalog -- --apply       # backfill and create normal MongoDB indexes
```

Back up MongoDB before applying a migration. The operation is idempotent and preserves original product data.

## Hybrid retrieval

Search combines indexed exact identifier lookup, MongoDB text search, and reciprocal-rank fusion. Optional local semantic retrieval uses Ollama `bge-m3` and MongoDB Atlas Vector Search. Exact and keyword retrieval remain available if the local model or vector index is unavailable. Budget constraints only use verified VND offers. Category, brand, RAM, storage, VRAM, display, and explicit use-case constraints are applied before results are returned.

The advisor reuses that hybrid search and the existing Product/Offer catalog. Product cards are created from backend product records; fit scores compare explicit category, brand, verified budget, use-case, and normalized specification facts. It does not use Qdrant because this repository is configured for MongoDB Atlas Vector Search.

Enable semantic search after configuring the local Ollama model and an Atlas vector index:

```sh
ollama pull bge-m3
npm run vectors:backfill                 # dry run
npm run vectors:index                    # dry run
npm run vectors:backfill -- --apply      # create/update separate embedding documents
npm run vectors:index -- --apply         # create the Atlas Vector Search index
```

The index defaults to `product_embedding_vector_index` with 1024 dimensions. Check readiness with `npm run vectors:index -- --status`; wait until it reports `READY`, then set `MONGODB_VECTOR_SEARCH_ENABLED=true` in `backend/.env`. Rerun vector backfill after importing or editing catalog products; unchanged source content is skipped. Embeddings are stored separately from Products and Offers.

## Evaluation

The evaluation set contains 200 labeled queries: 160 positive cases derived from eligible verified MongoDB products and their verified VND offers, plus 40 negative controls whose model identifiers or RAM requirements are absent from the catalog. Positive cases include exact model, brand/model, budget, and natural-language/specification queries; each names a catalog model, so that product ID is the labeled target.

```sh
npm run evaluate:search -- --generate --corpus-only
npm run evaluate:search -- --legacy-negative-baseline
npm run evaluate:search -- --label=after
```

Reports are written to `backend/reports/`. The runner uses deterministic query parsing for repeatable retrieval/ranking comparisons and reports P@5, Recall@10, MRR, nDCG@10, exact-model top-1 accuracy, no-result accuracy, constraint-violation rate, and p50/p95 retrieval latency. Ollama intent parsing latency is excluded from those latency figures; local embedding/vector retrieval latency is included when enabled.

Latest local run (2026-11-11), using the same 160 positive cases before and after:

| Metric | Before | After |
|---|---:|---:|
| P@5 | 0.1925 | 0.1950 |
| Recall@10 | 0.9875 | 0.9750 |
| MRR | 0.8231 | 0.9750 |
| nDCG@10 | 0.8642 | 0.9750 |
| Exact model at rank 1 | 0.7750 | 1.0000 |
| Explicit constraint violation rate | 0.0950 | 0.0000 |
| Retrieval latency p50 / p95 | 116 / 533 ms | 107 / 426 ms |

The 40 no-result controls scored 0/40 under the replayed legacy candidate filters and 40/40 with the current search. This corpus is generated from current verified catalog data, not manually judged user behavior. Each positive case labels one catalog product. Query understanding can safely fall back to deterministic parsing when local Ollama output does not pass schema validation.
