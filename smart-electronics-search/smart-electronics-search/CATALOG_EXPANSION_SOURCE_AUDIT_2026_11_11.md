# Catalog expansion: source and rights review

Checked on 2026-11-11 for the catalog expansion task.

## Existing Mongo baseline

Before this import, MongoDB contained 169 product documents, 161 pending-product documents, 122 offers, 128 product vectors, and 128,042 TechAPI discovery references. The public product endpoint returned 128 verified products. The backend uses MongoDB Atlas Vector Search; no Qdrant connection or Qdrant collection is configured.

## Imported: TechAPI

The [TechAPI repository](https://github.com/GetTechAPI/TechAPI) licenses its `data/**` dataset under CC BY-SA 4.0, requests the attribution “Data from TechAPI,” and requires derived datasets to use the same license. The notice explicitly excludes linked Wikimedia Commons image files from the dataset license; each image keeps its own Commons license and attribution ([data license](https://github.com/GetTechAPI/TechAPI/blob/main/data/LICENSE.md)).

The selected `main` snapshot contains 104,666 JSON records: 3,022 brands, 92,824 smartphones, 4,628 CPUs, 2,075 GPUs, and 2,117 SoCs. Full source records are imported into `techapicatalogrecords` with source URLs, attribution, license, and `discovery_only` status. A SHA-256 checkpoint is stored for each file. This import does not copy image files or create current-price offers. It also does not turn discovery rows into published products or product vectors.

Import result: all 104,666 files were processed with 0 file errors; 101,644 existing product references were enriched and 3,022 brand references were added. MongoDB now has 131,064 TechAPI records and 104,666 file checkpoints. Of the product records, 23,231 carry TechAPI's own `verified: true` flag; TechFind leaves all of them in source discovery pending its own product and URL checks. The product collection remains at 169 records, the public products API remains at 128, offers remain at 122, and MongoDB product vectors remain at 128. Database logical size changed from 122,834,159 bytes to 269,872,765 bytes; storage size changed from 23,191,552 bytes to 65,064,960 bytes. A second run against the same snapshot hashed all files, skipped all 104,666 unchanged files, and made 0 inserts or updates. One earlier setup attempt stopped before writing records because the source JSON did not carry the generated API URL; the importer now builds and validates that URL from the category and slug, and the complete retry succeeded.

To resume or refresh this import, set `TECHAPI_DATA_DIR` to the extracted `data` directory and `TECHAPI_COMMIT` to the exact source commit, then run `npm run import:techapi:full` from `backend`. The importer hashes local JSON files and skips unchanged commit/path/hash checkpoints; it does not download data itself.

Live search checks after the discovery lookup update:

- `GPU NVIDIA GeForce RTX 5090`: 0 verified products, 4 TechAPI references; exact RTX 5090 ranked first.
- `CPU AMD Ryzen 9 9950X`: 1 verified product and 3 TechAPI references; exact Ryzen 9 9950X ranked first.
- `điện thoại Samsung Galaxy S25 Ultra`: 0 verified products, 8 references; Galaxy S25 Ultra ranked first with brand and technical highlights.
- `chip Snapdragon 8 Elite`: 0 verified products, 7 references; exact Snapdragon 8 Elite ranked first with release date and CPU/GPU/NPU highlights.

No prices or image assets were returned for TechAPI references. Source attribution and the CC BY-SA 4.0 license link are shown in the reference UI.

## Not imported: Pricelists.org

The [product manifest](https://pricelists.org/datasets/releases/pricelists-global-products/2026-10.2/manifest.json) and [offer manifest](https://pricelists.org/datasets/releases/pricelists-global-offers/2026-10.2/manifest.json) declare CC BY 4.0. The dataset pages' footers instead describe CC BY-SA “with additional restrictions possible”; the product schema says product names are merchant-supplied and puts redistribution-rights verification on the publisher. Product names therefore need rights clarification, and the release license is inconsistent across publisher pages. The release includes 10,728,231 products (1.44 GB) and 48,739,053 offers (1.56 GB). Offer prices are historical: the publisher says only 1.4% were refreshed within 48 hours and 8.1% within 30 days. I left both datasets out until field-level rights and Mongo storage limits are clear; old prices must not be inserted as current offers.

## Not imported: PC Part Dataset

The [PC Part Dataset](https://github.com/docyx/pc-part-dataset) is 66,778 scraped PCPartPicker records. Its author clarified that MIT covers the code, not the dataset, and said they did not get permission from PCPartPicker to host the data; the author also cites PCPartPicker's [Terms of Service](https://pcpartpicker.com/tos/) prohibiting collection/use of product listings, descriptions, and prices and use of scraping/data-mining tools. I did not import it.

## Not imported: Amazon Reviews 2023

The [AWS Open Data license](https://github.com/awslabs/open-data-docs/blob/main/docs/amazon-reviews-ml/license.txt) limits the dataset to academic research and prohibits republishing or commercial use. It is not suitable for the site's product catalog.

## Not imported: Web Data Commons

The [product corpus](https://webdatacommons.org/largescaleproductcorpus/index.html) was extracted from November 2017 web data. Its corpus page provides downloads but no clear redistribution license for the product records. The separate [Apache license](https://www.webdatacommons.org/framework/index.html) covers the extraction framework, which does not by itself grant rights to republish the underlying merchant records. I did not import the corpus into the catalog.

## Search and vector policy

TechAPI details remain visible as source references with attribution and a CC BY-SA 4.0 link. They are not marked as independently verified by TechFind. The reference UI does not show price or image assets. Only published, verified products stay in the product search and MongoDB vector index. No Qdrant sync can be performed because this project has no configured Qdrant service.
