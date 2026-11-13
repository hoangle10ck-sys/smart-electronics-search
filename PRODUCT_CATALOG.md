# Electronics Product Catalog

The MongoDB database is the catalog's source of truth. Current totals are generated from MongoDB by `cd backend && npm run audit:catalog`; the command writes [PRODUCT_CATALOG_REPORT.md](PRODUCT_CATALOG_REPORT.md), [PRODUCT_COVERAGE.json](PRODUCT_COVERAGE.json), and [IMPORT_HISTORY.md](IMPORT_HISTORY.md).

## Current database snapshot

As of 2026-11-10, database `smart_electronics` contains 149 product documents. Of these, 108 pass the current structural verified checks and 41 are legacy records with no `source` value and no verification metadata. There are 0 Offers and 12 pending research records, with 0 rejected records. The structural checks do not establish full model coverage or per-field source evidence for Product records.

The repository defines 33 canonical categories. Product records currently have no recorded product families, generations, variants, or per-field `sourceEvidence`. Twelve non-public PendingProduct research rows cover all 12 newly added categories and carry model-specific official evidence and source URLs. Seven have a sourced generation label; five leave generation unknown because the manufacturer did not specify one. All 12 are waiting for image selection and rights/visual review. The 108 curated records have documented image license metadata and product/specification URLs. The latest URL verifier only checks HTTPS reachability and image content type; it does not confirm page contents or visually verify model identity.

No fixed number of products per category is treated as a completion target. Coverage gaps are reported from the actual catalog, and a family is considered complete only when checked against a manufacturer model roster.

## Taxonomy

Canonical categories are: Laptop, Desktop / PC, Smartphone, Tablet, Smartwatch, CPU, GPU, RAM, SSD / Storage, Mainboard, Headphones, Speaker, Mouse, Keyboard, Monitor, Webcam, Camera, TV, Networking, Charger / Power Bank, Electronics Accessories, Gaming Console, Projector, Printer / Scanner, VR / AR, Drone, NAS, Smart Home, UPS, Microphone, Streaming / Capture Devices, E-reader, and Professional Audio. The legacy alias `watch` resolves to `smartwatch`.

Brand, product family, generation, model, model number, and variant are separate fields. Category-specific technical details remain in `specifications`; the smaller `specs` object is for search filters. Unknown facts stay empty rather than being inferred.

## Source and image rules

Use manufacturer product and specification pages for model identity and technical facts. Keep one `sourceEvidence` entry for each evidence type with source name, exact URL, retrieval time, and verification time. The Product schema supports lifecycle status, release year, model number, variants, image author, and image retrieval time.

Images are displayable only when their reuse permission and source are recorded. Commons file pages must be checked individually; the license conditions vary by file. For example, CC BY requires attribution, while CC BY-SA also carries ShareAlike obligations for covered adaptations. See the [Commons reuse guide](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/en).

Offers are stored separately from products. A public price requires a seller URL, currency, price, and a verification timestamp; product model verification does not imply price verification.

## Import and review

`npm run seed:catalog` validates catalog entries and idempotently upserts by normalized brand/model without deleting records. `npm run verify:catalog` performs read-only URL reachability checks and writes `CATALOG_URL_VERIFICATION.json`. `npm run backup:db` backs up MongoDB collections to a uniquely named temporary directory before a database import.

The `/admin` console requires `ADMIN_API_TOKEN` and supports category, brand, family, generation, product, variant, media, evidence, Offer, and verification-queue workflows. Verified curated products must include product family, generation, image-rights metadata, specifications, and identity/product/specification/image/image-rights evidence. Unverified or incomplete rows are kept in the review queue and are excluded from public search. The current research batch has no attached displayable image and remains pending.

See [CATALOG_RESEARCH_CHECKPOINT.md](CATALOG_RESEARCH_CHECKPOINT.md) for this session's live database audit, backup location, research sources, and remaining coverage work.
