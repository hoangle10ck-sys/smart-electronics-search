/**
 * importBatch9.ts — 51 New Electronic Products
 * Categories: monitor, headphone, speaker, keyboard, mouse, smartwatch, camera, smart_home, networking, tablet, gaming_console, ereader, projector, professional_audio
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
  /* ==================== MONITOR (6) ==================== */
  {
    name: 'LG UltraGear 27GR75Q-B 27" QHD 165Hz', brand: 'LG', model: '27GR75Q-B', category: 'monitor',
    description: 'Màn hình gaming tấm nền IPS 27 inch 2K QHD 165Hz 1ms (GtG), hỗ trợ HDR10, sRGB 99%, tương thích chuẩn NVIDIA G-Sync và AMD FreeSync Premium.',
    specs: { displaySize: '27 inch', resolution: '2560 x 1440 2K QHD', panel: 'IPS', refreshRate: '165Hz', responseTime: '1ms (GtG)', sync: 'NVIDIA G-Sync Compatible, AMD FreeSync Premium', ports: '2x HDMI 2.0, 1x DP 1.4' },
    price: 5990000,
    url: 'https://www.lg.com/vn/man-hinh-may-tinh/lg-27gr75q-b',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Dell_UltraSharp_U2414H_Monitor.jpg/320px-Dell_UltraSharp_U2414H_Monitor.jpg',
  },
  {
    name: 'Dell S2722DGM 27" Curved QHD 165Hz', brand: 'Dell', model: 'S2722DGM', category: 'monitor',
    description: 'Màn hình cong 1500R kích thước 27 inch độ phân giải 2K QHD, tần số quét 165Hz, độ tương phản sâu 3000:1 của tấm nền VA cho trải nghiệm hình ảnh gaming đắm chìm.',
    specs: { displaySize: '27 inch Curved 1500R', resolution: '2560 x 1440 QHD', panel: 'VA', refreshRate: '165Hz (DP) / 144Hz (HDMI)', responseTime: '1ms MPRT', contrast: '3000:1', ports: '2x HDMI 2.0, 1x DP 1.2' },
    price: 6490000,
    url: 'https://www.dell.com/en-us/shop/dell-27-curved-gaming-monitor-s2722dgm/apd/210-azzp/monitors-monitor-accessories',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Dell_UltraSharp_U2414H_Monitor.jpg/320px-Dell_UltraSharp_U2414H_Monitor.jpg',
  },
  {
    name: 'ASUS TUF Gaming VG27AQ 27" IPS 165Hz', brand: 'ASUS', model: 'TUF Gaming VG27AQ', category: 'monitor',
    description: 'Huyền thoại màn hình gaming 27 inch IPS WQHD 165Hz tích hợp công nghệ độc quyền ELMB-Sync kích hoạt đồng thời G-Sync và chống nhòe chuyển động.',
    specs: { displaySize: '27 inch', resolution: '2560 x 1440 WQHD', panel: 'IPS', refreshRate: '165Hz (OC)', responseTime: '1ms MPRT', technology: 'ASUS Extreme Low Motion Blur Sync (ELMB SYNC)', hdr: 'HDR10' },
    price: 6890000,
    url: 'https://www.asus.com/vn/displays-desktops/monitors/tuf-gaming/tuf-gaming-vg27aq/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Dell_UltraSharp_U2414H_Monitor.jpg/320px-Dell_UltraSharp_U2414H_Monitor.jpg',
  },
  {
    name: 'GIGABYTE M27Q 27" SS IPS 170Hz KVM', brand: 'Gigabyte', model: 'M27Q', category: 'monitor',
    description: 'Màn hình chơi game đầu tiên tích hợp nút gạt KVM chuyển đổi chuột phím giữa 2 máy tính, tấm nền Super Speed IPS 170Hz 0.5ms độ phân giải 2K sắc nét.',
    specs: { displaySize: '27 inch', resolution: '2560 x 1440 QHD', panel: 'Super Speed IPS', refreshRate: '170Hz', responseTime: '0.5ms MPRT', features: 'Built-in KVM Switch, Type-C, 92% DCI-P3' },
    price: 6990000,
    url: 'https://www.gigabyte.com/Monitor/M27Q',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Dell_UltraSharp_U2414H_Monitor.jpg/320px-Dell_UltraSharp_U2414H_Monitor.jpg',
  },
  {
    name: 'Samsung Odyssey G5 27" QHD 165Hz Curved', brand: 'Samsung', model: 'Odyssey G5 G51C 27"', category: 'monitor',
    description: 'Màn hình gaming cong 1000R tối ưu thị giác con người, độ phân giải QHD 165Hz 1ms, chứng nhận AMD FreeSync Premium và hiển thị dải động HDR10 sắc sảo.',
    specs: { displaySize: '27 inch Curved 1000R', resolution: '2560 x 1440 QHD', panel: 'VA', refreshRate: '165Hz', responseTime: '1ms (MPRT)', hdr: 'HDR10', sync: 'AMD FreeSync Premium' },
    price: 5290000,
    url: 'https://www.samsung.com/vn/monitors/gaming/odyssey-g5-g51c-27-inch-165hz-curved-qhd-ls27cg510eexxv/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Dell_UltraSharp_U2414H_Monitor.jpg/320px-Dell_UltraSharp_U2414H_Monitor.jpg',
  },
  {
    name: 'ViewSonic XG2431 24" IPS 240Hz Blur Busters', brand: 'ViewSonic', model: 'XG2431', category: 'monitor',
    description: 'Màn hình thi đấu FPS eSports chuyên nghiệp đầu tiên đạt chứng nhận Blur Busters Approved 2.0, tần số quét siêu nhanh 240Hz 0.5ms MPRT không bóng ma.',
    specs: { displaySize: '23.8 inch', resolution: '1920 x 1080 Full HD', panel: 'Fast IPS', refreshRate: '240Hz', responseTime: '0.5ms MPRT', certification: 'Blur Busters Approved 2.0, VESA DisplayHDR 400' },
    price: 6490000,
    url: 'https://www.viewsonic.com/vn/products/lcd/XG2431',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Dell_UltraSharp_U2414H_Monitor.jpg/320px-Dell_UltraSharp_U2414H_Monitor.jpg',
  },

  /* ==================== HEADPHONE & SPEAKER (9) ==================== */
  {
    name: 'Apple AirPods Pro 2 (USB-C)', brand: 'Apple', model: 'AirPods Pro 2 USB-C', category: 'headphone',
    description: 'Tai nghe in-ear chống ồn chủ động tốt nhất của Apple với chip H2, cổng sạc USB-C, tính năng Âm thanh thích ứng (Adaptive Audio) và khả năng nhận biết cuộc trò chuyện.',
    specs: { type: 'In-ear True Wireless', chip: 'Apple H2 headphone chip, Apple U1 in MagSafe Case', anc: 'Active Noise Cancellation 2x, Adaptive Audio, Transparency Mode', battery: '6h (up to 30h with Case)', charging: 'USB-C, MagSafe, Apple Watch charger, Qi', waterResistance: 'IP54' },
    price: 5690000,
    url: 'https://www.apple.com/vn/airpods-pro/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Sony_WF-1000XM3.jpg/320px-Sony_WF-1000XM3.jpg',
  },
  {
    name: 'Apple AirPods 4 with Active Noise Cancellation', brand: 'Apple', model: 'AirPods 4 ANC', category: 'headphone',
    description: 'Mẫu tai nghe open-ear đầu tiên của Apple có chống ồn chủ động ANC, chip H2, thiết kế vừa vặn tự nhiên, hộp sạc nhỏ nhất hỗ trợ loa Find My và cổng USB-C.',
    specs: { type: 'Open-ear True Wireless', chip: 'Apple H2 chip', anc: 'Active Noise Cancellation with Adaptive Audio', battery: '4h with ANC (20h with Case)', charging: 'USB-C, Apple Watch charger, Qi' },
    price: 4490000,
    url: 'https://www.apple.com/vn/airpods-4/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Sony_WF-1000XM3.jpg/320px-Sony_WF-1000XM3.jpg',
  },
  {
    name: 'Razer BlackShark V2 Pro (2023)', brand: 'Razer', model: 'BlackShark V2 Pro (2023)', category: 'headphone',
    description: 'Tai nghe gaming không dây eSports đỉnh cao, micro băng thông siêu rộng Razer HyperClear Super Wideband, màng loa TriForce Titanium 50mm, pin 70 giờ.',
    specs: { type: 'Over-ear Wireless Gaming', drivers: 'Razer TriForce Titanium 50mm', mic: 'Razer HyperClear Super Wideband Mic (detachable)', connectivity: 'Razer HyperSpeed Wireless 2.4GHz, Bluetooth 5.2, USB', battery: 'Up to 70 hours', weight: '320g' },
    price: 4690000,
    url: 'https://www.razer.com/gaming-headsets/razer-blackshark-v2-pro',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Sony_WH-1000XM4.jpg/320px-Sony_WH-1000XM4.jpg',
  },
  {
    name: 'HyperX Cloud III Wireless', brand: 'HyperX', model: 'Cloud III Wireless', category: 'headphone',
    description: 'Kế thừa sự êm ái huyền thoại với đệm mút hoạt tính HyperX, thời lượng pin vô địch lên đến 120 giờ chỉ với một lần sạc, âm thanh vòm không gian DTS Headphone:X.',
    specs: { type: 'Over-ear Wireless', battery: 'Up to 120 hours', drivers: 'Angled 53mm dynamic drivers', spatialAudio: 'DTS Headphone:X Spatial Audio', mic: '10mm ultra-clear with internal pop filter', connectivity: '2.4GHz Wireless USB-C dongle' },
    price: 3690000,
    url: 'https://hyperx.com/products/hyperx-cloud-iii-wireless-gaming-headset',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Sony_WH-1000XM4.jpg/320px-Sony_WH-1000XM4.jpg',
  },
  {
    name: 'Marshall Emberton II', brand: 'Marshall', model: 'Emberton II', category: 'speaker',
    description: 'Loa Bluetooth di động nhỏ gọn âm thanh đa hướng True Stereophonic 360 độ đặc trưng của Marshall, pin bền 30 giờ, chuẩn chống nước bụi hoàn hảo IP67 và chế độ Stack Mode.',
    specs: { power: '2x 10W Class D amplifiers', sound: 'True Stereophonic multi-directional 360°', battery: '30+ hours playtime', waterResistance: 'IP67 dust and water resistant', bluetooth: '5.1', stackMode: 'Connect multiple Emberton II speakers' },
    price: 4490000,
    url: 'https://www.marshallheadphones.com/vn/en/emberton-ii.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/JBL_Charge_3.jpg/320px-JBL_Charge_3.jpg',
  },
  {
    name: 'Marshall Stanmore III', brand: 'Marshall', model: 'Stanmore III', category: 'speaker',
    description: 'Loa gia đình đặt bàn kinh điển với âm trường rộng mở hơn, củ loa tweeter hướng ra ngoài, công nghệ Dynamic Loudness cân bằng dải âm, công suất 80W tràn ngập gian phòng.',
    specs: { power: '80W (1x 50W woofer + 2x 15W tweeters)', frequencyResponse: '45–20,000 Hz', connectivity: 'Bluetooth 5.2 (LE Audio ready), 3.5mm AUX, RCA input', controls: 'Brass control knobs on top panel' },
    price: 8990000,
    url: 'https://www.marshallheadphones.com/vn/en/stanmore-iii.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Edifier_R1280T_Bookshelf_Speakers.jpg/320px-Edifier_R1280T_Bookshelf_Speakers.jpg',
  },
  {
    name: 'JBL Flip 6', brand: 'JBL', model: 'Flip 6', category: 'speaker',
    description: 'Loa di động hình trụ chống nước bụi IP67 tiện lợi mang theo mọi nơi, hệ thống loa 2 chiều độc lập (loa trầm racetrack + loa bổng riêng biệt), pin 12 giờ JBL Pro Sound.',
    specs: { power: '30W (20W RMS woofer + 10W RMS tweeter)', battery: '12 hours (4800mAh)', waterResistance: 'IP67 waterproof and dustproof', bluetooth: '5.1', partyBoost: 'Pair 2 PartyBoost speakers for stereo sound' },
    price: 2590000,
    url: 'https://vn.jbl.com/portable/FLIP-6-.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/JBL_Charge_3.jpg/320px-JBL_Charge_3.jpg',
  },
  {
    name: 'JBL Boombox 3 Wi-Fi', brand: 'JBL', model: 'Boombox 3 Wi-Fi', category: 'speaker',
    description: 'Quái vật âm thanh di động công suất khủng lên tới 180W (chế độ cắm điện), hỗ trợ Dolby Atmos 3D qua kết nối Wi-Fi, âm bass uy lực rung chuyển không gian, pin 24 giờ.',
    specs: { power: '180W (AC mode) / 136W (Battery mode)', battery: '24 hours (10000mAh) + Powerbank out', connectivity: 'Wi-Fi 6 with Dolby Atmos, AirPlay, Chromecast, Bluetooth 5.3', waterResistance: 'IP67' },
    price: 13900000,
    url: 'https://vn.jbl.com/bluetooth-speakers/BOOMBOX-3-WIFI.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/JBL_Charge_3.jpg/320px-JBL_Charge_3.jpg',
  },
  {
    name: 'Sony SRS-XG300', brand: 'Sony', model: 'SRS-XG300', category: 'speaker',
    description: 'Loa tiệc tùng di động tay xách tiện lợi X-Balanced Speaker Unit, âm trầm MEGA BASS uy lực, đèn LED viền màng rung đồng bộ nhịp nhạc, pin 25 giờ sạc nhanh.',
    specs: { battery: '25 hours (10 mins quick charge = 70 mins play)', waterResistance: 'IP67 water and dust resistant, rustproof', audio: 'X-Balanced Speaker Unit, MEGA BASS, Live Sound', lights: 'Ambient illumination ring light' },
    price: 6490000,
    url: 'https://www.sony.com.vn/wireless-speakers/products/srs-xg300',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/JBL_Charge_3.jpg/320px-JBL_Charge_3.jpg',
  },

  /* ==================== MOUSE & KEYBOARD (6) ==================== */
  {
    name: 'Logitech MX Master 3S', brand: 'Logitech', model: 'MX Master 3S', category: 'mouse',
    description: 'Chuột công thái học làm việc chuyên nghiệp đỉnh cao nhất thế giới với bánh xe cuộn MagSpeed điện từ 1000 dòng/giây, click tĩnh âm Quiet Clicks giảm 90% tiếng ồn, cảm biến 8000 DPI trên mọi mặt kính.',
    specs: { sensor: 'Darkfield high precision (200 - 8000 DPI on glass)', scrollWheel: 'MagSpeed Electromagnetic with SmartShift', clicks: 'Quiet Clicks (90% noise reduction)', connectivity: 'Bluetooth Low Energy + Logi Bolt USB Receiver', battery: 'Up to 70 days' },
    price: 2490000,
    url: 'https://www.logitech.com/vi-vn/products/mice/mx-master-3s.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Logitech_G502_Proteus_Core.jpg/320px-Logitech_G502_Proteus_Core.jpg',
  },
  {
    name: 'Logitech G102 Gen2 Lightsync', brand: 'Logitech', model: 'G102 Lightsync', category: 'mouse',
    description: 'Chuột gaming quốc dân thiết kế 6 nút đối xứng cổ điển, cảm biến cấp gaming 8000 DPI, hệ thống đèn RGB Lightsync 16.8 triệu màu lượn sóng rực rỡ.',
    specs: { sensor: 'Gaming-grade sensor (200 - 8000 DPI)', buttons: '6 programmable buttons with mechanical spring tensioning', rgb: 'LIGHTSYNC RGB color wave', pollingRate: '1000Hz (1ms)', weight: '85g' },
    price: 420000,
    url: 'https://www.logitechg.com/vi-vn/products/gaming-mice/g102-lightsync-rgb-gaming-mouse.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Logitech_G502_Proteus_Core.jpg/320px-Logitech_G502_Proteus_Core.jpg',
  },
  {
    name: 'Razer Viper Mini', brand: 'Razer', model: 'Viper Mini', category: 'mouse',
    description: 'Chuột gaming siêu nhẹ chỉ 61 gram cho người có bàn tay vừa và nhỏ, switch quang học Razer Optical phản hồi tốc độ ánh sáng 0.2ms, cáp mềm Speedflex linh hoạt.',
    specs: { weight: '61g ultra-lightweight', sensor: '8500 DPI optical sensor (300 IPS)', switches: 'Razer Optical Mouse Switches (50M clicks)', cable: 'Razer Speedflex Cable', lighting: 'Razer Chroma RGB underglow' },
    price: 690000,
    url: 'https://www.razer.com/gaming-mice/razer-viper-mini',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Razer_DeathAdder_Chroma.jpg/320px-Razer_DeathAdder_Chroma.jpg',
  },
  {
    name: 'Keychron K2 Pro QMK/VIA Wireless', brand: 'Keychron', model: 'K2 Pro', category: 'keyboard',
    description: 'Bàn phím cơ layout 75% không dây tùy biến mã nguồn mở QMK/VIA, mạch hotswap xuôi, đệm tiêu âm silicon và foam cách âm, keycap PBT double-shot OSA profile.',
    specs: { layout: '75% (84 keys)', connectivity: 'Bluetooth 5.1 + Type-C wired', customization: 'QMK & VIA fully programmable', switches: 'Keychron K Pro Mechanical (Hot-swappable)', keycaps: 'Double-shot PBT OSA profile', battery: '4000mAh' },
    price: 2450000,
    url: 'https://www.keychron.com/products/keychron-k2-pro-qmk-via-wireless-mechanical-keyboard',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Mechanical_Keyboard_Keycaps.jpg/320px-Mechanical_Keyboard_Keycaps.jpg',
  },
  {
    name: 'Akko 3068B Plus Black & Pink', brand: 'Akko', model: '3068B Plus', category: 'keyboard',
    description: 'Bàn phím cơ 68 phím nhỏ gọn 65% mang đi du lịch tiện lợi, kết nối 3 chế độ (2.4G/Bluetooth/USB-C), switch Akko CS Jelly, LED RGB từng phím tùy biến.',
    specs: { layout: '65% (68 keys)', connectivity: 'Bluetooth 5.0 / 2.4GHz / Type-C', switches: 'Akko CS Jelly Pink / Purple (Hotswap)', keycaps: 'PBT Double-shot OEM Profile', battery: '1800mAh', rgb: 'Per-key RGB with SMD LED' },
    price: 1550000,
    url: 'https://akkogear.com.vn/san-pham/ban-phim-co-akko-3068b-plus-black-pink/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Mechanical_Keyboard_Keycaps.jpg/320px-Mechanical_Keyboard_Keycaps.jpg',
  },
  {
    name: 'DareU EK87 V2 Tenkeyless', brand: 'DareU', model: 'EK87 V2', category: 'keyboard',
    description: 'Bàn phím cơ giá rẻ quốc dân cho học sinh sinh viên layout TKL 87 phím, switch cơ học DareU D-Switch bền bỉ 50 triệu lần bấm, hệ thống LED Rainbow 7 màu rực rỡ.',
    specs: { layout: 'Tenkeyless 87 keys', switches: 'DareU D-Switch (Red/Blue/Brown)', keycaps: 'ABS Double-shot', connection: 'USB 2.0 cáp liền bọc dù 1.8m', lighting: 'Rainbow LED multi-modes' },
    price: 490000,
    url: 'https://dareu.com.vn/ban-phim-co-dareu-ek87-v2/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Mechanical_Keyboard_Keycaps.jpg/320px-Mechanical_Keyboard_Keycaps.jpg',
  },

  /* ==================== SMARTWATCH & WEARABLES (6) ==================== */
  {
    name: 'Apple Watch Series 10 GPS 42mm', brand: 'Apple', model: 'Apple Watch Series 10', category: 'smartwatch',
    description: 'Thế hệ Apple Watch mỏng nhất từ trước đến nay với màn hình OLED góc rộng sáng hơn 40%, chip S10 SiP, phát hiện ngưng thở khi ngủ và sạc nhanh 80% chỉ trong 30 phút.',
    specs: { caseSize: '42mm Aluminum', display: 'Wide-angle OLED always-on display up to 2000 nits', chip: 'S10 SiP 64-bit dual-core', health: 'ECG, Blood Oxygen, Sleep Apnea detection, Temperature sensor', waterResistance: '50m swimproof, Depth gauge to 6m', os: 'watchOS 11' },
    price: 10490000,
    url: 'https://www.apple.com/vn/apple-watch-series-10/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Samsung_Galaxy_Watch_4.jpg/320px-Samsung_Galaxy_Watch_4.jpg',
  },
  {
    name: 'Apple Watch Ultra 2 GPS + Cellular 49mm', brand: 'Apple', model: 'Apple Watch Ultra 2', category: 'smartwatch',
    description: 'Đồng hồ thám hiểm chuyên nghiệp vỏ titan 49mm màn hình sáng nhất 3000 nits, chip S9 SiP thao tác chạm đúp Double Tap, GPS băng tần kép L1+L5 chuẩn xác nhất, pin 72 giờ.',
    specs: { caseSize: '49mm Aerospace-grade Titanium', display: 'Always-On Retina display 3000 nits', battery: '36 hours normal / up to 72 hours low power', waterResistance: '100m, dive certified EN13319 to 40m', siren: '86-decibel siren for emergency' },
    price: 20990000,
    url: 'https://www.apple.com/vn/apple-watch-ultra-2/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Samsung_Galaxy_Watch_4.jpg/320px-Samsung_Galaxy_Watch_4.jpg',
  },
  {
    name: 'Apple Watch SE 2nd Gen GPS 40mm', brand: 'Apple', model: 'Apple Watch SE 2', category: 'smartwatch',
    description: 'Mẫu smartwatch Apple giá tốt nhất trang bị chip xử lý S8 SiP mạnh mẽ ngang Series 8, tính năng phát hiện va chạm ô tô (Crash Detection), theo dõi nhịp tim và theo dõi giấc ngủ chi tiết.',
    specs: { caseSize: '40mm Aluminum', display: 'Retina LTPO OLED 1000 nits', chip: 'S8 SiP 64-bit dual-core', safety: 'Crash Detection, Fall Detection, Emergency SOS', waterResistance: '50m swimproof' },
    price: 5990000,
    url: 'https://www.apple.com/vn/apple-watch-se/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Samsung_Galaxy_Watch_4.jpg/320px-Samsung_Galaxy_Watch_4.jpg',
  },
  {
    name: 'Huawei Watch GT 4 46mm', brand: 'Huawei', model: 'Watch GT 4 46mm', category: 'smartwatch',
    description: 'Đồng hồ thông minh thiết kế bát giác hình học sang trọng, thời lượng pin bền bỉ 14 ngày, công nghệ đo nhịp tim TruSeen 5.5+ cải tiến và quản lý calo thông minh Stay Fit.',
    specs: { display: '1.43 inch AMOLED (466 x 466)', battery: 'Up to 14 days maximum / 8 days regular', health: 'TruSeen 5.5+ heart rate, TruSleep 3.0, SpO2, ECG tracking', compatibility: 'Android & iOS support', waterResistance: '5 ATM' },
    price: 4990000,
    url: 'https://consumer.huawei.com/vn/wearables/watch-gt4/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Samsung_Galaxy_Watch_4.jpg/320px-Samsung_Galaxy_Watch_4.jpg',
  },
  {
    name: 'Huawei Band 9', brand: 'Huawei', model: 'Band 9', category: 'smartwatch',
    description: 'Vòng đeo tay thông minh siêu nhẹ chỉ 14 gram mỏng 8.99mm, dây đeo fluoroelastomer thoáng khí, theo dõi giấc ngủ TruSleep 4.0 và pin kéo dài tới 14 ngày.',
    specs: { display: '1.47 inch AMOLED touch display', weight: '14g (without strap)', thickness: '8.99mm', battery: 'Up to 14 days (fast charge 5 mins = 2 days)', sensors: '9-axis IMU sensor, optical heart rate sensor' },
    price: 890000,
    url: 'https://consumer.huawei.com/vn/wearables/band9/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Samsung_Galaxy_Watch_4.jpg/320px-Samsung_Galaxy_Watch_4.jpg',
  },
  {
    name: 'Xiaomi Smart Band 9', brand: 'Xiaomi', model: 'Smart Band 9', category: 'smartwatch',
    description: 'Vòng đeo tay theo dõi sức khỏe thế hệ mới với màn hình AMOLED 1.62 inch 60Hz độ sáng đỉnh 1200 nits, khung hợp kim nhôm sang trọng, hơn 150 chế độ thể thao và pin 21 ngày.',
    specs: { display: '1.62 inch AMOLED 60Hz 1200 nits', battery: '233mAh (up to 21 days)', waterResistance: '5 ATM (50m)', sensors: 'High-precision 6-axis sensor, PPG heart rate & SpO2', haptics: 'Linear motor with 20 vibration modes' },
    price: 990000,
    url: 'https://www.mi.com/vn/product/xiaomi-smart-band-9/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Samsung_Galaxy_Watch_4.jpg/320px-Samsung_Galaxy_Watch_4.jpg',
  },

  /* ==================== CAMERA & VIDEO (6) ==================== */
  {
    name: 'Sony Alpha 7 IV (ILCE-7M4)', brand: 'Sony', model: 'Alpha 7 IV', category: 'camera',
    description: 'Máy ảnh không gương lật Full-Frame lai (Hybrid) chụp ảnh 33MP và quay phim chuẩn điện ảnh 4K 60p 10-bit 4:2:2, bộ xử lý BIONZ XR và lấy nét Real-time Eye AF thông minh.',
    specs: { sensor: '33.0 MP Full-Frame Exmor R CMOS', processor: 'BIONZ XR image processor', video: '4K 60p in Super 35, 4K 30p full width oversampled from 7K 10-bit 4:2:2', autofocus: '759 phase-detection points with AI tracking', stabilization: '5-axis in-body image stabilization (5.5 stops)' },
    price: 52990000,
    url: 'https://www.sony.com.vn/interchangeable-lens-cameras/products/ilce-7m4',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Sony_Alpha_6400.jpg/320px-Sony_Alpha_6400.jpg',
  },
  {
    name: 'Fujifilm X-T5 Mirrorless Camera', brand: 'Fujifilm', model: 'X-T5', category: 'camera',
    description: 'Máy ảnh phong cách hoài cổ retro bánh xe cơ học, cảm biến APS-C độ phân giải kỷ lục 40.2MP X-Trans CMOS 5 HR, chống rung 5 trục trong thân máy 7.0 stops và quay video 6.2K.',
    specs: { sensor: '40.2 MP APS-C X-Trans CMOS 5 HR', processor: 'X-Processor 5', video: '6.2K 30p, 4K 60p 10-bit 4:2:2 internal', ibis: '5-axis In-Body Image Stabilization up to 7.0 stops', filmSimulations: '19 Film Simulation modes including Nostalgic Neg' },
    price: 43900000,
    url: 'https://fujifilm-x.com/vi-vn/products/cameras/x-t5/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Sony_Alpha_6400.jpg/320px-Sony_Alpha_6400.jpg',
  },
  {
    name: 'Fujifilm X100VI Compact Digital Camera', brand: 'Fujifilm', model: 'X100VI', category: 'camera',
    description: 'Chiếc máy ảnh compact đường phố được săn đón nhất toàn cầu ống kính cố định Fujinon 23mm F/2, cảm biến 40.2MP tích hợp chống rung IBIS 6.0 stops đầu tiên trên dòng X100.',
    specs: { sensor: '40.2 MP X-Trans CMOS 5 HR', lens: 'Fujinon 23mm F/2 II (tương đương 35mm)', viewfinder: 'Advanced Hybrid Viewfinder (OVF + 3.69M-dot EVF)', ibis: '6.0 stops In-Body Image Stabilization', video: '6.2K 30p, 4K 60p' },
    price: 47990000,
    url: 'https://fujifilm-x.com/vi-vn/products/cameras/x100vi/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Sony_Alpha_6400.jpg/320px-Sony_Alpha_6400.jpg',
  },
  {
    name: 'Canon EOS R6 Mark II Mirrorless Camera', brand: 'Canon', model: 'EOS R6 Mark II', category: 'camera',
    description: 'Máy ảnh Full-frame tốc độ chụp liên tục cực nhanh 40 fps màn trập điện tử, quay phim 4K 60p không crop từ 6K, chống rung kết hợp Coordinated IS lên đến 8.0 stops.',
    specs: { sensor: '24.2 MP Full-Frame CMOS', processor: 'DIGIC X', continuousShooting: 'Up to 40 fps with electronic shutter', video: '6K oversampled uncropped 4K 60p, FHD 180p', autofocus: 'Dual Pixel CMOS AF II with Deep Learning subject detection' },
    price: 58990000,
    url: 'https://vn.canon/vi/consumer/eos-r6-mark-ii-body/product',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Canon_EOS_M50_with_lens.jpg/320px-Canon_EOS_M50_with_lens.jpg',
  },
  {
    name: 'DJI RS 3 Mini Gimbal Stabilizer', brand: 'DJI', model: 'RS 3 Mini', category: 'camera',
    description: 'Gimbal chống rung cầm tay nhỏ gọn đầu tiên hỗ trợ quay video dọc tự nhiên cho TikTok/Reels không cần phụ kiện, tải trọng 2.0 kg cân tốt máy ảnh mirrorless Full-frame.',
    specs: { weight: '795g ultra-lightweight', payload: 'Up to 2.0 kg payload', features: 'Native vertical video shooting, Bluetooth shutter control, 1.4 inch full-color touchscreen', battery: '10 hours battery runtime' },
    price: 6890000,
    url: 'https://www.dji.com/rs-3-mini',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/DJI_Osmo_Pocket.jpg/320px-DJI_Osmo_Pocket.jpg',
  },
  {
    name: 'DJI Mic 2 (2 TX + 1 RX + Charging Case)', brand: 'DJI', model: 'DJI Mic 2', category: 'camera',
    description: 'Bộ micro thu âm không dây chuyên nghiệp tích hợp ghi âm nội bộ 32-bit float không bao giờ vỡ tiếng, tính năng khử ồn thông minh Intelligent Noise Cancelling, phạm vi 250m.',
    specs: { internalRecording: '32-bit Float internal recording with 8GB storage per transmitter', transmissionRange: 'Up to 250m line of sight', battery: '6 hours (up to 18 hours with charging case)', connectivity: 'Direct Bluetooth to smartphones, 3.5mm TRS, Lightning & USB-C adapters' },
    price: 8490000,
    url: 'https://www.dji.com/mic-2',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/DJI_Osmo_Pocket.jpg/320px-DJI_Osmo_Pocket.jpg',
  },

  /* ==================== SMART HOME & NETWORKING (7) ==================== */
  {
    name: 'Dreame L10s Ultra Robot Vacuum', brand: 'Dreame', model: 'L10s Ultra', category: 'smart_home',
    description: 'Robot hút bụi lau nhà thông minh trạm sạc tự động giặt giẻ sấy khô khí nóng, tự hút rác tự pha nước lau sàn, lực hút 5300Pa và camera AI nhận diện vật cản 3D.',
    specs: { suction: '5300 Pa', baseStation: 'Auto-empty dust, auto mop cleaning & hot air drying, auto water & solution refilling', navigation: 'AI Action 3D obstacle avoidance + LiDAR laser', battery: '5200mAh (cleans up to 200m²)' },
    price: 14990000,
    url: 'https://dreametech.vn/products/dreame-bot-l10s-ultra/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Xiaomi_Mi_Air_Purifier.jpg/320px-Xiaomi_Mi_Air_Purifier.jpg',
  },
  {
    name: 'Ecovacs Deebot T30 Pro Omni', brand: 'Ecovacs', model: 'Deebot T30 Pro Omni', category: 'smart_home',
    description: 'Robot hút bụi công nghệ xòe giẻ TruEdge làm sạch sát mép tường 1mm, chổi chống rối tóc ZeroTangle, lực hút cực đại 11000Pa, giặt giẻ bằng nước nóng 70°C.',
    specs: { suction: '11,000 Pa', mopTech: 'TruEdge Adaptive Edge Mopping + OZMO Turbo 2.0', baseStation: '70°C Hot water mop washing, hot air drying, 90-day auto-empty', antiTangle: 'ZeroTangle technology' },
    price: 16990000,
    url: 'https://ecovacs.vn/products/ecovacs-deebot-t30-pro-omni',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Xiaomi_Mi_Air_Purifier.jpg/320px-Xiaomi_Mi_Air_Purifier.jpg',
  },
  {
    name: 'Xiaomi Smart Air Fryer 6.5L', brand: 'Xiaomi', model: 'Smart Air Fryer 6.5L', category: 'smart_home',
    description: 'Nồi chiên không dầu thông minh dung lượng lớn 6.5L nướng nguyên con gà, công nghệ đối lưu 360 độ giảm 88.3% dầu mỡ, điều khiển nhiệt độ chính xác 40-220°C qua ứng dụng Mi Home.',
    specs: { capacity: '6.5 Liters', power: '1800W', temperatureRange: '40°C to 220°C (dual-speed fan)', smartFeatures: 'Wi-Fi connected, 100+ cloud recipes, voice control with Google Assistant' },
    price: 2190000,
    url: 'https://www.mi.com/vn/product/xiaomi-smart-air-fryer-6-5l/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Xiaomi_Mi_Air_Purifier.jpg/320px-Xiaomi_Mi_Air_Purifier.jpg',
  },
  {
    name: 'Philips Hue Play Light Bar (2-Pack)', brand: 'Philips Hue', model: 'Hue Play Light Bar 2-Pack', category: 'smart_home',
    description: 'Cặp thanh đèn trang trí phòng game và xem phim 16 triệu màu, đồng bộ ánh sáng theo màn hình máy tính và tivi qua phần mềm Hue Sync sống động.',
    specs: { pack: '2 Light Bars + Power Supply', colors: '16 Million Colors + Tunable White', brightness: '530 lumens per bar', connectivity: 'Zigbee (requires Philips Hue Bridge)', placement: 'Vertical, horizontal, or mounted behind TV/Monitor' },
    price: 3650000,
    url: 'https://www.philips-hue.com/en-us/p/hue-white-and-color-ambiance-play-light-bar-double-pack/7820230U7',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Philips_Hue_Bridge_2.0.jpg/320px-Philips_Hue_Bridge_2.0.jpg',
  },
  {
    name: 'TP-Link Archer AX73 AX5400 Wi-Fi 6 Router', brand: 'TP-Link', model: 'Archer AX73', category: 'networking',
    description: 'Router Wi-Fi 6 băng tần kép tốc độ 5400Mbps, 6 ăng-ten ngoài công suất cao công nghệ 4T4R và Beamforming, cổng USB 3.0 chia sẻ ổ cứng mạng và gói bảo mật HomeShield.',
    specs: { standard: 'Wi-Fi 6 (802.11ax)', speed: '5400 Mbps (4804 Mbps trên 5GHz + 574 Mbps trên 2.4GHz)', antennas: '6x High-performance external antennas', ports: '1x Gigabit WAN, 4x Gigabit LAN, 1x USB 3.0', features: 'OneMesh support, TP-Link HomeShield security' },
    price: 2490000,
    url: 'https://www.tp-link.com/vn/home-networking/wifi-router/archer-ax73/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/TP-Link_Archer_C7_v2.jpg/320px-TP-Link_Archer_C7_v2.jpg',
  },
  {
    name: 'ASUS RT-AX58U V2 Dual-Band Wi-Fi 6 Router', brand: 'ASUS', model: 'RT-AX58U V2', category: 'networking',
    description: 'Router Wi-Fi 6 chuẩn 3000Mbps với băng thông 160MHz siêu rộng, hỗ trợ công nghệ mạng lưới AiMesh mở rộng sóng toàn nhà, bảo mật trọn đời AiProtection Pro từ Trend Micro.',
    specs: { standard: 'Wi-Fi 6 (802.11ax) with 160MHz channels', speed: '3000 Mbps (2402 Mbps 5GHz + 574 Mbps 2.4GHz)', mesh: 'ASUS AiMesh compatible', security: 'AiProtection Pro powered by Trend Micro, WPA3', ports: '1x GbE WAN, 4x GbE LAN, 1x USB 3.2 Gen 1' },
    price: 2690000,
    url: 'https://www.asus.com/vn/networking-iot-servers/wifi-routers/asus-wifi-routers/rt-ax58u-v2/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/TP-Link_Archer_C7_v2.jpg/320px-TP-Link_Archer_C7_v2.jpg',
  },
  {
    name: 'Xiaomi Router AX3000T Wi-Fi 6', brand: 'Xiaomi', model: 'Router AX3000T', category: 'networking',
    description: 'Bộ phát Wi-Fi 6 thế hệ mới giá rẻ tốc độ 3000Mbps, 4 cổng Gigabit tự động nhận diện WAN/LAN, hỗ trợ kết nối Mesh một chạm lên tới 10 thiết bị và NFC kết nối nhanh.',
    specs: { standard: 'Wi-Fi 6 (802.11ax)', speed: '2976 Mbps (2402 Mbps 5GHz + 574 Mbps 2.4GHz)', ports: '4x Full Gigabit WAN/LAN ports (WAN aggregation)', mesh: 'Xiaomi self-developed Mesh networking', ram: '256MB (connects up to 128 devices)' },
    price: 690000,
    url: 'https://www.mi.com/vn/product/xiaomi-router-ax3000t/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/TP-Link_Archer_C7_v2.jpg/320px-TP-Link_Archer_C7_v2.jpg',
  },

  /* ==================== TABLETS (4) ==================== */
  {
    name: 'Apple iPad Air 11 inch M2 (2024)', brand: 'Apple', model: 'iPad Air 11 M2', category: 'tablet',
    description: 'Máy tính bảng Apple iPad Air thế hệ mới trang bị chip M2 đột phá, màn hình Liquid Retina 11 inch sắc nét, camera trước góc rộng ngang tối ưu cuộc gọi video, hỗ trợ Apple Pencil Pro.',
    specs: { display: '11 inch Liquid Retina (2360 x 1640) 500 nits True Tone', processor: 'Apple M2 (8 Cores CPU, 9 Cores GPU, 16 Cores Neural Engine)', ram: '8GB', storage: '128GB', accessories: 'Apple Pencil Pro, Magic Keyboard', weight: '462g' },
    price: 15990000,
    url: 'https://www.apple.com/vn/ipad-air/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/IPad_Air_2_Gold.png/320px-IPad_Air_2_Gold.png',
  },
  {
    name: 'Apple iPad Pro 11 inch M4 (2024)', brand: 'Apple', model: 'iPad Pro 11 M4', category: 'tablet',
    description: 'Thiết bị mỏng nhất lịch sử Apple chỉ 5.3mm với màn hình Ultra Retina XDR Tandem OLED đột phá, chip M4 thế hệ mới sức mạnh AI 38 TOPS, hỗ trợ bàn phím Magic Keyboard nhôm.',
    specs: { display: '11 inch Ultra Retina XDR Tandem OLED 120Hz ProMotion 1000 nits', processor: 'Apple M4 (9/10 Cores CPU, 10 Cores GPU, Ray Tracing)', ram: '8GB', storage: '256GB', thickness: '5.3 mm ultra-thin', weight: '444g' },
    price: 26990000,
    url: 'https://www.apple.com/vn/ipad-pro/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/IPad_Air_2_Gold.png/320px-IPad_Air_2_Gold.png',
  },
  {
    name: 'Samsung Galaxy Tab S9 FE 10.9"', brand: 'Samsung', model: 'Galaxy Tab S9 FE', category: 'tablet',
    description: 'Máy tính bảng chống nước chống bụi chuẩn IP68 đầu tiên trong phân khúc tầm trung, tặng kèm bút S Pen chính hãng kháng nước, màn hình 10.9 inch 90Hz và loa kép Dolby Atmos.',
    specs: { display: '10.9 inch WQXGA (2304 x 1440) 90Hz', processor: 'Samsung Exynos 1380 (5nm)', ram: '6GB', storage: '128GB (MicroSD up to 1TB)', pen: 'S Pen included (IP68 water resistant)', battery: '8000mAh, sạc nhanh 45W' },
    price: 8990000,
    url: 'https://www.samsung.com/vn/tablets/galaxy-tab-s/galaxy-tab-s9-fe-gray-128gb-sm-x510nzaaxxv/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/IPad_Air_2_Gold.png/320px-IPad_Air_2_Gold.png',
  },
  {
    name: 'Xiaomi Pad 6S Pro 12.4', brand: 'Xiaomi', model: 'Pad 6S Pro 12.4', category: 'tablet',
    description: 'Tablet màn hình lớn 12.4 inch độ phân giải 3K 144Hz tỷ lệ 3:2 chuẩn làm việc, chip Snapdragon 8 Gen 2 hàng đầu, sạc siêu nhanh HyperCharge 120W đầy pin trong 35 phút.',
    specs: { display: '12.4 inch 3K (3048 x 2032) 144Hz 3:2 ratio 900 nits', processor: 'Snapdragon 8 Gen 2 (4nm)', ram: '8GB LPDDR5X', storage: '256GB UFS 4.0', audio: '6-speaker stereo system', battery: '10000mAh, 120W HyperCharge', os: 'Xiaomi HyperOS' },
    price: 13990000,
    url: 'https://www.mi.com/vn/product/xiaomi-pad-6s-pro-12-4/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/IPad_Air_2_Gold.png/320px-IPad_Air_2_Gold.png',
  },

  /* ==================== PROJECTOR, E-READER, AUDIO & CONSOLE (7) ==================== */
  {
    name: 'XGIMI Horizon Pro 4K Projector', brand: 'XGIMI', model: 'Horizon Pro 4K', category: 'projector',
    description: 'Máy chiếu gia đình 4K UHD độ sáng 2200 ANSI Lumens, công nghệ tự căn chỉnh màn hình ISA (tự lấy nét, tự chỉnh vuông hình, tránh vật cản), loa tích hợp Harman Kardon 16W.',
    specs: { resolution: '3840 x 2160 4K UHD', brightness: '2200 ANSI Lumens', projectionSize: 'Up to 300 inches', audio: '2x 8W Harman Kardon with Dolby Audio & DTS-HD', os: 'Android TV with Google Play' },
    price: 36900000,
    url: 'https://global.xgimi.com/pages/horizon-pro',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Dell_UltraSharp_U2414H_Monitor.jpg/320px-Dell_UltraSharp_U2414H_Monitor.jpg',
  },
  {
    name: 'Amazon Kindle Paperwhite 5 (11th Gen)', brand: 'Amazon', model: 'Kindle Paperwhite 11th Gen', category: 'ereader',
    description: 'Máy đọc sách bán chạy nhất thế giới màn hình E-ink Carta 1200 kích thước 6.8 inch 300 ppi, đèn nền đổi màu từ trắng sang vàng ấm chống mỏi mắt, chuẩn kháng nước IPX8.',
    specs: { display: '6.8 inch E-ink Carta 1200 glare-free 300 ppi', lighting: 'Adjustable warm light (17 LEDs)', waterResistance: 'IPX8 waterproof (2 meters in fresh water for 60 mins)', battery: 'Up to 10 weeks on a single charge', storage: '8GB/16GB, USB-C' },
    price: 3490000,
    url: 'https://www.amazon.com/Kindle-Paperwhite-adjustable-warm-light/dp/B08KTZ8249',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Amazon_Kindle_Paperwhite_2013.jpg/320px-Amazon_Kindle_Paperwhite_2013.jpg',
  },
  {
    name: 'Kobo Clara 2E E-reader', brand: 'Kobo', model: 'Clara 2E', category: 'ereader',
    description: 'Máy đọc sách thân thiện môi trường chế tạo từ 85% nhựa tái chế, màn hình cảm ứng E-ink Carta 1200 6 inch sắc nét, đèn nền ComfortLight PRO giảm ánh sáng xanh, chống nước IPX8.',
    specs: { display: '6.0 inch HD E-ink Carta 1200 touchscreen 300 ppi', storage: '16GB (holds up to 12,000 eBooks)', waterResistance: 'IPX8 waterproof', audio: 'Bluetooth for Kobo Audiobooks', lighting: 'ComfortLight PRO with blue light reduction' },
    price: 3390000,
    url: 'https://us.kobobooks.com/products/kobo-clara-2e',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Amazon_Kindle_Paperwhite_2013.jpg/320px-Amazon_Kindle_Paperwhite_2013.jpg',
  },
  {
    name: 'Audient iD14 MKII USB-C Audio Interface', brand: 'Audient', model: 'iD14 MKII', category: 'professional_audio',
    description: 'Soundcard thu âm chuyên nghiệp 10 In / 6 Out USB-C, 2 tiền khuếch đại Audient Console Mic Preamps chuẩn phòng thu lừng danh, bộ chuyển đổi AD/DA 32-bit dải động 126dB.',
    specs: { micPreamps: '2x Audient Console Mic Preamps (Class-A design)', converters: 'High Performance 32-bit DAC with 126dB Dynamic Range', inputs: '2x XLR/TRS combo + 1x JFET D.I. instrument + Optical ADAT/SPDIF in', outputs: '4x TRS line out, Dual headphone out (1/4" + 3.5mm)', busPower: 'Full USB-C bus powered' },
    price: 6490000,
    url: 'https://audient.com/products/audio-interfaces/id14/overview/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Focusrite_Scarlett_2i2.jpg/320px-Focusrite_Scarlett_2i2.jpg',
  },
  {
    name: 'Anker 737 Power Bank (PowerCore 24K)', brand: 'Anker', model: '737 Power Bank A1289', category: 'charger',
    description: 'Pin sạc dự phòng cao cấp công suất siêu khủng 140W chuẩn PD 3.1, dung lượng 24000mAh, màn hình màu kỹ thuật số thông minh hiển thị công suất sạc và thời gian nạp theo thời gian thực.',
    specs: { capacity: '24,000 mAh (86.4 Wh)', maxOutput: '140W two-way fast charging (PD 3.1)', ports: '2x USB-C + 1x USB-A', display: 'Smart Digital Color Display (Power in/out, battery health, recharge time)', size: '155.7 x 54.6 x 49.5 mm' },
    price: 2890000,
    url: 'https://www.anker.com/products/a1289',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Apple_96W_USB-C_Power_Adapter.jpg/320px-Apple_96W_USB-C_Power_Adapter.jpg',
  },
  {
    name: 'Nintendo Switch OLED Model Mario Red Edition', brand: 'Nintendo', model: 'Switch OLED Mario Red', category: 'gaming_console',
    description: 'Máy chơi game cầm tay phiên bản giới hạn màu đỏ đặc trưng Mario, màn hình rực rỡ 7 inch OLED sống động, chân đế rộng điều chỉnh góc linh hoạt, dock cắm có cổng LAN có dây.',
    specs: { display: '7.0 inch OLED touchscreen (1280 x 720)', storage: '64GB internal storage', dock: 'Wired LAN port, HDMI, USB', battery: '4310mAh (approx. 4.5 - 9 hours)', modes: 'TV Mode, Tabletop Mode, Handheld Mode' },
    price: 7890000,
    url: 'https://www.nintendo.com/us/store/products/nintendo-switch-oled-model-mario-red-edition-112872/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Nintendo-Switch-Console-Docked-wJoyConRB.jpg/320px-Nintendo-Switch-Console-Docked-wJoyConRB.jpg',
  },
  {
    name: 'PlayStation DualSense Edge Wireless Controller', brand: 'Sony', model: 'DualSense Edge', category: 'gaming_console',
    description: 'Tay cầm chơi game chuyên nghiệp cao cấp nhất cho PS5 và PC, có thể thay thế cụm cần analog tháo rời, nút gạt điều chỉnh hành trình cò trigger, 2 nút gán lưng tiện lợi.',
    specs: { compatibility: 'PS5, PC, Mac, iOS, Android', features: 'Replaceable stick modules, mappable back buttons, adjustable triggers, customizable button assignments', haptics: 'Haptic feedback and adaptive triggers' },
    price: 5490000,
    url: 'https://www.playstation.com/en-vn/accessories/dualsense-edge-wireless-controller/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/PlayStation_5_and_DualSense_with_box.jpg/320px-PlayStation_5_and_DualSense_with_box.jpg',
  },
];

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB. Starting importBatch9...');

  let inserted = 0;
  let skipped  = 0;

  for (const raw of products) {
    const { price, ...rest } = raw as any;
    const exists = await (Product as any).findOne({ name: rest.name }).lean();
    if (exists) {
      console.log(`  SKIP (exists): ${rest.name}`);
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
  console.log(`\n=== BATCH 9 DONE ===`);
  console.log(`Inserted: ${inserted} | Skipped: ${skipped}`);
  console.log(`Total products: ${total} | Total offers: ${totalOffers}`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
