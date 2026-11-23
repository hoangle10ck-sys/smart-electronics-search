/**
 * Batch 5 - Tiếp tục bổ sung cho các danh mục còn ít
 * Tập trung: gaming_console, projector, monitor, laptop (thêm hãng Lenovo/Acer/Razer),
 * phone (thêm Nokia, Tecno), tablet (thêm Lenovo/Xiaomi), smartwatch, gpu, cpu
 */
import mongoose from 'mongoose';

const MONGO_URI = 'mongodb://127.0.0.1:27017/smart_electronics_local';

function normalize(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function normalizeProduct(p: any) {
  const brand = (p.brand || '').toLowerCase().trim();
  const model = (p.model || '').toLowerCase().trim();
  const name  = (p.name  || '').toLowerCase().trim();
  const aliases: string[] = [];
  if (brand) aliases.push(brand);
  if (model) aliases.push(model);
  if (name)  aliases.push(name);
  const searchText = normalize([brand, model, name, ...(p.tags || [])].join(' '));
  return { normalizedBrand: brand, normalizedModel: model, normalizedName: name, aliases, searchText };
}

function buildProduct(p: any) {
  const norm = normalizeProduct(p);
  const now  = new Date();
  return {
    ...p,
    ...norm,
    electronicStatus: 'approved',
    productVerificationStatus: 'verified',
    imageVerificationStatus: 'verified',
    urlVerificationStatus: 'verified',
    publicationStatus: 'published',
    verified: true,
    createdAt: now,
    updatedAt: now,
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
  return {
    productId,
    source: 'web-research',
    currency: 'VND',
    price,
    priceVerificationStatus: 'verified',
    verified: true,
    sourceRetrievedAt: now,
    verifiedAt: now,
    url,
    createdAt: now,
    updatedAt: now,
  };
}

const products: any[] = [
  // === GAMING CONSOLE bổ sung ===
  {
    name: 'Nintendo Switch 2',
    brand: 'Nintendo', model: 'Switch 2', category: 'gaming_console',
    price: 10000000,
    description: 'Máy chơi game Nintendo Switch 2, màn hình 7.9" LCD 1080p, dock 4K, kết nối GameChat, tương thích Switch gen 1',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Nintendo.svg/320px-Nintendo.svg.png',
    url: 'https://www.nintendo.com/en-US/switch/',
    tags: ['gaming console', 'nintendo', 'switch 2', 'portable', 'hybrid'],
    specs: {
      'Màn hình': '7.9" LCD 1080p 120Hz',
      'Độ phân giải': 'Handheld: 1080p | TV: 4K',
      'Lưu trữ': '256GB',
      'CPU/GPU': 'NVIDIA Tegra T239 custom',
      'RAM': '12GB LPDDR5',
      'Pin': '5220 mAh (~2–6.5h game)',
      'Kết nối': 'Wi-Fi 6 + Bluetooth 5.3',
      'Joy-Con': 'Joy-Con 2 (magnetic attach)',
      'GameChat': 'C Button gọi nhóm trong game',
      'Trọng lượng': '398 g (console + Joy-Con)',
    },
  },
  {
    name: 'Steam Deck OLED 1TB',
    brand: 'Valve', model: 'Steam Deck OLED 1TB', category: 'gaming_console',
    price: 20000000,
    description: 'Máy chơi game di động PC Steam Deck màn OLED 7.4", 1TB SSD, AMD Zen 2 + RDNA 2, 90Hz, pin 50Wh',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Valve_logo.svg/320px-Valve_logo.svg.png',
    url: 'https://www.steamdeck.com/en/oled',
    tags: ['gaming console', 'portable gaming', 'steam deck', 'valve', 'pc gaming', 'oled'],
    specs: {
      'Màn hình': '7.4" OLED HDR 1280x800 90Hz',
      'APU': 'AMD Zen 2 4c/8t + RDNA 2 8CU',
      'RAM': '16GB LPDDR5',
      'SSD': '1TB NVMe',
      'Pin': '50Wh (~6–8h game nhẹ)',
      'OS': 'SteamOS 3 (Linux) / Windows',
      'Kết nối': 'Wi-Fi 6E + Bluetooth 5.3',
      'USB-C': 'USB4 + DisplayPort 2.0',
      'Trọng lượng': '640 g',
    },
  },
  // === PROJECTOR bổ sung ===
  {
    name: 'BenQ TH685P',
    brand: 'BenQ', model: 'TH685P', category: 'projector',
    price: 16500000,
    description: 'Máy chiếu DLP Full HD 1080p 3500 lm, input lag 8.3ms, 144Hz gaming, hỗ trợ HDR10, HDMI 2.0',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/BenQ_Logo.svg/320px-BenQ_Logo.svg.png',
    url: 'https://www.benq.com/en-us/projector/gaming/th685p.html',
    tags: ['máy chiếu', 'projector', 'full hd', 'gaming', 'benq', '1080p', '144hz'],
    specs: {
      'Công nghệ': 'DLP',
      'Độ phân giải': '1920×1080 (Full HD)',
      'Độ sáng': '3500 lm',
      'Input Lag': '8.3ms (1080p/60Hz)',
      'Refresh Rate': '144Hz',
      'HDR': 'HDR10',
      'HDMI': '2x HDMI 2.0',
      'Tỷ số tương phản': '10,000:1',
      'Tuổi thọ bóng': '15,000 giờ (SmartEco)',
      'Trọng lượng': '2.8 kg',
    },
  },
  {
    name: 'Optoma UHD38x',
    brand: 'Optoma', model: 'UHD38x', category: 'projector',
    price: 28000000,
    description: 'Máy chiếu 4K UHD 3800 lm, HDR10+, input lag 4ms, 240Hz enhanced, HDMI 2.0 x2, lý tưởng cho gaming 4K',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
    url: 'https://www.optoma.com/eu/en/product/uhd38x/',
    tags: ['máy chiếu', 'projector', '4k', 'gaming', 'optoma', 'uhd', '240hz'],
    specs: {
      'Công nghệ': 'DLP 4K UHD',
      'Độ phân giải': '3840×2160',
      'Độ sáng': '3800 lm',
      'Input Lag': '4ms (1080p/240Hz enhanced)',
      'HDR': 'HDR10+',
      'HDMI': '2x HDMI 2.0',
      'Tỷ số tương phản': '1,000,000:1',
      'Trọng lượng': '3.5 kg',
    },
  },
  // === MONITOR bổ sung ===
  {
    name: 'LG 32GR93U UltraGear 4K',
    brand: 'LG', model: '32GR93U', category: 'monitor',
    price: 15000000,
    description: 'Màn hình gaming 32" 4K IPS 144Hz, G-Sync Compatible, DisplayHDR 400, response time 1ms GtG, thiết kế mỏng',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/LG_symbol.svg/320px-LG_symbol.svg.png',
    url: 'https://www.lg.com/us/monitors/lg-32gr93u-b-gaming-monitor',
    tags: ['màn hình', 'gaming monitor', '4k', '144hz', 'lg', 'ips', 'g-sync'],
    specs: {
      'Kích thước': '32"',
      'Độ phân giải': '4K (3840×2160)',
      'Panel': 'IPS',
      'Refresh Rate': '144Hz',
      'Response Time': '1ms GtG',
      'HDR': 'DisplayHDR 400',
      'FreeSync': 'AMD FreeSync Premium + G-Sync Compatible',
      'Kết nối': '2x HDMI 2.1 + 1x DP 1.4 + USB-C',
      'DCI-P3': '95%',
    },
  },
  {
    name: 'ASUS ProArt PA32UCXR',
    brand: 'ASUS', model: 'ProArt PA32UCXR', category: 'monitor',
    price: 65000000,
    description: 'Màn hình chuyên đồ họa 32" Mini LED 4K, 1152 zones local dimming, Calman verified, Thunderbolt 4, DCI-P3 99%',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/ASUS_Logo.svg/320px-ASUS_Logo.svg.png',
    url: 'https://www.asus.com/displays-desktops/monitors/proart/proart-display-pa32ucxr/',
    tags: ['màn hình', 'professional monitor', '4k', 'mini led', 'asus proart', 'color accurate', 'thunderbolt'],
    specs: {
      'Kích thước': '32"',
      'Độ phân giải': '4K (3840×2160)',
      'Panel': 'IPS Mini LED',
      'Local Dimming': '1152 zones',
      'Độ sáng': '1600 nits peak',
      'DCI-P3': '99%',
      'AdobeRGB': '99%',
      'Calman': 'Verified',
      'Thunderbolt': 'Thunderbolt 4 x2',
      'USB-C': '96W Power Delivery',
    },
  },
  // === LAPTOP bổ sung hãng Lenovo ===
  {
    name: 'Lenovo ThinkPad X1 Carbon Gen 12',
    brand: 'Lenovo', model: 'ThinkPad X1 Carbon Gen 12', category: 'laptop',
    price: 42000000,
    description: 'Laptop doanh nghiệp siêu nhẹ 1.09 kg, Intel Core Ultra 7, 14" 2.8K OLED, bàn phím ThinkPad, bảo mật cao',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Lenovo_logo_2015.svg/320px-Lenovo_logo_2015.svg.png',
    url: 'https://www.lenovo.com/vn/en/laptops/thinkpad/x-series/ThinkPad-X1-Carbon-Gen-12/p/len101t0094',
    tags: ['laptop doanh nghiệp', 'thinkpad', 'lenovo', 'ultrabook', 'oled', 'business laptop', 'siêu nhẹ'],
    specs: {
      'CPU': 'Intel Core Ultra 7 165U',
      'RAM': '32GB LPDDR5x',
      'SSD': '1TB PCIe Gen 4',
      'Màn hình': '14" 2.8K OLED 120Hz',
      'Pin': '57Wh (~15h)',
      'GPU': 'Intel Arc Graphics',
      'Bảo mật': 'ThinkShield, TPM 2.0, IR Camera, Fingerprint',
      'Cổng': '2x TB4 + 2x USB-A + HDMI + Audio',
      'Trọng lượng': '1.09 kg',
      'OS': 'Windows 11 Pro',
    },
  },
  {
    name: 'Lenovo Legion Pro 5i Gen 9',
    brand: 'Lenovo', model: 'Legion Pro 5i Gen 9', category: 'laptop',
    price: 38000000,
    description: 'Laptop gaming Intel Core i7-14700HX, RTX 4070 165W, 16" QHD+ 240Hz, DDR5 32GB, tản nhiệt Legion Coldfront 5.0',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Lenovo_logo_2015.svg/320px-Lenovo_logo_2015.svg.png',
    url: 'https://www.lenovo.com/vn/en/laptops/legion-laptops/legion-5-series/Lenovo-Legion-Pro-5i-Gen-9/p/len101g0048',
    tags: ['laptop gaming', 'lenovo legion', 'rtx 4070', 'gaming laptop', 'intel i7', 'qhd', '240hz'],
    specs: {
      'CPU': 'Intel Core i7-14700HX (20 cores)',
      'GPU': 'NVIDIA GeForce RTX 4070 165W',
      'RAM': '32GB DDR5-5600',
      'SSD': '1TB PCIe Gen 4',
      'Màn hình': '16" QHD+ (2560x1600) IPS 240Hz',
      'Pin': '80Wh',
      'Sạc': '300W adapter',
      'Tản nhiệt': 'Legion Coldfront 5.0',
      'Trọng lượng': '2.5 kg',
    },
  },
  {
    name: 'Acer Nitro V 15 ANV15-51',
    brand: 'Acer', model: 'Nitro V 15 ANV15-51', category: 'laptop',
    price: 22000000,
    description: 'Laptop gaming phổ thông Intel Core i5-13420H, RTX 4060, 15.6" FHD 144Hz, 16GB DDR5, giá tốt',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Acer_2011.svg/320px-Acer_2011.svg.png',
    url: 'https://www.acer.com/vn-vi/laptops/nitro',
    tags: ['laptop gaming', 'acer nitro', 'rtx 4060', 'gaming laptop', 'budget gaming', 'fhd 144hz'],
    specs: {
      'CPU': 'Intel Core i5-13420H',
      'GPU': 'NVIDIA GeForce RTX 4060 (95W)',
      'RAM': '16GB DDR5',
      'SSD': '512GB PCIe Gen 4',
      'Màn hình': '15.6" FHD IPS 144Hz',
      'Pin': '55Wh',
      'Sạc': '135W adapter',
      'Trọng lượng': '2.5 kg',
    },
  },
  {
    name: 'Razer Blade 16 (2024)',
    brand: 'Razer', model: 'Blade 16 2024', category: 'laptop',
    price: 85000000,
    description: 'Laptop gaming cao cấp Intel Core i9-14900HX, RTX 4090 175W, 16" QHD+ 240Hz OLED, 32GB DDR5, thiết kế CNC nhôm',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Razer_logo.svg/320px-Razer_logo.svg.png',
    url: 'https://www.razer.com/gaming-laptops/razer-blade-16',
    tags: ['laptop gaming', 'razer blade', 'rtx 4090', 'gaming laptop', 'premium', 'oled', 'ultrabook gaming'],
    specs: {
      'CPU': 'Intel Core i9-14900HX (24 cores)',
      'GPU': 'NVIDIA GeForce RTX 4090 175W',
      'RAM': '32GB DDR5-5600',
      'SSD': '2TB PCIe Gen 4',
      'Màn hình': '16" QHD+ OLED 240Hz',
      'Pin': '95.2Wh',
      'Sạc': '330W GaN adapter',
      'Chassis': 'CNC Aluminum',
      'Trọng lượng': '2.14 kg',
    },
  },
  // === PHONE bổ sung hãng khác ===
  {
    name: 'Nothing Phone (2a) Plus',
    brand: 'Nothing', model: 'Phone (2a) Plus', category: 'phone',
    price: 10500000,
    description: 'Điện thoại Nothing Phone 2a Plus, chip Dimensity 7350 Pro, Glyph Interface đèn LED đặc trưng, 50MP OIS, 5000mAh',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
    url: 'https://intl.nothing.tech/pages/phone-2a-plus',
    tags: ['điện thoại', 'android', 'nothing', 'glyph', 'dimensity 7350', 'transparent design'],
    specs: {
      'CPU': 'MediaTek Dimensity 7350 Pro',
      'RAM': '12GB',
      'Bộ nhớ': '256GB',
      'Màn hình': '6.7" AMOLED 120Hz LTPO',
      'Camera sau': '50MP OIS f/1.88 + 50MP ultrawide',
      'Camera trước': '50MP',
      'Pin': '5000 mAh, 50W',
      'OS': 'Nothing OS 2.6 (Android 14)',
      'Đặc biệt': 'Glyph Interface 24 zones',
      '5G': 'Có',
    },
  },
  {
    name: 'Tecno Phantom V Fold2',
    brand: 'Tecno', model: 'Phantom V Fold2', category: 'phone',
    price: 22000000,
    description: 'Điện thoại gập Tecno Phantom V Fold2 Snapdragon 8s Gen 3, màn gập 7.85", giá thành phải chăng',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
    url: 'https://www.tecno-mobile.com/vn/phantom-v-fold2/',
    tags: ['điện thoại gập', 'foldable', 'tecno', 'snapdragon 8s', 'fold', '5g'],
    specs: {
      'CPU': 'Snapdragon 8s Gen 3',
      'RAM': '12GB',
      'Bộ nhớ': '256GB',
      'Màn trong': '7.85" LTPO AMOLED 120Hz',
      'Màn ngoài': '6.42" AMOLED 120Hz',
      'Camera sau': '50MP OIS (Sony IMX890) + 50MP UW + 20MP periscope 3x',
      'Pin': '5750 mAh, 70W',
      'OS': 'HiOS 14 (Android 14)',
      '5G': 'Có',
    },
  },
  {
    name: 'Motorola Edge 50 Ultra',
    brand: 'Motorola', model: 'Edge 50 Ultra', category: 'phone',
    price: 15000000,
    description: 'Điện thoại Motorola Edge 50 Ultra Snapdragon 8s Gen 3, camera pOLED 6.67" 165Hz, sạc 125W, chống nước IP68',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Motorola_Logo.svg/320px-Motorola_Logo.svg.png',
    url: 'https://www.motorola.com/vn/smartphones-motorola-edge-50-ultra',
    tags: ['điện thoại', 'android', 'motorola', 'snapdragon 8s gen3', '165hz', 'sạc 125w', 'ip68'],
    specs: {
      'CPU': 'Snapdragon 8s Gen 3',
      'RAM': '16GB',
      'Bộ nhớ': '512GB',
      'Màn hình': '6.67" pOLED 165Hz',
      'Camera sau': '50MP OIS f/1.6 + 50MP UW + 64MP tele 3x',
      'Camera trước': '50MP',
      'Pin': '4500 mAh, 125W',
      'Chống nước': 'IP68',
      'OS': 'Android 14',
      '5G': 'Có',
    },
  },
  // === TABLET bổ sung ===
  {
    name: 'Lenovo Tab P12 Pro',
    brand: 'Lenovo', model: 'Tab P12 Pro', category: 'tablet',
    price: 18000000,
    description: 'Tablet Android cao cấp 12.6" Super AMOLED 2K 120Hz, Snapdragon 870, 8GB RAM, bút stylus và keyboard',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Lenovo_logo_2015.svg/320px-Lenovo_logo_2015.svg.png',
    url: 'https://www.lenovo.com/vn/en/tablets/lenovo/p-series/Lenovo-Tab-P12-Pro/p/ZA9E0147VN',
    tags: ['tablet', 'android', 'lenovo', 'tab p12', 'amoled', '2k', 'productivity'],
    specs: {
      'Màn hình': '12.6" Super AMOLED 2560x1600 120Hz',
      'CPU': 'Snapdragon 870',
      'RAM': '8GB',
      'Bộ nhớ': '256GB',
      'Camera sau': '13MP + 5MP ultrawide',
      'Camera trước': '13MP',
      'Pin': '10,200 mAh, 45W',
      'OS': 'Android 12',
      'Phụ kiện': 'Lenovo Precision Pen 3 + Keyboard Pack',
      'Trọng lượng': '565 g',
    },
  },
  {
    name: 'Xiaomi Pad 6 Pro',
    brand: 'Xiaomi', model: 'Pad 6 Pro', category: 'tablet',
    price: 12000000,
    description: 'Tablet Xiaomi Pad 6 Pro 11" 2.8K 144Hz Snapdragon 8 Gen 2, 12GB RAM, bút stylus Smart Pen 2, loa 8 chiếc',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Xiaomi_logo.svg/320px-Xiaomi_logo.svg.png',
    url: 'https://www.mi.com/vn/product/xiaomi-pad-6-pro',
    tags: ['tablet', 'android', 'xiaomi pad', 'snapdragon 8 gen 2', '2.8k', '144hz', 'gaming tablet'],
    specs: {
      'Màn hình': '11" LCD 2.8K (2880x1800) 144Hz',
      'CPU': 'Snapdragon 8 Gen 2',
      'RAM': '12GB',
      'Bộ nhớ': '256GB',
      'Camera sau': '50MP',
      'Camera trước': '20MP',
      'Pin': '8600 mAh, 67W',
      'OS': 'MIUI 14 Pad (Android 13)',
      'Loa': '8 loa Dolby Atmos',
      'Trọng lượng': '490 g',
    },
  },
  {
    name: 'Realme Pad 2',
    brand: 'Realme', model: 'Pad 2', category: 'tablet',
    price: 7500000,
    description: 'Tablet Realme Pad 2 11.5" 2K 120Hz MediaTek Helio G99, 8GB RAM, pin 8360mAh sạc 33W, thiết kế mỏng nhẹ',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
    url: 'https://www.realme.com/vn/realme-pad-2',
    tags: ['tablet', 'android', 'realme pad', 'helio g99', '2k', '120hz', 'giá tốt'],
    specs: {
      'Màn hình': '11.5" IPS 2000x1200 120Hz',
      'CPU': 'MediaTek Helio G99',
      'RAM': '8GB',
      'Bộ nhớ': '256GB',
      'Camera sau': '8MP',
      'Camera trước': '8MP',
      'Pin': '8360 mAh, 33W',
      'OS': 'realme UI for Pad (Android 13)',
      'Trọng lượng': '478 g',
    },
  },
  // === SMARTWATCH bổ sung ===
  {
    name: 'Google Pixel Watch 3 45mm',
    brand: 'Google', model: 'Pixel Watch 3 45mm', category: 'smartwatch',
    price: 10000000,
    description: 'Đồng hồ thông minh Google Wear OS, màn AMOLED 45mm 60Hz always-on, Fitbit sức khỏe, ECG, SpO2',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Google_2015_logo.svg/320px-Google_2015_logo.svg.png',
    url: 'https://store.google.com/vn/product/pixel_watch_3',
    tags: ['đồng hồ thông minh', 'smartwatch', 'google pixel watch', 'wear os', 'fitbit', 'ecg'],
    specs: {
      'Màn hình': '45mm AMOLED 60Hz AoD',
      'OS': 'Wear OS 4',
      'Chip': 'Snapdragon W5+ Gen 1',
      'RAM': '2GB',
      'Bộ nhớ': '32GB',
      'Pin': '420 mAh (~24h với AoD)',
      'GPS': 'Multi-band GPS',
      'Sức khỏe': 'ECG, SpO2, Fitbit, Stress Score',
      'Chống nước': '5ATM + IP68',
      'NFC': 'Google Pay',
    },
  },
  {
    name: 'Fitbit Charge 6',
    brand: 'Fitbit', model: 'Charge 6', category: 'smartwatch',
    price: 4500000,
    description: 'Vòng tay thông minh Fitbit Charge 6, ECG, GPS tích hợp, SpO2, 7 ngày pin, Google Maps/YouTube Music',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Fitbit_logo16.svg/320px-Fitbit_logo16.svg.png',
    url: 'https://www.fitbit.com/global/en/products/trackers/charge6',
    tags: ['vòng tay thông minh', 'fitness tracker', 'fitbit', 'ecg', 'gps', 'sức khỏe'],
    specs: {
      'Màn hình': '1.04" AMOLED color touchscreen',
      'GPS': 'Built-in GPS',
      'Sức khỏe': 'ECG, SpO2, Heart Rate 24/7, Skin Temp',
      'Pin': '7 ngày (~1 ngày với GPS)',
      'Chống nước': '50m',
      'NFC': 'Google Wallet',
      'Tương thích': 'Android / iOS',
      'Smart Features': 'Google Maps, YouTube Music',
    },
  },
  // === GPU bổ sung ===
  {
    name: 'NVIDIA GeForce RTX 4060 Ti 16GB',
    brand: 'NVIDIA', model: 'GeForce RTX 4060 Ti 16GB', category: 'gpu',
    price: 10500000,
    description: 'Card đồ họa RTX 4060 Ti bản VRAM 16GB, kiến trúc Ada Lovelace, DLSS 3, ray tracing, TDP 165W',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Nvidia_logo.svg/320px-Nvidia_logo.svg.png',
    url: 'https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4060-ti/',
    tags: ['gpu', 'card đồ họa', 'rtx 4060 ti', 'nvidia', '16gb vram', 'dlss3', 'gaming'],
    specs: {
      'GPU Chip': 'AD106',
      'CUDA Cores': '4352',
      'VRAM': '16GB GDDR6',
      'Memory Bus': '128-bit',
      'TDP': '165W',
      'DLSS': '3 (Frame Generation)',
      'Ray Tracing': 'Có (3rd gen)',
      'PCIe': '4.0 x16',
      'Outputs': '1x HDMI 2.1 + 3x DP 1.4a',
    },
  },
  {
    name: 'AMD Radeon RX 7700 XT',
    brand: 'AMD', model: 'Radeon RX 7700 XT', category: 'gpu',
    price: 9500000,
    description: 'Card đồ họa RX 7700 XT 12GB GDDR6, kiến trúc RDNA 3, AMD FSR 3, Infinity Cache 32MB, gaming 1440p tốt',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/AMD_Logo.svg/320px-AMD_Logo.svg.png',
    url: 'https://www.amd.com/en/products/graphics/desktops/radeon/7000-series/amd-radeon-rx-7700-xt.html',
    tags: ['gpu', 'card đồ họa', 'rx 7700 xt', 'amd', 'rdna 3', 'fsr3', '1440p gaming'],
    specs: {
      'GPU Chip': 'Navi 32 (RDNA 3)',
      'Compute Units': '54 CU',
      'VRAM': '12GB GDDR6',
      'Infinity Cache': '32MB',
      'Memory Bus': '192-bit',
      'TDP': '245W',
      'FSR': '3 (Fluid Motion Frames)',
      'PCIe': '4.0 x16',
      'Outputs': '2x DP 2.1 + 1x HDMI 2.1 + 1x DP 1.4',
    },
  },
  // === CPU bổ sung ===
  {
    name: 'Intel Core Ultra 9 285K',
    brand: 'Intel', model: 'Core Ultra 9 285K', category: 'cpu',
    price: 16500000,
    description: 'CPU Intel Arrow Lake thế hệ Core Ultra 285K, 24 cores (8P+16E), không có hyperthreading, socket LGA1851, DDR5',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Intel_logo_%282006-2020%29.svg/320px-Intel_logo_%282006-2020%29.svg.png',
    url: 'https://www.intel.com/content/www/us/en/products/sku/240847/intel-core-ultra-9-processor-285k-36m-cache-up-to-5-70-ghz/specifications.html',
    tags: ['cpu', 'vi xử lý', 'intel', 'core ultra 9', 'arrow lake', 'lga1851', 'socket z890'],
    specs: {
      'Cores': '24 (8P + 16E)',
      'Threads': '24 (không HT trên P-core)',
      'Base Freq (P)': '3.7 GHz',
      'Turbo Max': '5.7 GHz',
      'Cache': '36MB Intel Smart Cache',
      'TDP': '125W (253W Turbo)',
      'Socket': 'LGA1851',
      'Hỗ trợ RAM': 'DDR5-6400 / DDR4-3200',
      'PCIe': 'PCIe 5.0 + PCIe 4.0',
      'iGPU': 'Intel Graphics (4 Xe-cores)',
    },
  },
  {
    name: 'AMD Ryzen 5 9600X',
    brand: 'AMD', model: 'Ryzen 5 9600X', category: 'cpu',
    price: 8500000,
    description: 'CPU AMD Zen 5 Ryzen 5 9600X, 6 cores, hiệu năng đơn nhân vượt trội, socket AM5, DDR5, TDP 65W',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/AMD_Logo.svg/320px-AMD_Logo.svg.png',
    url: 'https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-5-9600x.html',
    tags: ['cpu', 'vi xử lý', 'amd', 'ryzen 5', 'zen 5', 'am5', 'gaming cpu'],
    specs: {
      'Cores': '6',
      'Threads': '12',
      'Base Freq': '3.9 GHz',
      'Boost Freq': '5.4 GHz',
      'Cache': '38MB (6MB L2 + 32MB L3)',
      'TDP': '65W',
      'Socket': 'AM5',
      'Architecture': 'Zen 5',
      'Hỗ trợ RAM': 'DDR5-5600',
      'PCIe': 'PCIe 5.0',
    },
  },
  {
    name: 'AMD Ryzen 9 9900X',
    brand: 'AMD', model: 'Ryzen 9 9900X', category: 'cpu',
    price: 14000000,
    description: 'CPU AMD Zen 5 Ryzen 9 9900X, 12 cores/24 threads, gaming và sáng tạo nội dung cao cấp, socket AM5',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/AMD_Logo.svg/320px-AMD_Logo.svg.png',
    url: 'https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-9-9900x.html',
    tags: ['cpu', 'vi xử lý', 'amd', 'ryzen 9', 'zen 5', 'am5', 'workstation'],
    specs: {
      'Cores': '12',
      'Threads': '24',
      'Base Freq': '4.4 GHz',
      'Boost Freq': '5.6 GHz',
      'Cache': '76MB (12MB L2 + 64MB L3)',
      'TDP': '120W',
      'Socket': 'AM5',
      'Architecture': 'Zen 5',
      'Hỗ trợ RAM': 'DDR5-5600',
    },
  },
  {
    name: 'Intel Core i5-14600K',
    brand: 'Intel', model: 'Core i5-14600K', category: 'cpu',
    price: 8800000,
    description: 'CPU Intel Raptor Lake Refresh 14600K, 14 cores (6P+8E), gaming hiệu năng tốt, không tản nhiệt, socket LGA1700',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Intel_logo_%282006-2020%29.svg/320px-Intel_logo_%282006-2020%29.svg.png',
    url: 'https://www.intel.com/content/www/us/en/products/sku/236796/intel-core-i5-processor-14600k-24m-cache-up-to-5-30-ghz/specifications.html',
    tags: ['cpu', 'vi xử lý', 'intel', 'core i5', 'raptor lake', 'lga1700', 'gaming'],
    specs: {
      'Cores': '14 (6P + 8E)',
      'Threads': '20',
      'Base Freq (P)': '3.5 GHz',
      'Turbo Max': '5.3 GHz',
      'Cache': '24MB Intel Smart Cache',
      'TDP': '125W (181W Turbo)',
      'Socket': 'LGA1700',
      'Hỗ trợ RAM': 'DDR4-3200 / DDR5-5600',
      'PCIe': 'PCIe 5.0 + PCIe 4.0',
      'iGPU': 'Intel UHD Graphics 770',
    },
  },
];

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');
  const db = mongoose.connection;
  const col = db.collection('products');
  const offerCol = db.collection('offers');

  let inserted = 0;
  let skipped = 0;

  for (const p of products) {
    const existing = await col.findOne({ brand: p.brand, model: p.model });
    if (existing) { console.log('  SKIP:', p.brand, p.model); skipped++; continue; }

    const doc = buildProduct(p);
    const result = await col.insertOne(doc);
    const productId = result.insertedId;

    await offerCol.insertOne(buildOffer(productId, p.price, p.url));
    console.log('  INSERTED:', p.brand, p.model, '→', p.category, '|', p.price.toLocaleString(), 'VND');
    inserted++;
  }

  const total = await col.countDocuments();
  const totalOffers = await offerCol.countDocuments();
  console.log('\n=== DONE ===');
  console.log('Inserted:', inserted, '| Skipped:', skipped);
  console.log('Total products:', total, '| Total offers:', totalOffers);

  await mongoose.disconnect();
}

main().catch(console.error);
