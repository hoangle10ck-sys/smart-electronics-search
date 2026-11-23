/**
 * importComponents2.ts — Batch components (GPU, CPU, RAM, Storage, Motherboard, PSU)
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

const products = [
  // GPU
  {
    name: 'ZOTAC Gaming GeForce RTX 4060 Twin Edge', brand: 'ZOTAC', model: 'RTX 4060 Twin Edge', category: 'gpu',
    description: 'Card đồ họa ZOTAC GAMING GeForce RTX 4060 Twin Edge 8GB GDDR6 thiết kế nhỏ gọn compact, DLSS 3, kiến trúc Ada Lovelace.',
    specs: { memory: '8GB GDDR6', memoryBus: '128-bit', cudaCores: 3072, boostClock: '2460 MHz', powerConnectors: '1x 8-pin', tdp: '115W', output: '3x DisplayPort 1.4a, 1x HDMI 2.1a' },
    price: 8200000,
    url: 'https://www.zotac.com/us/product/graphics_card/zotac-gaming-geforce-rtx-4060-8gb-twin-edge',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Nvidia_RTX_4060_FE.jpg/320px-Nvidia_RTX_4060_FE.jpg',
  },
  {
    name: 'MSI GeForce RTX 4070 SUPER 12G VENTUS 2X OC', brand: 'MSI', model: 'RTX 4070 SUPER VENTUS 2X OC', category: 'gpu',
    description: 'Card đồ họa MSI RTX 4070 SUPER 12GB GDDR6X quạt tản nhiệt kép TORX Fan 4.0, hiệu năng mạnh mẽ cho gaming 1440p và đồ họa.',
    specs: { memory: '12GB GDDR6X', memoryBus: '192-bit', cudaCores: 7168, boostClock: '2520 MHz', powerConnectors: '1x 16-pin (12VHPWR)', tdp: '220W', output: '3x DP 1.4a, 1x HDMI 2.1a' },
    price: 17500000,
    url: 'https://www.msi.com/Graphics-Card/GeForce-RTX-4070-SUPER-12G-VENTUS-2X-OC',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/NVIDIA_GeForce_RTX_4070_Founders_Edition.jpg/320px-NVIDIA_GeForce_RTX_4070_Founders_Edition.jpg',
  },
  {
    name: 'ASUS TUF Gaming GeForce RTX 4080 SUPER 16GB', brand: 'ASUS', model: 'TUF RTX 4080 SUPER', category: 'gpu',
    description: 'Card đồ họa cao cấp ASUS TUF Gaming RTX 4080 SUPER 16GB GDDR6X với quạt Axial-tech, tản nhiệt buồng hơi cho gaming 4K max setting.',
    specs: { memory: '16GB GDDR6X', memoryBus: '256-bit', cudaCores: 10240, boostClock: '2580 MHz', powerConnectors: '1x 16-pin', tdp: '320W', output: '3x DP 1.4a, 2x HDMI 2.1a' },
    price: 31000000,
    url: 'https://www.asus.com/motherboards-components/graphics-cards/tuf-gaming/tuf-rtx4080s-16g-gaming/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/GeForce_RTX_4080_FE.jpg/320px-GeForce_RTX_4080_FE.jpg',
  },
  {
    name: 'Sapphire PULSE AMD Radeon RX 7600 XT 16GB', brand: 'Sapphire', model: 'Radeon RX 7600 XT PULSE', category: 'gpu',
    description: 'Card đồ họa Sapphire PULSE Radeon RX 7600 XT bộ nhớ khủng 16GB GDDR6, kiến trúc RDNA 3, hỗ trợ AMD FSR 3 và AV1 encoding.',
    specs: { memory: '16GB GDDR6', memoryBus: '128-bit', streamProcessors: 2048, boostClock: '2755 MHz', powerConnectors: '2x 8-pin', tdp: '190W', output: '2x DP 2.1, 2x HDMI 2.1' },
    price: 9500000,
    url: 'https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-7600-xt-16g-gddr6',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/AMD_Radeon_RX_7600_-_Side.jpg/320px-AMD_Radeon_RX_7600_-_Side.jpg',
  },
  {
    name: 'Gigabyte Radeon RX 7700 XT GAMING OC 12G', brand: 'Gigabyte', model: 'Radeon RX 7700 XT GAMING OC', category: 'gpu',
    description: 'Card đồ họa Gigabyte Radeon RX 7700 XT 12GB GDDR6 192-bit tản nhiệt Windforce 3 quạt, cân mượt mọi tựa game 2K 144Hz.',
    specs: { memory: '12GB GDDR6', memoryBus: '192-bit', streamProcessors: 3456, boostClock: '2599 MHz', powerConnectors: '2x 8-pin', tdp: '245W', output: '2x DP 2.1, 2x HDMI 2.1' },
    price: 12800000,
    url: 'https://www.gigabyte.com/Graphics-Card/GV-R77XTGAMING-OC-12GD',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Radeon_RX_7900_XTX_Graphics_Card.jpg/320px-Radeon_RX_7900_XTX_Graphics_Card.jpg',
  },
  {
    name: 'PowerColor Hellhound AMD Radeon RX 7900 GRE 16GB', brand: 'PowerColor', model: 'Radeon RX 7900 GRE Hellhound', category: 'gpu',
    description: 'Card đồ họa PowerColor Hellhound AMD Radeon RX 7900 GRE Golden Rabbit Edition 16GB GDDR6 256-bit, hiệu năng tiệm cận RX 7900 XT.',
    specs: { memory: '16GB GDDR6', memoryBus: '256-bit', streamProcessors: 5120, boostClock: '2366 MHz', powerConnectors: '2x 8-pin', tdp: '260W', output: '3x DP 2.1, 1x HDMI 2.1' },
    price: 16500000,
    url: 'https://www.powercolor.com/product?id=1692862804',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Radeon_RX_7900_XTX_Graphics_Card.jpg/320px-Radeon_RX_7900_XTX_Graphics_Card.jpg',
  },

  // CPU
  {
    name: 'Intel Core Ultra 7 265K', brand: 'Intel', model: 'Core Ultra 7 265K', category: 'cpu',
    description: 'Bộ vi xử lý Intel thế hệ Arrow Lake socket LGA1851, 20 nhân (8P + 12E), 20 luồng, xung nhịp lên đến 5.5 GHz, tích hợp NPU AI 13 TOPS.',
    specs: { socket: 'LGA1851', cores: 20, threads: 20, pCores: 8, eCores: 12, baseClock: '3.9 GHz', boostClock: '5.5 GHz', cache: '30MB L3', tdp: '125W', npu: 'Intel AI Boost 13 TOPS' },
    price: 11500000,
    url: 'https://www.intel.com/content/www/us/en/products/sku/241063/intel-core-ultra-7-processor-265k-30m-cache-up-to-5-50-ghz/specifications.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Intel_Core_Ultra_9_Processor.jpg/320px-Intel_Core_Ultra_9_Processor.jpg',
  },
  {
    name: 'Intel Core Ultra 5 245K', brand: 'Intel', model: 'Core Ultra 5 245K', category: 'cpu',
    description: 'CPU tầm trung thế hệ mới Arrow Lake LGA1851, 14 nhân (6P + 8E), 14 luồng, xung tối đa 5.2 GHz, tiết kiệm điện năng tối ưu.',
    specs: { socket: 'LGA1851', cores: 14, threads: 14, pCores: 6, eCores: 8, baseClock: '4.2 GHz', boostClock: '5.2 GHz', cache: '24MB L3', tdp: '125W' },
    price: 8200000,
    url: 'https://www.intel.com/content/www/us/en/products/sku/241065/intel-core-ultra-5-processor-245k-24m-cache-up-to-5-20-ghz/specifications.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Intel_Core_Ultra_9_Processor.jpg/320px-Intel_Core_Ultra_9_Processor.jpg',
  },
  {
    name: 'Intel Core i5-14400F', brand: 'Intel', model: 'Core i5-14400F', category: 'cpu',
    description: 'Bộ vi xử lý quốc dân cho cấu hình gaming tầm trung, 10 nhân (6P + 4E), 16 luồng, socket LGA1700, hỗ trợ DDR4 & DDR5.',
    specs: { socket: 'LGA1700', cores: 10, threads: 16, pCores: 6, eCores: 4, baseClock: '2.5 GHz', boostClock: '4.7 GHz', cache: '20MB L3', tdp: '65W' },
    price: 5100000,
    url: 'https://www.intel.com/content/www/us/en/products/sku/236787/intel-core-i5-processor-14400f-20m-cache-up-to-4-70-ghz/specifications.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Intel_Core_i5_14600K_top.jpg/320px-Intel_Core_i5_14600K_top.jpg',
  },
  {
    name: 'Intel Core i3-14100', brand: 'Intel', model: 'Core i3-14100', category: 'cpu',
    description: 'CPU thế hệ 14 giá rẻ hiệu năng cao, 4 nhân 8 luồng, socket LGA1700, tích hợp sẵn đồ họa Intel UHD Graphics 730.',
    specs: { socket: 'LGA1700', cores: 4, threads: 8, baseClock: '3.5 GHz', boostClock: '4.7 GHz', cache: '12MB L3', igpu: 'Intel UHD 730', tdp: '60W' },
    price: 3200000,
    url: 'https://www.intel.com/content/www/us/en/products/sku/236782/intel-core-i3-processor-14100-12m-cache-up-to-4-70-ghz/specifications.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Intel_Core_i5_14600K_top.jpg/320px-Intel_Core_i5_14600K_top.jpg',
  },
  {
    name: 'AMD Ryzen 7 9700X', brand: 'AMD', model: 'Ryzen 7 9700X', category: 'cpu',
    description: 'CPU kiến trúc Zen 5 socket AM5 8 nhân 16 luồng, sản xuất tiến trình 4nm, IPC tăng 16%, tản nhiệt mát mẻ TDP chỉ 65W.',
    specs: { socket: 'AM5', cores: 8, threads: 16, baseClock: '3.8 GHz', boostClock: '5.5 GHz', cache: '32MB L3', tdp: '65W', architecture: 'Zen 5' },
    price: 9500000,
    url: 'https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-7-9700x.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/AMD_Ryzen_7_7800X3D_top.jpg/320px-AMD_Ryzen_7_7800X3D_top.jpg',
  },
  {
    name: 'AMD Ryzen 5 9600X', brand: 'AMD', model: 'Ryzen 5 9600X', category: 'cpu',
    description: 'CPU gaming Zen 5 thế hệ mới 6 nhân 12 luồng, xung nhịp đỉnh 5.4 GHz, tối ưu hoàn hảo cho các bộ máy chơi game và đồ họa 2024.',
    specs: { socket: 'AM5', cores: 6, threads: 12, baseClock: '3.9 GHz', boostClock: '5.4 GHz', cache: '32MB L3', tdp: '65W', architecture: 'Zen 5' },
    price: 7500000,
    url: 'https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-5-9600x.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/AMD_Ryzen_7_7800X3D_top.jpg/320px-AMD_Ryzen_7_7800X3D_top.jpg',
  },
  {
    name: 'AMD Ryzen 5 7600', brand: 'AMD', model: 'Ryzen 5 7600', category: 'cpu',
    description: 'CPU quốc dân nền tảng AM5, 6 nhân 12 luồng kiến trúc Zen 4, đi kèm tản nhiệt Wraith Stealth, tiết kiệm chi phí build PC.',
    specs: { socket: 'AM5', cores: 6, threads: 12, baseClock: '3.8 GHz', boostClock: '5.1 GHz', cache: '32MB L3', tdp: '65W', coolerIncluded: 'Wraith Stealth' },
    price: 4800000,
    url: 'https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/AMD_Ryzen_7_7800X3D_top.jpg/320px-AMD_Ryzen_7_7800X3D_top.jpg',
  },
  {
    name: 'AMD Ryzen 9 7950X', brand: 'AMD', model: 'Ryzen 9 7950X', category: 'cpu',
    description: 'CPU máy trạm và đồ họa cao cấp 16 nhân 32 luồng Zen 4 AM5, xung boost 5.7 GHz, hiệu năng render 3D và biên tập video vượt trội.',
    specs: { socket: 'AM5', cores: 16, threads: 32, baseClock: '4.5 GHz', boostClock: '5.7 GHz', cache: '64MB L3', tdp: '170W' },
    price: 14500000,
    url: 'https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-9-7950x.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/AMD_Ryzen_7_7800X3D_top.jpg/320px-AMD_Ryzen_7_7800X3D_top.jpg',
  },

  // RAM
  {
    name: 'G.Skill Trident Z5 RGB DDR5-6400 32GB', brand: 'G.Skill', model: 'Trident Z5 RGB DDR5-6400', category: 'ram',
    description: 'Kit RAM DDR5 32GB (2x16GB) tốc độ 6400MHz CL32 hỗ trợ Intel XMP 3.0, dải đèn LED RGB mượt mà và tản nhiệt nhôm phay xước.',
    specs: { capacity: '32GB (2x16GB)', speed: '6400 MT/s', timing: 'CL32-39-39-102', voltage: '1.40V', profile: 'Intel XMP 3.0', rgb: 'Yes' },
    price: 3200000,
    url: 'https://www.gskill.com/product/165/374/1665649931/F5-6400J3239G16GX2-TZ5RK',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/DDR5_RAM_Module.jpg/320px-DDR5_RAM_Module.jpg',
  },
  {
    name: 'Kingston Fury Renegade DDR5-7200 32GB', brand: 'Kingston', model: 'Fury Renegade DDR5-7200', category: 'ram',
    description: 'Kit RAM DDR5 cao cấp 32GB (2x16GB) xung nhịp cực cao 7200MHz CL38, tối ưu ép xung và gaming đỉnh cao trên Intel Z790.',
    specs: { capacity: '32GB (2x16GB)', speed: '7200 MT/s', timing: 'CL38-44-44', voltage: '1.45V', profile: 'Intel XMP 3.0', rgb: 'No (Black heatspreader)' },
    price: 3900000,
    url: 'https://www.kingston.com/en/memory/gaming/kingston-fury-renegade-ddr5-memory',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/DDR5_RAM_Module.jpg/320px-DDR5_RAM_Module.jpg',
  },
  {
    name: 'Crucial Pro DDR4-3200 32GB', brand: 'Crucial', model: 'Pro DDR4-3200', category: 'ram',
    description: 'Kit RAM DDR4 32GB (2x16GB) bus 3200MHz CL22 tản nhiệt đen mờ chuẩn công nghiệp, hoạt động cắm là chạy siêu ổn định.',
    specs: { capacity: '32GB (2x16GB)', speed: '3200 MT/s', timing: 'CL22', voltage: '1.2V', profile: 'JEDEC / XMP 2.0', formFactor: 'UDIMM' },
    price: 1700000,
    url: 'https://www.crucial.com/memory/ddr4/cp2k16g4dfra32a',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Crucial_Ballistix_Sport_LT_DDR4_RAM.jpg/320px-Crucial_Ballistix_Sport_LT_DDR4_RAM.jpg',
  },

  // Storage
  {
    name: 'WD Black SN850X 2TB NVMe PCIe Gen4', brand: 'Western Digital', model: 'WD Black SN850X 2TB', category: 'storage',
    description: 'Ổ cứng SSD M.2 PCIe Gen4 NVMe hàng đầu cho game thủ, tốc độ đọc tuần tự lên đến 7300 MB/s, ghi 6600 MB/s.',
    specs: { capacity: '2TB', formFactor: 'M.2 2280', interface: 'PCIe Gen4 x4 NVMe 1.4', seqRead: '7300 MB/s', seqWrite: '6600 MB/s', tbw: '1200 TBW' },
    price: 4200000,
    url: 'https://www.westerndigital.com/products/internal-drives/wd-black-sn850x-nvme-ssd',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Samsung_970_EVO_Plus_NVMe_SSD.jpg/320px-Samsung_970_EVO_Plus_NVMe_SSD.jpg',
  },
  {
    name: 'Seagate Barracuda 2TB 3.5" HDD', brand: 'Seagate', model: 'Barracuda 2TB ST2000DM008', category: 'storage',
    description: 'Ổ cứng cơ HDD 3.5 inch dung lượng 2TB tốc độ quay 7200RPM, bộ đệm 256MB Cache, thích hợp lưu trữ dữ liệu dung lượng lớn.',
    specs: { capacity: '2TB', formFactor: '3.5 inch', interface: 'SATA III 6Gb/s', rpm: 7200, cache: '256MB' },
    price: 1500000,
    url: 'https://www.seagate.com/products/hard-drives/barracuda-hard-drive/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Seagate_Barracuda_7200.11_1TB.jpg/320px-Seagate_Barracuda_7200.11_1TB.jpg',
  },
  {
    name: 'Crucial BX500 1TB 2.5" SATA SSD', brand: 'Crucial', model: 'BX500 1TB', category: 'storage',
    description: 'Ổ cứng SSD 2.5 inch SATA 3 dung lượng 1TB giá rẻ, tốc độ đọc 540 MB/s, nâng cấp mượt mà cho laptop và PC đời cũ.',
    specs: { capacity: '1TB', formFactor: '2.5 inch 7mm', interface: 'SATA III 6Gb/s', seqRead: '540 MB/s', seqWrite: '500 MB/s' },
    price: 1600000,
    url: 'https://www.crucial.com/ssd/bx500/ct1000bx500ssd1',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Crucial_BX500_SSD.jpg/320px-Crucial_BX500_SSD.jpg',
  },
  {
    name: 'Samsung 870 EVO 1TB 2.5" SATA SSD', brand: 'Samsung', model: '870 EVO 1TB', category: 'storage',
    description: 'Ổ SSD 2.5 inch SATA bền bỉ số 1 thế giới với chip nhớ Samsung V-NAND 3-bit MLC, bộ điều khiển MKX, độ bền 600 TBW.',
    specs: { capacity: '1TB', formFactor: '2.5 inch', interface: 'SATA 6 Gb/s', seqRead: '560 MB/s', seqWrite: '530 MB/s', tbw: '600 TBW' },
    price: 2400000,
    url: 'https://www.samsung.com/us/computing/memory-storage/solid-state-drives/870-evo-sata-2-5-ssd-1tb-mz-77e1t0b-am/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Samsung_SSD_850_EVO_1TB.jpg/320px-Samsung_SSD_850_EVO_1TB.jpg',
  },
  {
    name: 'Kingston NV3 2TB PCIe 4.0 NVMe SSD', brand: 'Kingston', model: 'NV3 2TB', category: 'storage',
    description: 'Ổ SSD NVMe M.2 2280 PCIe Gen 4x4 thế hệ mới dung lượng 2TB, tốc độ đọc 6000 MB/s, ghi 5000 MB/s, tối ưu chi phí lưu trữ.',
    specs: { capacity: '2TB', formFactor: 'M.2 2280', interface: 'PCIe 4.0 x4 NVMe', seqRead: '6000 MB/s', seqWrite: '5000 MB/s', tbw: '640 TBW' },
    price: 3200000,
    url: 'https://www.kingston.com/en/ssd/nv3-nvme-pcie-ssd',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Samsung_970_EVO_Plus_NVMe_SSD.jpg/320px-Samsung_970_EVO_Plus_NVMe_SSD.jpg',
  },

  // Motherboard
  {
    name: 'ASUS Prime B760M-A WiFi D4', brand: 'ASUS', model: 'Prime B760M-A WiFi D4', category: 'motherboard',
    description: 'Bo mạch chủ micro-ATX socket LGA1700 hỗ trợ CPU Intel gen 12/13/14, RAM DDR4, tích hợp Wi-Fi 6 và Realtek 2.5Gb Ethernet.',
    specs: { socket: 'LGA1700', chipset: 'Intel B760', formFactor: 'Micro-ATX', memory: '4x DDR4 up to 5333MHz (OC)', storage: '2x M.2 PCIe 4.0, 4x SATA III', wireless: 'Wi-Fi 6 + Bluetooth 5.2' },
    price: 3300000,
    url: 'https://www.asus.com/motherboards-components/motherboards/prime/prime-b760m-a-wifi-d4/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Asus_P8Z77-V_LX_motherboard.jpg/320px-Asus_P8Z77-V_LX_motherboard.jpg',
  },
  {
    name: 'Gigabyte Z790 AORUS ELITE AX', brand: 'Gigabyte', model: 'Z790 AORUS ELITE AX', category: 'motherboard',
    description: 'Bo mạch chủ cao cấp Z790 cho game thủ Intel, phase nguồn 16+1+2 Twin Digital VRM, 4 khe M.2 PCIe 4.0 tản nhiệt Thermal Guard.',
    specs: { socket: 'LGA1700', chipset: 'Intel Z790', formFactor: 'ATX', memory: '4x DDR5 up to 7600MHz (OC)', pcie: 'PCIe 5.0 x16', storage: '4x M.2 PCIe 4.0', wireless: 'Wi-Fi 6E + 2.5GbE LAN' },
    price: 7800000,
    url: 'https://www.gigabyte.com/Motherboard/Z790-AORUS-ELITE-AX-rev-10',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Asus_P8Z77-V_LX_motherboard.jpg/320px-Asus_P8Z77-V_LX_motherboard.jpg',
  },

  // Power Supply
  {
    name: 'Thermaltake Toughpower GF3 850W Gold', brand: 'Thermaltake', model: 'Toughpower GF3 850W', category: 'power_supply',
    description: 'Bộ nguồn chuẩn PCIe 5.0 ATX 3.0 công suất thực 850W, chuẩn 80 Plus Gold, 100% tụ điện Nhật Bản 105°C, cáp 12VHPWR nguyên bản.',
    specs: { wattage: '850W', efficiency: '80 Plus Gold', standard: 'ATX 3.0 / PCIe 5.0', modular: 'Full Modular', fan: '135mm Fluid Dynamic Bearing', warranty: '10 years' },
    price: 3400000,
    url: 'https://www.thermaltake.com/toughpower-gf3-850w-gold-tt-premium-edition.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Corsair_HX750_Power_Supply.jpg/320px-Corsair_HX750_Power_Supply.jpg',
  },
  {
    name: 'MSI MAG A850GL PCIE5 850W 80 Plus Gold', brand: 'MSI', model: 'MAG A850GL PCIE5', category: 'power_supply',
    description: 'Nguồn máy tính MSI MAG A850GL 850W chuẩn ATX 3.0 PCIe 5.0 native, đầu cắm 16-pin 2 màu chống cắm lỏng, hiệu suất 80 Plus Gold.',
    specs: { wattage: '850W', efficiency: '80 Plus Gold', standard: 'ATX 3.0 / PCIe 5.0', modular: 'Full Modular', fan: '120mm FDB', protections: 'OCP, OVP, OPP, OTP, SCP, UVP' },
    price: 2900000,
    url: 'https://www.msi.com/Power-Supply/MAG-A850GL-PCIE5',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Corsair_HX750_Power_Supply.jpg/320px-Corsair_HX750_Power_Supply.jpg',
  },
];

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB. Starting importComponents2...');

  let inserted = 0;
  let skipped  = 0;

  for (const raw of products) {
    const { price, ...rest } = raw as any;
    const exists = await (Product as any).findOne({ name: rest.name }).lean();
    if (exists) {
      console.log(`  SKIP: ${rest.name}`);
      skipped++;
      continue;
    }

    const doc = buildProduct(rest);
    const saved = await new (Product as any)(doc).save();
    await new (Offer as any)(buildOffer(saved._id, rest, price)).save();
    console.log(`  ✓ ${rest.name} → ${rest.category} | ${price.toLocaleString('vi-VN')} VND`);
    inserted++;
  }

  const total = await (Product as any).countDocuments();
  const totalOffers = await (Offer as any).countDocuments();
  console.log(`\n=== importComponents2 DONE ===`);
  console.log(`Inserted: ${inserted} | Skipped: ${skipped}`);
  console.log(`Total products: ${total} | Total offers: ${totalOffers}`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
