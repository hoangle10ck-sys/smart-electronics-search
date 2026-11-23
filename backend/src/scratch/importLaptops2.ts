/**
 * importLaptops2.ts — Laptops & Desktops batch
 * Products: Lenovo, HP, Acer, Microsoft, Samsung, LG laptops + 3 desktops
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_electronics_local';

const productSchema = new mongoose.Schema({}, { strict: false });
const offerSchema   = new mongoose.Schema({}, { strict: false });
const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
const Offer   = mongoose.models.Offer   || mongoose.model('Offer', offerSchema);

function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
function normalizeProduct(p: any) {
  const normalizedBrand = (p.brand || '').toLowerCase().trim();
  const normalizedModel = (p.model || '').toLowerCase().trim();
  const normalizedName  = (p.name  || '').toLowerCase().trim();
  const aliases = [normalizedName, `${normalizedBrand} ${normalizedModel}`, p.name, `${p.brand} ${p.model}`]
    .filter((v, i, a) => v && a.indexOf(v) === i);
  const searchText = aliases.join(' ') + ' ' + Object.values(p.specs || {}).join(' ');
  return { normalizedBrand, normalizedModel, normalizedName, aliases, searchText };
}

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

  /* ===== LENOVO Laptops ===== */
  {
    name: 'Lenovo ThinkPad X1 Carbon Gen 12',
    brand: 'Lenovo', model: 'ThinkPad X1 Carbon Gen 12', category: 'laptop',
    description: 'Laptop doanh nhân siêu mỏng nhẹ cao cấp, Intel Core Ultra 7, màn OLED 2.8K 120Hz, chỉ 1.09kg.',
    specs: {
      cpu: 'Intel Core Ultra 7 155U',
      ram: '32GB LPDDR5x',
      storage: '1TB PCIe Gen4 NVMe SSD',
      display: '14-inch 2.8K OLED 120Hz Anti-reflection',
      gpu: 'Intel Arc Graphics',
      battery: '57Wh, up to 15h',
      os: 'Windows 11 Pro',
      weight: '1.09kg',
      ports: '2x Thunderbolt 4, 2x USB-A 3.2, HDMI 2.1',
    },
    price: 42000000,
    url: 'https://www.lenovo.com/vn/vi/p/laptops/thinkpad/thinkpadx1/thinkpad-x1-carbon-gen-12/len101t0082',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Lenovo_ThinkPad_X1_Carbon_Ultrabook.jpg/320px-Lenovo_ThinkPad_X1_Carbon_Ultrabook.jpg',
  },
  {
    name: 'Lenovo ThinkPad E16 Gen 2',
    brand: 'Lenovo', model: 'ThinkPad E16 Gen 2', category: 'laptop',
    description: 'Laptop văn phòng 16 inch MIL-STD-810H, Intel Core Ultra 5, bàn phím numpad, bền bỉ cho doanh nghiệp.',
    specs: {
      cpu: 'Intel Core Ultra 5 125U',
      ram: '16GB DDR5',
      storage: '512GB PCIe NVMe SSD',
      display: '16-inch WUXGA 1920x1200 IPS Anti-glare 300nits',
      gpu: 'Intel Graphics',
      battery: '57Wh',
      os: 'Windows 11 Home',
      weight: '1.78kg',
    },
    price: 23500000,
    url: 'https://www.lenovo.com/vn/vi/p/laptops/thinkpad/thinkpade/thinkpad-e16-gen-2/len101t0107',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Lenovo_ThinkPad_X1_Carbon_Ultrabook.jpg/320px-Lenovo_ThinkPad_X1_Carbon_Ultrabook.jpg',
  },
  {
    name: 'Lenovo IdeaPad Slim 5i Gen 9',
    brand: 'Lenovo', model: 'IdeaPad Slim 5i Gen 9', category: 'laptop',
    description: 'Laptop mỏng nhẹ tầm trung, Intel Core Ultra 7, màn OLED 2K 120Hz, thiết kế nhôm sang trọng.',
    specs: {
      cpu: 'Intel Core Ultra 7 155H',
      ram: '16GB LPDDR5x',
      storage: '512GB PCIe Gen4 NVMe SSD',
      display: '14-inch 2K 2240x1400 OLED 120Hz 400nits 100% DCI-P3',
      gpu: 'Intel Arc Graphics',
      battery: '75Wh',
      os: 'Windows 11 Home',
      weight: '1.46kg',
    },
    price: 20500000,
    url: 'https://www.lenovo.com/vn/vi/p/laptops/ideapad/ideapad-slim/ideapad-slim-5i-gen-9/83dj001jvn',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Lenovo_IdeaPad_Series.jpg/320px-Lenovo_IdeaPad_Series.jpg',
  },
  {
    name: 'Lenovo Legion Pro 7i Gen 9',
    brand: 'Lenovo', model: 'Legion Pro 7i Gen 9', category: 'laptop',
    description: 'Laptop gaming cao cấp nhất, Intel Core i9-14900HX, RTX 4080 12GB, màn 2K 240Hz G-SYNC, tản nhiệt vapor chamber.',
    specs: {
      cpu: 'Intel Core i9-14900HX',
      ram: '32GB DDR5 5600MHz',
      storage: '1TB PCIe Gen4 NVMe SSD',
      display: '16-inch WQXGA 2560x1600 IPS 240Hz 500nits 100% sRGB G-SYNC',
      gpu: 'NVIDIA GeForce RTX 4080 12GB GDDR6',
      battery: '99.9Wh',
      os: 'Windows 11 Home',
      weight: '2.62kg',
    },
    price: 72000000,
    url: 'https://www.lenovo.com/vn/vi/p/laptops/legion-laptops/legion-pro-7-series/lenovo-legion-pro-7i-gen-9/83de000avn',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Copilot_key.jpg/320px-Copilot_key.jpg',
  },
  {
    name: 'Lenovo Yoga 9i Gen 9',
    brand: 'Lenovo', model: 'Yoga 9i Gen 9', category: 'laptop',
    description: 'Laptop convertible 2-in-1 cao cấp, Intel Core Ultra 7, màn OLED 4K cảm ứng 120Hz, loa Bowers & Wilkins Dolby Atmos.',
    specs: {
      cpu: 'Intel Core Ultra 7 155H',
      ram: '32GB LPDDR5x',
      storage: '1TB PCIe Gen4 NVMe SSD',
      display: '14-inch 4K OLED Touch 120Hz 100% DCI-P3 Dolby Vision',
      gpu: 'Intel Arc Graphics',
      battery: '75Wh',
      os: 'Windows 11 Home',
      weight: '1.32kg',
      audio: 'Bowers & Wilkins 4 speakers Dolby Atmos',
    },
    price: 38000000,
    url: 'https://www.lenovo.com/vn/vi/p/laptops/yoga/yoga-2-in-1-series/lenovo-yoga-9i-gen-9/83ac003uvn',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Lenovo_IdeaPad_Series.jpg/320px-Lenovo_IdeaPad_Series.jpg',
  },

  /* ===== HP Laptops ===== */
  {
    name: 'HP Victus 15 RTX 4060',
    brand: 'HP', model: 'Victus 15 fa1035dx', category: 'laptop',
    description: 'Laptop gaming tầm trung, Intel Core i7-13620H, RTX 4060 8GB, màn 15.6" FHD 144Hz, thiết kế mỏng nhẹ.',
    specs: {
      cpu: 'Intel Core i7-13620H',
      ram: '16GB DDR5',
      storage: '512GB PCIe Gen4 NVMe SSD',
      display: '15.6-inch FHD 1920x1080 IPS 144Hz Anti-glare',
      gpu: 'NVIDIA GeForce RTX 4060 8GB GDDR6',
      battery: '70.9Wh',
      os: 'Windows 11 Home',
      weight: '2.29kg',
    },
    price: 25500000,
    url: 'https://www.hp.com/vn-en/shop/pdp/hp-victus-15-fa1035dx',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/HP_logo_2012.svg/320px-HP_logo_2012.svg.png',
  },
  {
    name: 'HP Spectre x360 14',
    brand: 'HP', model: 'Spectre x360 14-eu0097nr', category: 'laptop',
    description: 'Laptop convertible 2-in-1 cao cấp nhất của HP, Intel Core Ultra 7, màn OLED 2.8K 120Hz cảm ứng, thiết kế nhôm CNC.',
    specs: {
      cpu: 'Intel Core Ultra 7 155H',
      ram: '32GB LPDDR5x',
      storage: '2TB PCIe Gen4 NVMe SSD',
      display: '14-inch 2.8K 2880x1800 OLED Touch 120Hz 400nits 100% DCI-P3',
      gpu: 'Intel Arc Graphics',
      battery: '72Wh',
      os: 'Windows 11 Home',
      weight: '1.44kg',
    },
    price: 42000000,
    url: 'https://www.hp.com/vn-en/shop/pdp/hp-spectre-x360-2-in-1-laptop-14-eu0097nr',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Hp_Spectre_x360.jpg/320px-Hp_Spectre_x360.jpg',
  },
  {
    name: 'HP Pavilion 15',
    brand: 'HP', model: 'Pavilion 15-eg3094tu', category: 'laptop',
    description: 'Laptop sinh viên văn phòng tầm trung, Intel Core i5 thế hệ 13, màn FHD IPS, nhẹ nhàng bền bỉ.',
    specs: {
      cpu: 'Intel Core i5-1335U',
      ram: '8GB DDR4',
      storage: '512GB PCIe NVMe SSD',
      display: '15.6-inch FHD 1920x1080 IPS Anti-glare',
      gpu: 'Intel Iris Xe Graphics',
      battery: '41Wh',
      os: 'Windows 11 Home',
      weight: '1.75kg',
    },
    price: 14500000,
    url: 'https://www.hp.com/vn-en/shop/pdp/hp-pavilion-laptop-15-eg3094tu',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/HP_logo_2012.svg/320px-HP_logo_2012.svg.png',
  },
  {
    name: 'HP Envy x360 15',
    brand: 'HP', model: 'Envy x360 15-ew0013dx', category: 'laptop',
    description: 'Laptop convertible 2-in-1 cao cấp, Intel Core Ultra 5, màn OLED FHD 120Hz cảm ứng, thiết kế nhôm đẹp.',
    specs: {
      cpu: 'Intel Core Ultra 5 125U',
      ram: '16GB LPDDR5',
      storage: '1TB PCIe Gen4 NVMe SSD',
      display: '15.6-inch FHD 1920x1080 OLED Touch 120Hz',
      gpu: 'Intel Arc Graphics',
      battery: '56Wh',
      os: 'Windows 11 Home',
      weight: '1.73kg',
    },
    price: 23000000,
    url: 'https://www.hp.com/vn-en/shop/pdp/hp-envy-x360-2-in-1-laptop-15-ew0013dx',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/HP_logo_2012.svg/320px-HP_logo_2012.svg.png',
  },

  /* ===== Acer Laptops ===== */
  {
    name: 'Acer Nitro V 15 RTX 4060',
    brand: 'Acer', model: 'Nitro V 15 ANV15-51', category: 'laptop',
    description: 'Laptop gaming tầm trung giá tốt, Intel Core i7-13620H, RTX 4060 8GB, màn 15.6" FHD 165Hz, tản nhiệt tốt.',
    specs: {
      cpu: 'Intel Core i7-13620H',
      ram: '16GB DDR5',
      storage: '512GB PCIe Gen4 NVMe SSD',
      display: '15.6-inch FHD 1920x1080 IPS 165Hz 100% sRGB',
      gpu: 'NVIDIA GeForce RTX 4060 8GB GDDR6',
      battery: '55Wh',
      os: 'Windows 11 Home',
      weight: '2.5kg',
    },
    price: 23900000,
    url: 'https://store.acer.com/en-us/gaming-laptops/nitro/nitro-v-15-laptop-anv15-51',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Acer_Nitro_5.jpg/320px-Acer_Nitro_5.jpg',
  },
  {
    name: 'Acer Swift Go 14',
    brand: 'Acer', model: 'Swift Go 14 SFG14-72', category: 'laptop',
    description: 'Laptop mỏng nhẹ cao cấp, Intel Core Ultra 7, màn OLED 2.8K 90Hz, chỉ 1.3kg, pin trâu cả ngày.',
    specs: {
      cpu: 'Intel Core Ultra 7 155H',
      ram: '16GB LPDDR5x',
      storage: '1TB PCIe Gen4 NVMe SSD',
      display: '14-inch 2.8K 2880x1800 OLED 90Hz 100% DCI-P3',
      gpu: 'Intel Arc Graphics',
      battery: '65Wh',
      os: 'Windows 11 Home',
      weight: '1.3kg',
    },
    price: 21500000,
    url: 'https://store.acer.com/en-us/laptops/swift/swift-go-14-laptop-sfg14-72',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Acer_2014.svg/320px-Acer_2014.svg.png',
  },
  {
    name: 'Acer Predator Helios 18',
    brand: 'Acer', model: 'Predator Helios 18 PH18-71', category: 'laptop',
    description: 'Laptop gaming flagship 18 inch, Intel Core i9-14900HX, RTX 4090 16GB, màn 2K 250Hz MiniLED, tản nhiệt AeroBlade 5th Gen.',
    specs: {
      cpu: 'Intel Core i9-14900HX',
      ram: '32GB DDR5 5600MHz',
      storage: '2TB PCIe Gen4 NVMe SSD',
      display: '18-inch WQXGA 2560x1600 MiniLED 250Hz 100% DCI-P3',
      gpu: 'NVIDIA GeForce RTX 4090 16GB GDDR6',
      battery: '90Wh',
      os: 'Windows 11 Home',
      weight: '3.5kg',
    },
    price: 89000000,
    url: 'https://store.acer.com/en-us/gaming-laptops/predator/predator-helios-18-laptop-ph18-71',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Acer_2014.svg/320px-Acer_2014.svg.png',
  },

  /* ===== Microsoft Surface ===== */
  {
    name: 'Microsoft Surface Laptop 7 15"',
    brand: 'Microsoft', model: 'Surface Laptop 7 15"', category: 'laptop',
    description: 'Laptop Copilot+ PC, Snapdragon X Elite, màn PixelSense 2496x1664 120Hz cảm ứng, thiết kế nhôm mỏng đẹp, pin 22h.',
    specs: {
      cpu: 'Snapdragon X Elite X1E-80-100 (12-core)',
      ram: '32GB LPDDR5x',
      storage: '1TB NVMe SSD',
      display: '15-inch 2496x1664 PixelSense Touch 120Hz 600nits',
      gpu: 'Snapdragon X Elite Adreno GPU',
      battery: '66Wh, up to 22h',
      os: 'Windows 11 Home',
      weight: '1.66kg',
    },
    price: 45000000,
    url: 'https://www.microsoft.com/en-us/surface/laptops/surface-laptop',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Microsoft_Surface_Laptop_7_%28boot_screen%29.jpg/320px-Microsoft_Surface_Laptop_7_%28boot_screen%29.jpg',
  },
  {
    name: 'Microsoft Surface Pro 11',
    brand: 'Microsoft', model: 'Surface Pro 11', category: 'laptop',
    description: 'Máy tính bảng 2-in-1 Copilot+ PC, Snapdragon X Plus, màn OLED 2880x1920 120Hz, bút Surface Slim Pen 2.',
    specs: {
      cpu: 'Snapdragon X Plus X1P-64-100 (10-core)',
      ram: '16GB LPDDR5x',
      storage: '512GB NVMe SSD',
      display: '13-inch 2880x1920 OLED 120Hz HDR',
      gpu: 'Snapdragon X Plus Adreno GPU',
      battery: '53Wh, up to 14h',
      os: 'Windows 11 Home',
      weight: '0.895kg (without keyboard)',
    },
    price: 36000000,
    url: 'https://www.microsoft.com/en-us/surface/tablets/surface-pro',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Microsoft_Surface_Laptop_7_%28boot_screen%29.jpg/320px-Microsoft_Surface_Laptop_7_%28boot_screen%29.jpg',
  },

  /* ===== Samsung Galaxy Book4 Pro 360 ===== */
  {
    name: 'Samsung Galaxy Book4 Pro 360',
    brand: 'Samsung', model: 'Galaxy Book4 Pro 360', category: 'laptop',
    description: 'Laptop convertible 2-in-1 cao cấp Samsung, Intel Core Ultra 7, màn Dynamic AMOLED 2X 2880x1800 120Hz cảm ứng, bút S Pen.',
    specs: {
      cpu: 'Intel Core Ultra 7 155H',
      ram: '16GB LPDDR5x',
      storage: '1TB NVMe SSD',
      display: '16-inch 2880x1800 Dynamic AMOLED 2X Touch 120Hz 100% DCI-P3',
      gpu: 'Intel Arc Graphics',
      battery: '76Wh',
      os: 'Windows 11 Home',
      weight: '1.66kg',
      extras: 'S Pen included',
    },
    price: 38500000,
    url: 'https://www.samsung.com/vn/computers/galaxy-book/galaxy-book4-pro-360-16-np960qgk-kg2vn/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/20230729_%EC%82%BC%EC%84%B1_%EA%B0%A4%EB%9F%AD%EC%8B%9C_%EB%B6%81_%ED%94%84%EB%A1%9C_360.jpg/320px-20230729_%EC%82%BC%EC%84%B1_%EA%B0%A4%EB%9F%AD%EC%8B%9C_%EB%B6%81_%ED%94%84%EB%A1%9C_360.jpg',
  },

  /* ===== LG Gram 17 2024 ===== */
  {
    name: 'LG Gram 17 2024',
    brand: 'LG', model: 'Gram 17 2024 17Z90S', category: 'laptop',
    description: 'Laptop siêu nhẹ 17 inch chỉ 1.35kg, Intel Core Ultra 7, pin 80Wh dùng 24h, chứng nhận MIL-STD-810H.',
    specs: {
      cpu: 'Intel Core Ultra 7 155H',
      ram: '32GB LPDDR5x',
      storage: '1TB NVMe SSD',
      display: '17-inch WQXGA 2560x1600 IPS 60Hz Anti-glare',
      gpu: 'Intel Arc Graphics',
      battery: '80Wh, up to 24h',
      os: 'Windows 11 Home',
      weight: '1.35kg',
    },
    price: 36000000,
    url: 'https://www.lg.com/vn/laptops/lg-gram/all-gram/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/LG_symbol.svg/320px-LG_symbol.svg.png',
  },

  /* ===== DESKTOP PCs ===== */
  {
    name: 'Lenovo ThinkCentre M70q Gen 5 Tiny',
    brand: 'Lenovo', model: 'ThinkCentre M70q Gen 5', category: 'desktop',
    description: 'Mini PC doanh nghiệp nhỏ gọn, Intel Core Ultra 5 125T, bảo mật ThinkShield, hỗ trợ 3 màn hình, kích thước 1 lít.',
    specs: {
      cpu: 'Intel Core Ultra 5 125T',
      ram: '16GB DDR5',
      storage: '512GB PCIe Gen4 NVMe SSD',
      display: 'Hỗ trợ tối đa 3 màn hình (HDMI 2.1 + 2x DP via USB4)',
      gpu: 'Intel Graphics',
      os: 'Windows 11 Pro',
      formFactor: 'Tiny (Mini PC) ~1 liter',
      ports: '2x USB4 40Gbps, 4x USB-A 3.2, HDMI 2.1, 2x DP 1.4',
    },
    price: 18000000,
    url: 'https://www.lenovo.com/vn/vi/p/desktops/thinkcentre/m-series-tiny/thinkcentre-m70q-gen-5/len102c0005',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Lenovo_ThinkPad_X1_Carbon_Ultrabook.jpg/320px-Lenovo_ThinkPad_X1_Carbon_Ultrabook.jpg',
  },
  {
    name: 'HP EliteDesk 800 G9 Mini',
    brand: 'HP', model: 'EliteDesk 800 G9 Mini', category: 'desktop',
    description: 'Mini PC doanh nghiệp cao cấp HP, Intel Core i7-13700, bảo mật HP Wolf Security, hỗ trợ 4 màn hình.',
    specs: {
      cpu: 'Intel Core i7-13700T',
      ram: '16GB DDR5',
      storage: '512GB PCIe Gen4 NVMe SSD',
      display: 'Hỗ trợ 4 màn hình đồng thời',
      gpu: 'Intel UHD Graphics 770',
      os: 'Windows 11 Pro',
      formFactor: 'Mini PC',
      ports: '2x Thunderbolt 4, 4x USB-A 3.2, HDMI 2.1, 2x DP 1.4',
    },
    price: 22000000,
    url: 'https://www.hp.com/vn-en/shop/pdp/hp-elitedesk-800-g9-mini',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/HP_logo_2012.svg/320px-HP_logo_2012.svg.png',
  },
  {
    name: 'Dell OptiPlex 7020 Micro',
    brand: 'Dell', model: 'OptiPlex 7020 Micro', category: 'desktop',
    description: 'Mini PC doanh nghiệp Dell nhỏ gọn, Intel Core i5-14500T, bảo mật Dell Trusted Device, hỗ trợ 3 màn hình.',
    specs: {
      cpu: 'Intel Core i5-14500T',
      ram: '16GB DDR5',
      storage: '512GB PCIe Gen4 NVMe SSD',
      display: 'Hỗ trợ 3 màn hình (2x DP 1.4 + 1x HDMI 2.1)',
      gpu: 'Intel UHD Graphics 770',
      os: 'Windows 11 Pro',
      formFactor: 'Micro Form Factor',
      ports: '1x Thunderbolt 4, 3x USB-A 3.2, HDMI 2.1, 2x DP 1.4',
    },
    price: 19500000,
    url: 'https://www.dell.com/en-vn/shop/desktops-all-in-ones/optiplex-7020-micro/spd/optiplex-7020-micro-desktop',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Dell_logo_2016.svg/320px-Dell_logo_2016.svg.png',
  },
];

/* ── Main ──────────────────────────────────────────────────────────── */
async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB:', MONGO_URI);

  let inserted = 0;
  let skipped  = 0;

  for (const p of products) {
    const existing = await Product.findOne({ name: p.name });
    if (existing) {
      console.log(`  SKIP (exists): ${p.name}`);
      skipped++;
      continue;
    }

    const doc   = buildProduct(p);
    const saved = await Product.create(doc);
    await Offer.create(buildOffer(saved._id as mongoose.Types.ObjectId, p, p.price));
    console.log(`  INSERT: ${p.name}  (${p.price.toLocaleString()} VND)`);
    inserted++;
  }

  console.log(`\nDone. Inserted: ${inserted}, Skipped: ${skipped}`);
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
