# Electronics catalog discovery and enrichment report — 2026-11-12

Generated 2026-11-11 19:46 UTC from the live MongoDB database `smart_electronics`. This report supersedes the initial database counts in `CATALOG_SOURCE_RESEARCH_2026_11_11.md`.

## Current catalog

| Measure | Live count |
|---|---:|
| Product documents | 1,718 |
| Published unique brand/model pairs | 1,677 |
| Canonical categories | 34 |
| Brands in the field-quality audit | 132 |
| PendingProduct records | 161 total; 98 active research items |
| Verified VND offers | 1,203, attached to 1,168 products |
| TechAPI discovery references | 131,064 |
| Product search vectors | 1,677 (`bge-m3`, 1,024 dimensions) |

Product sources are 1,046 ACCESSTRADE, 631 curated, and 41 legacy rows with unknown provenance. The 41 unknown rows remain hidden. Five are now marked `suspected_duplicate` and link to a published verified candidate; neither record was merged or deleted. See [PRODUCT_DUPLICATE_REVIEW_2026_11_12.json](PRODUCT_DUPLICATE_REVIEW_2026_11_12.json).

## Discovery and database updates

The two configured ACCESSTRADE merchant feeds were read using the existing publisher API configuration. Their source records are active and store separate data-use and image-use permission evidence. Feed images are used only with their matching campaign purchase links, as recorded against the [Datafeed API](https://developers.accesstrade.vn/api-publisher-vietnamese/lay-thong-tin-datafeeds) and [ACCESSTRADE terms](https://biz.accesstrade.vn/dieu-khoan/).

The full feed run scanned 21,227 rows. The mapper accepted 8,867 current, valid rows and skipped 12,360 stale or invalid rows. The category cap was set to 60 models. Across the first-page import and full run, the catalog grew by 528 distinct models from its 1,149-model baseline (53 in the first pass, then 475 more). The full run performed 1,081 offer upserts; the first pass performed 168. Net verified offers grew from 657 to 1,203 because many upserts refreshed existing seller offers. No product price was copied into a manufacturer specification field.

The feed is not a manufacturer specification database: product identity, offer, product page, and permitted image evidence are feed-backed, while many detailed specifications and descriptions remain incomplete. The field-quality statuses below keep those gaps explicit.

Before the full feed import, MongoDB was backed up to `C:\Users\DELL\AppData\Local\Temp\smart-electronics-search-mongo-backup-2026-11-11T19-37-03-470Z` (11 collections, 240,348 documents).

## Field quality and enrichment queue

The field audit checked all 1,718 Product records. “Verified” is field-specific and reflects the evidence currently stored; it does not mean every field or every product is complete.

| Field | Verified | Partial | Missing | Needs review / restricted |
|---|---:|---:|---:|---:|
| Name | 1,677 | 0 | 0 | 41 needs review |
| Brand | 1,677 | 0 | 0 | 41 needs review |
| Model | 1,677 | 0 | 41 | 0 |
| Image | 1,059 | 0 | 544 | 108 needs review; 7 restricted |
| Specifications | 485 | 462 | 771 | 0 |
| Current price | 1,168 | 0 | 509 | 41 needs review |
| Product URL | 1,677 | 0 | 41 | 0 |
| Description | 301 | 516 | 901 | 0 |
| Source provenance | 59 | 1,618 | 41 | 0 |

There is one `DataEnrichmentJob` per Product: 1,562 pending, 156 needing manual review, and 0 completed. All Product records have at least one field-quality gap. The 192 descriptions added earlier were generated from already-sourced specifications; no local image candidates without reuse permission were attached.

The detailed field report, including per-product evidence, is [PRODUCT_FIELD_REVIEW.md](PRODUCT_FIELD_REVIEW.md), with machine-readable data in [PRODUCT_FIELD_QUALITY.json](PRODUCT_FIELD_QUALITY.json). The refreshed count and category report is [PRODUCT_CATALOG_REPORT.md](PRODUCT_CATALOG_REPORT.md).

## Vector indexing

This project uses MongoDB Atlas Vector Search in `productsearchvectors`; it has no configured Qdrant connection. The backfill embedded and wrote 475 new vectors, left 1,202 unchanged, and reported 0 failures. A direct inventory query confirmed 1,677 vectors, all labeled `bge-m3`; the embedding dimension is 1,024. The applied run is recorded in `backend/reports/product-vectors-applied-2026-11-11T19-44-49-053Z.json`.

## Search and advisor verification

The 200-case search evaluation completed with:

- Precision@5: 0.195
- Recall@10: 0.975
- MRR: 0.975
- nDCG@10: 0.975
- Exact-model top-1 accuracy: 1.000
- No-result accuracy: 1.000 across 40 no-result cases
- Constraint violation rate: 0
- Latency: p50 182 ms, p95 721 ms, mean 308 ms

The separate live coverage check matched 19 of 27 brand/category/problem queries. Eight still returned no verified product: Samsung Galaxy, Xiaomi, OPPO, vivo, and realme phones; MSI laptops; HDDs; and a Vietnamese online-learning headset query. An Intel Core CPU query now returns a verified catalog product. Full results are in [SEARCH_CATALOG_COVERAGE_2026_11_12.json](SEARCH_CATALOG_COVERAGE_2026_11_12.json).

The advisor returns exactly the verified iPhone 15 for the exact-model query and uses its stored verified offer price, 21,490,000 VND. For a Lenovo laptop with 16 GB RAM under 20,000,000 VND, it returns no product and states the exact budget. Product replies now use catalog-backed text so model-generated prose cannot invent specifications or misstate prices.

## Source and reuse decisions

- TechAPI records remain discovery-only with CC BY-SA 4.0 attribution. They are not automatically published products, and linked image rights are assessed separately. Existing detailed source/import notes are in [CATALOG_EXPANSION_SOURCE_AUDIT_2026_11_11.md](CATALOG_EXPANSION_SOURCE_AUDIT_2026_11_11.md).
- Pricelists.org’s 2026-10.2 manifests declare CC BY 4.0, while its dataset pages also describe CC BY-SA with possible extra restrictions. The release has no suitable Vietnam-market geography field and most offer prices are historical; neither bulk dataset was imported. See [products dataset](https://pricelists.org/index.php/en/datasets/global-products) and [offers dataset](https://pricelists.org/index.php/en/datasets/global-offers).
- Amazon Reviews 2023 was excluded because its [AWS license](https://github.com/awslabs/open-data-docs/blob/main/docs/amazon-reviews-ml/license.txt) limits use to academic research and disallows commercial reuse.
- Web Data Commons’ product corpus dates from November 2017, and its corpus page does not grant clear redistribution rights for underlying product records; it was not imported. See the [corpus documentation](https://webdatacommons.org/largescaleproductcorpus/index.html).
- No new API key, publisher account, paid dataset, or local image asset was used. Runtime web search remains unconfigured. TechAPI and other source leads are not counted as verified retail products.

## Remaining limits

This is a large, evidence-backed catalog snapshot, not a complete census of electronics products available in Vietnam or worldwide. Sixteen of 34 categories remain below the 60-model target, and the field audit still finds missing images, detailed specs, descriptions, prices, or full provenance. The 41 hidden legacy records need review; five have suspected-duplicate links. The eight live search gaps above also remain. Product coverage should be compared against explicit manufacturer and retailer rosters before claiming category or brand completeness.
