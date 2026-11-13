# Catalog Source Research — 2026-11-11

> This document preserves the initial 2026-11-11 source snapshot. Its opening catalog counts and feed-access findings are historical; see [the 2026-11-12 catalog discovery and enrichment report](CATALOG_DISCOVERY_ENRICHMENT_REPORT_2026_11_12.md) for the current database state and source updates.

## Current gap at initial review

The MongoDB catalog contains 163 Product documents and 122 published brand/model pairs across 33 categories. This is useful product-model coverage, but it is not a complete inventory of items currently sold in Vietnam or worldwide. The database has no Offer records and no connected, licensed retailer feed. Manufacturer catalogs verify model identity and specifications; they do not establish retailer stock, local SKU variants, or current market availability.

## Source options reviewed

| Source | Potential value | Access and reuse requirements | Decision |
|---|---|---|---|
| ACCESSTRADE | Vietnamese merchant feeds can provide merchant SKU, product title, price, category, product URL, and image URL. | Current approved campaign lookup returned only an ACCESSTRADE referral campaign; the unfiltered feed sample was unrelated beauty retail, and the FPT Shop feed had zero rows. ACCESSTRADE terms limit campaign assets/content to the campaign purpose. A feed response does not independently grant catalog-wide image reuse. | No electronics batch imported. Recheck after the publisher account receives an approved electronics campaign and written asset permissions. |
| Open Icecat | Broad structured product sheets from participating manufacturers. Icecat currently describes its free Open catalog as up to 2 million products from 600 sponsoring brands in 70+ languages; Full Icecat is larger and paid. | Registration is needed. Some media, including high-resolution images, may be limited to authorized resellers. The published content license prohibits use of Icecat information in systems that train AI or dynamically query it through RAG. | Do not import into the AI search path under the published license. Reconsider only if the exact app use is outside that restriction or Icecat grants explicit written permission; no account or import was used. |
| Open Products Facts | Public community-maintained product identifiers and records; may help discover GTINs and alternate names. | The dataset is presented under ODbL, which carries attribution and share-alike obligations. Contributions are user-supplied and may be incomplete or inaccurate. Photo rights must be checked separately for each asset. | Discovery/cross-check lead only. Do not mark its records verified without manufacturer evidence and independent image-rights checks. |
| Best Buy Products API | Official API describes a catalog of products, past and present. | It is a U.S. retailer catalog, requires developer access, and does not establish Vietnam-market stock or reuse rights for this project. | Not a fit for the current Vietnam-market availability goal. |
| Manufacturer product catalogs | Best current source for exact model identity, official specifications, model numbers, and lifecycle details. | Pages are model-specific, but brand photography is generally not automatically reusable. Manufacturer catalogs do not tell us which local sellers currently have stock. | Continue for model/spec coverage; keep image verification and market offers independent. |

## TechAPI initial review and GPU import

TechAPI is a useful structured discovery source for smartphones, tablets, laptops, monitors, watches, CPUs, GPUs, and SoCs. Its own documentation describes the dataset as curated, growing, and not exhaustive, so the API's `verified` flag is a lead rather than a substitute for checking the manufacturer's page.

Its data is licensed CC BY-SA 4.0. Reuse requires the attribution **“Data from TechAPI”** linked to the [TechAPI repository](https://github.com/GetTechAPI/TechAPI), and derived datasets must use the same license. TechAPI's data license does not grant rights to linked images; any Commons image needs its own file-page license and attribution review. The imported PendingProduct records store the attribution, license, source record URLs, and manufacturer evidence. Product schema and product cards preserve and display those fields if a row is later published.

On 2026-11-11, a bounded GPU batch imported 14 distinct model rows based on 15 TechAPI records (the RTX 5060 Ti memory configurations are kept as variants). The manufacturer pages passed 21 live HTTP 200 and exact-model-text checks (14 product-page checks plus 7 distinct specification-page checks), with one supplemental AMD specifications listing checked for the RX 9060 XT 8 GB variant. NVIDIA RTX 50 Series, AMD Radeon RX 9000, and Intel Arc B-series entries remain in PendingProduct with product and URL verification `verified`, image verification and publication `pending`. No image URL, MSRP, synthetic benchmark score, Offer, or retailer availability was imported.

The source data had discrepancies, so imported technical values were normalized to manufacturer pages. Examples: TechAPI gives RTX 5080 memory bandwidth as 896 GB/s while NVIDIA lists 960 GB/s; TechAPI lists 150 W for RTX 5060 while NVIDIA specifies 145 W; and TechAPI's Radeon RX 9000 bandwidth values differ from AMD's pages for the RX 9070 XT, RX 9070, RX 9060 XT, and RX 9060. TechAPI's Intel Arc B580/B570 records point to incorrect Intel SKU pages; the batch uses the live Intel SKU pages 241598 and 241676. The RX 9060 XT 8 GB variant was found in AMD's current graphics specification listing; it is a manufacturer-sourced variant, not a TechAPI record. Full per-model URL checks and corrections are in `TECHAPI_GPU_VERIFICATION_2026_11_11.json`; the Mongo import check is in `TECHAPI_GPU_MONGO_IMPORT_2026_11_11.json`.

The batch expands GPU research coverage in Mongo, but those 14 rows are not yet returned by public product search because no exact-model reusable images have been approved. TechAPI does not provide seller stock or current Vietnam-market offers.

## Full TechAPI catalog-index ingestion (2026-11-11)

The live TechAPI API index was read for ten electronics/device categories and **128,042 unique category/slug references** were upserted into the separate Mongo collection `techapicatalogrecords`. Counts: smartphones 92,824; tablets 3,305; smartwatches 418; PDAs 112; GPUs 2,075; CPUs 4,628; laptops 1,966; monitors 231; device-catalog identifiers 20,366; and SoCs 2,117. Software and website catalogs were excluded because they are not electronic products. The device-catalog and SoC records remain separately labeled source discoveries, not retail products.

This ingestion captures each API list reference (slug, display name, and detail-page URL), the raw list record, and TechAPI attribution/license metadata. It does **not** hydrate the 128,042 detail pages or import full specifications, offers, or images. Every row is marked `discovery_only`; this does not set product/image/URL verification or publication status and does not expose the rows to public product search. Existing Product, PendingProduct, and Offer counts remained 163, 159 (145 active), and 0. The index is intended to support deduplication and staged detail research; TechAPI's own dataset is curated and non-exhaustive, and category counts can change.

TechAPI data attribution is stored on every index record as **“Data from TechAPI”** with the repository and CC BY-SA 4.0 links. Any future use of linked imagery needs a separate per-image rights and visual-identity review. The import report is `TECHAPI_CATALOG_INDEX_IMPORT_2026_11_11.json`; the resumable idempotent importer is `backend/src/seed/importTechApiCatalogIndex.ts`. A pre-import backup is at `C:\Users\DELL\AppData\Local\Temp\smart-electronics-search-mongo-backup-2026-11-11T01-38-19-387Z` (5 collections, 353 documents).

## Required source to expand market availability

For products actually sold in Vietnam, connect an approved merchant or affiliate feed whose contract permits storing product identifiers and showing product links. Record source permission and image permission separately. A feed's price/stock data must have a refresh timestamp and remain an Offer linked to a verified Product. Do not generate offers from manufacturer MSRP or stale search results.

## Price research batch (2026-11-11)

The first live retailer-price batch added two Offers and did not change Product or PendingProduct totals:

| Product | Seller and source page | Price | Status | Evidence |
|---|---|---:|---|---|
| Nikon Z fc | Nikon Vietnam / Việt Hồng, [authorized-distributor product page](https://vhgvietnam.vn/products/nikon-z-fc) | 23,370,000 VND | Verified | Exact model page shows the price; the page does not state stock status. Offer retrieval/verification time is stored in MongoDB. |
| Shure SM7B | HACOM, [product page](https://hacom.vn/micro-thu-am-dynamic-vocal-shure-sm7b-micr0270) | 12,499,000 VND | Pending | Exact product code MICR0270. The page also shows a 11,999,000 VND promotional price and an end date of 2026-09-30, so the current checkout amount needs confirmation before marking this Offer verified. |
| iPhone 17 256GB | FPT Shop, [exact SKU product page](https://fptshop.com.vn/dien-thoai/iphone-17) | 28,490,000 VND | Pending | SKU 00921654. The live product block shows 28,490,000 VND; the same page's editorial section retains a 25,490,000 VND figure dated 2026-10-11. Confirm checkout before marking it verified. |

Live MongoDB after this batch: 163 Product, 159 PendingProduct (145 active), 3 Offer (1 verified, 2 pending). Backup was taken before the Offer writes at `C:\Users\DELL\AppData\Local\Temp\smart-electronics-search-mongo-backup-2026-11-11T02-26-14-022Z` (6 collections, 128,398 documents). The page prices are Offers linked to exact, already-published product identities; no price was placed in a Product spec field. The batch is recorded in `IMPORT_HISTORY.md`.

The Admin collector now has `price-dry-run` and `price-sync` for ACCESSTRADE Datafeeds. It requires exact brand/category/model or variant-SKU matching, explicit VND, a product URL, a source product ID, and a model-verified Product. It is independent of image permission, skips prices older than 14 days, and preserves a newer stored Offer. The current FPT Shop feed remains empty and there is no approved electronics campaign, so the automated feed path is implemented but unavailable until that source access is granted.

## References

- [ACCESSTRADE Datafeed API](https://developers.accesstrade.vn/api-publisher-vietnamese/lay-thong-tin-datafeeds)
- [ACCESSTRADE terms](https://biz.accesstrade.vn/dieu-khoan/)
- [Open Icecat catalog plans and coverage](https://icecat.com/content-subscription/)
- [Open Icecat content license](https://iceclog.com/content-license-icecat/)
- [Open Icecat fair-use policy](https://iceclog.com/open-icecat-fair-use-policy/)
- [Open Products Facts dataset description](https://www.data.gouv.fr/datasets/open-products-facts)
- [Best Buy developer APIs](https://developers.bestbuy.com/apis)
- [TechAPI dataset and API](https://gettechapi.github.io/TechAPI/)
- [TechAPI repository and attribution requirements](https://github.com/GetTechAPI/TechAPI)
- [TechAPI data license](https://github.com/GetTechAPI/TechAPI/blob/develop/data/LICENSE.md)
- [NVIDIA GeForce RTX 50 Series specifications](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/)
- [AMD Radeon RX graphics specifications](https://www.amd.com/en/products/graphics/desktops/radeon.html)
- [Intel Arc B580 specifications](https://www.intel.com/content/www/us/en/products/sku/241598/intel-arc-b580-graphics/specifications.html) and [Intel Arc B570 specifications](https://www.intel.com/content/www/us/en/products/sku/241676/intel-arc-b570-graphics/specifications.html)
- [Nikon Vietnam authorized-distributor page: Nikon Z fc](https://vhgvietnam.vn/products/nikon-z-fc)
- [HACOM product page: Shure SM7B](https://hacom.vn/micro-thu-am-dynamic-vocal-shure-sm7b-micr0270)
- [FPT Shop product page: iPhone 17 256GB](https://fptshop.com.vn/dien-thoai/iphone-17)

