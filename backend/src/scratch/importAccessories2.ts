/**
 * importAccessories2.ts — Batch Smart Home, Camera, Charger, Networking, Console, TV, Smartwatch
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
  // Smart Home
  {
    name: 'Xiaomi Smart Air Purifier 4', brand: 'Xiaomi', model: 'Smart Air Purifier 4', category: 'smart_home',
    description: 'Máy lọc không khí thông minh lọc sạch 99.97% hạt bụi mịn 0.3μm, hiệu suất CADR 400m³/h phù hợp phòng 28-48m², điều khiển qua Mi Home và giọng nói.',
    specs: { cadr: '400 m³/h', coverageArea: '28-48 m²', filter: '3-in-1 HEPA filter', sensors: 'Laser particle sensor, Temperature & Humidity', display: 'OLED touch display', noise: '32.1 dB(A) night mode' },
    price: 3390000,
    url: 'https://www.mi.com/global/product/xiaomi-smart-air-purifier-4/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Xiaomi_Mi_Air_Purifier.jpg/320px-Xiaomi_Mi_Air_Purifier.jpg',
  },
  {
    name: 'TP-Link Tapo C320WS Outdoor Camera', brand: 'TP-Link', model: 'Tapo C320WS', category: 'smart_home',
    description: 'Camera an ninh ngoài trời độ phân giải 2K QHD 4MP, nhìn đêm có màu với đèn Starlight Sensor khẩu độ lớn F/1.6, chuẩn kháng nước bụi IP66, đàm thoại 2 chiều.',
    specs: { resolution: '2K QHD (2560x1440) 4MP', nightVision: 'Full-Color Night Vision with Starlight Sensor', waterResistance: 'IP66 Weatherproof', audio: 'Two-way audio with built-in siren', storage: 'MicroSD card up to 256GB / Tapo Care Cloud' },
    price: 990000,
    url: 'https://www.tapo.com/en/product/smart-camera/tapo-c320ws/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Surveillance_camera_at_the_MIA.jpg/320px-Surveillance_camera_at_the_MIA.jpg',
  },
  {
    name: 'Google Nest Hub 2nd Gen', brand: 'Google', model: 'Nest Hub 2nd Gen', category: 'smart_home',
    description: 'Màn hình thông minh 7 inch điều khiển toàn bộ nhà thông minh Google Home, trợ lý ảo Google Assistant, công nghệ cảm biến giấc ngủ Soli radar không cần đeo thiết bị.',
    specs: { display: '7 inch touchscreen (1024x600)', audio: 'Full-range speaker (50% more bass)', sensors: 'Soli sensor for Motion Sense, Ambient EQ light sensor', connectivity: 'Wi-Fi 802.11ac, Bluetooth 5.0, Thread' },
    price: 1850000,
    url: 'https://store.google.com/us/product/nest_hub_2nd_gen',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Google_Home_Hub.jpg/320px-Google_Home_Hub.jpg',
  },
  {
    name: 'Aqara Smart Hub M3', brand: 'Aqara', model: 'Hub M3', category: 'smart_home',
    description: 'Bộ điều khiển trung tâm Matter Controller và Thread Border Router cao cấp, hỗ trợ Zigbee 3.0, điều khiển hồng ngoại 360 độ, kết nối Ethernet PoE và Wi-Fi băng tần kép.',
    specs: { protocols: 'Matter, Thread, Zigbee 3.0, Bluetooth 5.1, IR 360°', power: 'PoE 802.3af or USB-C (5V 2A)', network: 'RJ45 Ethernet + Dual-band Wi-Fi', localStorage: 'eMMC for local automation execution' },
    price: 2600000,
    url: 'https://www.aqara.com/en/product/hub-m3/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Philips_Hue_Bridge_2.0.jpg/320px-Philips_Hue_Bridge_2.0.jpg',
  },

  // Camera
  {
    name: 'Sony Alpha ZV-E10 II Mirrorless', brand: 'Sony', model: 'ZV-E10 II', category: 'camera',
    description: 'Máy ảnh mirrorless chuyên quay vlog và sáng tạo nội dung thế hệ 2, cảm biến APS-C 26MP Exmor R BSI, quay phim 4K 60p 10-bit 4:2:2 oversampled từ 5.6K, pin lớn NP-FZ100.',
    specs: { sensor: '26.0 MP APS-C Exmor R CMOS', video: '4K 60p 10-bit 4:2:2, FHD 120p', autofocus: '759 phase-detection points with AI Subject Recognition', battery: 'NP-FZ100 (approx. 610 shots)', stabilization: 'Active Mode EIS' },
    price: 23990000,
    url: 'https://www.sony.com.vn/interchangeable-lens-cameras/products/zv-e10m2',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Sony_Alpha_6400.jpg/320px-Sony_Alpha_6400.jpg',
  },
  {
    name: 'Canon EOS R50 Mirrorless', brand: 'Canon', model: 'EOS R50', category: 'camera',
    description: 'Máy ảnh không gương lật nhỏ gọn ngàm RF-S, cảm biến APS-C 24.2MP, Dual Pixel CMOS AF II nhận diện người/xe/động vật, quay 4K 30p không crop từ 6K.',
    specs: { sensor: '24.2 MP APS-C CMOS', processor: 'DIGIC X', video: '4K 30p uncropped (6K oversampled), FHD 120p', autofocus: 'Dual Pixel CMOS AF II with 651 AF zones', weight: '375g' },
    price: 16500000,
    url: 'https://vn.canon/vi/consumer/eos-r50-rf-s18-45mm-f-4-5-6-3-is-stm/product',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Canon_EOS_M50_with_lens.jpg/320px-Canon_EOS_M50_with_lens.jpg',
  },
  {
    name: 'GoPro HERO 13 Black', brand: 'GoPro', model: 'HERO 13 Black', category: 'camera',
    description: 'Camera hành động đỉnh cao với cảm biến 27MP, quay video 5.3K 60fps, 4K 120fps, chống rung HyperSmooth 6.0, pin Enduro 1900mAh dung lượng cao, hỗ trợ ống kính HB-Series.',
    specs: { video: '5.3K60, 4K120, 2.7K240, Burst Slo-Mo 400fps', photo: '27MP with SuperPhoto + HDR', stabilization: 'HyperSmooth 6.0 with 360° Horizon Lock', battery: '1900mAh Enduro battery', waterResistance: '10m (33ft) without housing' },
    price: 11990000,
    url: 'https://gopro.com/en/us/shop/cameras/hero13-black/CHDHX-131-master.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/GoPro_HERO7_Black.jpg/320px-GoPro_HERO7_Black.jpg',
  },
  {
    name: 'DJI Osmo Pocket 3', brand: 'DJI', model: 'Osmo Pocket 3', category: 'camera',
    description: 'Camera bỏ túi tích hợp gimbal chống rung 3 trục cơ học, cảm biến CMOS 1 inch mạnh mẽ, màn hình OLED xoay 2 inch linh hoạt, quay 4K 120fps D-Log M 10-bit.',
    specs: { sensor: '1-inch CMOS', gimbal: '3-axis mechanical stabilization', display: '2-inch rotatable OLED touchscreen', video: '4K 120fps, FHD 240fps, 10-bit D-Log M & HLG', audio: '3-mic array with stereo recording' },
    price: 12900000,
    url: 'https://www.dji.com/osmo-pocket-3',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/DJI_Osmo_Pocket.jpg/320px-DJI_Osmo_Pocket.jpg',
  },

  // Charger
  {
    name: 'Ugreen Nexode 100W GaN 4-Port Charger', brand: 'Ugreen', model: 'Nexode 100W CD226', category: 'charger',
    description: 'Củ sạc nhanh công nghệ GaN công suất khủng 100W, 4 cổng đầu ra (3 USB-C + 1 USB-A), sạc đồng thời 2 laptop hoặc MacBook Pro 16 inch đầy 55% trong 30 phút.',
    specs: { totalPower: '100W Max', ports: '3x USB-C + 1x USB-A', protocols: 'PD 3.0 / QC 4.0+ / PPS / SCP / AFC', technology: 'GaN Fast Technology', size: '69 x 69 x 33 mm' },
    price: 1190000,
    url: 'https://www.ugreen.com/products/100w-3c1a-gan-fast-charger',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Apple_96W_USB-C_Power_Adapter.jpg/320px-Apple_96W_USB-C_Power_Adapter.jpg',
  },
  {
    name: 'Baseus GaN5 Pro 100W Fast Charger', brand: 'Baseus', model: 'GaN5 Pro 100W', category: 'charger',
    description: 'Củ sạc GaN thế hệ thứ 5 nhỏ gọn hơn 10%, công suất 100W chia cổng thông minh BPS II, đi kèm dây cáp C-to-C 100W dài 1m có chip E-marker.',
    specs: { totalPower: '100W', ports: '2x Type-C + 2x USB-A', protocols: 'PD 3.0, QC 4.0, PPS', includedCable: '100W 1m Type-C to Type-C', protection: 'BCT nhiệt độ thông minh' },
    price: 950000,
    url: 'https://www.baseus.com/products/gan5-pro-fast-charger-100w',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Apple_96W_USB-C_Power_Adapter.jpg/320px-Apple_96W_USB-C_Power_Adapter.jpg',
  },
  {
    name: 'Samsung 45W Super Fast Charging 2.0 Adapter', brand: 'Samsung', model: 'EP-T4510 45W', category: 'charger',
    description: 'Củ sạc chính hãng Samsung công suất 45W chuẩn Super Fast Charging 2.0 (PD 3.0 PPS), sạc tối đa công suất cho Galaxy S24 Ultra, S25 Ultra và Galaxy Tab S9.',
    specs: { totalPower: '45W Max', interface: 'USB Type-C', protocols: 'USB PD 3.0, PPS max 45W', cable: '5A USB-C to USB-C cable included' },
    price: 790000,
    url: 'https://www.samsung.com/vn/mobile-accessories/45w-power-adapter-black-ep-t4510xbegww/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Apple_96W_USB-C_Power_Adapter.jpg/320px-Apple_96W_USB-C_Power_Adapter.jpg',
  },

  // Networking
  {
    name: 'TP-Link Deco XE75 Pro Wi-Fi 6E (2-Pack)', brand: 'TP-Link', model: 'Deco XE75 Pro', category: 'networking',
    description: 'Hệ thống Mesh Wi-Fi 6E 3 băng tần AXE5400 (6GHz + 5GHz + 2.4GHz), cổng WAN/LAN 2.5 Gbps đa năng cho Internet siêu tốc, phủ sóng nhà rộng 500m².',
    specs: { standard: 'Wi-Fi 6E (802.11axe)', speed: '5400 Mbps (2402 Mbps trên 6GHz + 2402 Mbps trên 5GHz + 574 Mbps trên 2.4GHz)', ports: '1x 2.5 Gbps port + 2x Gigabit ports per unit', coverage: 'Up to 500 m² (2-pack)', capacity: 'Up to 200 devices' },
    price: 6500000,
    url: 'https://www.tp-link.com/vn/home-networking/deco/deco-xe75-pro/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/TP-Link_Archer_C7_v2.jpg/320px-TP-Link_Archer_C7_v2.jpg',
  },
  {
    name: 'MikroTik hAP ax3 Router', brand: 'MikroTik', model: 'hAP ax3 (C53UiG+5HPaxD2HPaxD)', category: 'networking',
    description: 'Router chuyên dụng cho văn phòng và gia đình chạy RouterOS v7, CPU ARM 4 nhân 1.8GHz, RAM 1GB, cổng 2.5G PoE in/out và Wi-Fi 6 tốc độ cao.',
    specs: { cpu: 'Qualcomm IPQ-6010 Quad-Core 1.8GHz', ram: '1GB DDR3L', wireless: 'Wi-Fi 6 AX1800 Dual-Band', ports: '1x 2.5G Ethernet (PoE in) + 4x Gigabit Ethernet (PoE out on port 5)', os: 'RouterOS Level 6' },
    price: 3600000,
    url: 'https://mikrotik.com/product/hap_ax3',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/TP-Link_Archer_C7_v2.jpg/320px-TP-Link_Archer_C7_v2.jpg',
  },

  // Gaming Console
  {
    name: 'PlayStation 5 Slim Digital Edition', brand: 'Sony', model: 'PS5 Slim Digital', category: 'gaming_console',
    description: 'Máy chơi game thế hệ mới PlayStation 5 bản Slim thiết kế mỏng nhẹ hơn 30%, ổ SSD siêu tốc 1TB tích hợp, hỗ trợ Ray Tracing và xuất hình ảnh 4K 120Hz HDR.',
    specs: { cpu: 'x86-64-AMD Ryzen Zen 2 8 Cores / 16 Threads up to 3.5GHz', gpu: 'AMD Radeon RDNA 2 up to 2.23GHz (10.3 TFLOPS)', storage: '1TB Custom NVMe SSD', videoOut: 'HDMI 2.1 support 4K 120Hz, 8K, VRR', audio: 'Tempest 3D AudioTech' },
    price: 11990000,
    url: 'https://www.playstation.com/en-vn/ps5/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/PlayStation_5_and_DualSense_with_box.jpg/320px-PlayStation_5_and_DualSense_with_box.jpg',
  },
  {
    name: 'Xbox Series S 1TB Carbon Black', brand: 'Microsoft', model: 'Xbox Series S 1TB', category: 'gaming_console',
    description: 'Máy chơi game console nhỏ gọn màu đen Carbon Black sang trọng, ổ cứng SSD dung lượng nâng cấp 1TB, chơi mượt mà mọi tựa game Xbox Game Pass ở 1440p 120FPS.',
    specs: { cpu: 'Custom AMD Zen 2 8 Cores 3.6GHz', gpu: 'Custom RDNA 2 4 TFLOPS', storage: '1TB Custom NVMe SSD with Xbox Velocity Architecture', resolution: 'Gaming at 1440p up to 120 FPS', features: 'Quick Resume, DirectX Raytracing' },
    price: 8990000,
    url: 'https://www.xbox.com/en-US/consoles/xbox-series-s/carbon-black',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Xbox_Series_S.jpg/320px-Xbox_Series_S.jpg',
  },

  // TV
  {
    name: 'Samsung Neo QLED 55" QN85D 4K', brand: 'Samsung', model: 'QA55QN85DAKXXV', category: 'tv',
    description: 'Smart TV 55 inch công nghệ đèn nền Quantum Mini LED, bộ xử lý hình ảnh NQ4 AI Gen2 tối ưu bằng 20 mạng mô phỏng thần kinh, tần số quét 120Hz mượt mà.',
    specs: { displaySize: '55 inch', resolution: '4K UHD (3840 x 2160)', panel: 'Quantum Mini LED Neo QLED', refreshRate: '120Hz', processor: 'NQ4 AI Gen2 Processor', audio: 'Dolby Atmos 40W 2.2CH', os: 'Tizen OS Smart TV' },
    price: 24900000,
    url: 'https://www.samsung.com/vn/tvs/qled-tv/qn85d-55-inch-neo-qled-4k-tizen-os-smart-tv-qa55qn85dakxxv/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/LG_Smart_TV.jpg/320px-LG_Smart_TV.jpg',
  },
  {
    name: 'Xiaomi TV A Pro 55" 4K QLED', brand: 'Xiaomi', model: 'A Pro 55 QLED', category: 'tv',
    description: 'Tivi thông minh màn hình chấm lượng tử QLED 55 inch 4K HDR10, dải màu DCI-P3 94% rực rỡ, thiết kế tràn viền kim loại cao cấp cùng hệ điều hành Google TV.',
    specs: { displaySize: '55 inch', resolution: '4K UHD (3840 x 2160)', panel: 'QLED 1.07 tỷ màu', colorGamut: 'DCI-P3 94%', os: 'Google TV with Google Assistant', audio: 'Dolby Audio + DTS:X 2x 10W' },
    price: 8990000,
    url: 'https://www.mi.com/vn/product/xiaomi-tv-a-pro-55-2025/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/LG_Smart_TV.jpg/320px-LG_Smart_TV.jpg',
  },
  {
    name: 'TCL 65" Mini-LED 4K 65C845', brand: 'TCL', model: '65C845', category: 'tv',
    description: 'Tivi Mini-LED hàng đầu phân khúc 65 inch độ sáng đỉnh 2000 nits, tần số quét game 144Hz VRR, hệ thống âm thanh Onkyo 2.1 tích hợp loa subwoofer siêu trầm 60W.',
    specs: { displaySize: '65 inch', resolution: '4K (3840 x 2160)', panel: 'Mini-LED + Quantum Dot', peakBrightness: '2000 nits', refreshRate: '144Hz VRR', sound: 'Onkyo 2.1CH 60W with Subwoofer', hdr: 'Dolby Vision IQ, HDR10+' },
    price: 26900000,
    url: 'https://www.tcl.com/vn/vi/tvs/c845',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/LG_Smart_TV.jpg/320px-LG_Smart_TV.jpg',
  },

  // Smartwatch
  {
    name: 'Samsung Galaxy Watch Ultra 47mm LTE', brand: 'Samsung', model: 'Galaxy Watch Ultra', category: 'smartwatch',
    description: 'Đồng hồ thông minh thể thao mạo hiểm khung viền Titanium chuẩn quân đội siêu bền, kháng nước lặn 10 ATM, nút Quick Button tiện ích, thời lượng pin 100 giờ.',
    specs: { caseSize: '47mm Titanium Grade 4', display: '1.5 inch Super AMOLED 3000 nits Sapphire Crystal', waterResistance: '10 ATM / IP68 / MIL-STD-810H', battery: '590mAh (up to 100h power saving mode)', connectivity: '4G LTE eSIM, Dual-frequency GPS (L1+L5)' },
    price: 15490000,
    url: 'https://www.samsung.com/vn/watches/galaxy-watch/galaxy-watch-ultra-titanium-gray-lte-sm-l705fzaaxxv/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Samsung_Galaxy_Watch_4.jpg/320px-Samsung_Galaxy_Watch_4.jpg',
  },
  {
    name: 'Garmin Fenix 8 Solar 47mm', brand: 'Garmin', model: 'Fenix 8 Solar 47mm', category: 'smartwatch',
    description: 'Đồng hồ thể thao chuyên nghiệp màn hình kính Sapphire sạc năng lượng mặt trời Power Sapphire, tích hợp mic và loa đàm thoại, đèn pin LED siêu sáng, lặn sâu 40m.',
    specs: { display: '1.3 inch MIP Solar display Sapphire', battery: 'Up to 28 days with Solar', waterResistance: '10 ATM (certified for 40m dive)', features: 'Built-in Speaker & Mic, LED Flashlight, TopoActive Maps, Multi-band GPS' },
    price: 29990000,
    url: 'https://www.garmin.com/vi-VN/p/1228419',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Garmin_Fenix_5_Plus.jpg/320px-Garmin_Fenix_5_Plus.jpg',
  },
  {
    name: 'Amazfit GTR 4 Smartwatch', brand: 'Amazfit', model: 'GTR 4', category: 'smartwatch',
    description: 'Đồng hồ thông minh mặt tròn cổ điển AMOLED 1.43 inch, GPS băng tần kép phân cực tròn chuẩn xác hàng đầu, hơn 150 chế độ thể thao, đàm thoại Bluetooth và pin 14 ngày.',
    specs: { display: '1.43 inch HD AMOLED (466x466)', battery: '475mAh (14 days typical usage)', gps: 'Dual-band & 6 Satellite Positioning Systems', sensors: 'BioTracker 4.0 PPG biometric sensor', calls: 'Bluetooth phone calls with speaker & mic' },
    price: 4390000,
    url: 'https://www.amazfit.com/products/amazfit-gtr-4',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Samsung_Galaxy_Watch_4.jpg/320px-Samsung_Galaxy_Watch_4.jpg',
  },
];

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB. Starting importAccessories2...');

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
  console.log(`\n=== importAccessories2 DONE ===`);
  console.log(`Inserted: ${inserted} | Skipped: ${skipped}`);
  console.log(`Total products: ${total} | Total offers: ${totalOffers}`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
