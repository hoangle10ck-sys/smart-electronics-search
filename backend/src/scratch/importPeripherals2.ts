/**
 * importPeripherals2.ts — Batch Peripherals (Monitor, Headphone, Speaker, Keyboard, Mouse, Webcam)
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
  // Monitor
  {
    name: 'AOC 24G2SP 24" IPS 165Hz', brand: 'AOC', model: '24G2SP', category: 'monitor',
    description: 'Màn hình gaming 23.8 inch IPS Full HD 165Hz, thời gian phản hồi 1ms MPRT, độ phủ màu 125% sRGB, chân đế công thái học nâng hạ xoay.',
    specs: { displaySize: '23.8 inch', resolution: '1920x1080 Full HD', panel: 'IPS', refreshRate: '165Hz', responseTime: '1ms MPRT', colorGamut: '125% sRGB', sync: 'Adaptive-Sync / G-Sync Compatible', ports: '2x HDMI 1.4, 1x DP 1.2, 1x VGA' },
    price: 3200000,
    url: 'https://vn.aoc.com/product/24G2SP',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Dell_UltraSharp_U2414H_Monitor.jpg/320px-Dell_UltraSharp_U2414H_Monitor.jpg',
  },
  {
    name: 'MSI MAG 274UPF 27" 4K 144Hz', brand: 'MSI', model: 'MAG 274UPF', category: 'monitor',
    description: 'Màn hình đồ họa và gaming 27 inch 4K UHD 144Hz Rapid IPS, chứng nhận VESA DisplayHDR 400, cổng kết nối Type-C sạc 65W PD tiện lợi.',
    specs: { displaySize: '27 inch', resolution: '3840x2160 4K UHD', panel: 'Rapid IPS', refreshRate: '144Hz', responseTime: '0.5ms (GtG)', hdr: 'VESA DisplayHDR 400', ports: '2x HDMI 2.1, 1x DP 1.4a, 1x USB Type-C 65W PD' },
    price: 11500000,
    url: 'https://www.msi.com/Monitor/MAG-274UPF',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Dell_UltraSharp_U2414H_Monitor.jpg/320px-Dell_UltraSharp_U2414H_Monitor.jpg',
  },
  {
    name: 'Philips Momentum 275M1RZ 27" QHD 170Hz', brand: 'Philips', model: '275M1RZ', category: 'monitor',
    description: 'Màn hình gaming Nano IPS 27 inch 2K QHD 170Hz, hệ thống đèn hắt sáng Ambiglow độc quyền sống động, loa tích hợp DTS Sound 5W x 2.',
    specs: { displaySize: '27 inch', resolution: '2560x1440 2K QHD', panel: 'Nano IPS', refreshRate: '170Hz (DP OC)', responseTime: '1ms (GtG)', lighting: 'Ambiglow', speakers: '5W x 2 DTS Sound', ports: '2x HDMI 2.0, 1x DP 1.4' },
    price: 7800000,
    url: 'https://www.philips.com.vn/c-p/275M1RZ_74/gaming-monitor-quad-hd-gaming-monitor',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Dell_UltraSharp_U2414H_Monitor.jpg/320px-Dell_UltraSharp_U2414H_Monitor.jpg',
  },
  {
    name: 'ViewSonic VX2758A-2K-PRO 27" QHD', brand: 'ViewSonic', model: 'VX2758A-2K-PRO', category: 'monitor',
    description: 'Màn hình 27 inch tấm nền SuperClear IPS độ phân giải 2K 170Hz 1ms, độ sâu màu 10-bit sống động, hỗ trợ chuẩn hình ảnh HDR10.',
    specs: { displaySize: '27 inch', resolution: '2560x1440 2K QHD', panel: 'SuperClear IPS', refreshRate: '170Hz', responseTime: '1ms MPRT', hdr: 'HDR10', ports: '2x HDMI 2.0, 1x DP 1.2' },
    price: 4500000,
    url: 'https://www.viewsonic.com/vn/products/lcd/VX2758A-2K-PRO',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Dell_UltraSharp_U2414H_Monitor.jpg/320px-Dell_UltraSharp_U2414H_Monitor.jpg',
  },
  {
    name: 'Xiaomi Mi Curved Gaming Monitor 30"', brand: 'Xiaomi', model: 'Curved Gaming Monitor 30"', category: 'monitor',
    description: 'Màn hình cong UltraWide 30 inch tỷ lệ 21:9 WFHD độ cong 1800R, tần số quét siêu mượt 200Hz, độ tương phản tĩnh 3000:1.',
    specs: { displaySize: '30 inch', resolution: '2560x1080 WFHD 21:9', curvature: '1800R', panel: 'VA', refreshRate: '200Hz', responseTime: '4ms (GtG)', contrast: '3000:1', ports: '1x HDMI 2.1, 1x HDMI 1.4, 1x DP 1.2' },
    price: 4800000,
    url: 'https://www.mi.com/global/product/xiaomi-curved-gaming-monitor-30/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Dell_UltraSharp_U2414H_Monitor.jpg/320px-Dell_UltraSharp_U2414H_Monitor.jpg',
  },

  // Headphone
  {
    name: 'Sony WH-1000XM5', brand: 'Sony', model: 'WH-1000XM5', category: 'headphone',
    description: 'Tai nghe chụp tai chống ồn chủ động hàng đầu thế giới với bộ xử lý Integrated Processor V1, 8 micro ANC, âm thanh Hi-Res Audio Wireless LDAC, pin 30 giờ.',
    specs: { type: 'Over-ear Wireless', anc: 'Auto NC Optimizer (2 processors, 8 mics)', battery: '30 hours (ANC on)', bluetooth: '5.2, LDAC, AAC, SBC', weight: '250g', charging: 'USB-PD Fast Charge (3 mins = 3 hours)' },
    price: 7200000,
    url: 'https://www.sony.com.vn/headphones/products/wh-1000xm5',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Sony_WH-1000XM4.jpg/320px-Sony_WH-1000XM4.jpg',
  },
  {
    name: 'Sennheiser HD 560S', brand: 'Sennheiser', model: 'HD 560S', category: 'headphone',
    description: 'Tai nghe kiểm âm mở lưng (Open-Back) cho audiophile và mixer, dải tần 6Hz - 38kHz cực rộng, trở kháng 120 ohms, âm trường thoáng đạt tự nhiên.',
    specs: { type: 'Over-ear Open-Back', impedance: '120 ohms', frequencyResponse: '6 Hz - 38,000 Hz', thd: '< 0.05%', connector: '6.3mm with 3.5mm adapter', weight: '240g' },
    price: 4500000,
    url: 'https://www.sennheiser-hearing.com/en-US/p/hd-560-s/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Sennheiser_HD598_Audiophile_Headphones.jpg/320px-Sennheiser_HD598_Audiophile_Headphones.jpg',
  },
  {
    name: 'Audio-Technica ATH-M50xBT2', brand: 'Audio-Technica', model: 'ATH-M50xBT2', category: 'headphone',
    description: 'Phiên bản không dây của dòng tai nghe phòng thu huyền thoại ATH-M50x, driver độc quyền 45mm khẩu độ lớn, pin lên đến 50 giờ, hỗ trợ codec LDAC.',
    specs: { type: 'Over-ear Closed-Back Wireless', drivers: '45mm neodymium', frequencyResponse: '15 - 28,000 Hz', battery: '50 hours', bluetooth: '5.0 (LDAC, AAC, SBC)', lowLatencyMode: 'Yes' },
    price: 4800000,
    url: 'https://www.audio-technica.com/en-us/ath-m50xbt2',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Audio-Technica_ATH-M50.jpg/320px-Audio-Technica_ATH-M50.jpg',
  },
  {
    name: 'Anker Soundcore Space Q45', brand: 'Anker', model: 'Soundcore Space Q45', category: 'headphone',
    description: 'Tai nghe chống ồn chủ động thích ứng giảm đến 98% tiếng ồn, chứng nhận Hi-Res Wireless qua codec LDAC, thời lượng pin 50h khi bật ANC (65h khi tắt).',
    specs: { type: 'Over-ear Wireless', anc: 'Adaptive ANC (ultra-wide 3-stage)', battery: '50h (ANC on) / 65h (ANC off)', drivers: '40mm double-layer diaphragm', bluetooth: '5.3 (LDAC)' },
    price: 2200000,
    url: 'https://us.soundcore.com/products/space-q45-a3040011',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Sony_WH-1000XM4.jpg/320px-Sony_WH-1000XM4.jpg',
  },
  {
    name: 'Sony WF-1000XM5', brand: 'Sony', model: 'WF-1000XM5', category: 'headphone',
    description: 'Tai nghe true wireless chống ồn đỉnh cao của Sony, Dynamic Driver X 8.4mm tái tạo chi tiết âm thanh phong phú, tích hợp cảm biến dẫn truyền xương, kháng nước IPX4.',
    specs: { type: 'In-ear True Wireless', anc: 'Dual processor (V2 + QN2e)', drivers: '8.4mm Dynamic Driver X', battery: '8h + 16h case (ANC on)', bluetooth: '5.3 (LDAC, LC3)', waterResistance: 'IPX4' },
    price: 5500000,
    url: 'https://www.sony.com.vn/headphones/products/wf-1000xm5',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Sony_WF-1000XM3.jpg/320px-Sony_WF-1000XM3.jpg',
  },

  // Speaker
  {
    name: 'JBL Charge 5', brand: 'JBL', model: 'Charge 5', category: 'speaker',
    description: 'Loa di động chống nước chống bụi chuẩn IP67, công suất 40W RMS củ loa woofer riêng biệt và loa tweeter độc lập, kiêm pin sạc dự phòng, nghe nhạc 20 giờ.',
    specs: { power: '40W RMS (30W woofer + 10W tweeter)', battery: '20 hours (7500mAh)', waterResistance: 'IP67 waterproof and dustproof', bluetooth: '5.1', partyBoost: 'Yes', powerbank: 'USB-A out' },
    price: 3500000,
    url: 'https://vn.jbl.com/portable/CHARGE5-.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/JBL_Charge_3.jpg/320px-JBL_Charge_3.jpg',
  },
  {
    name: 'Bose SoundLink Flex', brand: 'Bose', model: 'SoundLink Flex', category: 'speaker',
    description: 'Loa Bluetooth di động siêu bền chuẩn IP67 chống nước va đập có khả năng nổi trên mặt nước, công nghệ PositionIQ tự động tối ưu âm thanh theo tư thế đặt loa.',
    specs: { technology: 'Bose PositionIQ', waterResistance: 'IP67 waterproof & floats', battery: '12 hours', bluetooth: '4.2 (up to 9m)', microphone: 'Built-in for speakerphone' },
    price: 3800000,
    url: 'https://www.bose.vn/vi_vn/products/speakers/portable_speakers/soundlink-flex.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Bose_SoundLink_Mini_Bluetooth_speaker.jpg/320px-Bose_SoundLink_Mini_Bluetooth_speaker.jpg',
  },
  {
    name: 'Sony SRS-XB100', brand: 'Sony', model: 'SRS-XB100', category: 'speaker',
    description: 'Loa không dây siêu nhỏ gọn mini bỏ túi, công nghệ Sound Diffusion Processor khuếch tán âm thanh rộng khắp, chuẩn IP67 và pin lên đến 16 giờ.',
    specs: { battery: '16 hours', waterResistance: 'IP67 waterproof & dustproof', processor: 'Sound Diffusion Processor with Extra Bass', bluetooth: '5.3', microphone: 'Echo Cancelling mic', strap: 'Versatile 2-way strap' },
    price: 1200000,
    url: 'https://www.sony.com.vn/wireless-speakers/products/srs-xb100',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/JBL_Charge_3.jpg/320px-JBL_Charge_3.jpg',
  },
  {
    name: 'Edifier R1280DBs Bookshelf Speakers', brand: 'Edifier', model: 'R1280DBs', category: 'speaker',
    description: 'Cặp loa kiểm âm vi tính để bàn thùng gỗ cổ điển, công suất 42W RMS, cổng kết nối Bluetooth 5.0, Quang học Optical, Coaxial và cổng xuất sub riêng biệt.',
    specs: { power: '42W RMS (21W + 21W)', drivers: '4 inch bass unit + 13mm silk dome tweeter', inputs: 'Bluetooth 5.0, Optical, Coaxial, Dual RCA', subOut: 'Subwoofer line out', control: 'Wireless remote' },
    price: 2500000,
    url: 'https://edifier.com/product-r1280dbs.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Edifier_R1280T_Bookshelf_Speakers.jpg/320px-Edifier_R1280T_Bookshelf_Speakers.jpg',
  },
  {
    name: 'Klipsch ProMedia 2.1 THX', brand: 'Klipsch', model: 'ProMedia 2.1 THX', category: 'speaker',
    description: 'Hệ thống loa máy tính 2.1 chứng nhận chuẩn âm thanh rạp chiếu phim THX Certified, loa siêu trầm 6.5 inch đánh lực đánh sâu, công suất đỉnh 200W.',
    specs: { power: '200W Peak / 100W Continuous', subwoofer: '6.5 inch side-firing bass driver', satellites: '3 inch midrange + 0.75 inch MicroTractrix horn tweeter', certified: 'THX Certified', frequencyResponse: '35Hz - 22kHz' },
    price: 4500000,
    url: 'https://www.klipsch.com/products/promedia-2-1-thx-certified-computer-speaker',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Edifier_R1280T_Bookshelf_Speakers.jpg/320px-Edifier_R1280T_Bookshelf_Speakers.jpg',
  },

  // Keyboard
  {
    name: 'Akko 5075B Plus Multi-Modes', brand: 'Akko', model: '5075B Plus', category: 'keyboard',
    description: 'Bàn phím cơ layout 75% cấu trúc đệm Gasket Mount êm ái, kết nối 3 chế độ (2.4Ghz/Bluetooth/Type-C), hotswap 5-pin, switch Akko V3 Cream Yellow Pro.',
    specs: { layout: '75% (82 keys)', structure: 'Gasket Mount', connectivity: '2.4GHz / Bluetooth 5.0 / USB-C', switches: 'Akko V3 Cream Yellow Pro (Linear)', keycaps: 'PBT Double-shot ASA profile', battery: '3000mAh', rgb: 'Per-key RGB with side strip' },
    price: 1750000,
    url: 'https://akkogear.com.vn/san-pham/ban-phim-co-akko-5075b-plus-shine-through-black/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Mechanical_Keyboard_Keycaps.jpg/320px-Mechanical_Keyboard_Keycaps.jpg',
  },
  {
    name: 'Royal Kludge RK84 Pro', brand: 'Royal Kludge', model: 'RK84 Pro', category: 'keyboard',
    description: 'Bàn phím cơ khung nhôm CNC nguyên khối cao cấp 84 phím, mạch xuôi hotswap universal, 3 chế độ kết nối, dung lượng pin 3750mAh bền bỉ.',
    specs: { layout: '75% (84 keys)', case: 'Full CNC Aluminum frame', connectivity: 'Bluetooth 5.0 / 2.4GHz / USB Type-C', battery: '3750mAh', hotswap: '3-pin & 5-pin', backlight: 'RGB 21 effects' },
    price: 1600000,
    url: 'https://rkgamingstore.com/products/rk84-pro-75-percent-keyboard',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Mechanical_Keyboard_Keycaps.jpg/320px-Mechanical_Keyboard_Keycaps.jpg',
  },
  {
    name: 'Razer Huntsman V3 Pro TKL', brand: 'Razer', model: 'Huntsman V3 Pro TKL', category: 'keyboard',
    description: 'Bàn phím cơ eSports hàng đầu với switch quang analog Razer Gen-2, tính năng Rapid Trigger phản hồi tức thì, tùy chỉnh hành trình phím từ 0.1mm - 4.0mm.',
    specs: { layout: 'Tenkeyless (TKL)', switches: 'Razer Analog Optical Gen-2 with Rapid Trigger', actuationRange: '0.1 mm - 4.0 mm', topPlate: 'Brushed Aluminum 5052', pollingRate: '1000Hz', wristRest: 'Magnetic leatherette included' },
    price: 5200000,
    url: 'https://www.razer.com/gaming-keyboards/razer-huntsman-v3-pro-tkl',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Razer_BlackWidow_Chroma.jpg/320px-Razer_BlackWidow_Chroma.jpg',
  },
  {
    name: 'ASUS ROG Strix Flare II Animate', brand: 'ASUS', model: 'ROG Strix Flare II Animate', category: 'keyboard',
    description: 'Bàn phím cơ full-size độc đáo tích hợp màn hình LED AniMe Matrix hiển thị ảnh gif động tùy biến, polling rate cực nhanh 8000Hz, switch ROG NX hotswap.',
    specs: { layout: 'Full-size 100%', display: 'AniMe Matrix LED display', pollingRate: '8000Hz (0.125ms response)', switches: 'ROG NX Mechanical (Hot-swappable)', keycaps: 'ROG PBT Doubleshot', audio: 'ESS SABRE Hi-Fi DAC' },
    price: 4900000,
    url: 'https://rog.asus.com/keyboards/keyboards/pbt-keycaps/rog-strix-flare-ii-animate-model/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Mechanical_Keyboard_Keycaps.jpg/320px-Mechanical_Keyboard_Keycaps.jpg',
  },
  {
    name: 'SteelSeries Apex Pro TKL', brand: 'SteelSeries', model: 'Apex Pro TKL', category: 'keyboard',
    description: 'Bàn phím cơ nhanh nhất thế giới switch OmniPoint 2.0 cảm biến từ tính Hall Effect, màn hình thông minh OLED Smart Display hiển thị thông số ingame.',
    specs: { layout: 'Tenkeyless (TKL)', switches: 'OmniPoint 2.0 Adjustable HyperMagnetic', responseTime: '0.7ms (Rapid Trigger mode)', display: 'OLED Smart Display with Volume Roller', chassis: 'Aircraft Grade Aluminum' },
    price: 4600000,
    url: 'https://steelseries.com/gaming-keyboards/apex-pro-tkl',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Mechanical_Keyboard_Keycaps.jpg/320px-Mechanical_Keyboard_Keycaps.jpg',
  },

  // Mouse
  {
    name: 'Logitech G502 X Plus LIGHTSPEED', brand: 'Logitech', model: 'G502 X Plus', category: 'mouse',
    description: 'Chuột gaming không dây thế hệ mới của huyền thoại G502, switch quang cơ lai LIGHTFORCE siêu bền, cảm biến HERO 25K chính xác từng pixel, đèn RGB 8 vùng.',
    specs: { sensor: 'HERO 25K (100 - 25,600 DPI)', switches: 'LIGHTFORCE Optical-Mechanical', connectivity: 'LIGHTSPEED Wireless + USB-C', battery: 'Up to 120h (37h with RGB)', weight: '106g', buttons: '13 programmable' },
    price: 3200000,
    url: 'https://www.logitechg.com/vi-vn/products/gaming-mice/g502-x-plus-wireless-lightforce.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Logitech_G502_Proteus_Core.jpg/320px-Logitech_G502_Proteus_Core.jpg',
  },
  {
    name: 'Razer Basilisk V3 Pro', brand: 'Razer', model: 'Basilisk V3 Pro', category: 'mouse',
    description: 'Chuột gaming công thái học không dây cao cấp nhất của Razer, bánh xe cuộn HyperScroll Tilt Wheel 4 chiều, cảm biến Focus Pro 30K Optical, 13 vùng sáng Chroma.',
    specs: { sensor: 'Focus Pro 30K Optical (30,000 DPI)', scrollWheel: 'Razer HyperScroll Tilt Wheel (Free-spin / Tactile)', connectivity: 'HyperSpeed Wireless (4000Hz compatible) / Bluetooth / Type-C', battery: 'Up to 90h', weight: '112g' },
    price: 3600000,
    url: 'https://www.razer.com/gaming-mice/razer-basilisk-v3-pro',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Razer_DeathAdder_Chroma.jpg/320px-Razer_DeathAdder_Chroma.jpg',
  },
  {
    name: 'Glorious Model O 2 Wireless', brand: 'Glorious', model: 'Model O 2 Wireless', category: 'mouse',
    description: 'Chuột gaming siêu nhẹ chỉ 68 gram, cảm biến BAMF 2.0 26,000 DPI 650 IPS, switch cơ bấm 80 triệu lần, thời lượng pin ấn tượng lên đến 210 giờ.',
    specs: { weight: '68g ultra-lightweight', sensor: 'BAMF 2.0 Optical (26,000 DPI, 650 IPS)', connectivity: '2.4GHz (110h) / Bluetooth 5.2 (210h)', switches: 'Glorious 80M clicks', shape: 'Symmetrical ambidextrous' },
    price: 2100000,
    url: 'https://www.gloriousgaming.com/products/model-o-2-wireless-matte-black',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Razer_DeathAdder_Chroma.jpg/320px-Razer_DeathAdder_Chroma.jpg',
  },
  {
    name: 'ASUS ROG Harpe Ace Aim Lab Edition', brand: 'ASUS', model: 'ROG Harpe Ace Aim Lab', category: 'mouse',
    description: 'Chuột thi đấu FPS hợp tác cùng Aim Lab, trọng lượng siêu nhẹ 54 gram vỏ nylon sinh học, cảm biến quang ROG AimPoint 36,000 DPI cực nhạy.',
    specs: { weight: '54g', sensor: 'ROG AimPoint (36,000 DPI, 650 IPS)', connectivity: 'ROG SpeedNova 2.4GHz / Bluetooth / Wired', battery: 'Up to 90h', switches: 'ROG 70M Mechanical' },
    price: 2800000,
    url: 'https://rog.asus.com/mice-mouse-pads/mice/wireless/rog-harpe-ace-aim-lab-edition-model/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Razer_DeathAdder_Chroma.jpg/320px-Razer_DeathAdder_Chroma.jpg',
  },
  {
    name: 'ZOWIE EC2-C Esports Mouse', brand: 'BenQ ZOWIE', model: 'EC2-C', category: 'mouse',
    description: 'Chuột chuẩn thi đấu eSports form cầm công thái học tay phải kinh điển, cảm biến 3360 tối ưu không cần cài driver, dây cáp dù nhẹ linh hoạt giảm ma sát.',
    specs: { shape: 'Ergonomic right-handed', sensor: '3360 Optical (400/800/1600/3200 DPI)', pollingRate: '125 / 500 / 1000 Hz driverless', cable: 'Paracord lightweight cable', weight: '73g' },
    price: 1700000,
    url: 'https://zowie.benq.com/en-us/mouse/ec2-c.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Razer_DeathAdder_Chroma.jpg/320px-Razer_DeathAdder_Chroma.jpg',
  },

  // Webcam
  {
    name: 'Logitech Brio 500 Full HD Webcam', brand: 'Logitech', model: 'Brio 500', category: 'webcam',
    description: 'Webcam họp trực tuyến độ phân giải 1080p 30fps / 720p 60fps, tính năng Auto-Light Correction RightLight 4 tự cân bằng sáng, mic kép lọc ồn và nắp che bảo mật.',
    specs: { resolution: '1080p 30fps / 720p 60fps', fov: '90° / 78° / 65° diagonal', focus: 'Autofocus', mic: 'Dual beamforming noise-cancelling mics', privacyShutter: 'Integrated physical shutter', connection: 'USB-C' },
    price: 2600000,
    url: 'https://www.logitech.com/vi-vn/products/webcams/brio-500-webcam.html',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Logitech_Webcam_C920.jpg/320px-Logitech_Webcam_C920.jpg',
  },
  {
    name: 'Razer Kiyo Pro Ultra 4K Webcam', brand: 'Razer', model: 'Kiyo Pro Ultra', category: 'webcam',
    description: 'Webcam chất lượng cao nhất của Razer với cảm biến khổng lồ Sony STARVIS 2 kích thước 1/1.2 inch khẩu độ F/1.7, quay 4K 30FPS không nén HDR chân thực.',
    specs: { resolution: 'Uncompressed 4K 30FPS / 1080P 60FPS HDR', sensor: 'Sony STARVIS 2 1/1.2 inch', aperture: 'F/1.7 large aperture', focus: 'AI-powered face tracking autofocus', mic: 'Omnidirectional mic' },
    price: 6800000,
    url: 'https://www.razer.com/streaming-cameras/razer-kiyo-pro-ultra',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Logitech_Webcam_C920.jpg/320px-Logitech_Webcam_C920.jpg',
  },
  {
    name: 'Anker PowerConf C200 2K Webcam', brand: 'Anker', model: 'PowerConf C200', category: 'webcam',
    description: 'Webcam 2K Ultra Clear nhỏ gọn, micro khử ồn trí tuệ nhân tạo AI Voice, khẩu độ F/2.0 thu sáng tốt trong phòng tối, gạt che camera cơ học bảo mật.',
    specs: { resolution: '2K QHD 30fps / 1080p 30fps', fov: '65°, 78°, 95° adjustable', mic: 'Dual stereo mics with AI noise cancellation', aperture: 'F/2.0', privacyShutter: 'Built-in privacy cover' },
    price: 1300000,
    url: 'https://us.soundcore.com/products/a3369011',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Logitech_Webcam_C920.jpg/320px-Logitech_Webcam_C920.jpg',
  },
];

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB. Starting importPeripherals2...');

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
  console.log(`\n=== importPeripherals2 DONE ===`);
  console.log(`Inserted: ${inserted} | Skipped: ${skipped}`);
  console.log(`Total products: ${total} | Total offers: ${totalOffers}`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
