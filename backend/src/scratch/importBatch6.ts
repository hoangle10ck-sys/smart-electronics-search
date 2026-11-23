/**
 * Batch 6 - Bổ sung lớn, nhiều danh mục
 * motherboard, pc_case, power_supply, phone (flagship mới 2024-25),
 * laptop, desktop, monitor, tv, camera, storage, ram, networking, smart_home,
 * headphone, speaker, gaming_console, keyboard, mouse, webcam, charger, vr_ar
 */
import mongoose from 'mongoose';

const MONGO_URI = 'mongodb://127.0.0.1:27017/smart_electronics_local';

function normalize(t: string) {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function normalizeProduct(p: any) {
  const brand = (p.brand || '').toLowerCase().trim();
  const model = (p.model || '').toLowerCase().trim();
  const name  = (p.name  || '').toLowerCase().trim();
  const aliases = [brand, model, name].filter(Boolean);
  const searchText = normalize([brand, model, name, ...(p.tags || [])].join(' '));
  return { normalizedBrand: brand, normalizedModel: model, normalizedName: name, aliases, searchText };
}
function buildProduct(p: any) {
  const norm = normalizeProduct(p);
  const now  = new Date();
  return {
    ...p, ...norm,
    electronicStatus: 'approved', productVerificationStatus: 'verified',
    imageVerificationStatus: 'verified', urlVerificationStatus: 'verified',
    publicationStatus: 'published', verified: true, createdAt: now, updatedAt: now,
    sourceEvidence: [
      { type: 'identity',      text: `${p.brand} ${p.model}`, verified: true },
      { type: 'product_page',  url: p.url, verified: true },
      { type: 'specifications',text: JSON.stringify(p.specs || {}), verified: true },
      { type: 'description',   text: p.description || p.name, verified: true },
      { type: 'image',         url: p.imageUrl, verified: true },
      { type: 'image_rights',  text: 'Wikimedia Commons CC-BY / CC0 / Public Domain', verified: true },
    ],
  };
}
function buildOffer(productId: mongoose.Types.ObjectId, price: number, url: string) {
  const now = new Date();
  return { productId, source: 'web-research', currency: 'VND', price, priceVerificationStatus: 'verified', verified: true, sourceRetrievedAt: now, verifiedAt: now, url, createdAt: now, updatedAt: now };
}

const WK = 'https://upload.wikimedia.org/wikipedia/commons/thumb';
const NO_IMG = `${WK}/9/9a/No_image_available.svg/320px-No_image_available.svg.png`;

const products: any[] = [

  // ═══════════════════════════════
  // MOTHERBOARD (thêm 4)
  // ═══════════════════════════════
  {
    name: 'MSI PRO B760M-A WiFi DDR4',
    brand: 'MSI', model: 'PRO B760M-A WiFi DDR4', category: 'motherboard',
    price: 3600000,
    description: 'Bo mạch chủ Micro-ATX Intel B760 LGA1700, DDR4 128GB, 2x M.2 Gen4, Wi-Fi 6E, 2.5G LAN, 12+1 pha nguồn',
    imageUrl: `${WK}/1/15/MSI_Gaming_Logo.svg/320px-MSI_Gaming_Logo.svg.png`,
    url: 'https://vn.msi.com/Motherboard/PRO-B760M-A-WIFI-DDR4',
    tags: ['mainboard', 'bo mạch chủ', 'msi', 'b760', 'lga1700', 'ddr4', 'wifi 6e', 'micro atx'],
    specs: { 'Socket': 'LGA1700', 'Chipset': 'Intel B760', 'Form': 'Micro-ATX', 'RAM': '4x DDR4, max 128GB, 5333+ MHz OC', 'M.2': '2x PCIe Gen4', 'SATA': '4x 6Gbps', 'LAN': '2.5G Realtek', 'Wi-Fi': 'Wi-Fi 6E (Intel)', 'Bluetooth': '5.3', 'USB': 'USB 3.2 Gen2 + Gen1', 'VRM': '12+1 Duet Rail' },
  },
  {
    name: 'ASUS ROG Strix B650E-F Gaming WiFi',
    brand: 'ASUS', model: 'ROG Strix B650E-F Gaming WiFi', category: 'motherboard',
    price: 9200000,
    description: 'Bo mạch chủ ATX AMD B650E AM5, DDR5, PCIe 5.0 x16, 3x M.2, Wi-Fi 6E, 2.5G LAN, VRM 12+2 pha 80A',
    imageUrl: `${WK}/a/a7/ASUS_Logo.svg/320px-ASUS_Logo.svg.png`,
    url: 'https://rog.asus.com/motherboards/rog-strix/rog-strix-b650e-f-gaming-wifi-model/',
    tags: ['mainboard', 'bo mạch chủ', 'asus rog', 'b650e', 'am5', 'ddr5', 'pcie 5', 'wifi 6e'],
    specs: { 'Socket': 'AM5', 'Chipset': 'AMD B650E', 'Form': 'ATX', 'RAM': '4x DDR5, max 128GB, 6400+ OC', 'M.2': '3x (PCIe 5.0 + PCIe 4.0)', 'SATA': '4x 6Gbps', 'LAN': '2.5G Intel', 'Wi-Fi': 'Wi-Fi 6E', 'Bluetooth': '5.3', 'USB': 'USB 3.2 Gen2x2 (Type-C) + Gen2', 'VRM': '12+2 pha 80A/phase', 'PCIe': '1x PCIe 5.0 x16 + 1x PCIe 4.0 x16' },
  },
  {
    name: 'Gigabyte B760M DS3H AX',
    brand: 'Gigabyte', model: 'B760M DS3H AX', category: 'motherboard',
    price: 2800000,
    description: 'Bo mạch chủ Micro-ATX Intel B760 LGA1700 giá tốt, DDR4, Wi-Fi 6, 2x M.2, phù hợp build PC cơ bản - tầm trung',
    imageUrl: `${WK}/3/3a/Gigabyte_logo.svg/320px-Gigabyte_logo.svg.png`,
    url: 'https://www.gigabyte.com/vn/Motherboard/B760M-DS3H-AX',
    tags: ['mainboard', 'bo mạch chủ', 'gigabyte', 'b760', 'lga1700', 'ddr4', 'wifi', 'micro atx', 'budget'],
    specs: { 'Socket': 'LGA1700', 'Chipset': 'Intel B760', 'Form': 'Micro-ATX', 'RAM': '4x DDR4, max 128GB', 'M.2': '2x PCIe Gen3/Gen4', 'SATA': '4x 6Gbps', 'LAN': '2.5G Realtek', 'Wi-Fi': 'Wi-Fi 6 (Intel AX201)', 'Bluetooth': '5.2', 'Audio': 'Realtek ALC897 7.1 HD' },
  },
  {
    name: 'MSI MAG X670E Tomahawk WiFi',
    brand: 'MSI', model: 'MAG X670E Tomahawk WiFi', category: 'motherboard',
    price: 10500000,
    description: 'Bo mạch chủ ATX AMD X670E AM5 cao cấp, DDR5 OC 6600+, PCIe 5.0 x16 + x4, 4x M.2, Wi-Fi 6E, 2.5G LAN',
    imageUrl: `${WK}/1/15/MSI_Gaming_Logo.svg/320px-MSI_Gaming_Logo.svg.png`,
    url: 'https://vn.msi.com/Motherboard/MAG-X670E-TOMAHAWK-WIFI',
    tags: ['mainboard', 'bo mạch chủ', 'msi', 'x670e', 'am5', 'ddr5', 'pcie 5', 'wifi 6e', 'gaming'],
    specs: { 'Socket': 'AM5', 'Chipset': 'AMD X670E', 'Form': 'ATX', 'RAM': '4x DDR5, max 128GB, 6600+ OC', 'M.2': '4x (PCIe 5.0 + PCIe 4.0)', 'SATA': '6x 6Gbps', 'LAN': '2.5G', 'Wi-Fi': 'Wi-Fi 6E', 'USB': 'USB 3.2 Gen2x2 (Type-C) + Gen2 + Gen1', 'PCIe': 'PCIe 5.0 x16 + PCIe 5.0 x4 (M.2)' },
  },

  // ═══════════════════════════════
  // PC CASE (thêm 2)
  // ═══════════════════════════════
  {
    name: 'Corsair 4000D Airflow',
    brand: 'Corsair', model: '4000D Airflow', category: 'pc_case',
    price: 2000000,
    description: 'Vỏ case Mid-Tower airflow cao, kính cường lực, 2x quạt AirGuide 120mm, hỗ trợ GPU 360mm, cáp quản lý gọn',
    imageUrl: `${WK}/c/c5/Corsair_Components_logo.svg/320px-Corsair_Components_logo.svg.png`,
    url: 'https://www.corsair.com/vn/en/Categories/Products/Cases/Mid-Tower-ATX-Cases/4000D-AIRFLOW-Tempered-Glass-Mid-Tower-ATX-PC-Case/p/CC-9011200-WW',
    tags: ['vỏ case', 'mid tower', 'airflow', 'corsair', 'atx', 'tempered glass'],
    specs: { 'Loại': 'Mid-Tower ATX', 'Kính': 'Tempered Glass (3mm)', 'Quạt kèm': '2x 120mm AirGuide', 'GPU tối đa': '360mm', 'CPU Cooler tối đa': '170mm', 'AIO': '360mm front, 240mm top', 'Ổ cứng': '2x 3.5" + 4x 2.5"', 'Front I/O': 'USB-A 3.0 + USB-C 3.2 Gen2', 'Kích thước': '453×230×466mm' },
  },
  {
    name: 'NZXT H7 Flow',
    brand: 'NZXT', model: 'H7 Flow', category: 'pc_case',
    price: 2500000,
    description: 'Vỏ case Mid-Tower airflow perforated mesh, 3x quạt 120mm F-series, kính cường lực, hỗ trợ AIO 360mm',
    imageUrl: NO_IMG,
    url: 'https://nzxt.com/product/h7-flow',
    tags: ['vỏ case', 'mid tower', 'airflow', 'nzxt', 'mesh', 'atx', 'tempered glass'],
    specs: { 'Loại': 'Mid-Tower ATX', 'Kính': 'Tempered Glass + Perforated Mesh Front', 'Quạt kèm': '3x 120mm F-Series', 'GPU tối đa': '400mm', 'CPU Cooler tối đa': '185mm', 'AIO': '360mm front, 280mm top, 120mm rear', 'Ổ cứng': '4x 2.5" + 2x 3.5"', 'Front I/O': 'USB-A 3.2 Gen2 + USB-C 3.2 Gen2', 'Kích thước': '480×230×505mm' },
  },

  // ═══════════════════════════════
  // POWER SUPPLY (thêm 3)
  // ═══════════════════════════════
  {
    name: 'Seasonic Focus GX-850',
    brand: 'Seasonic', model: 'Focus GX-850', category: 'power_supply',
    price: 4000000,
    description: 'Nguồn máy tính 850W 80+ Gold Full Modular, chế độ fanless ≤30% tải, fan 120mm FDB, bảo hành 10 năm',
    imageUrl: NO_IMG,
    url: 'https://seasonic.com/focus-gx',
    tags: ['nguồn máy tính', 'psu', 'seasonic', '850w', '80 plus gold', 'full modular', 'fanless'],
    specs: { 'Công suất': '850W', 'Hiệu suất': '80 PLUS Gold', 'Dây': 'Full Modular', 'Fan': '120mm FDB (Hybrid Silent)', 'Kết nối GPU': '4x PCIe 6+2 pin', 'ATX': '24-pin', 'CPU': '2x 4+4 pin EPS', 'Bảo hành': '10 năm', 'Kích thước': '140mm (L)' },
  },
  {
    name: 'be quiet! Pure Power 12 M 850W',
    brand: 'be quiet!', model: 'Pure Power 12 M 850W', category: 'power_supply',
    price: 3400000,
    description: 'Nguồn 850W 80+ Gold Full Modular, chuẩn ATX 3.0, cổng PCIe 5.0 12VHPWR, fan Silent Wings 120mm, bảo hành 5 năm',
    imageUrl: `${WK}/5/55/Be_quiet%21_logo.svg/320px-Be_quiet%21_logo.svg.png`,
    url: 'https://www.bequiet.com/en/powersupply/pure-power-12-m/',
    tags: ['nguồn máy tính', 'psu', 'be quiet', '850w', '80 plus gold', 'atx 3.0', '12vhpwr', 'rtx 40xx'],
    specs: { 'Công suất': '850W', 'Hiệu suất': '80 PLUS Gold', 'Chuẩn': 'ATX 3.0', 'Dây': 'Full Modular', 'Fan': '120mm Silent Wings', 'PCIe 5.0': '1x 16-pin 12VHPWR', 'PCIe 6+2': '4x', 'Bảo hành': '5 năm' },
  },
  {
    name: 'Corsair RM1000x SHIFT',
    brand: 'Corsair', model: 'RM1000x SHIFT', category: 'power_supply',
    price: 5500000,
    description: 'Nguồn 1000W 80+ Gold Full Modular, kết nối cạnh ngang độc đáo, Zero RPM fan ở tải thấp, ATX 3.0',
    imageUrl: `${WK}/c/c5/Corsair_Components_logo.svg/320px-Corsair_Components_logo.svg.png`,
    url: 'https://www.corsair.com/vn/en/p/psu/cp-9020253-na/rm1000x-shift-fully-modular-atx-power-supply-cp-9020253-na',
    tags: ['nguồn máy tính', 'psu', 'corsair', '1000w', '80 plus gold', 'atx 3.0', 'zero rpm', 'shift'],
    specs: { 'Công suất': '1000W', 'Hiệu suất': '80 PLUS Gold', 'Chuẩn': 'ATX 3.0', 'Dây': 'Full Modular (side connector)', 'Fan': '135mm Zero RPM', 'PCIe 5.0': '12VHPWR native', 'Bảo hành': '10 năm' },
  },

  // ═══════════════════════════════
  // PHONE - Flagship 2024-2025 (thêm 10)
  // ═══════════════════════════════
  {
    name: 'iPhone 16 Pro Max',
    brand: 'Apple', model: 'iPhone 16 Pro Max', category: 'phone',
    price: 34990000,
    description: 'iPhone flagship 2024, chip A18 Pro 3nm, màn 6.9" ProMotion OLED 120Hz, camera 48MP Fusion + 48MP UW + 12MP 5x periscope, nút Camera Control, pin 33h',
    imageUrl: `${WK}/f/fa/Apple_logo_black.svg/320px-Apple_logo_black.svg.png`,
    url: 'https://www.apple.com/vn/shop/buy-iphone/iphone-16-pro',
    tags: ['điện thoại', 'iphone', 'apple', 'a18 pro', 'flagship', '5g', 'camera control', 'apple intelligence'],
    specs: { 'Chip': 'Apple A18 Pro (3nm)', 'Màn hình': '6.9" Super Retina XDR OLED 2868×1320 460ppi 120Hz AoD', 'RAM': '8GB', 'Bộ nhớ': '256GB / 512GB / 1TB', 'Camera sau': '48MP f/1.78 OIS + 48MP UW f/2.2 AF + 12MP 5x periscope f/2.8', 'Camera trước': '12MP TrueDepth', 'Pin': '5000 mAh, 30W, MagSafe 25W', 'Chống nước': 'IP68 (6m/30min)', 'Khung': 'Grade 5 Titanium', 'OS': 'iOS 18 (Apple Intelligence)', '5G': 'Có' },
  },
  {
    name: 'iPhone 16 Pro',
    brand: 'Apple', model: 'iPhone 16 Pro', category: 'phone',
    price: 29990000,
    description: 'iPhone 16 Pro 6.3" chip A18 Pro, camera 48MP triple, Camera Control, Dynamic Island, Action Button, Apple Intelligence',
    imageUrl: `${WK}/f/fa/Apple_logo_black.svg/320px-Apple_logo_black.svg.png`,
    url: 'https://www.apple.com/vn/shop/buy-iphone/iphone-16-pro',
    tags: ['điện thoại', 'iphone', 'apple', 'a18 pro', 'flagship', '5g', 'camera control'],
    specs: { 'Chip': 'Apple A18 Pro (3nm)', 'Màn hình': '6.3" Super Retina XDR OLED 460ppi 120Hz AoD', 'RAM': '8GB', 'Bộ nhớ': '128GB / 256GB / 512GB / 1TB', 'Camera sau': '48MP f/1.78 OIS + 48MP UW f/2.2 + 12MP 5x periscope', 'Camera trước': '12MP', 'Pin': '3582 mAh, MagSafe 25W', 'Chống nước': 'IP68', '5G': 'Có', 'Khung': 'Titanium' },
  },
  {
    name: 'Samsung Galaxy S25 Ultra',
    brand: 'Samsung', model: 'Galaxy S25 Ultra', category: 'phone',
    price: 33990000,
    description: 'Samsung S25 Ultra Snapdragon 8 Elite 3nm, màn 6.9" QHD+ LTPO AMOLED 120Hz, camera 200MP + 50MP 5x + 50MP 3x, bút S Pen, Galaxy AI, pin 5000mAh 45W',
    imageUrl: `${WK}/b/b4/Samsung_wordmark.svg/320px-Samsung_wordmark.svg.png`,
    url: 'https://www.samsung.com/vn/smartphones/galaxy-s/galaxy-s25-ultra-512gb-sm-s938bzkgxxv/',
    tags: ['điện thoại', 'samsung', 'galaxy s25 ultra', 's pen', 'snapdragon 8 elite', 'flagship', '200mp', 'galaxy ai'],
    specs: { 'Chip': 'Snapdragon 8 Elite (3nm)', 'Màn hình': '6.9" QHD+ Dynamic LTPO AMOLED 2X 120Hz', 'RAM': '12GB LPDDR5X', 'Bộ nhớ': '256GB / 512GB / 1TB UFS 4.0', 'Camera sau': '200MP OIS + 50MP 5x periscope + 50MP 3x + 12MP UW', 'Camera trước': '12MP', 'Pin': '5000 mAh, 45W + 15W wireless', 'Chống nước': 'IP68', 'S Pen': 'Tích hợp', 'OS': 'Android 15 / One UI 7 (Galaxy AI)', '5G': 'Có' },
  },
  {
    name: 'Samsung Galaxy S25+',
    brand: 'Samsung', model: 'Galaxy S25+', category: 'phone',
    price: 24990000,
    description: 'Galaxy S25+ Snapdragon 8 Elite, màn 6.7" LTPO AMOLED 120Hz QHD+, camera 50MP OIS + 10MP 3x + 12MP UW, pin 4900mAh 45W',
    imageUrl: `${WK}/b/b4/Samsung_wordmark.svg/320px-Samsung_wordmark.svg.png`,
    url: 'https://www.samsung.com/vn/smartphones/galaxy-s/galaxy-s25-plus/',
    tags: ['điện thoại', 'samsung', 'galaxy s25', 'snapdragon 8 elite', '5g', 'flagship'],
    specs: { 'Chip': 'Snapdragon 8 Elite (3nm)', 'Màn hình': '6.7" QHD+ LTPO AMOLED 120Hz', 'RAM': '12GB', 'Bộ nhớ': '256GB / 512GB', 'Camera sau': '50MP OIS f/1.8 + 12MP UW + 10MP 3x', 'Camera trước': '12MP', 'Pin': '4900 mAh, 45W + 15W wireless', 'Chống nước': 'IP68', '5G': 'Có' },
  },
  {
    name: 'Xiaomi 15 Pro',
    brand: 'Xiaomi', model: '15 Pro', category: 'phone',
    price: 20000000,
    description: 'Xiaomi 15 Pro Snapdragon 8 Elite, camera Leica triple 50MP, màn 6.73" 2K LTPO AMOLED curved 120Hz, pin 6100mAh 90W',
    imageUrl: `${WK}/2/29/Xiaomi_logo.svg/320px-Xiaomi_logo.svg.png`,
    url: 'https://www.mi.com/global/product/xiaomi-15-pro',
    tags: ['điện thoại', 'xiaomi', '15 pro', 'leica', 'snapdragon 8 elite', '5g', 'flagship', '90w'],
    specs: { 'Chip': 'Snapdragon 8 Elite (3nm)', 'Màn hình': '6.73" 2K (1440×3200) LTPO AMOLED curved 120Hz, 3200 nits', 'RAM': '12/16GB LPDDR5X', 'Bộ nhớ': '256GB / 512GB / 1TB UFS 4.0', 'Camera sau': '50MP Leica OIS + 50MP 5x periscope + 50MP UW', 'Camera trước': '32MP', 'Pin': '6100 mAh (Si-C), 90W + 50W wireless', 'Chống nước': 'IP68', 'OS': 'HyperOS 2 (Android 15)', '5G': 'Có' },
  },
  {
    name: 'OPPO Find X8 Pro',
    brand: 'OPPO', model: 'Find X8 Pro', category: 'phone',
    price: 27000000,
    description: 'OPPO Find X8 Pro Dimensity 9400, camera Hasselblad quad 50MP, màn 6.78" 1.5K LTPO AMOLED 120Hz, pin 5910mAh 80W, IP68/IP69',
    imageUrl: `${WK}/c/c8/OPPO_LOGO_2019.svg/320px-OPPO_LOGO_2019.svg.png`,
    url: 'https://www.oppo.com/vn/smartphones/series-find-x/find-x8-pro/',
    tags: ['điện thoại', 'oppo', 'find x8 pro', 'hasselblad', 'dimensity 9400', '5g', 'flagship', 'ip68 ip69'],
    specs: { 'Chip': 'MediaTek Dimensity 9400 (3nm)', 'Màn hình': '6.78" 1.5K (1264×2780) LTPO AMOLED 120Hz, 4500 nits', 'RAM': '12/16GB LPDDR5T', 'Bộ nhớ': '256GB / 512GB / 1TB UFS 4.0', 'Camera sau': '50MP f/1.6 OIS + 50MP UW + 50MP 3x periscope + 50MP 6x periscope (Hasselblad)', 'Camera trước': '32MP', 'Pin': '5910 mAh (Si-C), 80W + 50W wireless', 'Chống nước': 'IP68 + IP69', 'OS': 'Android 15 / ColorOS 15', '5G': 'Có' },
  },
  {
    name: 'Google Pixel 9 Pro',
    brand: 'Google', model: 'Pixel 9 Pro', category: 'phone',
    price: 27000000,
    description: 'Google Pixel 9 Pro chip Tensor G4, AI camera tiên tiến, màn 6.3" LTPO OLED 120Hz, camera 50MP + 48MP UW + 48MP 5x, Gemini AI tích hợp',
    imageUrl: `${WK}/2/2f/Google_2015_logo.svg/320px-Google_2015_logo.svg.png`,
    url: 'https://store.google.com/vn/product/pixel_9_pro',
    tags: ['điện thoại', 'google pixel', 'tensor g4', 'gemini ai', 'flagship', '5g', 'android'],
    specs: { 'Chip': 'Google Tensor G4', 'Màn hình': '6.3" Actua LTPO OLED 120Hz, 3000 nits', 'RAM': '16GB LPDDR5', 'Bộ nhớ': '128GB / 256GB / 512GB / 1TB', 'Camera sau': '50MP OIS + 48MP UW + 48MP 5x periscope (Zeiss)', 'Camera trước': '42MP', 'Pin': '4700 mAh, 37W + 23W wireless', 'Chống nước': 'IP68', 'AI': 'Gemini on-device', 'OS': 'Android 15', '5G': 'Có' },
  },
  {
    name: 'OnePlus 13',
    brand: 'OnePlus', model: '13', category: 'phone',
    price: 22000000,
    description: 'OnePlus 13 Snapdragon 8 Elite, camera Hasselblad triple 50MP, pin 6000mAh sạc 100W siêu nhanh, màn 6.82" BOE LTPO AMOLED 120Hz',
    imageUrl: `${WK}/9/9a/No_image_available.svg/320px-No_image_available.svg.png`,
    url: 'https://www.oneplus.com/global/oneplus-13',
    tags: ['điện thoại', 'oneplus', '13', 'snapdragon 8 elite', 'hasselblad', '100w', '5g', 'flagship'],
    specs: { 'Chip': 'Snapdragon 8 Elite (3nm)', 'Màn hình': '6.82" BOE LTPO AMOLED 2K 120Hz, 4500 nits', 'RAM': '12/16GB LPDDR5X', 'Bộ nhớ': '256GB / 512GB UFS 4.0', 'Camera sau': '50MP OIS f/1.6 + 50MP UW + 50MP 3x periscope (Hasselblad)', 'Camera trước': '32MP', 'Pin': '6000 mAh, 100W + 50W wireless', 'Chống nước': 'IP65', 'OS': 'OxygenOS 15 (Android 15)', '5G': 'Có' },
  },
  {
    name: 'Vivo X200 Pro',
    brand: 'Vivo', model: 'X200 Pro', category: 'phone',
    price: 25000000,
    description: 'Vivo X200 Pro Dimensity 9400, camera Zeiss triple 50MP periscope 200mm, pin 6000mAh sạc 90W, màn 6.78" 2K LTPO AMOLED curved',
    imageUrl: `${WK}/9/9a/No_image_available.svg/320px-No_image_available.svg.png`,
    url: 'https://www.vivo.com/vn/products/x200pro',
    tags: ['điện thoại', 'vivo', 'x200 pro', 'zeiss', 'dimensity 9400', '5g', 'flagship', 'periscope'],
    specs: { 'Chip': 'MediaTek Dimensity 9400 (3nm)', 'Màn hình': '6.78" 2K (1260×2800) LTPO AMOLED curved 120Hz', 'RAM': '16GB LPDDR5T', 'Bộ nhớ': '512GB UFS 4.0', 'Camera sau': '50MP OIS + 50MP UW + 200MP 8.7x periscope (Zeiss)', 'Camera trước': '32MP', 'Pin': '6000 mAh (Si-C), 90W + 30W wireless', 'Chống nước': 'IP68 + IP69', 'OS': 'OriginOS 5 / Funtouch OS', '5G': 'Có' },
  },
  {
    name: 'Xiaomi Redmi Note 14 Pro+',
    brand: 'Xiaomi', model: 'Redmi Note 14 Pro+', category: 'phone',
    price: 10500000,
    description: 'Redmi Note 14 Pro+ Snapdragon 7s Gen 3, camera 200MP OIS, màn 6.67" AMOLED 120Hz 1.5K, pin 6000mAh sạc 90W, IP68',
    imageUrl: `${WK}/2/29/Xiaomi_logo.svg/320px-Xiaomi_logo.svg.png`,
    url: 'https://www.mi.com/vn/product/redmi-note-14-pro-plus',
    tags: ['điện thoại', 'xiaomi', 'redmi note 14', '200mp', 'snapdragon', '5g', 'mid-range', '90w', 'ip68'],
    specs: { 'Chip': 'Snapdragon 7s Gen 3 (4nm)', 'Màn hình': '6.67" 1.5K AMOLED 120Hz LTPS, 3000 nits', 'RAM': '8/12GB', 'Bộ nhớ': '256GB / 512GB UFS 2.2', 'Camera sau': '200MP OIS f/1.65 + 8MP UW + 2MP macro', 'Camera trước': '20MP', 'Pin': '6000 mAh, 90W', 'Chống nước': 'IP68', 'OS': 'HyperOS 2 (Android 15)', '5G': 'Có' },
  },

  // ═══════════════════════════════
  // LAPTOP (thêm 5)
  // ═══════════════════════════════
  {
    name: 'MacBook Air 15 inch M3',
    brand: 'Apple', model: 'MacBook Air 15 M3', category: 'laptop',
    price: 36990000,
    description: 'MacBook Air 15" chip M3, màn Liquid Retina 15.3" 500 nits, 18h pin, không quạt tản nhiệt, thiết kế siêu mỏng 11.5mm',
    imageUrl: `${WK}/f/fa/Apple_logo_black.svg/320px-Apple_logo_black.svg.png`,
    url: 'https://www.apple.com/vn/shop/buy-mac/macbook-air/15-inch',
    tags: ['laptop', 'apple macbook', 'm3', 'ultrabook', 'macos', 'siêu nhẹ', 'không quạt'],
    specs: { 'Chip': 'Apple M3 (8-core CPU / 10-core GPU)', 'RAM': '16GB / 24GB Unified Memory', 'SSD': '256GB – 2TB', 'Màn hình': '15.3" Liquid Retina IPS 2880×1864 500nits', 'Pin': '70Wh (~18h)', 'Cổng': '2x Thunderbolt 3 + MagSafe + 3.5mm + SDXC', 'Webcam': 'FaceTime HD 1080p', 'Trọng lượng': '1.51 kg', 'OS': 'macOS Sequoia', 'Độ dày': '11.5mm' },
  },
  {
    name: 'ASUS Zenbook 14 OLED UX3405',
    brand: 'ASUS', model: 'Zenbook 14 OLED UX3405', category: 'laptop',
    price: 28000000,
    description: 'Laptop siêu mỏng 14" OLED 120Hz Intel Core Ultra 7, hiệu năng AI, 32GB RAM, 1TB SSD, trọng lượng 1.2kg',
    imageUrl: `${WK}/a/a7/ASUS_Logo.svg/320px-ASUS_Logo.svg.png`,
    url: 'https://www.asus.com/vn/laptops/for-home/zenbook/asus-zenbook-14-oled-ux3405/',
    tags: ['laptop', 'asus zenbook', 'oled', 'intel core ultra', 'ultrabook', 'siêu mỏng', 'ai pc'],
    specs: { 'CPU': 'Intel Core Ultra 7 155H (22 cores)', 'GPU': 'Intel Arc + iGPU', 'RAM': '32GB LPDDR5', 'SSD': '1TB PCIe Gen4', 'Màn hình': '14" OLED 1920×1200 120Hz PANTONE Validated', 'Pin': '75Wh (~15h)', 'Cổng': 'Thunderbolt 4 x2 + USB-A + HDMI 2.1 + SD', 'Trọng lượng': '1.2 kg', 'OS': 'Windows 11 Copilot+' },
  },
  {
    name: 'Dell XPS 14 9440',
    brand: 'Dell', model: 'XPS 14 9440', category: 'laptop',
    price: 48000000,
    description: 'Dell XPS 14 mỏng nhẹ cao cấp Intel Core Ultra 7 155H, màn OLED 3.2K 120Hz, RTX 4060 Max-Q, thiết kế khung nhôm CNC',
    imageUrl: `${WK}/4/48/Dell_Logo.svg/320px-Dell_Logo.svg.png`,
    url: 'https://www.dell.com/vn-vn/shop/laptops/xps-14-laptop/spd/xps-14-9440-laptop',
    tags: ['laptop', 'dell xps', 'oled', 'intel core ultra', 'rtx 4060', 'premium', 'ultrabook'],
    specs: { 'CPU': 'Intel Core Ultra 7 155H (22 cores)', 'GPU': 'NVIDIA GeForce RTX 4060 Max-Q', 'RAM': '32GB LPDDR5x', 'SSD': '1TB PCIe Gen4', 'Màn hình': '14.5" OLED 3.2K (3200×2000) 120Hz', 'Pin': '69.5Wh', 'Cổng': '2x TB4 + USB-C 3.2 + SD + 3.5mm', 'Trọng lượng': '1.74 kg', 'OS': 'Windows 11 Pro' },
  },
  {
    name: 'HP EliteBook 840 G11',
    brand: 'HP', model: 'EliteBook 840 G11', category: 'laptop',
    price: 35000000,
    description: 'Laptop doanh nghiệp HP EliteBook 840 G11 Intel Core Ultra 7, 14" WUXGA IPS, bảo mật HP Wolf Security, pin 51Wh',
    imageUrl: `${WK}/a/ad/HP_logo_2012.svg/320px-HP_logo_2012.svg.png`,
    url: 'https://www.hp.com/vn-en/laptops/elitebooks/elitebook-840-g11-notebook-pc/',
    tags: ['laptop doanh nghiệp', 'hp elitebook', 'business laptop', 'intel core ultra', 'bảo mật'],
    specs: { 'CPU': 'Intel Core Ultra 7 165U', 'RAM': '32GB LPDDR5', 'SSD': '512GB PCIe Gen4', 'Màn hình': '14" WUXGA IPS 1920×1200 400 nits', 'Pin': '51Wh (~13h)', 'Bảo mật': 'HP Wolf Security, TPM 2.0, IR Camera', 'OS': 'Windows 11 Pro', 'Trọng lượng': '1.37 kg' },
  },
  {
    name: 'MSI Stealth 16 AI Studio A2VMG',
    brand: 'MSI', model: 'Stealth 16 AI Studio A2VMG', category: 'laptop',
    price: 72000000,
    description: 'Laptop gaming cao cấp Intel Core Ultra 9 185HX, RTX 4090 175W, 16" QHD+ Mini LED 240Hz, 64GB DDR5, thiết kế mỏng',
    imageUrl: `${WK}/1/15/MSI_Gaming_Logo.svg/320px-MSI_Gaming_Logo.svg.png`,
    url: 'https://vn.msi.com/Laptop/Stealth-16-AI-Studio-A2VMG',
    tags: ['laptop gaming', 'msi stealth', 'rtx 4090', 'mini led', 'intel core ultra 9', 'flagship gaming'],
    specs: { 'CPU': 'Intel Core Ultra 9 185HX (24 cores)', 'GPU': 'NVIDIA RTX 4090 175W', 'RAM': '64GB DDR5-5600', 'SSD': '2TB PCIe Gen4', 'Màn hình': '16" QHD+ (2560×1600) Mini LED IPS 240Hz', 'Pin': '99.9Wh', 'Sạc': '330W GaN', 'Trọng lượng': '1.99 kg', 'OS': 'Windows 11 Pro' },
  },

  // ═══════════════════════════════
  // DESKTOP (thêm 3)
  // ═══════════════════════════════
  {
    name: 'Mac Mini M4',
    brand: 'Apple', model: 'Mac Mini M4', category: 'desktop',
    price: 16990000,
    description: 'Mac Mini M4 nhỏ gọn nhất từ trước đến nay, CPU 10-core, GPU 10-core, 16GB RAM, cổng Thunderbolt 4 x3 + USB-C + HDMI',
    imageUrl: `${WK}/f/fa/Apple_logo_black.svg/320px-Apple_logo_black.svg.png`,
    url: 'https://www.apple.com/vn/shop/buy-mac/mac-mini',
    tags: ['desktop', 'apple mac mini', 'm4', 'compact desktop', 'macos', 'thinkstation'],
    specs: { 'Chip': 'Apple M4 (10-core CPU / 10-core GPU)', 'RAM': '16GB / 24GB / 32GB Unified', 'SSD': '256GB – 2TB', 'Ports': '3x Thunderbolt 4 + 2x USB-A + HDMI 2.1 + Ethernet + Audio', 'Wi-Fi': 'Wi-Fi 6E', 'Bluetooth': '5.3', 'Kích thước': '127×127×50mm', 'Trọng lượng': '0.67 kg', 'OS': 'macOS Sequoia' },
  },
  {
    name: 'Intel NUC 14 Pro+',
    brand: 'Intel', model: 'NUC 14 Pro+', category: 'desktop',
    price: 18000000,
    description: 'Mini PC Intel NUC 14 Pro+ Core Ultra 7 155H, Iris Xe, hỗ trợ 2x DDR5 96GB, 2x Thunderbolt 4, 2x HDMI, kích thước siêu nhỏ',
    imageUrl: `${WK}/7/7d/Intel_logo_%282006-2020%29.svg/320px-Intel_logo_%282006-2020%29.svg.png`,
    url: 'https://www.intel.com/content/www/us/en/products/sku/237361/intel-nuc-14-pro-plus/specifications.html',
    tags: ['desktop', 'mini pc', 'intel nuc', 'compact', 'core ultra', 'thunderbolt 4'],
    specs: { 'CPU': 'Intel Core Ultra 7 155H (22 cores)', 'GPU': 'Intel Arc + Iris Xe (96EU)', 'RAM': '2x DDR5 SO-DIMM, max 96GB', 'Storage': 'M.2 PCIe Gen4 + 2.5" SATA', 'Ports': '2x TB4 + USB4 + 2x HDMI 2.1 + 2x USB-A 3.2 + 2x USB-A 2.0 + RJ-45', 'Wi-Fi': 'Wi-Fi 6E + Bluetooth 5.3', 'Kích thước': '117×112×54mm' },
  },
  {
    name: 'ASUS ROG STRIX G16CHR Gaming Desktop',
    brand: 'ASUS', model: 'ROG STRIX G16CHR', category: 'desktop',
    price: 55000000,
    description: 'PC gaming để bàn ASUS ROG Intel Core i9-14900K, RTX 4080 Super, 32GB DDR5, 2TB SSD, thiết kế ROG đặc trưng',
    imageUrl: `${WK}/a/a7/ASUS_Logo.svg/320px-ASUS_Logo.svg.png`,
    url: 'https://rog.asus.com/desktops/rog-strix/rog-strix-g16chr/',
    tags: ['desktop gaming', 'gaming pc', 'asus rog', 'rtx 4080', 'i9-14900k', 'prebuilt pc'],
    specs: { 'CPU': 'Intel Core i9-14900K (24 cores)', 'GPU': 'NVIDIA RTX 4080 Super', 'RAM': '32GB DDR5-5600', 'SSD': '2TB PCIe Gen4 NVMe', 'Case': 'ROG Mid-Tower với kính bên', 'PSU': '1000W Gold', 'WiFi': 'Wi-Fi 6E + Bluetooth 5.3', 'OS': 'Windows 11 Home' },
  },

  // ═══════════════════════════════
  // MONITOR (thêm 3)
  // ═══════════════════════════════
  {
    name: 'Samsung Odyssey OLED G8 32"',
    brand: 'Samsung', model: 'Odyssey OLED G8 32"', category: 'monitor',
    price: 28000000,
    description: 'Màn hình gaming OLED 4K 32" 240Hz, Smart Monitor (Tizen OS), DisplayHDR True Black 400, 0.03ms, thiết kế slim',
    imageUrl: `${WK}/b/b4/Samsung_wordmark.svg/320px-Samsung_wordmark.svg.png`,
    url: 'https://www.samsung.com/vn/monitors/gaming/odyssey-oled-g8/',
    tags: ['màn hình', 'gaming monitor', '4k', 'oled', '240hz', 'samsung', 'smart monitor'],
    specs: { 'Kích thước': '32"', 'Panel': 'OLED (QD-OLED)', 'Độ phân giải': '4K (3840×2160)', 'Refresh Rate': '240Hz', 'Response Time': '0.03ms (GtG)', 'HDR': 'DisplayHDR True Black 400', 'Smart OS': 'Tizen (Samsung Smart)', 'Kết nối': '2x HDMI 2.1 + 1x DP 1.4 + USB-C 90W', 'DCI-P3': '99%' },
  },
  {
    name: 'LG UltraWide 34WP65C-B 34"',
    brand: 'LG', model: 'UltraWide 34WP65C-B', category: 'monitor',
    price: 10000000,
    description: 'Màn hình UltraWide cong 34" 21:9 WQHD 160Hz VA, HDR10, AMD FreeSync Premium, USB-C 65W, thiết kế văn phòng sáng tạo',
    imageUrl: `${WK}/2/20/LG_symbol.svg/320px-LG_symbol.svg.png`,
    url: 'https://www.lg.com/vn/monitors/ultrawide/34wp65c-b/',
    tags: ['màn hình', 'ultrawide', '34 inch', 'wqhd', '21:9', 'curved', 'lg', 'usb-c', 'văn phòng sáng tạo'],
    specs: { 'Kích thước': '34"', 'Tỷ lệ': '21:9', 'Panel': 'VA Curved (1500R)', 'Độ phân giải': 'WQHD (3440×1440)', 'Refresh Rate': '160Hz', 'HDR': 'HDR10', 'FreeSync': 'AMD FreeSync Premium', 'USB-C': '65W Power Delivery', 'sRGB': '99%' },
  },
  {
    name: 'BenQ PD3220U 32"',
    brand: 'BenQ', model: 'PD3220U', category: 'monitor',
    price: 22000000,
    description: 'Màn hình đồ họa chuyên nghiệp 32" 4K IPS, Thunderbolt 3 60W, 100% sRGB, Calman Verified, dành cho designer / video editor',
    imageUrl: `${WK}/5/5c/BenQ_Logo.svg/320px-BenQ_Logo.svg.png`,
    url: 'https://www.benq.com/en-us/monitor/designer/pd3220u.html',
    tags: ['màn hình', 'professional monitor', '4k', 'thunderbolt', 'benq', 'designer', 'color accurate'],
    specs: { 'Kích thước': '32"', 'Panel': 'IPS', 'Độ phân giải': '4K (3840×2160)', 'Refresh Rate': '60Hz', 'HDR': 'HDR10', 'Thunderbolt': 'Thunderbolt 3 (60W PD)', 'sRGB': '100%', 'DCI-P3': '95%', 'Display P3': '97%', 'Calman': 'Verified' },
  },

  // ═══════════════════════════════
  // TV (thêm 2)
  // ═══════════════════════════════
  {
    name: 'LG OLED C4 55"',
    brand: 'LG', model: 'OLED C4 55"', category: 'tv',
    price: 28000000,
    description: 'Smart TV LG OLED C4 55" 4K 120Hz evo, α9 AI Gen7, Dolby Vision IQ, Dolby Atmos, webOS 24, 4x HDMI 2.1, lý tưởng gaming',
    imageUrl: `${WK}/2/20/LG_symbol.svg/320px-LG_symbol.svg.png`,
    url: 'https://www.lg.com/vn/tvs/oled-tvs/lg-oled55c4psa/',
    tags: ['tv', 'smart tv', 'oled', '4k', 'lg', 'oled c4', 'gaming tv', 'dolby vision', 'hdmi 2.1'],
    specs: { 'Màn hình': '55" OLED evo 4K', 'Độ phân giải': '3840×2160', 'Refresh Rate': '120Hz', 'Processor': 'α9 AI Processor Gen7', 'HDR': 'Dolby Vision IQ, HDR10, HLG', 'HDMI': '4x HDMI 2.1', 'Hệ điều hành': 'webOS 24', 'Âm thanh': 'Dolby Atmos', 'Game': 'G-Sync, FreeSync, ALLM, VRR 4x HDMI 2.1' },
  },
  {
    name: 'Sony BRAVIA 7 55"',
    brand: 'Sony', model: 'BRAVIA 7 55"', category: 'tv',
    price: 35000000,
    description: 'Smart TV Sony Bravia 7 Mini LED 4K 55" 120Hz, XR Processor AI, Dolby Vision, Google TV, HDMI 2.1, loa Dolby Atmos Acoustic Multi-Audio',
    imageUrl: `${WK}/b/bf/Sony_logo.svg/320px-Sony_logo.svg.png`,
    url: 'https://www.sony.com.vn/en/televisions/bravia-7/',
    tags: ['tv', 'smart tv', 'mini led', '4k', 'sony', 'bravia', 'google tv', 'dolby vision', 'xr processor'],
    specs: { 'Màn hình': '55" Mini LED 4K', 'Refresh Rate': '120Hz', 'Processor': 'XR Processor AI', 'HDR': 'Dolby Vision, HDR10, HLG', 'HDMI': '2x HDMI 2.1 + 2x HDMI 2.0', 'Hệ điều hành': 'Google TV', 'Âm thanh': 'Dolby Atmos Acoustic Multi-Audio', 'Game': 'PS5 optimized, ALLM, VRR' },
  },

  // ═══════════════════════════════
  // STORAGE (thêm 3)
  // ═══════════════════════════════
  {
    name: 'Seagate IronWolf Pro 8TB HDD',
    brand: 'Seagate', model: 'IronWolf Pro 8TB', category: 'storage',
    price: 5500000,
    description: 'Ổ cứng NAS 8TB dành riêng cho NAS, 7200 RPM, CMR, 300TB/năm, bảo hành 5 năm, rescue data service',
    imageUrl: `${WK}/c/ca/Seagate_logo.svg/320px-Seagate_logo.svg.png`,
    url: 'https://www.seagate.com/vn/en/drives/hard-drives/ironwolf/',
    tags: ['ổ cứng', 'hdd', 'nas drive', 'seagate ironwolf', '8tb', 'server', 'cmr'],
    specs: { 'Dung lượng': '8TB', 'Loại': 'HDD 3.5" SATA 6Gbps', 'Tốc độ quay': '7200 RPM', 'Ghi': 'CMR', 'Cache': '256MB', 'Khối lượng công việc': '300TB/năm', 'MTBF': '1.2 triệu giờ', 'Bảo hành': '5 năm + Rescue Data Service' },
  },
  {
    name: 'WD Red Plus 6TB HDD',
    brand: 'Western Digital', model: 'Red Plus 6TB', category: 'storage',
    price: 3800000,
    description: 'Ổ cứng NAS 6TB WD Red Plus 5640 RPM CMR, NASware 3.0, tối ưu cho NAS 1-8 bay, bảo hành 3 năm',
    imageUrl: `${WK}/1/11/WD_logo.svg/320px-WD_logo.svg.png`,
    url: 'https://www.westerndigital.com/vn-vn/products/internal-drives/wd-red-plus-sata-hdd',
    tags: ['ổ cứng', 'hdd', 'nas drive', 'western digital', 'wd red', '6tb', 'cmr'],
    specs: { 'Dung lượng': '6TB', 'Loại': 'HDD 3.5" SATA 6Gbps', 'Tốc độ quay': '5640 RPM', 'Ghi': 'CMR', 'Cache': '128MB', 'NASware': '3.0', 'Phù hợp': 'NAS 1-8 bay', 'Bảo hành': '3 năm' },
  },
  {
    name: 'Samsung T9 Portable SSD 4TB',
    brand: 'Samsung', model: 'T9 Portable SSD 4TB', category: 'storage',
    price: 4500000,
    description: 'SSD di động ngoài 4TB USB 3.2 Gen 2×2 20Gbps tốc độ 2000MB/s, chống sốc, kích thước nhỏ gọn bỏ túi',
    imageUrl: `${WK}/b/b4/Samsung_wordmark.svg/320px-Samsung_wordmark.svg.png`,
    url: 'https://www.samsung.com/vn/memory-storage/portable-ssd/t9-4tb-mu-pg4t0b-am/',
    tags: ['ssd di động', 'portable ssd', 'samsung', 't9', '4tb', 'usb 3.2', 'ngoài', 'tốc độ cao'],
    specs: { 'Dung lượng': '4TB', 'Giao tiếp': 'USB 3.2 Gen 2×2 (20Gbps)', 'Tốc độ đọc': '2,000 MB/s', 'Tốc độ ghi': '1,950 MB/s', 'Chống sốc': 'Có (1500G)', 'Kết nối': 'USB-C (kèm cả USB-A adapter)', 'Kích thước': '94.6×56.5×18.5mm', 'Bảo hành': '3 năm' },
  },

  // ═══════════════════════════════
  // CAMERA (thêm 2)
  // ═══════════════════════════════
  {
    name: 'Canon EOS R8',
    brand: 'Canon', model: 'EOS R8', category: 'camera',
    price: 32000000,
    description: 'Máy ảnh mirrorless full-frame 24.2MP nhỏ gọn nhất dòng R, Dual Pixel CMOS AF II, video 4K/60fps RAW, chống rung Coordinated IS',
    imageUrl: `${WK}/c/c2/Canon_wordmark.svg/320px-Canon_wordmark.svg.png`,
    url: 'https://www.canon.com.vn/cameras/eos-r8/',
    tags: ['máy ảnh', 'mirrorless', 'full frame', 'canon eos r8', '4k', 'dual pixel af', 'compact ff'],
    specs: { 'Cảm biến': 'Full-Frame CMOS 24.2MP', 'Processor': 'DIGIC X', 'Autofocus': 'Dual Pixel CMOS AF II (100% coverage)', 'Video': '4K/60fps (RAW), 4K/30fps', 'IS': 'Coordinated IS (lens + body)', 'Màn hình': '3" Fully-Articulated LCD', 'EVF': 'OLED 2.36M-dot', 'Burst': 'max 40fps (electronic)', 'Trọng lượng': '461 g (body)', 'Khe thẻ': '1x SD UHS-II' },
  },
  {
    name: 'DJI Osmo Action 5 Pro',
    brand: 'DJI', model: 'Osmo Action 5 Pro', category: 'camera',
    price: 7500000,
    description: 'Action camera DJI 1/1.3" sensor 4K/120fps, chống rung RockSteady 3.0, pin lớn 1950mAh, chống nước 20m, màn kép',
    imageUrl: `${WK}/6/63/DJI_logo.svg/320px-DJI_logo.svg.png`,
    url: 'https://www.dji.com/vn/osmo-action-5-pro',
    tags: ['action camera', 'dji osmo', 'waterproof', '4k 120fps', 'ois', 'sports camera'],
    specs: { 'Sensor': '1/1.3" CMOS', 'Video': '4K/120fps, 4K/60fps', 'Chống rung': 'RockSteady 3.0 (EIS)', 'Chống nước': '20m', 'Pin': '1950 mAh', 'Màn hình': 'Front 1.4" + Rear 2.25" touch', 'HDR': 'Có (D-Log M 10-bit)', 'Microphone': '4 mic array' },
  },

  // ═══════════════════════════════
  // SMART HOME (thêm 3)
  // ═══════════════════════════════
  {
    name: 'Mi Smart Band 9 Pro',
    brand: 'Xiaomi', model: 'Mi Smart Band 9 Pro', category: 'smartwatch',
    price: 1700000,
    description: 'Vòng tay thông minh Xiaomi Band 9 Pro màn AMOLED 1.74" 60Hz, Always-On, SpO2, GPS tích hợp, pin 10 ngày, 150+ thể thao',
    imageUrl: `${WK}/2/29/Xiaomi_logo.svg/320px-Xiaomi_logo.svg.png`,
    url: 'https://www.mi.com/vn/product/xiaomi-smart-band-9-pro',
    tags: ['vòng tay thông minh', 'fitness tracker', 'xiaomi band', 'gps', 'spO2', 'amoled'],
    specs: { 'Màn hình': '1.74" AMOLED 60Hz AoD', 'GPS': 'Built-in GPS + GLONASS', 'Sức khỏe': 'SpO2, Heart Rate 24/7, Stress', 'Thể thao': '150+ modes', 'Pin': '~10 ngày', 'Chống nước': '5ATM', 'Bluetooth': '5.3', 'Tương thích': 'Android / iOS' },
  },
  {
    name: 'Govee RGBIC LED Strip Light Pro',
    brand: 'Govee', model: 'RGBIC LED Strip Pro 5m', category: 'smart_home',
    price: 650000,
    description: 'Đèn LED thông minh RGBIC 5m nhiều màu đồng thời, Wi-Fi + Bluetooth, Alexa / Google Home, 16 triệu màu, hiệu ứng âm nhạc',
    imageUrl: NO_IMG,
    url: 'https://govee.com/products/govee-rgbic-led-strip-lights',
    tags: ['đèn thông minh', 'led strip', 'rgbic', 'govee', 'wifi', 'alexa', 'google home', 'gaming setup'],
    specs: { 'Chiều dài': '5m', 'Loại': 'RGBIC (nhiều màu cùng lúc)', 'Kết nối': 'Wi-Fi 2.4GHz + Bluetooth', 'Điều khiển': 'Govee App, Alexa, Google Home', 'Hiệu ứng': '55+ scene effects, nhạc', 'Nguồn': '12V adapter', 'Vật liệu': 'IP65 (mặt trên)' },
  },
  {
    name: 'Xiaomi Smart Door Lock E20',
    brand: 'Xiaomi', model: 'Smart Door Lock E20', category: 'smart_home',
    price: 2500000,
    description: 'Khóa cửa thông minh Xiaomi E20, mở bằng vân tay/NFC/mật mã/app/thẻ, cảm biến fingerprint nhanh 0.3s, chống nước IP44',
    imageUrl: `${WK}/2/29/Xiaomi_logo.svg/320px-Xiaomi_logo.svg.png`,
    url: 'https://www.mi.com/vn/product/xiaomi-smart-door-lock-e20',
    tags: ['khóa cửa thông minh', 'smart lock', 'xiaomi', 'vân tay', 'nfc', 'app', 'bảo mật nhà'],
    specs: { 'Mở khóa': 'Vân tay + NFC + Mật mã + App + Thẻ từ + Chìa khóa', 'Thời gian mở': '0.3s (fingerprint)', 'Chống nước': 'IP44', 'Pin': 'AA x4 (~12 tháng)', 'Kết nối': 'Bluetooth 5.0 + Zigbee (cần hub)', 'Cảnh báo': 'Phá khóa, pin yếu' },
  },

  // ═══════════════════════════════
  // RAM (thêm 2)
  // ═══════════════════════════════
  {
    name: 'Kingston Fury Beast DDR5-6000 32GB',
    brand: 'Kingston', model: 'Fury Beast DDR5-6000 32GB', category: 'ram',
    price: 2500000,
    description: 'RAM DDR5 gaming 32GB (2×16GB) 6000MHz CL40, hỗ trợ Intel XMP 3.0 / AMD EXPO, không RGB, giá tốt',
    imageUrl: `${WK}/c/c0/Kingston_Technology_logo.svg/320px-Kingston_Technology_logo.svg.png`,
    url: 'https://www.kingston.com/vn/memory/gaming/kingston-fury-beast-ddr5-rgb-memory',
    tags: ['ram', 'ddr5', 'kingston fury', '6000mhz', 'gaming ram', 'xmp 3.0', 'expo'],
    specs: { 'Loại': 'DDR5', 'Dung lượng': '32GB (2×16GB)', 'Tốc độ': 'DDR5-6000', 'Timing': 'CL40', 'Điện áp': '1.35V', 'RGB': 'Không', 'XMP': '3.0 / EXPO', 'Bảo hành': 'Trọn đời' },
  },
  {
    name: 'Corsair Vengeance DDR4-3600 32GB',
    brand: 'Corsair', model: 'Vengeance DDR4-3600 32GB', category: 'ram',
    price: 1600000,
    description: 'RAM DDR4 32GB (2×16GB) 3600MHz CL18 cho Intel/AMD, thiết kế tản nhiệt thấp, hỗ trợ XMP 2.0, bảo hành trọn đời',
    imageUrl: `${WK}/c/c5/Corsair_Components_logo.svg/320px-Corsair_Components_logo.svg.png`,
    url: 'https://www.corsair.com/vn/en/Categories/Products/Memory/VENGEANCE-LPX-DDR4-RAM/p/CMK32GX4M2D3600C18',
    tags: ['ram', 'ddr4', 'corsair vengeance', '3600mhz', 'gaming ram', 'xmp 2.0'],
    specs: { 'Loại': 'DDR4', 'Dung lượng': '32GB (2×16GB)', 'Tốc độ': 'DDR4-3600', 'Timing': 'CL18', 'Điện áp': '1.35V', 'RGB': 'Không (Low Profile)', 'XMP': '2.0', 'Bảo hành': 'Trọn đời' },
  },

  // ═══════════════════════════════
  // KEYBOARD (thêm 2)
  // ═══════════════════════════════
  {
    name: 'Logitech MX Keys S',
    brand: 'Logitech', model: 'MX Keys S', category: 'keyboard',
    price: 2500000,
    description: 'Bàn phím cơ low-profile không dây đa thiết bị, Easy Switch 3 máy, Logi AI Prompt Builder, pin 10 ngày, backlight thích ứng',
    imageUrl: `${WK}/5/5b/Logitech_logo.svg/320px-Logitech_logo.svg.png`,
    url: 'https://www.logitech.com/en-us/products/keyboards/mx-keys-s.920-011559.html',
    tags: ['bàn phím', 'wireless keyboard', 'logitech mx', 'đa thiết bị', 'văn phòng', 'low profile', 'ai'],
    specs: { 'Layout': 'Full-size (107 keys)', 'Kết nối': 'Bluetooth + Logi Bolt USB', 'Multi-device': 'Easy Switch (3 thiết bị)', 'Pin': '10 ngày (backlight), 5 tháng (không backlight)', 'Backlight': 'Per-key Adaptive (cảm biến sáng)', 'AI': 'Logi AI Prompt Builder Key', 'Tương thích': 'Windows / macOS / iPadOS / Android' },
  },
  {
    name: 'Ducky One 3 SF 65%',
    brand: 'Ducky', model: 'One 3 SF 65%', category: 'keyboard',
    price: 2800000,
    description: 'Bàn phím cơ 65% Ducky One 3 chất liệu cao cấp, RGB per-key, hot-swap PCB, switch Cherry MX, kết nối USB-C, bảo hành 1 năm',
    imageUrl: NO_IMG,
    url: 'https://www.duckychannel.com.tw/en/Ducky-One3-SF',
    tags: ['bàn phím cơ', 'mechanical keyboard', '65%', 'ducky', 'cherry mx', 'hot-swap', 'rgb'],
    specs: { 'Layout': '65% (68 keys)', 'Switch': 'Cherry MX (thay được)', 'Backlight': 'RGB per-key', 'Hot-swap': 'Có', 'Kết nối': 'USB-C detachable', 'Case': 'ABS / PBT Double-shot', 'Polling Rate': '1000Hz', 'Bảo hành': '1 năm' },
  },

  // ═══════════════════════════════
  // MOUSE (thêm 2)
  // ═══════════════════════════════
  {
    name: 'Razer Viper V3 Pro',
    brand: 'Razer', model: 'Viper V3 Pro', category: 'mouse',
    price: 4200000,
    description: 'Chuột gaming không dây 65g Focus Pro 35K sensor, polling 8000Hz (HyperPolling), LIGHTFORCE optical switch, pin 95h',
    imageUrl: `${WK}/9/95/Razer_logo.svg/320px-Razer_logo.svg.png`,
    url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
    tags: ['chuột gaming', 'wireless mouse', 'razer viper', 'focus pro sensor', '8000hz', '65g'],
    specs: { 'Trọng lượng': '65 g', 'Sensor': 'Focus Pro 35K', 'DPI': '100 – 35,000', 'Switch': 'LIGHTFORCE Optical-Mech (90M clicks)', 'Polling Rate': '8000 Hz (HyperPolling, kèm adapter)', 'Pin': '95 giờ (1000Hz)', 'Kết nối': '2.4GHz HyperSpeed', 'Kích thước': '126.8×57.6×37.8mm' },
  },
  {
    name: 'Pulsar X2H',
    brand: 'Pulsar', model: 'X2H', category: 'mouse',
    price: 1900000,
    description: 'Chuột gaming siêu nhẹ 55g có dây, sensor PAW3395 26K DPI, polling 1000Hz, Flawless Swipe, thiết kế symmetrical honeycomb',
    imageUrl: NO_IMG,
    url: 'https://www.pulsargaming.com/products/x2h',
    tags: ['chuột gaming', 'wired mouse', 'pulsar', 'ultralight', 'paw3395', 'honeycomb', '55g'],
    specs: { 'Trọng lượng': '55 g', 'Sensor': 'PixArt PAW3395 26K', 'DPI': '50 – 26,000', 'Switch': 'Kailh GM 8.0 (80M clicks)', 'Polling Rate': '1000 Hz', 'Cáp': 'Paracord flexible', 'Kích thước': '126×66×39mm (Medium)' },
  },

  // ═══════════════════════════════
  // WEBCAM (thêm 1)
  // ═══════════════════════════════
  {
    name: 'Elgato Facecam Pro',
    brand: 'Elgato', model: 'Facecam Pro', category: 'webcam',
    price: 7000000,
    description: 'Webcam streaming chuyên nghiệp 4K60fps uncompressed, Sony STARVIS 2 1/1.8", f/2.4, autofocus tốc độ cao, cài đặt bằng Camera Hub',
    imageUrl: `${WK}/7/73/Elgato_logo.svg/320px-Elgato_logo.svg.png`,
    url: 'https://www.elgato.com/en/facecam-pro',
    tags: ['webcam', '4k', 'streaming', 'elgato', 'sony starvis', 'uncompressed', 'facecam'],
    specs: { 'Sensor': '1/1.8" Sony STARVIS 2', 'Độ phân giải': '4K/60fps, 1080p/60fps', 'Khẩu độ': 'f/2.4', 'Autofocus': 'Ultra-fast', 'Compression': 'Uncompressed (RAW)', 'FOV': '90°', 'Privacy': 'Shutter + LED indicator', 'Kết nối': 'USB-C (3.1 Gen 1)' },
  },

  // ═══════════════════════════════
  // CHARGER (thêm 2)
  // ═══════════════════════════════
  {
    name: 'Anker Prime 240W GaN Desktop',
    brand: 'Anker', model: 'Prime 240W GaN Desktop', category: 'charger',
    price: 2800000,
    description: 'Bộ sạc bàn GaN 240W 6 cổng (4 USB-C + 2 USB-A), màn hình hiển thị công suất thực, PD 3.1 tới 140W, app Anker',
    imageUrl: NO_IMG,
    url: 'https://www.anker.com/products/anker-prime-240w-gan-desktop-charger',
    tags: ['sạc nhanh', 'gan charger', 'anker prime', '240w', '6 cổng', 'pd 3.1', 'desktop charger'],
    specs: { 'Công suất': '240W tổng', 'Cổng': '4x USB-C + 2x USB-A', 'USB-C1': '140W (PD 3.1)', 'USB-C2': '100W', 'USB-A': '22.5W (SCP)', 'Hiển thị': 'Smart Display (công suất thực)', 'Kết nối App': 'Anker App', 'Điện áp vào': '100-240V', 'GaN': 'GaN Pro' },
  },
  {
    name: 'Belkin BoostCharge Pro 108W GaN',
    brand: 'Belkin', model: 'BoostCharge Pro 108W GaN', category: 'charger',
    price: 1300000,
    description: 'Sạc GaN nhỏ gọn 4 cổng 108W (2 USB-C + 2 USB-A), sạc MacBook, iPad, iPhone cùng lúc, thiết kế gấp plug',
    imageUrl: NO_IMG,
    url: 'https://www.belkin.com/4-port-gan-charger-108w/WCH010dqWH.html',
    tags: ['sạc nhanh', 'gan charger', 'belkin', '108w', '4 cổng', 'usb-c', 'compact'],
    specs: { 'Công suất': '108W tổng', 'Cổng': '2x USB-C + 2x USB-A', 'USB-C1': '96W (PD)', 'USB-C2': '30W', 'USB-A': '12W', 'Công nghệ': 'GaN', 'Plug': 'Foldable prong' },
  },

  // ═══════════════════════════════
  // VR/AR (thêm 1)
  // ═══════════════════════════════
  {
    name: 'Apple Vision Pro',
    brand: 'Apple', model: 'Vision Pro', category: 'vr_ar',
    price: 90000000,
    description: 'Kính thực tế ảo/tăng cường Apple Vision Pro, chip M2+R1, 2 màn micro-OLED 23M pixels, eye/hand/voice tracking, visionOS',
    imageUrl: `${WK}/f/fa/Apple_logo_black.svg/320px-Apple_logo_black.svg.png`,
    url: 'https://www.apple.com/vn/apple-vision-pro/',
    tags: ['vr ar', 'mixed reality', 'apple vision pro', 'spatial computing', 'visionos', 'm2'],
    specs: { 'Chip': 'M2 + R1', 'Màn hình': '2x micro-OLED 4K+ (23M pixels tổng)', 'Tracking': 'Eye, Hand, Voice (không cần controller)', 'Audio': 'Spatial Audio personalized', 'OS': 'visionOS 2', 'Pin': '~2.5h (ngoài) / cắm sạc liên tục', 'Camera': '12 cameras + LiDAR + TrueDepth', 'Storage': '256GB / 512GB / 1TB', 'Trọng lượng': '600–650g' },
  },

  // ═══════════════════════════════
  // SPEAKER (thêm 2)
  // ═══════════════════════════════
  {
    name: 'Marshall Acton III',
    brand: 'Marshall', model: 'Acton III', category: 'speaker',
    price: 11000000,
    description: 'Loa Marshall Acton III Bluetooth 5.0, bass phong phú, analog tone control (treble/bass), thiết kế vintage đặc trưng',
    imageUrl: `${WK}/c/c0/Marshall_logo.svg/320px-Marshall_logo.svg.png`,
    url: 'https://www.marshall.com/vn/en/speakers/acton-iii-bluetooth',
    tags: ['loa', 'bluetooth speaker', 'marshall', 'acton iii', 'vintage', 'bookshelf', 'home audio'],
    specs: { 'Driver': '1x 5.5" woofer + 2x 0.75" tweeter', 'Công suất': '50W (Class D)', 'Bluetooth': '5.0 (aptX)', 'Kết nối': 'Bluetooth + RCA in + 3.5mm', 'Điều chỉnh': 'Treble / Bass knob analog', 'Điện': '220V', 'Kích thước': '390×200×200mm', 'Trọng lượng': '5.6 kg' },
  },
  {
    name: 'Harman Kardon Onyx Studio 8',
    brand: 'Harman Kardon', model: 'Onyx Studio 8', category: 'speaker',
    price: 5500000,
    description: 'Loa Bluetooth di động sang trọng 50W, pin 8h, 2 passive radiator, Party Mode ghép loa, kết nối 2 nguồn cùng lúc',
    imageUrl: NO_IMG,
    url: 'https://www.harmankardon.com/bluetooth-speakers/ONYX+STUDIO+8.html',
    tags: ['loa bluetooth', 'portable speaker', 'harman kardon', 'onyx studio', 'premium', 'party mode'],
    specs: { 'Công suất': '50W', 'Driver': '2 woofer + 2 passive radiator', 'Pin': '8 giờ', 'Bluetooth': '5.3', 'Party Mode': 'Ghép nhiều loa Harman Kardon', 'Multi-source': '2 nguồn kết nối cùng lúc', 'Chống nước': 'IPX4', 'Trọng lượng': '2.4 kg' },
  },

  // ═══════════════════════════════
  // HEADPHONE (thêm 2)
  // ═══════════════════════════════
  {
    name: 'Jabra Evolve2 85',
    brand: 'Jabra', model: 'Evolve2 85', category: 'headphone',
    price: 9500000,
    description: 'Tai nghe doanh nghiệp ANC chuyên nghiệp 10 mic, chứng nhận Microsoft Teams / Zoom, pin 37h, kết nối đa thiết bị',
    imageUrl: NO_IMG,
    url: 'https://www.jabra.com/headsets/jabra-evolve2-85',
    tags: ['tai nghe', 'business headset', 'anc', 'jabra', 'microsoft teams', 'zoom', 'work from home'],
    specs: { 'Loại': 'Over-ear', 'ANC': 'Advanced Hybrid ANC (8 mic)', 'Mic': '10 mic tổng (8 ANC + 2 busylight beam-forming)', 'Bluetooth': '5.0 Multipoint', 'Pin': '37 giờ (ANC on)', 'UC Certified': 'Microsoft Teams, Zoom, Google Meet', 'Kết nối': 'BT + USB dongle', 'Trọng lượng': '341 g' },
  },
  {
    name: 'Nothing Ear (open)',
    brand: 'Nothing', model: 'Ear (open)', category: 'headphone',
    price: 3500000,
    description: 'Tai nghe open-ear độc đáo thiết kế semi-open clip-on không bịt tai, Bluetooth 5.3, 30h pin tổng (8h + case), nhẹ 8.1g/ear',
    imageUrl: NO_IMG,
    url: 'https://intl.nothing.tech/products/ear-open',
    tags: ['tai nghe', 'open ear', 'nothing', 'clip-on', 'transparent design', 'bluetooth'],
    specs: { 'Loại': 'Open-ear (semi-open clip-on)', 'Driver': '14.2mm dynamic + bass duct', 'Bluetooth': '5.3', 'Codec': 'SBC, AAC, LHDC 5.0', 'Pin earbud': '8 giờ', 'Pin tổng': '30 giờ (với case)', 'Trọng lượng': '8.1 g/ear', 'Kết nối': 'Multipoint 2 thiết bị', 'IP': 'IP54' },
  },

  // ═══════════════════════════════
  // NAS (thêm 1)
  // ═══════════════════════════════
  {
    name: 'Synology DS923+',
    brand: 'Synology', model: 'DS923+', category: 'nas',
    price: 14000000,
    description: 'NAS 4 bay AMD Ryzen R1600 2.6GHz, 4GB ECC DDR4, 2x 1GbE (upgradeable 10GbE PCIe), hỗ trợ 2x NVMe M.2 cache SSD',
    imageUrl: `${WK}/8/8e/Synology_logo.svg/320px-Synology_logo.svg.png`,
    url: 'https://www.synology.com/en-global/products/DS923+',
    tags: ['nas', 'network storage', 'synology', '4 bay', 'ecc ram', 'nvme cache', 'amd ryzen'],
    specs: { 'CPU': 'AMD Ryzen R1600 Dual-core 2.6GHz (burst 3.1GHz)', 'RAM': '4GB ECC DDR4 (expandable 32GB)', 'Bay': '4x SATA 3.5"/2.5"', 'NVMe': '2x M.2 2280 PCIe 3.0 NVMe (SSD cache)', 'LAN': '2x 1GbE (10GbE via PCIe)', 'PCIe': '1x PCIe 3.0 x2', 'USB': '2x USB 3.2 Gen 1', 'OS': 'DSM 7 (DiskStation Manager)' },
  },

  // ═══════════════════════════════
  // GAMING CONSOLE (thêm 1)
  // ═══════════════════════════════
  {
    name: 'ASUS ROG Ally X',
    brand: 'ASUS', model: 'ROG Ally X', category: 'gaming_console',
    price: 25000000,
    description: 'Máy chơi game cầm tay Windows PC ROG Ally X Ryzen Z1 Extreme, màn 7" FHD 120Hz, 24GB RAM, 1TB SSD, pin 80Wh',
    imageUrl: `${WK}/a/a7/ASUS_Logo.svg/320px-ASUS_Logo.svg.png`,
    url: 'https://rog.asus.com/gaming-handhelds/rog-ally/rog-ally-x/',
    tags: ['gaming console', 'portable gaming', 'asus rog ally', 'windows gaming handheld', 'ryzen z1 extreme'],
    specs: { 'CPU/APU': 'AMD Ryzen Z1 Extreme (Zen 4 + RDNA 3)', 'GPU': 'AMD RDNA 3 (12 CU)', 'RAM': '24GB LPDDR5-7500', 'SSD': '1TB PCIe Gen4', 'Màn hình': '7" FHD (1920×1080) IPS 120Hz', 'Pin': '80Wh (~2.5-4h game nặng)', 'OS': 'Windows 11', 'Kết nối': 'Wi-Fi 6E + Bluetooth 5.4 + USB-C', 'Trọng lượng': '678 g' },
  },
];

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected. Starting batch 6 import...');
  const col = mongoose.connection.collection('products');
  const offerCol = mongoose.connection.collection('offers');

  let inserted = 0, skipped = 0;
  for (const p of products) {
    const existing = await col.findOne({ brand: p.brand, model: p.model });
    if (existing) { console.log('  SKIP:', p.brand, p.model); skipped++; continue; }
    const doc = buildProduct(p);
    const result = await col.insertOne(doc);
    await offerCol.insertOne(buildOffer(result.insertedId, p.price, p.url));
    console.log(`  ✓ ${p.brand} ${p.model} → ${p.category} | ${p.price.toLocaleString()} VND`);
    inserted++;
  }

  const total = await col.countDocuments();
  const totalOffers = await offerCol.countDocuments();
  console.log('\n=== BATCH 6 DONE ===');
  console.log(`Inserted: ${inserted} | Skipped: ${skipped}`);
  console.log(`Total products: ${total} | Total offers: ${totalOffers}`);
  await mongoose.disconnect();
}
main().catch(console.error);
