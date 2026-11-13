# Price Research Checkpoint — 2026-11-11

## Live MongoDB snapshot

Database: `smart_electronics`.

- Products: 163 total; 122 published and model-verified.
- PendingProduct queue: 159.
- Offers: 116 total; all 116 have a positive VND price, verified status, and a usable product URL.
- Published products with a verified price offer: 116/122.
- Published products without a verified price offer: 6/122.
- Category coverage: phone 30/30, tablet 30/30, CPU 11/12, camera 3/3, mouse 2/2, GPU 1/1, webcam 1/1, VR/AR 1/1, microphone 1/1, laptop 26/30, storage 1/1, smartwatch 1/1, headphone 1/1, monitor 1/1, desktop 5/6, and drone 1/1.

Live report command: `cd backend && npm run report:prices`.

## Verified price offers

Prices are seller-specific snapshots captured on 2026-11-11. They can change; the UI should retain the seller, exact variant, and retrieval time.

| Product | Exact offered variant | Price (VND) | Seller | Source page |
|---|---|---:|---|---|
| iPhone 15 | 128 GB | 21,490,000 | FPT Shop | https://fptshop.com.vn/dien-thoai/iphone-15 |
| iPhone 16e | 128 GB | 18,990,000 | FPT Shop | https://fptshop.com.vn/dien-thoai/iphone-16e |
| iPhone 17 | 256 GB | 28,490,000 | FPT Shop | https://fptshop.com.vn/dien-thoai/iphone-17 |
| iPhone 17 Pro | 256 GB | 31,990,000 | FPT Shop | https://fptshop.com.vn/dien-thoai/iphone-17-pro-256gb?sku=00921741 |
| iPhone 17 Pro Max | 256 GB | 34,990,000 | FPT Shop | https://fptshop.com.vn/dien-thoai/iphone-17-pro-max-256gb |
| iPhone 17e | 256 GB | 20,990,000 | FPT Shop | https://fptshop.com.vn/dien-thoai/iphone-17e?sku=00926264 |
| Logitech MX Master 3S | Black | 2,990,000 | FPT Shop | https://fptshop.com.vn/phu-kien/chuot-bluetooth-logitech-mx-master-3s |
| Shure SM7B | SM7B | 12,499,000 | HACOM | https://hacom.vn/micro-thu-am-dynamic-vocal-shure-sm7b-micr0270 |
| Nikon Z fc | Existing verified listing | 23,370,000 | Nikon Vietnam / Việt Hồng | https://vhgvietnam.vn/products/nikon-z-fc |
| Canon EOS R6 Mark III | Body only, official warranty | 60,500,000 | BNCamera | https://bncamera.com/san-pham/canon-r6-mark-iii?attribute_pa_phan-loai=chinh-hang&attribute_pa_phien-ban=body-only |
| AMD Ryzen 5 5600X | Box, AM4, OPN 100-100000065BOX | 4,190,000 | TNC Store | https://tncstore.vn/products/cpu-amd-ryzen-5-5600x |
| AMD Ryzen 7 7800X3D | Tray, AM5, OPN 100-000000910 | 8,990,000 | TNC Store | https://tncstore.vn/products/cpu-amd-ryzen-7-7800x3d-4-2ghz-boost-5-0ghz-8-nhan-16-luong-104mb-am5-hang-tray-100-000000910 |
| Meta Quest 3 | 512 GB | 24,999,000 | HACOM | https://hacom.vn/bo-kinh-thuc-te-ao-meta-quest-3-512gb-glas0052 |
| iPad A16 | WiFi 128 GB, SKU 250300673 | 11,790,000 | Phong Vũ | https://phongvu.vn/ipad-a16-11-inch-128gb-wifi--p757322?selectPromotionId=1112750&sku=250300673 |
| iPad mini (A17 Pro) | WiFi 128 GB, SKU 241003495 | 15,490,000 | Phong Vũ | https://phongvu.vn/ipad-mini-7-wifi-128gb--p757310?selectPromotionId=3597649&sku=241003495 |
| Logitech G502 X PLUS | LIGHTSPEED Wireless, Mint/White Blue, SKU 261001665 | 3,190,000 | Phong Vũ | https://phongvu.vn/chuot-gaming-khong-day-logitech-g502-x-plus-lightspeed-mint-trang-xanh--s261001665 |
| AMD Ryzen 5 7600 | Box AM5, OPN 100-100001015BOX | 5,290,000 | TNC Store | https://tncstore.vn/products/cpu-amd-ryzen5-7600 |
| AMD Ryzen 5 5600G | Box AM4, 6 cores / 12 threads | 4,390,000 | GEARVN | https://gearvn.com/products/amd-ryzen-5-5600g |
| AMD Ryzen 9 9950X | AM5, 16 cores / 32 threads | 17,990,000 | GEARVN | https://gearvn.com/products/bo-vi-xu-ly-amd-ryzen-9-9950x |
| AMD Ryzen 9 7900X | AM5, 12 cores / 24 threads | 12,290,000 | GEARVN | https://gearvn.com/products/amd-ryzen-9-7900x |
| ASUS DUAL-RX6600XT-O8G | Dual RX 6600 XT OC Edition, 8 GB GDDR6 | 10,599,000 | Đỗ Lợi Computer | https://doloicomputer.vn/products/card-man-hinh-asus-dual-rx-6600-xt-o8g |
| Logitech C920 HD Pro Webcam | SKU C920-HD | 2,350,000 | Tường Vui | https://tuongvui.vn/san-pham/webcam-logitech-c920-hd/ |

The original 21 offers researched for this project were captured from retailer product listings/pages; Nikon Z fc was already in MongoDB as a verified offer before that batch. Phong Vũ's direct iPad mini and G502 X PLUS URLs returned 403 during direct opens; search results provided their exact SKU, variant, and prices, corroborated by current Phong Vũ category listings with the same price and Add to cart. GEARVN's 5600G listing contains a copied, inconsistent OPN field, so its SKU was intentionally left blank. A live TNC Store Ryzen 9 7900 listing was researched but held out because there is no exact matching Product in MongoDB. Two more retailers were admitted to the importer after checking their company details and sales pages: Đỗ Lợi Computer (established computer/components retailer; its page says new and in stock) and Tường Vui (registered electronics/computer retailer; its listing shows stock and checkout actions).

Two later one-source batches added another 94 offers. Each stored row includes the observed price, exact variant/condition when available, seller, source URL, and retrieval timestamp. These are the complete row manifests; no second-source price comparison was required for this pass:

- [Chợ Tốt batch, 82 offers](backend/src/seed/price-research-batch-2026-11-11-chotot.json)
- [Retailer batch, 12 offers](backend/src/seed/price-research-batch-2026-11-11-retail.json)

## Completed database batches

1. Batch `verified-retail-prices-2026-11-11-02`: refreshed eight existing retailer offers and inserted Canon EOS R6 Mark III and Ryzen 5 5600X.
2. Batch `verified-retail-prices-2026-11-11-03`: re-upserted those verified rows idempotently, inserted Ryzen 7 7800X3D and Meta Quest 3. The Quest was only imported after matching its actual existing MongoDB row (`brand=Meta`, `category=vr_ar`, `model=Meta Quest 3`) and confirming the seller page said in stock and offered Add to cart / Buy now.
3. Batch `verified-retail-prices-2026-11-11-04`: refreshed the 12 previously researched rows and inserted iPad A16 WiFi 128 GB at Phong Vũ, SKU 250300673, with a live product page and an offer valid through 2026-12-31.
4. Batch `verified-retail-prices-2026-11-11-05`: refreshed the 13 previously researched rows and inserted iPad mini (A17 Pro) WiFi 128 GB at Phong Vũ, SKU 241003495, at 15,490,000 VND with offer validity through 2026-12-31.
5. Batch `verified-retail-prices-2026-11-11-06`: refreshed the 14 previously researched rows and inserted Logitech G502 X PLUS LIGHTSPEED Mint/White Blue, SKU 261001665, at Phong Vũ for 3,190,000 VND (listed against 4,490,000 VND). Current category listing corroborated the price and Add to cart; direct product URL returned 403.
6. Batch `verified-retail-prices-2026-11-11-07`: refreshed 15 existing researched offers and inserted AMD Ryzen 5 7600 at TNC Store (5,290,000 VND; box OPN 100-100001015BOX) and Ryzen 5 5600G at GEARVN (4,390,000 VND; boxed AM4 listing). The GEARVN page's copied OPN field was excluded from the record.
7. Batch `verified-retail-prices-2026-11-11-08`: refreshed 17 researched offers and inserted AMD Ryzen 9 9950X at GEARVN for 17,990,000 VND. The Ryzen 9 7900 candidate was excluded after the importer found no exact Product row.
8. Batch `verified-retail-prices-2026-11-11-09`: refreshed 18 researched offers and inserted AMD Ryzen 9 7900X at GEARVN (12,290,000 VND), ASUS DUAL-RX6600XT-O8G at Đỗ Lợi Computer (10,599,000 VND), and Logitech C920 HD Pro Webcam at Tường Vui (2,350,000 VND).
9. Batch `price-research-batch-2026-11-11-chotot.json`: inserted 82 offers from individual Chợ Tốt listings/search pages. Retrieved at `2026-11-11T05:48:34.000Z`.
10. Batch `price-research-batch-2026-11-11-retail.json`: inserted 12 offers from FPT Shop, MediaMart, AGTEK, HACOM, iMax, and Phong Vũ pages. Retrieved at `2026-11-11T05:48:34.000Z`.

No product or offer was fabricated. The Quest price candidate initially failed the exact catalog match and was held back until its existing `vr_ar` product row was confirmed. Discontinued items and pages that only invite users to contact a seller were not assigned guessed prices.

## Backups and implementation

Latest full MongoDB backup, created before the two 2026-11-11 one-source batches:

`C:\Users\DELL\AppData\Local\Temp\smart-electronics-search-mongo-backup-2026-11-11T05-53-44-045Z`

It contains six collections and 128,421 documents (including the 22 offers present before the two latest batches). Earlier backup before batch `-09`:

`C:\Users\DELL\AppData\Local\Temp\smart-electronics-search-mongo-backup-2026-11-11T04-59-32-277Z`

Earlier backup before batch `-08`:

`C:\Users\DELL\AppData\Local\Temp\smart-electronics-search-mongo-backup-2026-11-11T04-53-04-557Z`

Earlier backup before batch `-07`:

`C:\Users\DELL\AppData\Local\Temp\smart-electronics-search-mongo-backup-2026-11-11T04-48-41-291Z`

Earlier backup before batch `-06`:

`C:\Users\DELL\AppData\Local\Temp\smart-electronics-search-mongo-backup-2026-11-11T04-43-47-959Z`

Earlier backup before batch `-05`:

`C:\Users\DELL\AppData\Local\Temp\smart-electronics-search-mongo-backup-2026-11-11T04-39-14-205Z`

Earlier backup before batch `-04`:

`C:\Users\DELL\AppData\Local\Temp\smart-electronics-search-mongo-backup-2026-11-11T04-34-02-313Z`

The reusable importer is `backend/src/seed/importVerifiedWebPrices.ts`; it validates HTTPS source domains, model/variant matches, current timestamps, exact catalog product uniqueness, and newer stored prices. Storage validation accepts either an exact numeric capacity or that capacity as one of multiple listed storage options. It defaults to dry-run; `npm run import:prices:verified -- --apply` writes. Batch files can be selected with `--batch-file=...`; seller overrides support the observed sellers and product pages. The price coverage report lists products without verified offers.

Backend TypeScript build passed after these changes. No tests were run in this turn.

## Next research queue

The current unpriced-product report contains six products:

1. Lenovo ThinkPad T500
2. HP Spectre x360 13t-aw0000
3. ASUS ZenBook 13 UX334
4. Apple MacBook Pro 16-inch M4 Pro (2024)
5. Apple iMac 24-inch M4 (2024, four ports)
6. AMD Ryzen 7 PRO 4750G

For this pass, one credible listing/search result with a matching product and visible price was enough to save the offer and refresh its retrieval date. The source, observed variant/condition, and timestamp are retained in the batch manifest. Continue with the same approach for the six remaining catalog products when a price can be found.
