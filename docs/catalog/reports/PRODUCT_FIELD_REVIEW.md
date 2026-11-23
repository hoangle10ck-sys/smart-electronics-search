# Product field quality report

Generated 2026-11-13T16:25:47.429Z from MongoDB `smart_electronics` in dry-run mode.

## Summary

- Products checked: 3802
- Unique brand/model pairs: 3760
- Brands / categories: 142 / 35
- Products with at least one field to review or enrich: 3802
- Jobs needing manual review: 2240
- Price freshness window: 14 days

## Field status

| Field | Verified | Partial | Missing | Outdated | Invalid | Needs review | Restricted | Verified coverage |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| name | 3761 | 0 | 0 | 0 | 0 | 41 | 0 | 98.92% |
| brand | 3761 | 0 | 0 | 0 | 0 | 41 | 0 | 98.92% |
| model | 3761 | 0 | 41 | 0 | 0 | 0 | 0 | 98.92% |
| image | 1059 | 0 | 544 | 0 | 0 | 2192 | 7 | 27.85% |
| specifications | 1466 | 462 | 1874 | 0 | 0 | 0 | 0 | 38.56% |
| price | 3252 | 0 | 509 | 0 | 0 | 41 | 0 | 85.53% |
| product_url | 3761 | 0 | 41 | 0 | 0 | 0 | 0 | 98.92% |
| description | 301 | 516 | 2985 | 0 | 0 | 0 | 0 | 7.92% |
| source_provenance | 1040 | 2721 | 41 | 0 | 0 | 0 | 0 | 27.35% |

## Coverage by category

| Category | Products | Specs verified | Images verified | Prices current | URLs verified |
|---|---:|---:|---:|---:|---:|
| air_conditioner | 95 | 95 (100%) | 0 (0%) | 95 (100%) | 95 (100%) |
| camera | 200 | 62 (31%) | 57 (28.5%) | 200 (100%) | 200 (100%) |
| charger | 202 | 140 (69.31%) | 60 (29.7%) | 200 (99.01%) | 200 (99.01%) |
| cpu | 87 | 40 (45.98%) | 30 (34.48%) | 57 (65.52%) | 87 (100%) |
| desktop | 30 | 19 (63.33%) | 5 (16.67%) | 10 (33.33%) | 30 (100%) |
| drone | 54 | 44 (81.48%) | 11 (20.37%) | 11 (20.37%) | 54 (100%) |
| electronics_accessory | 200 | 120 (60%) | 60 (30%) | 200 (100%) | 200 (100%) |
| ereader | 31 | 21 (67.74%) | 1 (3.23%) | 3 (9.68%) | 31 (100%) |
| gaming_console | 61 | 61 (100%) | 0 (0%) | 1 (1.64%) | 61 (100%) |
| gpu | 47 | 14 (29.79%) | 32 (68.09%) | 33 (70.21%) | 47 (100%) |
| headphone | 205 | 0 (0%) | 59 (28.78%) | 200 (97.56%) | 200 (97.56%) |
| keyboard | 201 | 1 (0.5%) | 60 (29.85%) | 200 (99.5%) | 200 (99.5%) |
| laptop | 212 | 5 (2.36%) | 29 (13.68%) | 196 (92.45%) | 200 (94.34%) |
| microphone | 48 | 31 (64.58%) | 17 (35.42%) | 18 (37.5%) | 48 (100%) |
| monitor | 202 | 131 (64.85%) | 59 (29.21%) | 200 (99.01%) | 200 (99.01%) |
| motherboard | 37 | 0 (0%) | 37 (100%) | 37 (100%) | 37 (100%) |
| mouse | 202 | 23 (11.39%) | 58 (28.71%) | 200 (99.01%) | 200 (99.01%) |
| nas | 30 | 30 (100%) | 0 (0%) | 0 (0%) | 30 (100%) |
| networking | 133 | 54 (40.6%) | 60 (45.11%) | 133 (100%) | 133 (100%) |
| phone | 208 | 70 (33.65%) | 30 (14.42%) | 200 (96.15%) | 200 (96.15%) |
| printer_scanner | 107 | 2 (1.87%) | 60 (56.07%) | 107 (100%) | 107 (100%) |
| professional_audio | 33 | 33 (100%) | 0 (0%) | 0 (0%) | 33 (100%) |
| projector | 33 | 1 (3.03%) | 32 (96.97%) | 33 (100%) | 33 (100%) |
| ram | 33 | 12 (36.36%) | 21 (63.64%) | 22 (66.67%) | 33 (100%) |
| smart_home | 33 | 1 (3.03%) | 3 (9.09%) | 4 (12.12%) | 33 (100%) |
| smartwatch | 203 | 0 (0%) | 59 (29.06%) | 200 (98.52%) | 200 (98.52%) |
| soc | 30 | 30 (100%) | 0 (0%) | 0 (0%) | 30 (100%) |
| speaker | 201 | 29 (14.43%) | 60 (29.85%) | 200 (99.5%) | 200 (99.5%) |
| storage | 80 | 20 (25%) | 59 (73.75%) | 80 (100%) | 80 (100%) |
| streaming_capture | 47 | 47 (100%) | 0 (0%) | 1 (2.13%) | 47 (100%) |
| tablet | 203 | 88 (43.35%) | 30 (14.78%) | 200 (98.52%) | 200 (98.52%) |
| tv | 202 | 140 (69.31%) | 60 (29.7%) | 200 (99.01%) | 200 (99.01%) |
| ups | 30 | 30 (100%) | 0 (0%) | 0 (0%) | 30 (100%) |
| vr_ar | 39 | 39 (100%) | 1 (2.56%) | 1 (2.56%) | 39 (100%) |
| webcam | 43 | 33 (76.74%) | 9 (20.93%) | 10 (23.26%) | 43 (100%) |

## Rows needing work

The full product-level queue, field statuses, and evidence URLs are in `PRODUCT_FIELD_QUALITY.json`. The table below lists all records missing a model, with no official product URL, or with fields needing rights/manual review.

| Product | Category | Brand / model | Work fields |
|---|---|---|---|
| ASUS ROG Strix G16 G614 | laptop | Asus / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Acer Nitro 5 Tiger AN515 | laptop | Acer / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| MSI Thin GF63 12VE | laptop | MSI / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Lenovo LOQ 15IRH8 | laptop | Lenovo / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| MacBook Air 13 M2 2022 | laptop | Apple / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| MacBook Pro 14 M3 Pro | laptop | Apple / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Dell XPS 13 9340 | laptop | Dell / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| HP Pavilion 15 eg3 | laptop | HP / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Dell Inspiron 15 3520 | laptop | Dell / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Asus Vivobook 14 OLED | laptop | Asus / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Lenovo ThinkPad E14 Gen 5 | laptop | Lenovo / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Acer Swift Go 14 | laptop | Acer / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| iPhone 15 Pro Max 256GB | phone | Apple / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| iPhone 15 128GB | phone | Apple / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Samsung Galaxy S24 Ultra | phone | Samsung / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Samsung Galaxy A55 5G | phone | Samsung / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Xiaomi 14T Pro | phone | Xiaomi / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Xiaomi Redmi Note 13 Pro | phone | Xiaomi / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| OPPO Reno11 F 5G | phone | Oppo / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| realme GT 6 | phone | Realme / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| iPad Air M2 11 inch | tablet | Apple / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Samsung Galaxy Tab S9 FE | tablet | Samsung / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Xiaomi Pad 6 | tablet | Xiaomi / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| AirPods Pro 2 USB-C | headphone | Apple / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Sony WH-1000XM5 | headphone | Sony / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| JBL Tune 520BT | headphone | JBL / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Razer BlackShark V2 X | headphone | Razer / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Samsung Galaxy Buds2 Pro | headphone | Samsung / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Apple Watch Series 9 41mm | smartwatch | Apple / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Samsung Galaxy Watch6 40mm | smartwatch | Samsung / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Xiaomi Smart Band 8 | smartwatch | Xiaomi / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| JBL Flip 6 | speaker | JBL / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Logitech G502 X Plus | mouse | Logitech / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Logitech MX Master 3S | mouse | Logitech / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Keychron K2 Pro | keyboard | Keychron / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| LG UltraGear 27GP850 | monitor | LG / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Dell UltraSharp U2723QE | monitor | Dell / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Samsung Smart TV Crystal UHD 55" | tv | Samsung / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Sony Bravia X75K 55" | tv | Sony / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Anker 737 Power Bank 24000mAh | charger | Anker / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| Xiaomi Power Bank 20000mAh | charger | Xiaomi / (missing) | name, brand, model, image, specifications, price, product_url, description, source_provenance |
| MacBook Air 13-inch (M2, 2022) | laptop | Apple / MacBook Air (M2, 2022) 13-inch | image, specifications, source_provenance |
| ThinkPad T480 | laptop | Lenovo / ThinkPad T480 | image, specifications, source_provenance |
| iPhone 15 | phone | Apple / iPhone 15 | image, specifications, source_provenance |
| iPhone 14 | phone | Apple / iPhone 14 | image, specifications, source_provenance |
| Google Pixel 7 | phone | Google / Pixel 7 | image, specifications, source_provenance |
| iPad Pro 12.9-inch (4th generation, 2020) | tablet | Apple / iPad Pro 12.9-inch (4th generation) | image, specifications, source_provenance |
| Microsoft Surface Pro 9 | tablet | Microsoft / Surface Pro 9 | image, specifications, source_provenance |
| iPhone 13 | phone | Apple / iPhone 13 | image, specifications, source_provenance |
| MacBook Pro 16-inch (2023, M2 Max) | laptop | Apple / MacBook Pro 16-inch M2 Max (2023) | image, specifications, source_provenance |
| iPad Air (5th generation, 2022) | tablet | Apple / iPad Air 10.9-inch (5th generation) | image, specifications, source_provenance |
| Samsung 980 PRO NVMe SSD 1TB | storage | Samsung / 980 PRO 1TB (MZ-V8P1T0) | image, specifications, source_provenance |
| Logitech MX Master 3S Wireless Mouse | mouse | Logitech / MX Master 3S | image, specifications, source_provenance |
| ASUS Dual Radeon RX 6600 XT OC Edition 8GB | gpu | ASUS / DUAL-RX6600XT-O8G | image, specifications, source_provenance |
| MacBook Pro 13-inch (M1, 2020) | laptop | Apple / MacBook Pro 13-inch M1 (2020) | image, specifications, source_provenance |
| AMD Ryzen 5 5600X Desktop Processor | cpu | AMD / Ryzen 5 5600X | image, specifications, source_provenance |
| Apple Watch Ultra 2 | smartwatch | Apple / Watch Ultra 2 (49 mm) | image, specifications, source_provenance |
| Nikon Z fc Mirrorless Camera | camera | Nikon / Z fc | image, specifications, source_provenance |
| Logitech C920 HD Pro Webcam | webcam | Logitech / C920 HD Pro Webcam | image, specifications, source_provenance |
| iPhone 12 Pro | phone | Apple / iPhone 12 Pro | image, specifications, source_provenance |
| Apple AirPods Max (1st generation, 2020) | headphone | Apple / AirPods Max 1 | image, specifications, source_provenance |
| Nikon D750 FX-format DSLR Camera | camera | Nikon / D750 | image, specifications, source_provenance |
| MacBook Air 13-inch (M1, 2020) | laptop | Apple / MacBook Air 13-inch M1 (2020) | image, specifications, source_provenance |
| Samsung Galaxy Tab S8 | tablet | Samsung / Galaxy Tab S8 (Wi-Fi) | image, specifications, source_provenance |
| Canon EOS R6 Mark III Mirrorless Camera | camera | Canon / EOS R6 Mark III | image, specifications, source_provenance |
| Logitech G502 X PLUS LIGHTSPEED Wireless Gaming Mouse | mouse | Logitech / G502 X PLUS | image, specifications, source_provenance |
| iPhone 12 Pro Max | phone | Apple / iPhone 12 Pro Max | image, specifications, source_provenance |
| iPhone 13 Pro | phone | Apple / iPhone 13 Pro | image, specifications, source_provenance |
| iPhone SE (3rd generation, 2022) | phone | Apple / iPhone SE (3rd generation) | image, specifications, source_provenance |
| iPhone 11 | phone | Apple / iPhone 11 | image, specifications, source_provenance |
| iPhone 11 Pro | phone | Apple / iPhone 11 Pro | image, specifications, source_provenance |
| Dell UltraSharp U2713HM 27-inch Monitor | monitor | Dell / U2713HM | image, specifications, source_provenance |
| iPhone 14 Plus | phone | Apple / iPhone 14 Plus | image, specifications, source_provenance |
| iPhone 14 Pro | phone | Apple / iPhone 14 Pro | image, specifications, source_provenance |
| iPhone 14 Pro Max | phone | Apple / iPhone 14 Pro Max | image, specifications, source_provenance |
| iPhone 15 Plus | phone | Apple / iPhone 15 Plus | image, specifications, source_provenance |
| iPhone 15 Pro | phone | Apple / iPhone 15 Pro | image, specifications, source_provenance |
| iPhone 15 Pro Max | phone | Apple / iPhone 15 Pro Max | image, specifications, source_provenance |
| iPhone 16 Pro | phone | Apple / iPhone 16 Pro | image, specifications, source_provenance |
| iPhone 16 Pro Max | phone | Apple / iPhone 16 Pro Max | image, specifications, source_provenance |
| iPhone 16e | phone | Apple / iPhone 16e | image, specifications, source_provenance |
| iPhone 17 | phone | Apple / iPhone 17 | image, specifications, source_provenance |
| iPhone 17 Pro | phone | Apple / iPhone 17 Pro | image, specifications, source_provenance |
| iPhone 17 Pro Max | phone | Apple / iPhone 17 Pro Max | image, specifications, source_provenance |
| iPhone 17e | phone | Apple / iPhone 17e | image, specifications, source_provenance |
| iPhone 12 mini | phone | Apple / iPhone 12 mini | image, specifications, source_provenance |
| iPhone 13 mini | phone | Apple / iPhone 13 mini | image, specifications, source_provenance |
| iPhone XS Max | phone | Apple / iPhone XS Max | image, specifications, source_provenance |
| iPhone XR | phone | Apple / iPhone XR | image, specifications, source_provenance |
| iPhone 13 Pro Max | phone | Apple / iPhone 13 Pro Max | image, specifications, source_provenance |
| iPhone 11 Pro Max | phone | Apple / iPhone 11 Pro Max | image, specifications, source_provenance |
| iPhone SE (2nd generation) | phone | Apple / iPhone SE (2nd generation, 2020) | image, specifications, source_provenance |
| ThinkPad X220 (4290-4XG) | laptop | Lenovo / ThinkPad X220 4290-4XG | image, specifications, source_provenance |
| ThinkPad T420 (4177-25G) | laptop | Lenovo / ThinkPad T420 4177-25G | image, specifications, source_provenance |
| ThinkPad T430 (2342-38U) | laptop | Lenovo / ThinkPad T430 2342-38U | image, specifications, source_provenance |
| ThinkPad T460 (20FN002JUS) | laptop | Lenovo / ThinkPad T460 20FN002JUS | image, specifications, source_provenance |
| ThinkPad T470 (20HD0070US) | laptop | Lenovo / ThinkPad T470 20HD0070US | image, specifications, source_provenance |
| ThinkPad T500 | laptop | Lenovo / ThinkPad T500 | image, specifications, price, source_provenance |
| ThinkPad T530 (2359-2HU) | laptop | Lenovo / ThinkPad T530 2359-2HU | image, specifications, source_provenance |
| ThinkPad X1 Carbon (5th Gen, 20HQ0020++) | laptop | Lenovo / ThinkPad X1 Carbon 5th Gen 20HQ0020++ | image, specifications, source_provenance |

## Interpretation

- `verified` means the required stored evidence and field-specific verification conditions are present.
- `partial` means a value exists but its evidence is incomplete.
- `outdated` applies to the latest verified offer older than the configured 14-day freshness window.
- `restricted` means an image is present but its reuse permission is not granted.
- URL reachability does not confirm exact model identity, and an image URL does not grant image rights.
- Dry-run writes the two reports only. Run `npm run audit:field-quality -- --apply` after backing up MongoDB to store `catalogQuality` on each product and create/resume one `dataenrichmentjobs` row per product.
