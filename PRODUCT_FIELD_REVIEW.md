# Product field quality report

Generated 2026-11-11T19:44:56.770Z from MongoDB `smart_electronics` in apply mode.

## Summary

- Products checked: 1718
- Unique brand/model pairs: 1677
- Brands / categories: 132 / 34
- Products with at least one field to review or enrich: 1718
- Jobs needing manual review: 156
- Price freshness window: 14 days

## Field status

| Field | Verified | Partial | Missing | Outdated | Invalid | Needs review | Restricted | Verified coverage |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| name | 1677 | 0 | 0 | 0 | 0 | 41 | 0 | 97.61% |
| brand | 1677 | 0 | 0 | 0 | 0 | 41 | 0 | 97.61% |
| model | 1677 | 0 | 41 | 0 | 0 | 0 | 0 | 97.61% |
| image | 1059 | 0 | 544 | 0 | 0 | 108 | 7 | 61.64% |
| specifications | 485 | 462 | 771 | 0 | 0 | 0 | 0 | 28.23% |
| price | 1168 | 0 | 509 | 0 | 0 | 41 | 0 | 67.99% |
| product_url | 1677 | 0 | 41 | 0 | 0 | 0 | 0 | 97.61% |
| description | 301 | 516 | 901 | 0 | 0 | 0 | 0 | 17.52% |
| source_provenance | 59 | 1618 | 41 | 0 | 0 | 0 | 0 | 3.43% |

## Coverage by category

| Category | Products | Specs verified | Images verified | Prices current | URLs verified |
|---|---:|---:|---:|---:|---:|
| camera | 60 | 0 (0%) | 57 (95%) | 60 (100%) | 60 (100%) |
| charger | 62 | 0 (0%) | 60 (96.77%) | 60 (96.77%) | 60 (96.77%) |
| cpu | 60 | 40 (66.67%) | 30 (50%) | 30 (50%) | 60 (100%) |
| desktop | 30 | 19 (63.33%) | 5 (16.67%) | 10 (33.33%) | 30 (100%) |
| drone | 54 | 44 (81.48%) | 11 (20.37%) | 11 (20.37%) | 54 (100%) |
| electronics_accessory | 60 | 0 (0%) | 60 (100%) | 60 (100%) | 60 (100%) |
| ereader | 30 | 20 (66.67%) | 1 (3.33%) | 2 (6.67%) | 30 (100%) |
| gaming_console | 61 | 61 (100%) | 0 (0%) | 1 (1.64%) | 61 (100%) |
| gpu | 47 | 14 (29.79%) | 32 (68.09%) | 33 (70.21%) | 47 (100%) |
| headphone | 65 | 0 (0%) | 59 (90.77%) | 60 (92.31%) | 60 (92.31%) |
| keyboard | 61 | 0 (0%) | 60 (98.36%) | 60 (98.36%) | 60 (98.36%) |
| laptop | 72 | 1 (1.39%) | 29 (40.28%) | 56 (77.78%) | 60 (83.33%) |
| microphone | 48 | 31 (64.58%) | 17 (35.42%) | 18 (37.5%) | 48 (100%) |
| monitor | 62 | 0 (0%) | 59 (95.16%) | 60 (96.77%) | 60 (96.77%) |
| motherboard | 37 | 0 (0%) | 37 (100%) | 37 (100%) | 37 (100%) |
| mouse | 62 | 0 (0%) | 58 (93.55%) | 60 (96.77%) | 60 (96.77%) |
| nas | 30 | 30 (100%) | 0 (0%) | 0 (0%) | 30 (100%) |
| networking | 60 | 0 (0%) | 60 (100%) | 60 (100%) | 60 (100%) |
| phone | 68 | 0 (0%) | 30 (44.12%) | 60 (88.24%) | 60 (88.24%) |
| printer_scanner | 60 | 0 (0%) | 60 (100%) | 60 (100%) | 60 (100%) |
| professional_audio | 33 | 33 (100%) | 0 (0%) | 0 (0%) | 33 (100%) |
| projector | 33 | 1 (3.03%) | 32 (96.97%) | 33 (100%) | 33 (100%) |
| ram | 32 | 11 (34.38%) | 21 (65.63%) | 21 (65.63%) | 32 (100%) |
| smart_home | 33 | 1 (3.03%) | 3 (9.09%) | 4 (12.12%) | 33 (100%) |
| smartwatch | 63 | 0 (0%) | 59 (93.65%) | 60 (95.24%) | 60 (95.24%) |
| soc | 30 | 30 (100%) | 0 (0%) | 0 (0%) | 30 (100%) |
| speaker | 61 | 0 (0%) | 60 (98.36%) | 60 (98.36%) | 60 (98.36%) |
| storage | 60 | 0 (0%) | 59 (98.33%) | 60 (100%) | 60 (100%) |
| streaming_capture | 47 | 47 (100%) | 0 (0%) | 1 (2.13%) | 47 (100%) |
| tablet | 63 | 0 (0%) | 30 (47.62%) | 60 (95.24%) | 60 (95.24%) |
| tv | 62 | 0 (0%) | 60 (96.77%) | 60 (96.77%) | 60 (96.77%) |
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
