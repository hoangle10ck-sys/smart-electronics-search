# Catalog Expansion Report — 2026-11-13

## First import result

Imported from the configured ACCESSTRADE feeds for CellphoneS and Thế Giới Di Động into MongoDB `smart_electronics`.

- Feed rows scanned: 21,263 across 107 pages.
- New Product records: 422.
- Offer records created or updated: 440.
- Duplicate feed rows skipped: 1,800.
- Old, invalid, unrelated, or unclassified rows skipped: 14,292.
- Rows skipped because an image was not permitted: 0.
- Exact products matched for update: 0. Existing Product/Offer records were not overwritten.
- New records with an image URL and stored permission metadata: 422.
- New records with title-derived specification fields and matching evidence: 246.
- New records without enough explicit title facts to add specifications: 176.

The importer compared normalized category, brand, model, and product name across the full Product collection, also checked source product identifiers and PendingProduct identities, and found no duplicate brand/model identities within the 422 newly inserted records.

## Subsequent expansion batches

### Batch 2 — completed

- Scanned the same 21,263 feed rows with a target of 200 published models per category.
- Created 1,662 Products and upserted 1,707 Offers; no exact category/brand/model matches were updated.
- A duplicate Apple Magic Keyboard listing was found across `tablet` and `keyboard`: the feed used two IDs for the same product URL. The verified record was retained, corrected to `keyboard`, both feed IDs were preserved, and the duplicate Product/Offer created by this batch was removed.
- The catalog audit after reconciliation reported zero duplicate brand/model groups.

### Batch 3 — partial; stopped by database storage quota

- Dry-run scanned 21,263 rows and planned 2,452 additional Products at a target of 1,000 models per category. The exact Magic Keyboard URL was no longer planned for insertion.
- All 2,452 Product records were created. The run then stopped while writing Offers after MongoDB Atlas reported that the cluster storage quota was exhausted.
- The catalog now has 6,253 Product records and 4,894 Offer records. Read-only inspection found 912 of the 2,452 new Products do not yet have an Offer. The remaining 1,540 new Products have an Offer; four additional Offer documents were added during the run, for a net Offer document increase of 1,544.
- All 2,452 new Products have a permitted feed image URL; all remain pending visual identity verification. 1,039 have explicit title-derived specification fields and source evidence. The other 1,413 remain without title-derived specifications.
- The interrupted batch could not record a final `SyncRun`; the most recent recorded run is the successful second batch. No more database writes were attempted after the quota error.
- A pre-batch backup of Product, Offer, and SyncRun is at `C:\Users\DELL\AppData\Local\Temp\smart-electronics-catalog-backup-2026-11-13T16-38-47-204Z` (7,208 documents).

The third batch can resume after the database storage quota is increased. The importer now deduplicates canonical product URLs as well as category/brand/model and source IDs, and can attach feed Offers to an already-published matching product.

## Products added by category

| Category | Added |
|---|---:|
| Air conditioner | 80 |
| Camera | 20 |
| Charger | 20 |
| CPU | 20 |
| Electronics accessory | 20 |
| E-reader | 1 |
| Headphone | 20 |
| Keyboard | 20 |
| Laptop | 20 |
| Monitor | 20 |
| Mouse | 20 |
| Networking | 20 |
| Phone | 20 |
| Printer / scanner | 20 |
| RAM | 1 |
| Smartwatch | 20 |
| Speaker | 20 |
| Storage | 20 |
| Tablet | 20 |
| TV | 20 |

Examples of brands represented in the added feed records include Samsung, Panasonic, Toshiba, LG, Xiaomi, Canon, Sony, Apple, Intel, AMD, JBL, Razer, Akko, TP-Link, Brother, SanDisk, Transcend, and MSI.

## Data handling and verification

- Only current feed entries updated within 14 days, with a positive VND price, product URL, and matching affiliate URL were considered.
- The stored offers keep the seller, current price, original price when supplied, currency, product URL, affiliate URL, and feed update time.
- Images are shown only where the existing DataSource record grants image permission and has permission evidence. Every new image remains `imageVerificationStatus: pending` and `imageVisualIdentityChecked: false` until a person checks that it depicts the exact model.
- A reachability sample checked one image URL from each of 20 added categories. All 20 returned image content; two CDNs required a ranged GET because their HEAD response did not report an image content type.
- Specification values are extracted only when present in the product listing title. Each extracted record points to the retailer product page. This does not establish a complete manufacturer specification sheet.
- Classifier tests exclude passive cases, stands, used listings, and known accessory/device category conflicts. Air conditioners are assigned to `air_conditioner`; RAM capacities are not recorded as storage; decimals such as 22.5 W are preserved.
- No direct retailer-page crawling was performed.

## Catalog after first import

- Products: 2,140.
- Unique brand/model pairs: 2,099.
- Brands: 139.
- Canonical categories: 35.
- Duplicate brand/model groups reported by the catalog audit: 0.
- `air_conditioner`: 80 products; this category had no published products before this import.

Categories still below the import target of 80 include desktop, drone, e-reader, gaming console, GPU, microphone, motherboard, NAS, professional audio, projector, RAM, smart home, SoC, streaming/capture, UPS, VR/AR, and webcam. The configured feeds did not supply enough eligible, current records to fill them.

## Current catalog state

Latest read-only catalog audit after the partial third batch:

- Products: 6,253; unique brand/model count: 6,212; brands: 149; canonical categories: 35.
- Duplicate brand/model groups: 0.
- Offers and verified prices: 4,894.
- Products with licensed image metadata: 5,702; products with specification data: 2,967.
- The current 2,452-product batch spans charger (279), headphone (379), electronics accessory (117), camera (9), monitor (246), mouse (130), speaker (110), smartwatch (220), keyboard (89), laptop (452), tablet (148), phone (170), and TV (103).
- Since the 1,718-product baseline, the three batches added a net 4,535 Product records after removing the one duplicate listing.

## Evidence and repeatable checks

- ACCESSTRADE [Datafeed API documentation](https://developers.accesstrade.vn/api-publisher-vietnamese/lay-thong-tin-datafeeds) and [publisher terms](https://biz.accesstrade.vn/dieu-khoan/).
- MongoDB run record for the first batch: `catalog-expansion:thegioididong.com,cellphones.com.vn`, started `2026-11-13T16:00:00.472Z`, status `succeeded`.
- MongoDB run record for batch 2: same source key, started `2026-11-13T16:18:49.753Z`, status `succeeded`.
- Backend regression tests: `npm test` — 153 passed, 0 failed.
- Backend TypeScript build and frontend production build passed.
- `npm run audit:catalog` completed read-only after the partial third batch. `npm run audit:field-quality` was not rerun after that batch because it writes enrichment jobs to MongoDB and the cluster is out of storage.
- Backups were created before each large import with `npm run backup:catalog`; each contains only Product, Offer, and SyncRun collections under the local temporary directory.
