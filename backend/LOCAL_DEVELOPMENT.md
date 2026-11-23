# Local baseline

The local baseline uses the existing search service and the curated catalog in `src/seed/catalog.json`. It writes to the isolated MongoDB database `smart_electronics_local`; it does not use the URI in `.env`.

## Start the app

1. Make sure the local MongoDB service is running.
2. In `backend`, run `npm run seed:local:expanded` to load the curated catalog, reviewed products, and any price snapshot that is still within its 24-hour verification window. This writes only to `smart_electronics_local`. Use `npm run seed:catalog:local` only when you want the 111-product curated base catalog.
3. In another terminal, run `npm run dev:local`.
4. In `frontend`, run `npm run dev`, then open `http://localhost:5173`.

The local API binds to `127.0.0.1:5000`. The local mode disables external web search, Ollama, vector search, and TechAPI discovery so search uses the MongoDB catalog and the existing keyword/model baseline.

## Baseline checks

- `ThinkPad T480` returns one exact model.
- `Apple MacBook Air M2 2022 13-inch` returns one exact model.
- `MacBook Air M2 dưới 20 triệu` returns two model candidates under `budgetUnknownItems` and no confirmed in-budget items because the local catalog has no verified prices.
- The shorter query `MacBook Air M2` also returns a MacBook Pro M2 Max candidate; use the fuller model name when checking exact identity.

The static seed contains 111 products. The expanded local database has 133 public Products across 17 of 35 categories and 33 category-brand combinations. Phones cover Apple, Google, HONOR, OPPO, OnePlus, Samsung, and Xiaomi. It has 109 active research candidates and two verified FPT Shop price observations for Xiaomi 15 and OPPO Find X9 captured on 2026-11-16; retailer prices can change, so a later catalog rebuild skips this snapshot after 24 hours. Budget searches for models without a current verified offer still report an unknown price. Twenty-two promoted products have recorded visual image checks. The original 111 seed rows still do not record `imageVisualIdentityChecked` even though the seed marks their images verified; resolve that before treating the original image set as fully reviewed.

## Expand the local catalog safely

To recreate the current expanded local dataset on a fresh local database, run `npm run seed:local:expanded` from `backend`. It seeds the curated catalog, imports fifteen research batches into the local review queue, and revalidates twenty-two image-reviewed products selected for publication. These operations use only `smart_electronics_local`.

The repository includes additional researched batches. Import one batch into the local review queue with `npm run import:research:local -- research-pending.json`; use another filename from `src/seed` as needed. This stores candidates as pending and does not make them public search results. A local import always overrides `.env` and writes only to `smart_electronics_local`.

Promote only exact source keys after live product, specification, image, and license checks pass. For example, after importing `research-pending.json`, run `npm run promote:research:local -- --file=research-pending.json web-research:meta:quest-3`. Promotion builds descriptions from sourced specifications and calculates normalized search fields. `npm run catalog:repair:local-readiness` repairs fields for the original ten expansion products in the local baseline.
