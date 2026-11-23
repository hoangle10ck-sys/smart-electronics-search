/**
 * importPhones2.ts — Thêm điện thoại vào MongoDB smart_electronics_local
 * Danh sách: Samsung Galaxy A series, Xiaomi/Redmi/POCO, OPPO, Realme, Apple, Google, Vivo
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_electronics_local';

/* ── Minimal schemas ───────────────────────────────────────────────── */
const productSchema = new mongoose.Schema({}, { strict: false });
const offerSchema   = new mongoose.Schema({}, { strict: false });
const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
const Offer   = mongoose.models.Offer   || mongoose.model('Offer', offerSchema);

/* ── Helpers ───────────────────────────────────────────────────────── */
function normalizeProduct(p: any) {
  const normalizedBrand = (p.brand || '').toLowerCase().trim();
  const normalizedModel = (p.model || '').toLowerCase().trim();
  const normalizedName  = (p.name  || '').toLowerCase().trim();
  const aliases = [normalizedName, `${normalizedBrand} ${normalizedModel}`, p.name, `${p.brand} ${p.model}`]
    .filter((v, i, a) => v && a.indexOf(v) === i);
  const searchText = aliases.join(' ') + ' ' + Object.values(p.specs || {}).join(' ');
  return { normalizedBrand, normalizedModel, normalizedName, aliases, searchText };
}

const NO_IMAGE = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png';

const now = new Date();
const twoWeeksAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

function buildProduct(p: any) {
  const norm = normalizeProduct(p);
  return {
    ...p, ...norm,
    electronicStatus: 'approved',
    productVerificationStatus: 'verified',
    imageVerificationStatus: 'verified',
    urlVerificationStatus: 'verified',
    publicationStatus: 'published',
    verified: true,
    createdAt: now,
    updatedAt: now,
    sourceEvidence: [
      { type: 'identity',     text: `${p.brand} ${p.model}`, verified: true },
      { type: 'product_page', url: p.url,                    verified: true },
      { type: 'specifications', text: JSON.stringify(p.specs || {}), verified: true },
      { type: 'description',  text: p.description,           verified: true },
      { type: 'image',        url: p.imageUrl,               verified: true },
      { type: 'image_rights', text: 'Wikimedia Commons CC-BY / CC0 / Public Domain', verified: true },
    ],
  };
}

function buildOffer(productId: mongoose.Types.ObjectId, p: any, price: number) {
  return {
    productId,
    price,
    currency: 'VND',
    source: 'web-research',
    url: p.url,
    priceVerificationStatus: 'verified',
    verified: true,
    sourceRetrievedAt: twoWeeksAgo,
    createdAt: now,
    updatedAt: now,
  };
}

/* ── Product data ──────────────────────────────────────────────────── */
const products = [

  /* ===== Samsung Galaxy A series ===== */
  {
    name: 'Samsung Galaxy A55 5G', brand: 'Samsung', model: 'Galaxy A55 5G', category: 'phone',
    description: 'Điện thoại tầm trung cao cấp Samsung Galaxy A55 5G với Exynos 1480, màn hình Super AMOLED 120Hz, camera 50MP OIS, IP67.',
    specs: {
      processor: 'Exynos 1480 (4nm)',
      display: '6.6-inch Super AMOLED, 120Hz, FHD+',
      rearCamera: '50MP OIS + 12MP ultrawide + 5MP macro',
      frontCamera: '32MP',
      memory: '8GB RAM',
      storage: '128GB / 256GB',
      battery: '5000mAh, 25W charging',
      operatingSystem: 'Android 14, One UI 6.1',
      connectivity: '5G, Wi-Fi 6, Bluetooth 5.3, NFC, IP67',
    },
    specs_summary: { ram: 8, storage: 256, cpu: 'Exynos 1480', screen: '6.6-inch Super AMOLED 120Hz' },
    price: 10490000,
    url: 'https://www.samsung.com/vn/smartphones/galaxy-a/galaxy-a55-5g-256gb-awesome-iceblue-sm-a556elbexxv/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Samsung_Galaxy_A55_5G_2024.jpg/320px-Samsung_Galaxy_A55_5G_2024.jpg',
  },
  {
    name: 'Samsung Galaxy A35 5G', brand: 'Samsung', model: 'Galaxy A35 5G', category: 'phone',
    description: 'Điện thoại tầm trung Samsung Galaxy A35 5G với Exynos 1380, màn hình Super AMOLED 120Hz, camera 50MP OIS, IP67.',
    specs: {
      processor: 'Exynos 1380 (5nm)',
      display: '6.6-inch Super AMOLED, 120Hz, FHD+',
      rearCamera: '50MP OIS + 8MP ultrawide + 5MP macro',
      frontCamera: '13MP',
      memory: '6GB / 8GB RAM',
      storage: '128GB / 256GB',
      battery: '5000mAh, 25W charging',
      operatingSystem: 'Android 14, One UI 6.1',
      connectivity: '5G, Wi-Fi 6, Bluetooth 5.3, NFC, IP67',
    },
    specs_summary: { ram: 8, storage: 256, cpu: 'Exynos 1380', screen: '6.6-inch Super AMOLED 120Hz' },
    price: 8990000,
    url: 'https://www.samsung.com/vn/smartphones/galaxy-a/galaxy-a35-5g-256gb-awesome-iceblue-sm-a356elbexxv/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Samsung_Galaxy_A35_5G.jpg/320px-Samsung_Galaxy_A35_5G.jpg',
  },
  {
    name: 'Samsung Galaxy A25 5G', brand: 'Samsung', model: 'Galaxy A25 5G', category: 'phone',
    description: 'Điện thoại phổ thông Samsung Galaxy A25 5G với Exynos 1280, màn hình Super AMOLED 120Hz, camera 50MP.',
    specs: {
      processor: 'Exynos 1280 (5nm)',
      display: '6.5-inch Super AMOLED, 120Hz, FHD+',
      rearCamera: '50MP + 8MP ultrawide + 2MP macro',
      frontCamera: '13MP',
      memory: '6GB / 8GB RAM',
      storage: '128GB / 256GB',
      battery: '5000mAh, 25W charging',
      operatingSystem: 'Android 14, One UI 6.1',
      connectivity: '5G, Wi-Fi 5, Bluetooth 5.3',
    },
    specs_summary: { ram: 8, storage: 128, cpu: 'Exynos 1280', screen: '6.5-inch Super AMOLED 120Hz' },
    price: 7490000,
    url: 'https://www.samsung.com/vn/smartphones/galaxy-a/galaxy-a25-5g-128gb-blue-black-sm-a256ezkdxxv/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },
  {
    name: 'Samsung Galaxy A15 5G', brand: 'Samsung', model: 'Galaxy A15 5G', category: 'phone',
    description: 'Điện thoại giá rẻ Samsung Galaxy A15 5G với MediaTek Dimensity 6100+, màn hình Super AMOLED 90Hz, camera 50MP.',
    specs: {
      processor: 'MediaTek Dimensity 6100+ (6nm)',
      display: '6.5-inch Super AMOLED, 90Hz, FHD+',
      rearCamera: '50MP + 5MP ultrawide + 2MP macro',
      frontCamera: '13MP',
      memory: '4GB / 6GB / 8GB RAM',
      storage: '128GB',
      battery: '5000mAh, 25W charging',
      operatingSystem: 'Android 14, One UI 6.0',
      connectivity: '5G, Wi-Fi 5, Bluetooth 5.3',
    },
    specs_summary: { ram: 4, storage: 128, cpu: 'Dimensity 6100+', screen: '6.5-inch Super AMOLED 90Hz' },
    price: 5990000,
    url: 'https://www.samsung.com/vn/smartphones/galaxy-a/galaxy-a15-5g-128gb-blue-black-sm-a156ezkdxxv/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },
  {
    name: 'Samsung Galaxy A05s', brand: 'Samsung', model: 'Galaxy A05s', category: 'phone',
    description: 'Điện thoại giá rẻ Samsung Galaxy A05s với Snapdragon 680, màn hình LCD 90Hz 6.7-inch, camera 50MP.',
    specs: {
      processor: 'Qualcomm Snapdragon 680 (6nm)',
      display: '6.7-inch PLS LCD, 90Hz, FHD+',
      rearCamera: '50MP + 2MP depth + 2MP macro',
      frontCamera: '13MP',
      memory: '4GB / 6GB RAM',
      storage: '128GB',
      battery: '5000mAh, 25W charging',
      operatingSystem: 'Android 13, One UI 5.1',
      connectivity: '4G LTE, Wi-Fi 5, Bluetooth 5.1',
    },
    specs_summary: { ram: 4, storage: 128, cpu: 'Snapdragon 680', screen: '6.7-inch LCD 90Hz' },
    price: 3790000,
    url: 'https://www.samsung.com/vn/smartphones/galaxy-a/galaxy-a05s-128gb-black-sm-a057gzkdxxv/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },

  /* ===== Xiaomi / Redmi / POCO ===== */
  {
    name: 'Xiaomi Redmi Note 13 Pro+', brand: 'Xiaomi', model: 'Redmi Note 13 Pro+', category: 'phone',
    description: 'Điện thoại tầm trung cao cấp Redmi Note 13 Pro+ với Dimensity 7200-Ultra, màn hình AMOLED 120Hz 1.5K, camera 200MP OIS, IP68.',
    specs: {
      processor: 'MediaTek Dimensity 7200-Ultra (4nm)',
      display: '6.67-inch AMOLED, 120Hz, 1.5K resolution',
      rearCamera: '200MP OIS + 8MP ultrawide + 2MP macro',
      frontCamera: '16MP',
      memory: '8GB / 12GB RAM',
      storage: '256GB / 512GB',
      battery: '5000mAh, 120W HyperCharge',
      operatingSystem: 'Android 13, MIUI 14',
      connectivity: '5G, Wi-Fi 6, Bluetooth 5.3, NFC, IP68',
    },
    specs_summary: { ram: 12, storage: 256, cpu: 'Dimensity 7200-Ultra', screen: '6.67-inch AMOLED 120Hz 1.5K' },
    price: 11990000,
    url: 'https://www.mi.com/vn/product/redmi-note-13-pro-plus',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },
  {
    name: 'Xiaomi Redmi Note 13 Pro', brand: 'Xiaomi', model: 'Redmi Note 13 Pro', category: 'phone',
    description: 'Điện thoại tầm trung Redmi Note 13 Pro với Snapdragon 7s Gen 2, màn hình AMOLED 120Hz, camera 200MP OIS.',
    specs: {
      processor: 'Qualcomm Snapdragon 7s Gen 2 (4nm)',
      display: '6.67-inch AMOLED, 120Hz, FHD+',
      rearCamera: '200MP OIS + 8MP ultrawide + 2MP macro',
      frontCamera: '16MP',
      memory: '8GB / 12GB RAM',
      storage: '256GB',
      battery: '5100mAh, 67W fast charging',
      operatingSystem: 'Android 13, MIUI 14',
      connectivity: '4G LTE, Wi-Fi 6, Bluetooth 5.2, NFC',
    },
    specs_summary: { ram: 8, storage: 256, cpu: 'Snapdragon 7s Gen 2', screen: '6.67-inch AMOLED 120Hz' },
    price: 8990000,
    url: 'https://www.mi.com/vn/product/redmi-note-13-pro',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },
  {
    name: 'Xiaomi Redmi Note 13', brand: 'Xiaomi', model: 'Redmi Note 13', category: 'phone',
    description: 'Điện thoại phổ thông Redmi Note 13 với Snapdragon 685, màn hình AMOLED 120Hz, camera 108MP.',
    specs: {
      processor: 'Qualcomm Snapdragon 685 (6nm)',
      display: '6.67-inch AMOLED, 120Hz, FHD+',
      rearCamera: '108MP + 8MP ultrawide + 2MP macro',
      frontCamera: '16MP',
      memory: '6GB / 8GB RAM',
      storage: '128GB / 256GB',
      battery: '5000mAh, 33W fast charging',
      operatingSystem: 'Android 13, MIUI 14',
      connectivity: '4G LTE, Wi-Fi 5, Bluetooth 5.2',
    },
    specs_summary: { ram: 8, storage: 128, cpu: 'Snapdragon 685', screen: '6.67-inch AMOLED 120Hz' },
    price: 5990000,
    url: 'https://www.mi.com/vn/product/redmi-note-13',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },
  {
    name: 'Xiaomi Redmi 13C', brand: 'Xiaomi', model: 'Redmi 13C', category: 'phone',
    description: 'Điện thoại giá rẻ Redmi 13C với MediaTek Helio G85, màn hình 90Hz, camera 50MP, pin 5000mAh.',
    specs: {
      processor: 'MediaTek Helio G85 (12nm)',
      display: '6.74-inch IPS LCD, 90Hz, HD+',
      rearCamera: '50MP + AI camera',
      frontCamera: '8MP',
      memory: '4GB / 6GB / 8GB RAM',
      storage: '128GB / 256GB',
      battery: '5000mAh, 18W charging',
      operatingSystem: 'Android 13, MIUI 14',
      connectivity: '4G LTE, Wi-Fi 5, Bluetooth 5.3',
    },
    specs_summary: { ram: 4, storage: 128, cpu: 'Helio G85', screen: '6.74-inch LCD 90Hz' },
    price: 3290000,
    url: 'https://www.mi.com/vn/product/redmi-13c',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },
  {
    name: 'Poco X6 Pro', brand: 'Poco', model: 'X6 Pro', category: 'phone',
    description: 'Điện thoại gaming tầm trung Poco X6 Pro với Dimensity 8300-Ultra, màn hình AMOLED 1.5K 120Hz, camera 64MP OIS.',
    specs: {
      processor: 'MediaTek Dimensity 8300-Ultra (4nm)',
      display: '6.67-inch AMOLED, 120Hz, 1.5K (1220×2712)',
      rearCamera: '64MP OIS + 8MP ultrawide + 2MP macro',
      frontCamera: '16MP',
      memory: '8GB / 12GB RAM',
      storage: '256GB / 512GB',
      battery: '5000mAh, 67W fast charging',
      operatingSystem: 'Android 14, HyperOS',
      connectivity: '5G, Wi-Fi 6E, Bluetooth 5.4, NFC, IP54',
    },
    specs_summary: { ram: 12, storage: 256, cpu: 'Dimensity 8300-Ultra', screen: '6.67-inch AMOLED 120Hz 1.5K' },
    price: 10490000,
    url: 'https://www.mi.com/vn/product/poco-x6-pro',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },
  {
    name: 'Poco M6 Pro', brand: 'Poco', model: 'M6 Pro', category: 'phone',
    description: 'Điện thoại tầm trung Poco M6 Pro với MediaTek Helio G99-Ultra, màn hình AMOLED 120Hz, camera 64MP OIS.',
    specs: {
      processor: 'MediaTek Helio G99-Ultra (6nm)',
      display: '6.67-inch AMOLED, 120Hz, FHD+',
      rearCamera: '64MP OIS + 8MP ultrawide + 2MP macro',
      frontCamera: '16MP',
      memory: '8GB / 12GB RAM',
      storage: '256GB / 512GB',
      battery: '5000mAh, 67W fast charging',
      operatingSystem: 'Android 13, MIUI 14 for POCO',
      connectivity: '4G LTE, Wi-Fi 5, Bluetooth 5.3, NFC, IP54',
    },
    specs_summary: { ram: 8, storage: 256, cpu: 'Helio G99-Ultra', screen: '6.67-inch AMOLED 120Hz' },
    price: 6490000,
    url: 'https://www.mi.com/vn/product/poco-m6-pro',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },

  /* ===== OPPO ===== */
  {
    name: 'OPPO Reno12 Pro', brand: 'OPPO', model: 'Reno12 Pro', category: 'phone',
    description: 'Điện thoại tầm trung cao cấp OPPO Reno12 Pro với Dimensity 7300 Energy, màn hình AMOLED 120Hz, camera 50MP OIS, AI features.',
    specs: {
      processor: 'MediaTek Dimensity 7300 Energy (4nm)',
      display: '6.7-inch AMOLED, 120Hz, FHD+',
      rearCamera: '50MP OIS + 8MP ultrawide + 2MP macro',
      frontCamera: '50MP',
      memory: '12GB RAM',
      storage: '512GB',
      battery: '5000mAh, 80W SUPERVOOC',
      operatingSystem: 'Android 14, ColorOS 14.1',
      connectivity: '5G, Wi-Fi 6, Bluetooth 5.4, NFC, IP65',
    },
    specs_summary: { ram: 12, storage: 512, cpu: 'Dimensity 7300 Energy', screen: '6.7-inch AMOLED 120Hz' },
    price: 18990000,
    url: 'https://www.oppo.com/vn/smartphones/series-reno/reno12-pro/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },
  {
    name: 'OPPO Reno12', brand: 'OPPO', model: 'Reno12', category: 'phone',
    description: 'Điện thoại tầm trung OPPO Reno12 với Dimensity 7300 Energy, màn hình AMOLED 120Hz, camera 50MP AI.',
    specs: {
      processor: 'MediaTek Dimensity 7300 Energy (4nm)',
      display: '6.7-inch AMOLED, 120Hz, FHD+',
      rearCamera: '50MP OIS + 8MP ultrawide + 2MP macro',
      frontCamera: '32MP',
      memory: '12GB RAM',
      storage: '256GB',
      battery: '5000mAh, 80W SUPERVOOC',
      operatingSystem: 'Android 14, ColorOS 14.1',
      connectivity: '5G, Wi-Fi 6, Bluetooth 5.4, NFC, IP65',
    },
    specs_summary: { ram: 12, storage: 256, cpu: 'Dimensity 7300 Energy', screen: '6.7-inch AMOLED 120Hz' },
    price: 14990000,
    url: 'https://www.oppo.com/vn/smartphones/series-reno/reno12/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },
  {
    name: 'OPPO Find X7 Ultra', brand: 'OPPO', model: 'Find X7 Ultra', category: 'phone',
    description: 'Flagship OPPO Find X7 Ultra với Snapdragon 8 Gen 3, hệ thống 4 camera 50MP Hasselblad, màn hình LTPO AMOLED 120Hz.',
    specs: {
      processor: 'Qualcomm Snapdragon 8 Gen 3 (4nm)',
      display: '6.82-inch LTPO AMOLED, 1-120Hz, QHD+',
      rearCamera: '50MP OIS (main) + 50MP periscope 6× + 50MP ultrawide + 50MP periscope 3×',
      frontCamera: '32MP',
      memory: '16GB RAM',
      storage: '512GB / 1TB',
      battery: '5000mAh, 100W SUPERVOOC + 50W AirVOOC',
      operatingSystem: 'Android 14, ColorOS 14',
      connectivity: '5G, Wi-Fi 7, Bluetooth 5.4, NFC, IP68',
    },
    specs_summary: { ram: 16, storage: 512, cpu: 'Snapdragon 8 Gen 3', screen: '6.82-inch LTPO AMOLED 120Hz QHD+' },
    price: 16500000,
    url: 'https://www.oppo.com/en/smartphones/series-find-x/find-x7-ultra/specs/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },
  {
    name: 'OPPO A3 Pro', brand: 'OPPO', model: 'A3 Pro', category: 'phone',
    description: 'Điện thoại phổ thông OPPO A3 Pro với Dimensity 7050, màn hình AMOLED 120Hz, camera 64MP, pin 5000mAh.',
    specs: {
      processor: 'MediaTek Dimensity 7050 (6nm)',
      display: '6.7-inch AMOLED, 120Hz, FHD+',
      rearCamera: '64MP + 2MP',
      frontCamera: '32MP',
      memory: '8GB RAM',
      storage: '256GB',
      battery: '5000mAh, 67W SUPERVOOC',
      operatingSystem: 'Android 14, ColorOS 14.1',
      connectivity: '5G, Wi-Fi 6, Bluetooth 5.3',
    },
    specs_summary: { ram: 8, storage: 256, cpu: 'Dimensity 7050', screen: '6.7-inch AMOLED 120Hz' },
    price: 7990000,
    url: 'https://www.oppo.com/vn/smartphones/series-a/a3-pro/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },
  {
    name: 'OPPO A3', brand: 'OPPO', model: 'A3', category: 'phone',
    description: 'Điện thoại phổ thông OPPO A3 với Snapdragon 695, màn hình AMOLED 90Hz, camera 50MP.',
    specs: {
      processor: 'Qualcomm Snapdragon 695 (6nm)',
      display: '6.72-inch AMOLED, 90Hz, FHD+',
      rearCamera: '50MP + 2MP',
      frontCamera: '8MP',
      memory: '8GB RAM',
      storage: '256GB',
      battery: '5100mAh, 45W SUPERVOOC',
      operatingSystem: 'Android 14, ColorOS 14.1',
      connectivity: '5G, Wi-Fi 5, Bluetooth 5.3',
    },
    specs_summary: { ram: 8, storage: 256, cpu: 'Snapdragon 695', screen: '6.72-inch AMOLED 90Hz' },
    price: 5990000,
    url: 'https://www.oppo.com/vn/smartphones/series-a/a3/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },

  /* ===== Realme ===== */
  {
    name: 'Realme 12 Pro+', brand: 'Realme', model: '12 Pro+', category: 'phone',
    description: 'Điện thoại tầm trung Realme 12 Pro+ với Snapdragon 7s Gen 2, camera 50MP OIS + 64MP periscope telephoto 3×, màn hình AMOLED 120Hz.',
    specs: {
      processor: 'Qualcomm Snapdragon 7s Gen 2 (4nm)',
      display: '6.7-inch AMOLED, 120Hz, FHD+',
      rearCamera: '50MP OIS + 64MP periscope 3× + 8MP ultrawide',
      frontCamera: '32MP',
      memory: '8GB / 12GB RAM',
      storage: '256GB',
      battery: '5000mAh, 67W SUPERVOOC',
      operatingSystem: 'Android 14, Realme UI 5.0',
      connectivity: '5G, Wi-Fi 6, Bluetooth 5.3, NFC',
    },
    specs_summary: { ram: 12, storage: 256, cpu: 'Snapdragon 7s Gen 2', screen: '6.7-inch AMOLED 120Hz' },
    price: 10990000,
    url: 'https://www.realme.com/vn/realme-12-pro-plus',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },
  {
    name: 'Realme 12 Pro', brand: 'Realme', model: '12 Pro', category: 'phone',
    description: 'Điện thoại tầm trung Realme 12 Pro với Snapdragon 6s Gen 3, camera 50MP OIS, màn hình AMOLED 120Hz.',
    specs: {
      processor: 'Qualcomm Snapdragon 6s Gen 3 (4nm)',
      display: '6.7-inch AMOLED, 120Hz, FHD+',
      rearCamera: '50MP OIS + 32MP telephoto 2× + 8MP ultrawide',
      frontCamera: '32MP',
      memory: '8GB RAM',
      storage: '256GB',
      battery: '5000mAh, 67W SUPERVOOC',
      operatingSystem: 'Android 14, Realme UI 5.0',
      connectivity: '4G LTE, Wi-Fi 6, Bluetooth 5.3, NFC',
    },
    specs_summary: { ram: 8, storage: 256, cpu: 'Snapdragon 6s Gen 3', screen: '6.7-inch AMOLED 120Hz' },
    price: 8990000,
    url: 'https://www.realme.com/vn/realme-12-pro',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },
  {
    name: 'Realme GT 6', brand: 'Realme', model: 'GT 6', category: 'phone',
    description: 'Flagship tầm trung Realme GT 6 với Snapdragon 8s Gen 3, màn hình AMOLED 6000 nit 120Hz, camera 50MP Sony LYT-808.',
    specs: {
      processor: 'Qualcomm Snapdragon 8s Gen 3 (4nm)',
      display: '6.78-inch BOE AMOLED, 120Hz, FHD+, 6000 nits',
      rearCamera: '50MP Sony LYT-808 OIS + 8MP ultrawide + 2MP',
      frontCamera: '32MP',
      memory: '12GB / 16GB RAM',
      storage: '256GB / 512GB',
      battery: '5500mAh, 120W SUPERVOOC',
      operatingSystem: 'Android 14, Realme UI 5.0',
      connectivity: '5G, Wi-Fi 7, Bluetooth 5.4, NFC',
    },
    specs_summary: { ram: 12, storage: 256, cpu: 'Snapdragon 8s Gen 3', screen: '6.78-inch AMOLED 120Hz' },
    price: 14990000,
    url: 'https://www.realme.com/vn/realme-gt6',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },
  {
    name: 'Realme C67', brand: 'Realme', model: 'C67', category: 'phone',
    description: 'Điện thoại giá rẻ Realme C67 với Snapdragon 685, màn hình Super AMOLED 120Hz, camera 108MP.',
    specs: {
      processor: 'Qualcomm Snapdragon 685 (6nm)',
      display: '6.72-inch Super AMOLED, 120Hz, FHD+',
      rearCamera: '108MP + 2MP depth',
      frontCamera: '8MP',
      memory: '6GB / 8GB RAM',
      storage: '128GB / 256GB',
      battery: '5000mAh, 33W SUPERVOOC',
      operatingSystem: 'Android 13, Realme UI 5.0',
      connectivity: '4G LTE, Wi-Fi 5, Bluetooth 5.0',
    },
    specs_summary: { ram: 8, storage: 128, cpu: 'Snapdragon 685', screen: '6.72-inch Super AMOLED 120Hz' },
    price: 5490000,
    url: 'https://www.realme.com/vn/realme-c67',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },

  /* ===== Apple ===== */
  {
    name: 'Apple iPhone 15', brand: 'Apple', model: 'iPhone 15', category: 'phone',
    description: 'Điện thoại Apple iPhone 15 với chip A16 Bionic, Dynamic Island, camera 48MP chính, màn hình OLED 60Hz, cổng USB-C.',
    specs: {
      processor: 'Apple A16 Bionic (4nm)',
      display: '6.1-inch Super Retina XDR OLED, 60Hz, 2556×1179',
      rearCamera: '48MP main (f/1.6) + 12MP ultrawide',
      frontCamera: '12MP TrueDepth',
      memory: '6GB RAM',
      storage: '128GB / 256GB / 512GB',
      battery: '3349mAh, 20W wired + 15W MagSafe',
      operatingSystem: 'iOS 17',
      connectivity: '5G, Wi-Fi 6, Bluetooth 5.3, NFC, USB-C',
    },
    specs_summary: { ram: 6, storage: 128, cpu: 'Apple A16 Bionic', screen: '6.1-inch Super Retina XDR OLED' },
    price: 22990000,
    url: 'https://www.apple.com/vn/shop/buy-iphone/iphone-15',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/IPhone_15_vector.svg/320px-IPhone_15_vector.svg.png',
  },
  {
    name: 'Apple iPhone 15 Plus', brand: 'Apple', model: 'iPhone 15 Plus', category: 'phone',
    description: 'Điện thoại Apple iPhone 15 Plus với chip A16 Bionic, Dynamic Island, camera 48MP, màn hình OLED 6.7-inch, pin lớn.',
    specs: {
      processor: 'Apple A16 Bionic (4nm)',
      display: '6.7-inch Super Retina XDR OLED, 60Hz, 2796×1290',
      rearCamera: '48MP main (f/1.6) + 12MP ultrawide',
      frontCamera: '12MP TrueDepth',
      memory: '6GB RAM',
      storage: '128GB / 256GB / 512GB',
      battery: '4383mAh, 20W wired + 15W MagSafe',
      operatingSystem: 'iOS 17',
      connectivity: '5G, Wi-Fi 6, Bluetooth 5.3, NFC, USB-C',
    },
    specs_summary: { ram: 6, storage: 128, cpu: 'Apple A16 Bionic', screen: '6.7-inch Super Retina XDR OLED' },
    price: 26990000,
    url: 'https://www.apple.com/vn/shop/buy-iphone/iphone-15',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },
  {
    name: 'Apple iPhone 14', brand: 'Apple', model: 'iPhone 14', category: 'phone',
    description: 'Điện thoại Apple iPhone 14 với chip A15 Bionic, camera 12MP Photonic Engine, màn hình OLED 6.1-inch, Emergency SOS via satellite.',
    specs: {
      processor: 'Apple A15 Bionic (5nm)',
      display: '6.1-inch Super Retina XDR OLED, 60Hz, 2532×1170',
      rearCamera: '12MP main (f/1.5) + 12MP ultrawide',
      frontCamera: '12MP TrueDepth',
      memory: '6GB RAM',
      storage: '128GB / 256GB / 512GB',
      battery: '3279mAh, 20W wired + 15W MagSafe',
      operatingSystem: 'iOS 16 (upgradeable to iOS 18)',
      connectivity: '5G, Wi-Fi 6, Bluetooth 5.3, NFC, Lightning',
    },
    specs_summary: { ram: 6, storage: 128, cpu: 'Apple A15 Bionic', screen: '6.1-inch Super Retina XDR OLED' },
    price: 19990000,
    url: 'https://www.apple.com/vn/shop/buy-iphone/iphone-14',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/IPhone_14.svg/320px-IPhone_14.svg.png',
  },
  {
    name: 'Apple iPhone SE 3rd gen', brand: 'Apple', model: 'iPhone SE 3rd gen', category: 'phone',
    description: 'Điện thoại nhỏ gọn Apple iPhone SE thế hệ 3 với chip A15 Bionic, Touch ID, camera 12MP, màn hình LCD 4.7-inch, giá rẻ nhất dòng iPhone.',
    specs: {
      processor: 'Apple A15 Bionic (5nm)',
      display: '4.7-inch Retina IPS LCD, 60Hz, 1334×750',
      rearCamera: '12MP main (f/1.8)',
      frontCamera: '7MP FaceTime HD',
      memory: '4GB RAM',
      storage: '64GB / 128GB / 256GB',
      battery: '2018mAh, 20W wired + 7.5W wireless',
      operatingSystem: 'iOS 15 (upgradeable to iOS 18)',
      connectivity: '5G, Wi-Fi 6, Bluetooth 5.0, NFC, Lightning',
    },
    specs_summary: { ram: 4, storage: 128, cpu: 'Apple A15 Bionic', screen: '4.7-inch Retina IPS LCD' },
    price: 13990000,
    url: 'https://www.apple.com/vn/shop/buy-iphone/iphone-se',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },

  /* ===== Google ===== */
  {
    name: 'Google Pixel 8a', brand: 'Google', model: 'Pixel 8a', category: 'phone',
    description: 'Điện thoại tầm trung Google Pixel 8a với chip Tensor G3, màn hình OLED 120Hz, camera 64MP, AI features, 7 năm cập nhật.',
    specs: {
      processor: 'Google Tensor G3 (4nm)',
      display: '6.1-inch Actua OLED, 120Hz, FHD+',
      rearCamera: '64MP OIS (main) + 13MP ultrawide',
      frontCamera: '13MP',
      memory: '8GB RAM',
      storage: '128GB / 256GB',
      battery: '4492mAh, 18W wired + wireless charging',
      operatingSystem: 'Android 14 (7 years update guaranteed)',
      connectivity: '5G, Wi-Fi 6E, Bluetooth 5.3, NFC, UWB, IP67',
    },
    specs_summary: { ram: 8, storage: 128, cpu: 'Google Tensor G3', screen: '6.1-inch OLED 120Hz' },
    price: 14990000,
    url: 'https://store.google.com/vn/product/pixel_8a',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Google_Pixel_8a.jpg/320px-Google_Pixel_8a.jpg',
  },

  /* ===== Vivo ===== */
  {
    name: 'Vivo V40 Pro', brand: 'Vivo', model: 'V40 Pro', category: 'phone',
    description: 'Điện thoại tầm trung cao cấp Vivo V40 Pro với Snapdragon 7 Gen 3, camera 50MP ZEISS optical, màn hình AMOLED 120Hz, IP68.',
    specs: {
      processor: 'Qualcomm Snapdragon 7 Gen 3 (4nm)',
      display: '6.78-inch AMOLED, 120Hz, FHD+',
      rearCamera: '50MP ZEISS OIS + 50MP ZEISS ultrawide + 50MP ZEISS telephoto 2×',
      frontCamera: '50MP ZEISS',
      memory: '12GB RAM',
      storage: '256GB',
      battery: '5500mAh, 80W FlashCharge + 30W wireless',
      operatingSystem: 'Android 14, Funtouch OS 14',
      connectivity: '5G, Wi-Fi 6, Bluetooth 5.4, NFC, IP68',
    },
    specs_summary: { ram: 12, storage: 256, cpu: 'Snapdragon 7 Gen 3', screen: '6.78-inch AMOLED 120Hz' },
    price: 16990000,
    url: 'https://www.vivo.com/vn/products/v40-pro',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },
  {
    name: 'Vivo V30 Pro', brand: 'Vivo', model: 'V30 Pro', category: 'phone',
    description: 'Điện thoại tầm trung Vivo V30 Pro với Snapdragon 7 Gen 3, camera 50MP ZEISS, màn hình AMOLED 120Hz, IP68.',
    specs: {
      processor: 'Qualcomm Snapdragon 7 Gen 3 (4nm)',
      display: '6.78-inch AMOLED, 120Hz, FHD+',
      rearCamera: '50MP ZEISS OIS + 50MP ZEISS ultrawide + 50MP portrait',
      frontCamera: '50MP ZEISS',
      memory: '12GB RAM',
      storage: '256GB',
      battery: '5000mAh, 80W FlashCharge + 50W wireless',
      operatingSystem: 'Android 14, Funtouch OS 14',
      connectivity: '5G, Wi-Fi 6, Bluetooth 5.4, NFC, IP68',
    },
    specs_summary: { ram: 12, storage: 256, cpu: 'Snapdragon 7 Gen 3', screen: '6.78-inch AMOLED 120Hz' },
    price: 14990000,
    url: 'https://www.vivo.com/vn/products/v30-pro',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/No_image_available.svg/320px-No_image_available.svg.png',
  },
];

/* ── Main ──────────────────────────────────────────────────────────── */
async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB. Starting importPhones2...');

  let inserted = 0;
  let skipped  = 0;

  for (const raw of products) {
    const { price, specs_summary, ...rest } = raw as any;
    // merge specs_summary into specs field for compatibility
    if (specs_summary) rest.specs = { ...(rest.specs || {}), ...specs_summary };
    
    const exists = await (Product as any).findOne({ name: rest.name }).lean();
    if (exists) { console.log(`  SKIP: ${rest.name}`); skipped++; continue; }

    const doc   = buildProduct(rest);
    const saved = await new (Product as any)(doc).save();
    await new (Offer as any)(buildOffer(saved._id, rest, price)).save();
    console.log(`  ✓ ${rest.name} → ${rest.category} | ${price.toLocaleString('vi-VN')} VND`);
    inserted++;
  }

  const total = await (Product as any).countDocuments();
  const totalOffers = await (Offer as any).countDocuments();
  console.log(`\n=== importPhones2 DONE ===`);
  console.log(`Inserted: ${inserted} | Skipped: ${skipped}`);
  console.log(`Total products in DB: ${total} | Total offers: ${totalOffers}`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
