# Product Data Collector

## Data policy and source status

The collector supports ACCESSTRADE Datafeeds and licensed CSV feeds. Website crawling is not part of this application. Add only sources for which the project has documented data-use permission. Image permission is separate from product-data permission.

Current source status:

| Source | Status |
|---|---|
| ACCESSTRADE / CellphoneS | Active publisher Datafeed source in MongoDB. Product and image usage are configured as authorized; images are displayed only with the matching affiliate offer. |
| ACCESSTRADE / Thế Giới Di Động | Active publisher Datafeed source in MongoDB. Product and image usage are configured as authorized; images are displayed only with the matching affiliate offer. |
| ACCESSTRADE, unfiltered | Not used for catalog ingestion; a prior sample included unrelated merchants and cannot establish electronic product eligibility. |
| ACCESSTRADE, FPT Shop domain | Previously returned HTTP 200 with `total=0`; feed entitlement and the exact campaign/domain need confirmation from ACCESSTRADE. |
| FPT Shop website | Terms and robots were checked. No permission to copy its product catalog or images was established. |
| CellphoneS website | Terms and robots were checked. No product feed license was established; do not copy catalog data/images from the site. |
| Phong Vũ website | `robots.txt` returned 403 during the check; no feed license was established. Do not bypass the restriction. |
| GearVN website | Robots signals allow search reference but do not grant catalog or image reuse. No feed license was established. |

The active source records document the project's permission configuration and evidence. They are not a substitute for a provider agreement or a grant covering other merchants. Do not add another domain or reuse images outside the matching campaign affiliate link without recording its permission separately.

The catalog expansion has imported data from the two active feeds in multiple batches. The latest batch added 2,452 Product records but stopped during Offer writes because the MongoDB Atlas cluster exhausted its storage quota; 912 of those products still need an Offer. See the [dated import and verification report](../reports/ACCESTRADE_CATALOG_EXPANSION_2026_11_13.md). Do not resume the import until cluster storage is available. An API key alone is not treated as permission to use merchant data or images.

## Open model catalog: TechAPI

TechAPI is a separate, openly licensed technical-reference source. Its dataset is CC BY-SA 4.0 and requires the attribution “Data from TechAPI” plus a link to the repository; derived data must retain the share-alike license. The existing index importer stores source references in `TechApiCatalogRecord` with `discovery_only` status. It does not create Product or Offer records, current prices, or retailer availability.

```powershell
cd backend
npm run import:techapi:index
npm run enrich:techapi:details -- --category smartphone --limit 200
npm run enrich:techapi:details -- --category smartphone --limit 200 --write
```

Both TechAPI import commands read `MONGODB_URI` from the process environment and do not load `backend/.env`. The detail command defaults to dry-run. `--write` caches a bounded batch of full source records, a SHA-256 digest, fetch time, and searchable technical text in `TechApiCatalogRecord`; it only permits a MongoDB host on localhost. Set `MONGODB_URI` in the process environment before invoking either command. The detail batch limit is 1,000 and default is 200; repeat it to continue through unhydrated references. Use `--refresh --write` only to refresh source details. Do not use it with Atlas or a production database.

TechAPI details can include MSRP, manufacturer reference links, and images from Wikimedia Commons. MSRP is not a current local retail offer. An image is surfaced as a clearly labeled reference only when the source record includes both license and attribution metadata; its exact model identity is still unverified. The TechAPI dataset license does not cover image files: each Wikimedia file has its own license and attribution, linked from its file page. These candidates do not become verified Product images or Offers automatically.

Source documentation: [TechAPI data license](https://github.com/GetTechAPI/TechAPI/blob/main/data/LICENSE.md) and [TechAPI dataset](https://github.com/GetTechAPI/TechAPI).

## Admin setup and endpoints

Set `ADMIN_API_TOKEN` in `backend/.env`. The token is accepted only in the `Authorization: Bearer ...` request header; it is not returned by any endpoint. If unset, Admin endpoints fail closed with HTTP 503. Do not commit `.env`.

The React Admin console is available at `/admin`. It keeps the entered token in memory only. The backend routes are mounted under `/api/admin/collector`:

- `GET /sources`, `GET /categories`, `GET /review`, `GET /runs`
- `POST /sources` to register a permitted feed and record permission evidence
- `POST /sources/:sourceKey/run?mode=dry-run|import|update`
- `POST /sources/:sourceKey/run?mode=price-dry-run|price-sync` for ACCESSTRADE Datafeeds
- `POST /review/:id` to approve with an allowed electronics category or reject
- `GET /export.csv`

`dry-run` fetches and validates at most 20 products and writes nothing to MongoDB, including run history. `import` upserts products only when identity, family, generation, specifications, product URL, licensed image, and source evidence are present; incomplete rows go to the review queue. `update` changes existing verified models only. Unknown categories go to the review queue; unrelated products are rejected. Failed feeds do not delete existing products or offers.

For ACCESSTRADE imports, source registration requires permission evidence and an Admin acknowledgement that relevant feed terms were checked. Image rights require a separate permission record. These fields document an Admin assertion; they do not replace a contract or permission from the provider.

The dedicated catalog expansion command also requires an active DataSource record with data-use authorization. It reads image permission from that record and never creates or upgrades permission records itself. It compares identities against Product and PendingProduct, skips unpermitted images, ignores feed rows older than 14 days, and defaults to dry-run. Newly imported feed images remain pending visual identity review even when reuse permission is configured.

```powershell
cd backend
npm run backup:catalog
npm run catalog:import:accesstrade -- --target=1000
npm run catalog:import:accesstrade -- --target=1000 --import
npm run audit:catalog
npm run audit:field-quality
```

The backup contains Product, Offer, and SyncRun collections and is written to the local temporary directory. Do not run `--import` until the dry-run output has been reviewed and the database has enough storage. Re-running the import is safe for Product deduplication by normalized category/brand/model, source identifier, and canonical product URL; Offers are upserted by product, source, and seller. The current Atlas quota must be increased or storage freed before resuming the interrupted run.

## Price ingestion

Price collection is separate from product/image import. `price-dry-run` reads one feed page (up to 20 rows) and writes nothing. `price-sync` requires the source's documented data permission, but does not require image permission. It accepts a price only when the row contains a positive price, explicit VND currency, an HTTPS product page, a source product identifier, and an exact brand/category/model or variant-SKU match to a model-verified Product. It does not match by fuzzy name and skips ambiguous matches when more than one Product has the same exact identity. It skips feed prices older than 14 days and does not overwrite an Offer whose stored timestamp is newer. It can attach an Offer before the Product is published; public search still requires a published Product and verified Offer.

Price status is stored independently as `priceVerificationStatus` (`verified`, `pending`, or `rejected`), alongside the source URL, retrieval time, currency, seller, and verification note. Web search snippets or category pages alone are not a verified offer. A manually researched exact product page can be stored as a pending Offer when the displayed price or availability is ambiguous; only a checked, unambiguous seller price is eligible to affect public price filtering. Price feeds never write to Product `price` fields and do not require model/image rights to be changed.

## Licensed CSV format

CSV requires `name` and `category`. Optional columns are `sourceProductId`, `sku`, `brand`, `model`, `modelNumber`, `family`, `generation`, `releaseYear`, `productStatus`, `price`, `originalPrice`, `currency`, `sellerName`, `description`, `imageUrl`, `productUrl`, `affiliateUrl`, `lastUpdated`, `availability`, `specifications` (a JSON object), and `variants` (a JSON array). The test/import limit is 20 rows. Prices, models, specifications, and URLs are stored only when supplied; the importer does not invent missing values. CSV rows with uncertain categories or missing verification evidence are queued for review.

Register a CSV source with a license reference or other permission evidence. Do not include images unless the license explicitly allows reuse and the source is marked as image-authorized.

## Verification

Run `npm test` and `npm run build` in `backend/`, then `npm run build` in `frontend/`. Current backend tests and builds passed. The read-only catalog audit passed after the partial batch; field-quality audit was not rerun because it writes MongoDB enrichment jobs while storage is full. Feed titles supply only limited explicit specifications; missing model facts remain unknown instead of being inferred.
