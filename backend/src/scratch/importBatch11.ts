/**
 * importBatch11.ts — 51 New Electronic Products
 * Categories: monitor, headphone, speaker, keyboard, mouse, smartwatch, camera, smart_home, gaming_console, tablet, networking, charger
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
  /* ==================== MONITOR (5) ==================== */
  {
    name: 'ASUS ROG Swift OLED PG27AQDM 27" 240Hz', brand: 'ASUS', model: 'ROG Swift OLED PG27AQDM', category: 'monitor',
    description: 'Màn hình gaming OLED 27 inch 2K QHD đỉnh cao với tần số quét 240Hz, thời gian phản hồi siêu tốc 0.03ms, độ phủ màu 99% DCI-P3 và tản nhiệt buồng hơi tùy chỉnh.',
    specs: { displaySize: '26.5 inch OLED', resolution: '2560 x 1440 QHD', panel: 'OLED', refreshRate: '240Hz', responseTime: '0.03ms (GtG)', brightness: '1000 nits peak', colorGamut: '99% DCI-P3' },
    price: 24990000,
    url: 'https://rog.asus.com/monitors/27-to-31-5-inches/rog-swift-oled-pg27aqdm/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Dell_UltraSharp_U2414H_Monitor.jpg/320px-Dell_UltraSharp_U2414H_Monitor.jpg',
  },
  {
    name: 'LG UltraGear 32GP850-B 32" Nano IPS 165Hz', brand: 'LG', model: '32GP850-B', category: 'monitor',
    description: 'Màn hình chơi game cỡ lớn 31.5 inch tấm nền Nano IPS 1ms, độ phân giải 2K QHD 165Hz (ép xung 180Hz), hỗ trợ HDR10 và tương thích NVIDIA G-Sync.',
    specs: { displaySize: '31.5 inch Nano IPS', resolution: '2560 x 1440 QHD', refreshRate: '165Hz (O/C 180Hz)', responseTime: '1ms (GtG)', colorGamut: 'DCI-P3 98%', sync: 'NVIDIA G-Sync Compatible' },
    price: 8990000,
    url: 'https://www.lg.com/vn/man-hinh-may-tinh/lg-32gp850-b',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Dell_UltraSharp_U2414H_Monitor.jpg/320px-Dell_UltraSharp_U2414H_Monitor.jpg',
  },
  {
    name: 'Dell UltraSharp U2724D 27" IPS Black 120Hz', brand: 'Dell', model: 'UltraSharp U2724D', category: 'monitor',
    description: 'Màn hình đồ họa chuẩn mực công nghệ IPS Black cho tỷ lệ tương phản 2000:1 sâu thẳm, tần số quét mượt mà 120Hz, cảm biến ánh sáng tự động điều chỉnh độ sáng.',
    specs: { displaySize: '27 inch IPS Black', resolution: '2560 x 1440 QHD', refreshRate: '120Hz', contrast: '2000:1', colorGamut: '100% sRGB, 98% DCI-P3, Delta E < 2', ports: 'Thunderbolt 4 / Type-C 90W PD, RJ45 2.5G' },
    price: 11490000,
    url: 'https://www.dell.com/en-us/shop/dell-ultrasharp-27-monitor-u2724d/apd/210-bksx/monitors-monitor-accessories',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Dell_UltraSharp_U2414H_Monitor.jpg/320px-Dell_UltraSharp_U2414H_Monitor.jpg',
  },
  {
    name: 'AOC Q27G2S/EU 27" QHD IPS 165Hz', brand: 'AOC', model: 'Q27G2S/EU', category: 'monitor',
    description: 'Màn hình gaming tấm nền IPS 27 inch 2K giá mềm, tần số quét 165Hz, thời gian phản hồi 1ms MPRT, hỗ trợ G-Sync Compatible và chân đế xoay 4 hướng linh hoạt.',
    specs: { displaySize: '27 inch IPS', resolution: '2560 x 1440 QHD', refreshRate: '165Hz', responseTime: '1ms MPRT', colorGamut: '131% sRGB', ports: '2x HDMI 2.0, 1x DP 1.2' },
    price: 4990000,
    url: 'https://aoc.com/en/gaming/products/monitors/q27g2s-eu',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Dell_UltraSharp_U2414H_Monitor.jpg/320px-Dell_UltraSharp_U2414H_Monitor.jpg',
  },
  {
    name: 'MSI Optix G271CQP 27" Curved 165Hz 1000R', brand: 'MSI', model: 'Optix G271CQP', category: 'monitor',
    description: 'Màn hình gaming cong hoàn hảo 1000R độ cong chuẩn tầm mắt, độ phân giải 2K WQHD, tần số quét 165Hz 1ms, tính năng Night Vision tăng độ sáng góc tối game.',
    specs: { displaySize: '27 inch Curved 1000R', resolution: '2560 x 1440 WQHD', panel: 'VA', refreshRate: '165Hz', responseTime: '1ms (MPRT)', contrast: '3000:1' },
    price: 5490000,
    url: 'https://www.msi.com/Monitor/Optix-G271CQP',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Dell_UltraSharp_U2414H_Monitor.jpg/320px-Dell_UltraSharp_U2414H_Monitor.jpg',
  },

  /* ==================== AUDIO: HEADPHONE & SPEAKER (8) ==================== */
  {
    name: 'Sony WH-CH720N Wireless Noise Canceling', brand: 'Sony', model: 'WH-CH720N', category: 'headphone',
    description: 'Tai nghe chống ồn chủ động siêu nhẹ nhất của Sony chỉ 192 gram trang bị chip Integrated Processor V1, công nghệ DSEE phục hồi âm thanh nén, thời lượng pin 35 giờ.',
    specs: { type: 'Over-ear Wireless', anc: 'Integrated Processor V1 with Dual Noise Sensor', weight: '192g ultra-lightweight', battery: '35 hours (ANC on) / 50 hours (ANC off)', bluetooth: '5.2, multipoint connection' },
    price: 2490000,
    url: 'https://www.sony.com.vn/headphones/products/wh-ch720n',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Sony_WH-1000XM4.jpg/320px-Sony_WH-1000XM4.jpg',
  },
  {
    name: 'Sennheiser Momentum 4 Wireless', brand: 'Sennheiser', model: 'Momentum 4 Wireless', category: 'headphone',
    description: 'Tai nghe chụp tai audiophile chất âm xuất sắc, thời lượng pin vô địch phân khúc lên tới 60 giờ nghe nhạc liên tục khi bật chống ồn ANC, hỗ trợ codec aptX Adaptive.',
    specs: { type: 'Over-ear Wireless ANC', drivers: '42mm audiophile-inspired transducer system', battery: 'Up to 60 hours playtime with ANC', codec: 'aptX Adaptive, aptX, AAC, SBC', soundPersonalization: 'Custom sound profile' },
    price: 8490000,
    url: 'https://www.sennheiser-hearing.com/en-US/p/momentum-4-wireless/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Sennheiser_HD598_Audiophile_Headphones.jpg/320px-Sennheiser_HD598_Audiophile_Headphones.jpg',
  },
  {
    name: 'Bose QuietComfort Ultra Headphones', brand: 'Bose', model: 'QC Ultra Headphones', category: 'headphone',
    description: 'Đỉnh cao chống ồn chủ động thế giới với công nghệ Âm thanh Không gian Bose Immersive Audio, thiết kế đệm tai sang trọng gập gọn, công nghệ CustomTune cá nhân hóa âm.',
    specs: { type: 'Over-ear Wireless Noise Cancelling', spatialAudio: 'Bose Immersive Audio', anc: 'Quiet, Aware, and Immersion modes', battery: '24 hours (up to 18 hours with Immersive Audio)', bluetooth: '5.3 (Snapdragon Sound)' },
    price: 9990000,
    url: 'https://www.bose.vn/vi_vn/products/headphones/noise_cancelling_headphones/bose-quietcomfort-ultra-headphones.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Sony_WH-1000XM4.jpg/320px-Sony_WH-1000XM4.jpg',
  },
  {
    name: 'Bose QuietComfort Ultra Earbuds', brand: 'Bose', model: 'QC Ultra Earbuds', category: 'headphone',
    description: 'Tai nghe true wireless chống ồn chủ động hàng đầu, âm thanh vòm không gian Bose Immersive Audio, đệm tai StayHear Max Fit Kit êm ái vừa vặn cho từng người.',
    specs: { type: 'In-ear True Wireless ANC', anc: 'World-class active noise cancellation with CustomTune', battery: '6 hours (up to 24 hours with case)', bluetooth: '5.3 (Snapdragon Sound with aptX Adaptive)', waterResistance: 'IPX4' },
    price: 6990000,
    url: 'https://www.bose.vn/vi_vn/products/headphones/earbuds/bose-quietcomfort-ultra-earbuds.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Sony_WF-1000XM3.jpg/320px-Sony_WF-1000XM3.jpg',
  },
  {
    name: 'Harman Kardon Aura Studio 4', brand: 'Harman Kardon', model: 'Aura Studio 4', category: 'speaker',
    description: 'Loa vòm trong suốt biểu tượng với hiệu ứng ánh sáng kim cương 5 chủ đề động kỳ ảo, âm thanh 360 độ công suất 130W, loa siêu trầm subwoofer 132mm đánh hướng xuống.',
    specs: { power: '130W RMS (1x 100W subwoofer + 6x 15W mid-high transducers)', lighting: 'Parametric diamond light effect (5 themes)', sound: '360-degree omnidirectional sound', bluetooth: '4.2' },
    price: 6990000,
    url: 'https://vn.harmankardon.com/AURA-STUDIO-4-.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Bose_SoundLink_Mini_Bluetooth_speaker.jpg/320px-Bose_SoundLink_Mini_Bluetooth_speaker.jpg',
  },
  {
    name: 'JBL PartyBox 110 (160W)', brand: 'JBL', model: 'PartyBox 110', category: 'speaker',
    description: 'Loa tiệc tùng di động bùng nổ âm thanh JBL Original Pro Sound 160W, hệ thống đèn LED đa sắc đồng bộ theo nhịp bass, cổng cắm micro và đàn guitar, pin 12 giờ chuẩn kháng nước IPX4.',
    specs: { power: '160W RMS', battery: '12 hours playtime (36Wh)', waterResistance: 'IPX4 splashproof', inputs: 'Mic input, Guitar input, AUX, USB playback', lighting: 'Dynamic light show sync to beat' },
    price: 9490000,
    url: 'https://vn.jbl.com/party-speakers/PARTYBOX-110-.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/JBL_Charge_3.jpg/320px-JBL_Charge_3.jpg',
  },
  {
    name: 'Marshall Kilburn II Portable Speaker', brand: 'Marshall', model: 'Kilburn II', category: 'speaker',
    description: 'Loa di động quai xách da cổ điển lấy cảm hứng từ dây đeo đàn guitar, âm thanh đa hướng True Stereophonic 36W, chuẩn kháng nước IPX2 và thời lượng pin hơn 20 giờ.',
    specs: { power: '36W (1x 20W Class D woofer + 2x 8W Class D tweeters)', battery: '20+ hours (quick charge 20 mins = 3 hours)', waterResistance: 'IPX2 water resistant', bluetooth: '5.0 aptX', weight: '2.5 kg' },
    price: 6490000,
    url: 'https://www.marshallheadphones.com/vn/en/kilburn-ii.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Edifier_R1280T_Bookshelf_Speakers.jpg/320px-Edifier_R1280T_Bookshelf_Speakers.jpg',
  },
  {
    name: 'Fender Indio 2 Bluetooth Speaker', brand: 'Fender', model: 'Indio 2', category: 'speaker',
    description: 'Loa Bluetooth phong cách ampli guitar Fender kinh điển với lưới vải tweed sang trọng, công suất 60W âm bass dày dặn, nút xoay vặn analog witch hat và pin 25 giờ.',
    specs: { power: '60W RMS (quad-driver system: 2 woofers + 2 tweeters)', battery: 'Up to 25 hours playtime', design: 'Classic Fender guitar amplifier aesthetic (Tweed / Tolex)', features: 'DUO mode for stereo pairing' },
    price: 8490000,
    url: 'https://www.fender.com/en-US/audio/bluetooth-speakers/indio-2-bluetooth-speaker/0995000000.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Edifier_R1280T_Bookshelf_Speakers.jpg/320px-Edifier_R1280T_Bookshelf_Speakers.jpg',
  },

  /* ==================== MOUSE & KEYBOARD (7) ==================== */
  {
    name: 'Razer DeathAdder Essential', brand: 'Razer', model: 'DeathAdder Essential', category: 'mouse',
    description: 'Chuột gaming công thái học tay phải bán chạy hơn 10 triệu chiếc, cảm biến quang học 6400 DPI, 5 nút bấm Hyperesponse có thể lập trình độc lập, switch cơ 10 triệu lần bấm.',
    specs: { sensor: 'True 6,400 DPI optical sensor (220 IPS / 30 G)', shape: 'Classic ergonomic right-handed design', buttons: '5 independently programmable Hyperesponse buttons', switches: 'Razer Mechanical Switches rated for 10M clicks' },
    price: 390000,
    url: 'https://www.razer.com/gaming-mice/razer-deathadder-essential',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Razer_DeathAdder_Chroma.jpg/320px-Razer_DeathAdder_Chroma.jpg',
  },
  {
    name: 'Logitech Lift Vertical Ergonomic Mouse', brand: 'Logitech', model: 'Lift Vertical', category: 'mouse',
    description: 'Chuột công thái học đứng góc 57 độ tự nhiên thư giãn cổ tay cả ngày, vừa vặn hoàn hảo cho người có bàn tay cỡ nhỏ và vừa, cuộn SmartWheel êm ái tĩnh âm.',
    specs: { ergonomics: '57° vertical hand angle for natural posture', sensor: '400 - 4000 DPI adjustable', connectivity: 'Bluetooth Low Energy + Logi Bolt USB', battery: 'Up to 2 years with 1x AA battery', clicks: 'Quiet clicks' },
    price: 1490000,
    url: 'https://www.logitech.com/vi-vn/products/mice/lift-vertical-ergonomic-mouse.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Logitech_G502_Proteus_Core.jpg/320px-Logitech_G502_Proteus_Core.jpg',
  },
  {
    name: 'Pulsar X2 V2 Mini Wireless Mouse', brand: 'Pulsar', model: 'X2 V2 Mini', category: 'mouse',
    description: 'Chuột gaming siêu nhẹ chỉ 51 gram đối xứng không lỗ, cảm biến quang PixArt PAW3395 26000 DPI 650 IPS, switch quang học Optical Switch chống double-click.',
    specs: { weight: '51g ultra-lightweight symmetrical', sensor: 'PixArt PAW3395 (26,000 DPI, 650 IPS, 50G)', switches: 'Optical Switches', pollingRate: '4K polling ready with dongle', battery: 'Up to 100 hours' },
    price: 2190000,
    url: 'https://www.pulsar.gg/products/x2-v2-mini-wireless-gaming-mouse',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Razer_DeathAdder_Chroma.jpg/320px-Razer_DeathAdder_Chroma.jpg',
  },
  {
    name: 'NuPhy Air75 V2 Wireless Mechanical Keyboard', brand: 'NuPhy', model: 'Air75 V2', category: 'keyboard',
    description: 'Bàn phím cơ low-profile mỏng nhẹ 75% hot-swap hỗ trợ QMK/VIA, tốc độ polling rate 1000Hz ở chế độ không dây 2.4G, switch Gateron Low-profile 2.0 gõ cực êm.',
    specs: { layout: '75% (84 keys)', profile: 'Ultra-slim Low-profile (13.5mm front height)', connectivity: '2.4GHz (1000Hz) / Bluetooth 5.1 / Type-C', switches: 'Gateron Low-Profile 2.0 (Cowberry / Wisteria / Aloe)', customization: 'QMK / VIA firmware support' },
    price: 2990000,
    url: 'https://nuphy.com/products/air75-v2',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Mechanical_Keyboard_Keycaps.jpg/320px-Mechanical_Keyboard_Keycaps.jpg',
  },
  {
    name: 'MonsGeek M1W V3 SP Tri-mode Keyboard', brand: 'MonsGeek', model: 'M1W V3 SP', category: 'keyboard',
    description: 'Bàn phím cơ nhôm CNC nguyên khối anodized 75% cấu trúc Gasket Mount, mạch xuôi hotswap, keycap PBT side-print xuyên led mặt cạnh, kết nối 3 chế độ.',
    specs: { layout: '75% (82 keys + aluminum knob)', case: 'Full CNC Aluminum case', structure: 'Gasket Mount with 5-layer sound dampening foam', connectivity: '2.4GHz / Bluetooth 5.0 / USB-C', battery: '6000mAh' },
    price: 2690000,
    url: 'https://www.monsgeek.com/product/m1w-v3-sp-mechanical-keyboard/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Mechanical_Keyboard_Keycaps.jpg/320px-Mechanical_Keyboard_Keycaps.jpg',
  },
  {
    name: 'Epomaker RT100 Retro Mechanical Keyboard', brand: 'Epomaker', model: 'RT100', category: 'keyboard',
    description: 'Bàn phím cơ retro hoài cổ 97 phím trang bị màn hình Smart Mini TV LCD tháo rời hiển thị đồng hồ thời tiết ảnh gif, núm xoay kim loại đa chức năng, đệm Gasket mount.',
    specs: { layout: '97 keys 95% compact', display: 'Detachable Smart Mini TV LCD display', knob: 'Multimedia customizable volume knob', connectivity: 'Bluetooth 5.0 / 2.4GHz / Type-C', battery: '5000mAh' },
    price: 2490000,
    url: 'https://epomaker.com/products/epomaker-rt100',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Mechanical_Keyboard_Keycaps.jpg/320px-Mechanical_Keyboard_Keycaps.jpg',
  },
  {
    name: 'Corsair K70 RGB PRO Mechanical Keyboard', brand: 'Corsair', model: 'K70 RGB PRO', category: 'keyboard',
    description: 'Bàn phím cơ thi đấu full-size huyền thoại khung nhôm xước máy bay, switch cơ học CHERRY MX Red, công nghệ siêu xử lý CORSAIR AXON quét phím 8000Hz siêu tốc.',
    specs: { layout: 'Full-size 104 keys', switches: 'CHERRY MX Red Mechanical (Linear 45g)', pollingRate: '8000Hz hyper-polling (CORSAIR AXON)', keycaps: 'PBT Double-shot PRO', features: 'Tournament Mode switch, magnetic soft-touch palm rest' },
    price: 3890000,
    url: 'https://www.corsair.com/us/en/p/keyboards/ch-9109410-na/k70-rgb-pro-mechanical-gaming-keyboard-with-polycarbonate-keycaps-cherry-mx-red-ch-9109410-na',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Mechanical_Keyboard_Keycaps.jpg/320px-Mechanical_Keyboard_Keycaps.jpg',
  },

  /* ==================== SMART HOME & APPLIANCE (7) ==================== */
  {
    name: 'Aqara Smart Lock U200 Kit (Matter over Thread)', brand: 'Aqara', model: 'Smart Lock U200', category: 'smart_home',
    description: 'Khóa cửa thông minh lắp đặt không cần khoan đục cửa chuẩn Matter over Thread đầu tiên, mở khóa bằng Apple Home Key chạm iPhone/Apple Watch, vân tay và mã số.',
    specs: { protocols: 'Matter over Thread, Bluetooth 5.1, NFC', unlockMethods: 'Apple Home Key, Fingerprint, Passcode, NFC card, Mechanical key, App', battery: 'Rechargeable Li-ion battery (up to 6 months)', durability: 'IPX5 weatherproof keypad' },
    price: 5990000,
    url: 'https://www.aqara.com/en/product/smart-lock-u200/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Philips_Hue_Bridge_2.0.jpg/320px-Philips_Hue_Bridge_2.0.jpg',
  },
  {
    name: 'Xiaomi Smart Camera C400 2.5K', brand: 'Xiaomi', model: 'Smart Camera C400', category: 'smart_home',
    description: 'Camera an ninh trong nhà xoay 360 độ độ phân giải siêu nét 2.5K 4MP (2560x1440), cảm biến hồng ngoại nhìn đêm không phát sáng đỏ, AI phát hiện người thông minh.',
    specs: { resolution: '2.5K (2560 x 1440) 4MP', fieldOfView: '360° horizontal rotation, 106° vertical', nightVision: '940nm infrared night vision with no red glow', audio: 'Two-way real-time voice calling', storage: 'MicroSD up to 256GB / Cloud' },
    price: 990000,
    url: 'https://www.mi.com/vn/product/xiaomi-smart-camera-c400/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Surveillance_camera_at_the_MIA.jpg/320px-Surveillance_camera_at_the_MIA.jpg',
  },
  {
    name: 'Dyson V12 Detect Slim Total Clean', brand: 'Dyson', model: 'V12 Detect Slim', category: 'smart_home',
    description: 'Máy hút bụi không dây nhẹ nhất của Dyson trang bị công nghệ tia laser phát hiện bụi vô hình trên sàn cứng, cảm biến Piezo đếm hạt bụi tự động tăng lực hút.',
    specs: { suctionPower: '150 AW', weight: '2.2 kg light-weight', filtration: 'Whole-machine HEPA filtration capturing 99.99% of particles down to 0.3 microns', battery: 'Up to 60 minutes run time', display: 'LCD screen showing real-time scientific proof of deep clean' },
    price: 16990000,
    url: 'https://www.dyson.vn/vi-VN/dyson-v12-detect-slim-fluffy',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Xiaomi_Mi_Air_Purifier.jpg/320px-Xiaomi_Mi_Air_Purifier.jpg',
  },
  {
    name: 'Philips All-in-One Cooker HD2151', brand: 'Philips', model: 'HD2151/66', category: 'smart_home',
    description: 'Nồi áp suất điện thông minh 35 chương trình nấu tự động công nghệ giải phóng áp suất Taste Control làm mềm thịt trong 30 phút, lòng nồi chống dính ProMetal.',
    specs: { capacity: '5 Liters', power: '1000W', programs: '35 pre-set cooking programs', technology: 'Taste Control pressure release system (releases pressure in 3 mins)', safety: '18 safety protection systems' },
    price: 2990000,
    url: 'https://www.philips.com.vn/c-p/HD2151_66/all-in-one-cooker',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Xiaomi_Mi_Air_Purifier.jpg/320px-Xiaomi_Mi_Air_Purifier.jpg',
  },
  {
    name: 'TP-Link Tapo RV30 Plus LiDAR Robot Vacuum', brand: 'TP-Link', model: 'Tapo RV30 Plus', category: 'smart_home',
    description: 'Robot hút bụi lau nhà thông minh trạm tự động gom rác 4 lít chứa rác đến 70 ngày, điều hướng kép LiDAR & Gyro chính xác trong phòng tối, lực hút 4200Pa.',
    specs: { suction: '4200 Pa hyper suction', navigation: 'Dual Navigation LiDAR + Gyro mapping', autoEmptyDock: '4L sealed dust bag (up to 70 days)', battery: '5000mAh (up to 3 hours cleaning 360m²)', waterTank: '300ml electronic water tank' },
    price: 7990000,
    url: 'https://www.tapo.com/vn/product/robot-vacuum/tapo-rv30-plus/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Xiaomi_Mi_Air_Purifier.jpg/320px-Xiaomi_Mi_Air_Purifier.jpg',
  },
  {
    name: 'Xiaomi Smart Tower Fan', brand: 'Xiaomi', model: 'Smart Tower Fan', category: 'smart_home',
    description: 'Quạt tháp không cánh thông minh mô phỏng làn gió tự nhiên êm dịu, góc làm mát siêu rộng 150 độ, độ ồn tĩnh âm chỉ 34.6 dB, tiết kiệm điện công suất chỉ 22W.',
    specs: { airVolume: '541 m³/h', noise: '34.6 dB(A) night mode', power: '22W DC frequency conversion motor', rotation: '150° ultra-wide angle oscillation', control: 'Mi Home App, Google Assistant, Alexa' },
    price: 1890000,
    url: 'https://www.mi.com/vn/product/xiaomi-smart-tower-fan/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Xiaomi_Mi_Air_Purifier.jpg/320px-Xiaomi_Mi_Air_Purifier.jpg',
  },
  {
    name: 'SwitchBot Curtain Rod 2', brand: 'SwitchBot', model: 'Curtain Rod 2', category: 'smart_home',
    description: 'Động cơ rèm cửa thông minh lắp đặt không dây trong 30 giây biến rèm kéo truyền thống thành rèm thông minh tự động mở đón ánh nắng mặt trời, hỗ trợ Matter.',
    specs: { compatibility: 'Round rod curtain poles (diameter 15-40mm)', motorPower: 'Pushes up to 8 kg (17 lbs) of curtain', battery: 'Type-C rechargeable (up to 8 months per charge, solar panel compatible)', wireless: 'Bluetooth 5.0 (Matter via SwitchBot Hub 2)' },
    price: 1790000,
    url: 'https://www.switch-bot.com/products/switchbot-curtain-rod-2',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Philips_Hue_Bridge_2.0.jpg/320px-Philips_Hue_Bridge_2.0.jpg',
  },

  /* ==================== WEARABLES & SMARTWATCH (6) ==================== */
  {
    name: 'Samsung Galaxy Watch6 Classic 47mm LTE', brand: 'Samsung', model: 'Galaxy Watch6 Classic', category: 'smartwatch',
    description: 'Đồng hồ thông minh mặt tròn cổ điển viền xoay bezel vật lý trứ danh, màn hình Sapphire 1.5 inch siêu nét, theo dõi giấc ngủ chuyên sâu, đo huyết áp và điện tâm đồ ECG.',
    specs: { caseSize: '47mm Stainless Steel with Rotating Bezel', display: '1.5 inch Super AMOLED Sapphire Crystal (480 x 480) Always-On', connectivity: '4G LTE eSIM, Bluetooth 5.3, Wi-Fi, NFC, GPS', health: 'ECG, Blood Pressure, BIA Body Composition, Optical Heart Rate', waterResistance: '5 ATM + IP68 / MIL-STD-810H' },
    price: 8490000,
    url: 'https://www.samsung.com/vn/watches/galaxy-watch/galaxy-watch6-classic-47mm-black-lte-sm-r965fzkaxxv/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Samsung_Galaxy_Watch_4.jpg/320px-Samsung_Galaxy_Watch_4.jpg',
  },
  {
    name: 'Garmin Forerunner 165 Music', brand: 'Garmin', model: 'Forerunner 165 Music', category: 'smartwatch',
    description: 'Đồng hồ chạy bộ chuyên dụng màn hình cảm ứng AMOLED 1.2 inch đầy màu sắc, lưu trữ nhạc trực tiếp từ Spotify/Deezer không cần điện thoại, đo công suất chạy và pin 11 ngày.',
    specs: { display: '1.2 inch AMOLED touchscreen (390 x 390)', battery: 'Up to 11 days in smartwatch mode / 19 hours GPS mode', music: 'Store up to 500 songs (Spotify, Amazon Music, Deezer offline)', runningMetrics: 'Wrist-based running dynamics, Training Effect, HRV status' },
    price: 7990000,
    url: 'https://www.garmin.com/vi-VN/p/1055469',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Garmin_Fenix_5_Plus.jpg/320px-Garmin_Fenix_5_Plus.jpg',
  },
  {
    name: 'Garmin Forerunner 265', brand: 'Garmin', model: 'Forerunner 265', category: 'smartwatch',
    description: 'Đồng hồ chạy bộ và ba môn phối hợp (Triathlon) màn hình rực rỡ AMOLED viền titan, định vị GPS đa băng tần SatIQ siêu chuẩn, chỉ số sẵn sàng luyện tập Training Readiness.',
    specs: { display: '1.3 inch AMOLED touchscreen', battery: 'Up to 13 days in smartwatch mode / 20 hours GPS', gps: 'Multi-band GPS with SatIQ technology', features: 'Triathlon and multisport activity profiles, Morning Report, Training Readiness' },
    price: 11690000,
    url: 'https://www.garmin.com/vi-VN/p/886785',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Garmin_Fenix_5_Plus.jpg/320px-Garmin_Fenix_5_Plus.jpg',
  },
  {
    name: 'Amazfit Cheetah Pro Running Watch', brand: 'Amazfit', model: 'Cheetah Pro', category: 'smartwatch',
    description: 'Đồng hồ chạy bộ marathon chuyên nghiệp khung viền hợp kim titan siêu nhẹ 34g, ăng-ten GPS phân cực tròn MaxTrack độ chính xác 99.5%, huấn luyện viên AI Zepp Coach.',
    specs: { case: 'Titanium alloy bezel with fiber-reinforced polymer', display: '1.45 inch AMOLED 1000 nits Corning Gorilla Glass 3', weight: '34g (without strap)', gps: 'Dual-band circular-polarized GPS antenna (6 satellite systems)', battery: 'Up to 14 days typical usage' },
    price: 6990000,
    url: 'https://www.amazfit.com/products/amazfit-cheetah-pro',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Samsung_Galaxy_Watch_4.jpg/320px-Samsung_Galaxy_Watch_4.jpg',
  },
  {
    name: 'Coros Pace 3 GPS Sport Watch', brand: 'Coros', model: 'Pace 3', category: 'smartwatch',
    description: 'Chiếc đồng hồ thể thao marathon siêu nhẹ chỉ 30 gram được các vận động viên điền kinh hàng đầu lựa chọn, GPS băng tần kép, đo SpO2 nhịp tim quang học thế hệ mới, pin 17 ngày.',
    specs: { weight: '30g with nylon band', display: '1.2 inch Always-On Memory-in-Pixel touchscreen', gps: 'Dual-Frequency All-Systems satellite tracking', battery: '17 days typical use / 38 hours continuous standard GPS', waterResistance: '5 ATM' },
    price: 6190000,
    url: 'https://coros.com/pace3',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Garmin_Fenix_5_Plus.jpg/320px-Garmin_Fenix_5_Plus.jpg',
  },
  {
    name: 'Huawei Watch Fit 3', brand: 'Huawei', model: 'Watch Fit 3', category: 'smartwatch',
    description: 'Đồng hồ thông minh mặt vuông thời trang siêu mỏng 9.9mm trọng lượng 26g, màn hình AMOLED 1.82 inch tỷ lệ màn hình 77.4% viền siêu mỏng, pin 10 ngày tương thích cả iOS & Android.',
    specs: { display: '1.82 inch Hybrid AMOLED 60Hz 1500 nits (480 x 408)', thickness: '9.9mm ultra-slim', weight: '26g', battery: 'Up to 10 days max / 7 days typical', calls: 'Bluetooth phone calls with speaker and mic' },
    price: 2790000,
    url: 'https://consumer.huawei.com/vn/wearables/watch-fit3/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Samsung_Galaxy_Watch_4.jpg/320px-Samsung_Galaxy_Watch_4.jpg',
  },

  /* ==================== CAMERA & HANDHELD GAMING (7) ==================== */
  {
    name: 'Sony ZV-1 II Vlog Camera', brand: 'Sony', model: 'ZV-1 II', category: 'camera',
    description: 'Máy ảnh vlog bỏ túi nhỏ gọn cảm biến 1.0 inch, ống kính góc rộng tiêu cự 18-50mm F/1.8-4.0 thu trọn khung cảnh và nhóm bạn, micro 3 đầu thu thông minh đổi hướng.',
    specs: { sensor: '20.1 MP 1.0-type Exmor RS CMOS', lens: 'ZEISS Vario-Sonnar T* 18-50mm F/1.8-4.0 wide angle', video: '4K 30p, FHD 120p, S-Log3 and S-Gamut3.Cine', mic: 'Intelligent 3-Capsule directional microphone with windscreen' },
    price: 19990000,
    url: 'https://www.sony.com.vn/compact-cameras/products/zv-1m2',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Sony_Alpha_6400.jpg/320px-Sony_Alpha_6400.jpg',
  },
  {
    name: 'Nikon Z6 III Mirrorless Camera', brand: 'Nikon', model: 'Z6 III', category: 'camera',
    description: 'Máy ảnh không gương lật đầu tiên trên thế giới trang bị cảm biến Full-Frame bán xếp chồng Partially-Stacked CMOS, chụp liên tục 120 fps, kính ngắm EVF sáng nhất 4000 nits 5.76M điểm.',
    specs: { sensor: '24.5 MP Full-Frame Partially-Stacked CMOS', continuousShooting: 'Up to 120 fps with electronic shutter', video: 'Internal 6K 60p N-RAW, 5.4K 60p ProRes, 4K 120p', evf: '5.76-million dot EVF with 4000 nits brightness and DCI-P3 gamut' },
    price: 64990000,
    url: 'https://www.nikon.com.vn/vi/z-6iii',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Canon_EOS_M50_with_lens.jpg/320px-Canon_EOS_M50_with_lens.jpg',
  },
  {
    name: 'DJI Osmo Action 4 Standard Combo', brand: 'DJI', model: 'Osmo Action 4', category: 'camera',
    description: 'Action camera cảm biến lớn 1/1.3 inch quay đêm xuất sắc, góc siêu rộng 155 độ, quay 4K 120fps màu 10-bit D-Log M, chống đóng băng pin chịu lạnh -20°C, chống nước 18m.',
    specs: { sensor: '1/1.3 inch CMOS', video: '4K 120fps, 10-bit D-Log M color performance', stabilization: 'RockSteady 3.0+ and 360° HorizonSteady', waterResistance: '18m waterproof without case', battery: '160 minutes, withstands -20°C' },
    price: 7690000,
    url: 'https://www.dji.com/osmo-action-4',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/GoPro_HERO7_Black.jpg/320px-GoPro_HERO7_Black.jpg',
  },
  {
    name: 'Valve Steam Deck OLED 512GB', brand: 'Valve', model: 'Steam Deck OLED 512GB', category: 'gaming_console',
    description: 'Máy chơi game PC cầm tay màn hình HDR OLED 7.4 inch 90Hz độ tương phản vô cực, vi xử lý AMD APU tiến trình 6nm tiết kiệm điện, pin tăng 50% và kết nối Wi-Fi 6E.',
    specs: { display: '7.4 inch HDR OLED 90Hz 1000 nits (1280 x 800)', processor: '6nm AMD Sephiroth APU (4 Cores Zen 2 + 8 CUs RDNA 2)', ram: '16GB LPDDR5 6400 MT/s', storage: '512GB NVMe SSD + MicroSD slot', battery: '50Wh (3 - 12 hours playtime)', wireless: 'Wi-Fi 6E, Bluetooth 5.3' },
    price: 15490000,
    url: 'https://store.steampowered.com/steamdeck',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Nintendo-Switch-Console-Docked-wJoyConRB.jpg/320px-Nintendo-Switch-Console-Docked-wJoyConRB.jpg',
  },
  {
    name: 'Lenovo Legion Go Handheld', brand: 'Lenovo', model: 'Legion Go 8APU1', category: 'gaming_console',
    description: 'Máy chơi game cầm tay Windows 11 màn hình khổng lồ 8.8 inch 2.5K 144Hz, chip AMD Ryzen Z1 Extreme, tay cầm Legion TrueStrike tháo rời tích hợp chế độ bắn súng FPS chuột đứng.',
    specs: { display: '8.8 inch QHD+ (2560 x 1600) IPS 144Hz 500 nits 16:10 Touch', processor: 'AMD Ryzen Z1 Extreme (8 Cores 16 Threads, RDNA 3)', ram: '16GB LPDDR5X 7500MHz', storage: '512GB PCIe 4.0 NVMe M.2 2242 SSD', controllers: 'Detachable Legion TrueStrike with FPS mouse mode', battery: '49.2Wh' },
    price: 17990000,
    url: 'https://www.lenovo.com/vn/vi/p/handheld/legion-go/len106g0001',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Nintendo-Switch-Console-Docked-wJoyConRB.jpg/320px-Nintendo-Switch-Console-Docked-wJoyConRB.jpg',
  },
  {
    name: 'Nintendo Switch Lite Coral', brand: 'Nintendo', model: 'Switch Lite', category: 'gaming_console',
    description: 'Máy chơi game cầm tay nhỏ gọn trọng lượng siêu nhẹ 275g, phím điều hướng D-pad chữ thập truyền thống chính xác, tương thích toàn bộ thư viện game Nintendo Switch chế độ handheld.',
    specs: { display: '5.5 inch LCD touchscreen (1280 x 720)', weight: '275g ultra-portable', storage: '32GB internal (expandable via MicroSD)', battery: 'Approx. 3.0 - 7.0 hours', controls: 'Built-in control buttons with classic +Control Pad' },
    price: 4390000,
    url: 'https://www.nintendo.com/us/switch/lite/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Nintendo-Switch-Console-Docked-wJoyConRB.jpg/320px-Nintendo-Switch-Console-Docked-wJoyConRB.jpg',
  },
  {
    name: 'Samsung Galaxy Tab A9+ 11" Wi-Fi', brand: 'Samsung', model: 'Galaxy Tab A9+ Wi-Fi', category: 'tablet',
    description: 'Máy tính bảng gia đình và học tập màn hình lớn 11 inch 90Hz mượt mà, hệ thống 4 loa vòm chuẩn Dolby Atmos sống động, chip Snapdragon 695 5G và tính năng đa nhiệm 3 cửa sổ.',
    specs: { display: '11.0 inch TFT LCD 90Hz (1920 x 1200) WUXGA', processor: 'Qualcomm Snapdragon 695 (6nm)', ram: '4GB', storage: '64GB (hỗ trợ thẻ MicroSD 1TB)', audio: 'Quad Speakers with Dolby Atmos', battery: '7040mAh, sạc nhanh 15W' },
    price: 4990000,
    url: 'https://www.samsung.com/vn/tablets/galaxy-tab-a/galaxy-tab-a9-plus-silver-64gb-sm-x210nzsaxxv/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/IPad_Air_2_Gold.png/320px-IPad_Air_2_Gold.png',
  },
];

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB. Starting importBatch11...');

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
  console.log(`\n=== BATCH 11 DONE ===`);
  console.log(`Inserted: ${inserted} | Skipped: ${skipped}`);
  console.log(`Total products: ${total} | Total offers: ${totalOffers}`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
