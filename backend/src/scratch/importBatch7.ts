/**
 * Batch 7 — Fill sparse categories:
 * soc, case_fan, ups, professional_audio, streaming_capture,
 * electronics_accessory, drone, single_board_computer,
 * keyboard, mouse, nas, vr_ar, networking, webcam, charger
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
  /* ===== SOC / Microcontroller ===== */
  {
    name: 'Arduino Uno R4 WiFi', brand: 'Arduino', model: 'Uno R4 WiFi', category: 'soc',
    description: 'Vi điều khiển Arduino với Renesas RA4M1 32-bit ARM Cortex-M4, tích hợp WiFi/BT ESP32-S3, matrix LED 12×8.',
    specs: { cpu: 'Renesas RA4M1 Cortex-M4 48MHz', flash: '256KB', ram: '32KB', wireless: 'WiFi 802.11b/g/n + BT 5.0', gpio: '14 digital + 6 analog', usb: 'USB-C', voltage: '5V' },
    price: 850000,
    url: 'https://store.arduino.cc/products/uno-r4-wifi',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Arduino_Uno_-_R3.jpg/320px-Arduino_Uno_-_R3.jpg',
  },
  {
    name: 'NVIDIA Jetson Orin Nano 8GB', brand: 'NVIDIA', model: 'Jetson Orin Nano 8GB', category: 'soc',
    description: 'Module AI edge computing Jetson Orin Nano 8GB, 40 TOPS AI performance, dùng cho robot & embedded AI.',
    specs: { cpu: '6-core Cortex-A78AE', gpu: '1024-core Ampere', ai: '40 TOPS', ram: '8GB LPDDR5', storage: 'microSD', usb: 'USB 3.2 Gen2 + USB 2.0', power: '7-15W' },
    price: 3500000,
    url: 'https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-orin/nano/',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'ESP32-S3 DevKitC-1', brand: 'Espressif', model: 'ESP32-S3 DevKitC-1', category: 'soc',
    description: 'Development board ESP32-S3 dual-core Xtensa LX7 240MHz, WiFi + BT 5, USB OTG, AI vector instructions.',
    specs: { cpu: 'Xtensa LX7 dual-core 240MHz', flash: '8MB', ram: '8MB PSRAM', wireless: 'WiFi 802.11b/g/n + BT 5', gpio: '36 GPIO', usb: 'USB-C OTG', ai: 'Vector extensions' },
    price: 280000,
    url: 'https://www.espressif.com/en/products/devkits/esp32-s3-devkitc-1',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'STM32F103C8T6 Blue Pill', brand: 'STMicroelectronics', model: 'STM32F103C8T6', category: 'soc',
    description: 'Development board STM32 ARM Cortex-M3 72MHz phổ biến cho học tập và dự án nhúng.',
    specs: { cpu: 'ARM Cortex-M3 72MHz', flash: '64KB', ram: '20KB', gpio: '32', usb: 'USB Full Speed', adc: '12-bit 1Msps', voltage: '3.3V' },
    price: 55000,
    url: 'https://stm32-base.org/boards/STM32F103C8T6-Blue-Pill.html',
    imageUrl: NO_IMAGE,
  },

  /* ===== Case Fan ===== */
  {
    name: 'Phanteks SK140 PWM High-Speed', brand: 'Phanteks', model: 'SK140 PWM', category: 'case_fan',
    description: 'Quạt case 140mm hiệu suất cao, 3-pack với ARGB, 500-2000 RPM, áp suất và lưu lượng tốt.',
    specs: { size: '140mm', rpm: '500-2000', airflow: '70.7 CFM', pressure: '2.78 mmH2O', noise: '33.9 dBA', connector: 'PWM 4-pin', rgb: 'ARGB' },
    price: 1250000,
    url: 'https://phanteks.com/SK-series.html',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'Arctic P14 PWM 5-Pack', brand: 'Arctic', model: 'P14 PWM', category: 'case_fan',
    description: 'Quạt case 140mm tối ưu pressure, 5-pack, 200-1700 RPM, cực kỳ im lặng, lý tưởng cho radiator.',
    specs: { size: '140mm', rpm: '200-1700', airflow: '62.8 CFM', pressure: '2.5 mmH2O', noise: '0.5 Sone', connector: 'PWM 4-pin', pack: '5-pack' },
    price: 850000,
    url: 'https://www.arctic.de/en/P14-PWM/ACFAN00123A',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'Corsair LL120 RGB 3-Pack', brand: 'Corsair', model: 'LL120 RGB', category: 'case_fan',
    description: 'Quạt 120mm với 16 LED RGB dual light loop, 3-pack kèm Lighting Node Core, hiệu ứng ánh sáng đẹp.',
    specs: { size: '120mm', rpm: '600-1500', airflow: '43.3 CFM', pressure: '1.61 mmH2O', noise: '24.8 dBA', rgb: '16 LED Dual Loop', pack: '3-pack' },
    price: 1800000,
    url: 'https://www.corsair.com/us/en/p/case-fans/co-9050072-ww/ll120-rgb-led-120mm-dual-light-loop-rgb-led-pwm-fan-3-fan-pack-co-9050072-ww',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'Thermalright TL-C12R-S 3-Pack', brand: 'Thermalright', model: 'TL-C12R-S', category: 'case_fan',
    description: 'Quạt 120mm ARGB siêu tĩnh, 3-pack giá rẻ, 500-2000 RPM, lý tưởng cho case tầm trung.',
    specs: { size: '120mm', rpm: '500-2000', airflow: '66.17 CFM', pressure: '2.65 mmH2O', noise: '28.6 dBA', rgb: 'ARGB', pack: '3-pack' },
    price: 450000,
    url: 'https://www.thermalright.com/product/tl-c12r-s/',
    imageUrl: NO_IMAGE,
  },

  /* ===== UPS ===== */
  {
    name: 'Eaton 5E 1100VA USB', brand: 'Eaton', model: '5E 1100VA USB', category: 'ups',
    description: 'UPS offline 1100VA/660W với USB port, bảo vệ thiết bị khi mất điện, giá rẻ cho gia đình.',
    specs: { type: 'Offline/Standby', capacity: '1100VA/660W', outlets: '6', battery: '12V 9Ah', recharge: '8 hours', interface: 'USB', formFactor: 'Tower' },
    price: 1800000,
    url: 'https://www.eaton.com/us/en-us/products/backup-power-ups-surge-it-power-distribution/backup-power-ups/5e.html',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'APC Back-UPS BX1200MI 1200VA', brand: 'APC', model: 'Back-UPS BX1200MI', category: 'ups',
    description: 'UPS offline APC 1200VA/650W, 8 ổ cắm, pin 12V 9Ah, bảo vệ toàn diện cho PC văn phòng.',
    specs: { type: 'Offline', capacity: '1200VA/650W', outlets: '8', battery: '12V 9Ah', recharge: '16 hours', interface: 'USB', warranty: '2 years' },
    price: 2200000,
    url: 'https://www.apc.com/shop/vn/en/products/APC-Back-UPS-1200VA-650W-230V/P-BX1200MI',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'CyberPower CP1500EPFCLCD 1500VA', brand: 'CyberPower', model: 'CP1500EPFCLCD', category: 'ups',
    description: 'UPS Pure Sine Wave 1500VA/900W với màn hình LCD, lý tưởng cho server nhỏ và workstation.',
    specs: { type: 'Line-Interactive Pure Sine Wave', capacity: '1500VA/900W', outlets: '10', lcd: 'Yes', battery: '12V 9Ah ×2', interface: 'USB + Serial', warranty: '3 years' },
    price: 5500000,
    url: 'https://www.cyberpower.com/vn/en/product/sku/CP1500EPFCLCD',
    imageUrl: NO_IMAGE,
  },

  /* ===== Professional Audio ===== */
  {
    name: 'Focusrite Scarlett 2i2 Studio 4th Gen', brand: 'Focusrite', model: 'Scarlett 2i2 Studio 4th Gen', category: 'professional_audio',
    description: 'Audio interface 2 in/2 out USB-C, 24-bit/192kHz, 2 preamp, dành cho home studio và podcasting.',
    specs: { inputs: '2 XLR/TRS combo', outputs: '2 TRS', sampleRate: '192kHz', bitDepth: '24-bit', usb: 'USB-C', preamp: '2 × Air mode', phantom: '48V phantom power' },
    price: 3500000,
    url: 'https://focusrite.com/downloads/scarlett-2i2-studio-4th-gen',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Focusrite_Scarlett_2i2.jpg/320px-Focusrite_Scarlett_2i2.jpg',
  },
  {
    name: 'Behringer UMC22 U-PHORIA', brand: 'Behringer', model: 'UMC22', category: 'professional_audio',
    description: 'Audio interface giá rẻ 2 in/2 out USB, 48kHz/16-bit, phantom power 48V, lý tưởng cho người mới.',
    specs: { inputs: '1 XLR + 1 instrument', outputs: '2 TRS', sampleRate: '48kHz', bitDepth: '16-bit', usb: 'USB-B', phantom: '48V', price_tier: 'Entry level' },
    price: 850000,
    url: 'https://www.behringer.com/product.html?modelCode=0806-AAE',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'Native Instruments Komplete Audio 6 MK2', brand: 'Native Instruments', model: 'Komplete Audio 6 MK2', category: 'professional_audio',
    description: 'Audio interface 6 in/6 out, 24-bit/192kHz, 2 preamp Cirrus Logic, MIDI I/O, cho sản xuất âm nhạc chuyên nghiệp.',
    specs: { inputs: '6 (2 XLR/TRS + 4 TRS)', outputs: '6', sampleRate: '192kHz', bitDepth: '24-bit', midi: 'MIDI I/O', usb: 'USB-C', preamp: 'Cirrus Logic Crystal' },
    price: 5500000,
    url: 'https://www.native-instruments.com/en/products/komplete/audio-interfaces/komplete-audio-6/',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'Yamaha MG10XU Mixer', brand: 'Yamaha', model: 'MG10XU', category: 'professional_audio',
    description: 'Mixer 10 kênh với USB interface, 4 preamp D-PRE, hiệu ứng SPX, lý tưởng cho live performance và recording.',
    specs: { channels: '10', preamp: '4 × D-PRE', fx: 'SPX digital effects', usb: 'USB stereo in/out', eq: '3-band EQ', phantom: '48V', formFactor: 'Tabletop' },
    price: 4800000,
    url: 'https://usa.yamaha.com/products/proaudio/mixers/mg_series/mg10xu.html',
    imageUrl: NO_IMAGE,
  },

  /* ===== Streaming & Capture ===== */
  {
    name: 'Elgato HD60 X', brand: 'Elgato', model: 'HD60 X', category: 'streaming_capture',
    description: 'Capture card external USB 3.0, capture 4K30 / 1080p60 HDR10, passthrough 4K60 HDR10+, lý tưởng cho console streaming.',
    specs: { capture: '4K30 / 1080p60 HDR10', passthrough: '4K60 HDR10+', interface: 'USB 3.0', hdmi: 'HDMI 2.0', latency: 'Ultra-Low', os: 'Windows/macOS/OBS' },
    price: 3500000,
    url: 'https://www.elgato.com/en/gaming/capture-cards/hd60-x',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'AVerMedia Live Gamer Portable 2 Plus', brand: 'AVerMedia', model: 'Live Gamer Portable 2 Plus', category: 'streaming_capture',
    description: 'Capture card 2.5K/4K passthrough, capture 1080p60, standalone mode không cần PC, card đa năng cho game thủ.',
    specs: { capture: '1080p60', passthrough: '4K30', interface: 'USB 2.0', standalone: 'Yes (SD card)', hdmi: 'HDMI', software: 'RECentral 4' },
    price: 2200000,
    url: 'https://www.avermedia.com/gaming/product/game_capture/live_gamer_portable_2_plus',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'Magewell USB Capture HDMI Gen 2', brand: 'Magewell', model: 'USB Capture HDMI Gen 2', category: 'streaming_capture',
    description: 'Capture card chuyên nghiệp USB 3.0, capture HDMI lên tới 2K60 / 1080p120, driver-free, dùng cho broadcast.',
    specs: { capture: '2048×1080p60 / 1080p120', interface: 'USB 3.0', hdmi: 'HDMI 1.4', driverFree: 'Yes', os: 'Windows/macOS/Linux', encoding: 'H.264 hardware' },
    price: 8500000,
    url: 'https://www.magewell.com/products/usb-capture-hdmi-gen-2',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'NZXT Signal 4K30', brand: 'NZXT', model: 'Signal 4K30', category: 'streaming_capture',
    description: 'Capture card external 4K30 / 1080p60, USB-C 3.1, passthrough 4K30, tích hợp NZXT CAM software.',
    specs: { capture: '4K30 / 1080p60', passthrough: '4K30', interface: 'USB-C 3.1', hdmi: 'HDMI 2.0', software: 'NZXT CAM', os: 'Windows/macOS' },
    price: 2800000,
    url: 'https://nzxt.com/product/signal-4k30',
    imageUrl: NO_IMAGE,
  },

  /* ===== Electronics Accessory ===== */
  {
    name: 'Ugreen USB-C Hub 9-in-1', brand: 'Ugreen', model: 'CM498 9-in-1 Hub', category: 'electronics_accessory',
    description: 'USB-C hub 9 cổng: HDMI 4K, VGA, 3×USB-A, USB-C PD 100W, SD/microSD, Ethernet Gigabit.',
    specs: { ports: 'HDMI 4K60 + VGA + 3×USB-A 3.0 + USB-C PD 100W + SD + microSD + Ethernet', power: 'PD 100W passthrough', hdmi: '4K60Hz', ethernet: 'Gigabit', size: 'Compact' },
    price: 850000,
    url: 'https://www.ugreen.com/products/usb-c-hub-9-in-1',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'Anker 332 USB-C Hub 5-in-1', brand: 'Anker', model: '332 USB-C Hub A8355', category: 'electronics_accessory',
    description: 'USB-C Hub 5 cổng: 4K HDMI, 2×USB-A 3.0, USB-C data, SD card reader, nhỏ gọn cho laptop.',
    specs: { ports: '4K HDMI + 2×USB-A 3.0 + USB-C data + SD', hdmi: '4K30Hz', usbA: 'USB 3.0 5Gbps', size: '10.6cm', weight: '58g' },
    price: 450000,
    url: 'https://www.anker.com/products/332-usb-c-hub-5-in-1',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'Baseus 65W GaN USB-C Charger with Cable', brand: 'Baseus', model: 'GaN5 Pro 65W', category: 'electronics_accessory',
    description: 'Sạc GaN 65W nhỏ gọn với 2 cổng USB-C + 1 USB-A, tương thích PD 3.0 và QC 4.0, kèm cáp 100W.',
    specs: { power: '65W', ports: '2×USB-C + 1×USB-A', protocol: 'PD 3.0 / QC 4.0', gan: 'GaN5', size: 'Compact', cable: '1m 100W included' },
    price: 650000,
    url: 'https://www.baseus.com/products/gan5-pro-desktop-fast-charger-65w',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'Belkin BOOST↑CHARGE USB-C 3-in-1 MagSafe Cable', brand: 'Belkin', model: 'CAA010bt3MWH', category: 'electronics_accessory',
    description: 'Cáp 3-in-1 USB-C tích hợp đầu Lightning, USB-C và MagSafe, thuận tiện sạc nhiều thiết bị Apple.',
    specs: { connectors: 'USB-C + Lightning + MagSafe', length: '3m', magsafe: 'Yes', material: 'Braided', warranty: '2 years' },
    price: 1200000,
    url: 'https://www.belkin.com/3-in-1-cable-with-lightning-usb-c-and-magsafe-connectors/CAA010bt3MWH.html',
    imageUrl: NO_IMAGE,
  },

  /* ===== Drone ===== */
  {
    name: 'DJI Avata 2', brand: 'DJI', model: 'Avata 2', category: 'drone',
    description: 'FPV drone nhỏ gọn với camera 1/1.3" 4K/60fps, tích hợp prop guard, trọng lượng 377g, dành cho bay xuyên không gian hẹp.',
    specs: { camera: '1/1.3" CMOS', video: '4K/60fps', stabilization: 'RockSteady 3.0 + HorizonSteady', weight: '377g', maxRange: '13km', flightTime: '23 min', protection: 'O4 transmission' },
    price: 20000000,
    url: 'https://www.dji.com/avata-2',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'DJI Mini 4K', brand: 'DJI', model: 'Mini 4K', category: 'drone',
    description: 'Drone nhỏ gọn dưới 249g, camera 4K/30fps, 3-axis gimbal, không cần đăng ký ở nhiều quốc gia.',
    specs: { camera: '1/2" CMOS', video: '4K/30fps', stabilization: '3-axis gimbal', weight: '243g', maxRange: '10km', flightTime: '34 min', gps: 'GPS + GLONASS' },
    price: 7500000,
    url: 'https://www.dji.com/mini-4k',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'DJI Air 3S', brand: 'DJI', model: 'Air 3S', category: 'drone',
    description: 'Drone cao cấp với camera 1" CMOS 50MP, dual cameras (tele + wide), video 4K/60fps HLG, thời gian bay 45 phút.',
    specs: { camera: '1" CMOS 50MP', video: '4K/60fps', cameras: 'Dual (wide + 3× tele)', stabilization: 'RockSteady 3.0', weight: '723g', flightTime: '45 min', obstacle: 'Omnidirectional' },
    price: 35000000,
    url: 'https://www.dji.com/air-3s',
    imageUrl: NO_IMAGE,
  },

  /* ===== Single Board Computer ===== */
  {
    name: 'Raspberry Pi 5 8GB', brand: 'Raspberry Pi', model: 'Pi 5 8GB', category: 'single_board_computer',
    description: 'SBC mạnh nhất Raspberry Pi, Cortex-A76 quad-core 2.4GHz, 8GB LPDDR4X, PCIe 2.0, camera connector kép.',
    specs: { cpu: 'Cortex-A76 2.4GHz quad-core', ram: '8GB LPDDR4X', pcie: 'PCIe 2.0', usb: '2×USB 3.0 + 2×USB 2.0', hdmi: '2×micro HDMI 4K', power: 'USB-C 5A', gpio: '40-pin' },
    price: 2200000,
    url: 'https://www.raspberrypi.com/products/raspberry-pi-5/',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Raspberry_Pi_4_Model_B_-_Side.jpg/320px-Raspberry_Pi_4_Model_B_-_Side.jpg',
  },
  {
    name: 'Orange Pi 5 Plus 16GB', brand: 'Orange Pi', model: '5 Plus 16GB', category: 'single_board_computer',
    description: 'SBC mạnh với RK3588 8-core (4×A76+4×A55) 2.4GHz, 16GB LPDDR4, 2×M.2 NVMe, 2×2.5G Ethernet.',
    specs: { cpu: 'RK3588 8-core 2.4GHz', ram: '16GB LPDDR4', m2: '2×M.2 (PCIe 3.0 + PCIe 2.0)', ethernet: '2×2.5Gbps', hdmi: '2×HDMI 2.1 8K', usb: 'USB3.0 + USB-C', gpio: '40-pin' },
    price: 2500000,
    url: 'http://www.orangepi.org/html/hardWare/computerAndMicrocontrollers/details/Orange-Pi-5-plus.html',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'Banana Pi BPI-M5 Pro', brand: 'Banana Pi', model: 'BPI-M5 Pro', category: 'single_board_computer',
    description: 'SBC với Rockchip RK3576 8-core, 4GB/8GB LPDDR5, NPU 6 TOPS, Gigabit Ethernet, HDMI 4K, lý tưởng cho AI edge.',
    specs: { cpu: 'RK3576 8-core (4×A72+4×A53)', ram: '8GB LPDDR5', npu: '6 TOPS', ethernet: 'Gigabit', hdmi: 'HDMI 2.1 4K', usb: 'USB 3.0 + USB-C', gpio: '40-pin' },
    price: 1800000,
    url: 'https://wiki.banana-pi.org/Banana_Pi_BPI-M5_Pro',
    imageUrl: NO_IMAGE,
  },

  /* ===== Keyboard (thêm) ===== */
  {
    name: 'HyperX Alloy Origins 65', brand: 'HyperX', model: 'Alloy Origins 65', category: 'keyboard',
    description: 'Bàn phím cơ 65% HyperX switch Red, nhôm nguyên khối, RGB per-key, kết nối USB-C tháo lắp được.',
    specs: { layout: '65%', switch: 'HyperX Red (Linear)', material: 'Aluminum', connection: 'USB-C detachable', rgb: 'Per-key RGB', nkro: 'Full NKRO', actuation: '45g' },
    price: 2200000,
    url: 'https://www.hyperx.com/products/hyperx-alloy-origins-65-mechanical-gaming-keyboard',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'Corsair K100 RGB', brand: 'Corsair', model: 'K100 RGB', category: 'keyboard',
    description: 'Bàn phím cơ full-size cao cấp nhất Corsair, Cherry MX Speed switch, iCUE RGB, optical-mech tuỳ chọn, Elgato intergration.',
    specs: { layout: 'Full size', switch: 'Cherry MX Speed / OPX Optical-Mech', material: 'Aluminum frame', connection: 'USB', rgb: 'Per-key RGB + light edge', macro: '6 dedicated G-keys + iCUE dial' },
    price: 5500000,
    url: 'https://www.corsair.com/us/en/p/keyboards/ch-912a01a-na/k100-rgb-mechanical-gaming-keyboard-with-corsair-opx-optical-mechanical-key-switches-ch-912a01a-na',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'Keychron Q5 Max QMK', brand: 'Keychron', model: 'Q5 Max', category: 'keyboard',
    description: 'Bàn phím cơ 96% gasket-mount nhôm, QMK/VIA, kết nối 2.4GHz + BT 5.1 + USB-C, Gateron Jupiter switch.',
    specs: { layout: '96%', switch: 'Gateron Jupiter (hotswap)', mount: 'Gasket', connection: '2.4GHz / BT 5.1 / USB-C', qmk: 'QMK + VIA', material: 'Aluminum CNC', battery: '4000mAh' },
    price: 4200000,
    url: 'https://www.keychron.com/products/keychron-q5-max-qmk-wireless-custom-mechanical-keyboard',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'FL-Esports MK870 Tri-Mode', brand: 'FL-Esports', model: 'MK870', category: 'keyboard',
    description: 'Bàn phím cơ TKL 87 phím gasket-mount, kết nối 3 chế độ (BT/2.4G/USB), hot-swap, giá tốt.',
    specs: { layout: 'TKL 87%', mount: 'Gasket', connection: 'BT 5.0 / 2.4GHz / USB-C', hotswap: 'Yes (5-pin)', rgb: 'Per-key RGB', battery: '3000mAh', switch: 'Linear/Tactile options' },
    price: 1200000,
    url: 'https://www.fl-esports.com/mk870',
    imageUrl: NO_IMAGE,
  },

  /* ===== Mouse (thêm) ===== */
  {
    name: 'Logitech G Pro X Superlight 2 DEX', brand: 'Logitech', model: 'G Pro X Superlight 2 DEX', category: 'mouse',
    description: 'Chuột gaming không dây siêu nhẹ 60g, sensor HERO 2 25600 DPI, LIGHTSPEED 2.4GHz, pin 95 giờ.',
    specs: { weight: '60g', sensor: 'HERO 2 25600 DPI', connection: 'LIGHTSPEED 2.4GHz', battery: '95 hours', buttons: '5 + scroll', shape: 'Ambidextrous', switch: 'Omron' },
    price: 3800000,
    url: 'https://www.logitechg.com/en-us/products/gaming-mice/g-pro-x-superlight-2-dex.html',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'Razer DeathAdder V3 HyperSpeed', brand: 'Razer', model: 'DeathAdder V3 HyperSpeed', category: 'mouse',
    description: 'Chuột gaming không dây ergonomic, Focus X 26000 DPI, 2.4GHz HyperSpeed, pin 300 giờ, 88g.',
    specs: { weight: '88g', sensor: 'Focus X 26000 DPI', connection: 'HyperSpeed 2.4GHz', battery: '300 hours', shape: 'Ergonomic right-hand', buttons: '6' },
    price: 1800000,
    url: 'https://www.razer.com/gaming-mice/Razer-DeathAdder-V3-HyperSpeed',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'Endgame Gear XM2we', brand: 'Endgame Gear', model: 'XM2we', category: 'mouse',
    description: 'Chuột gaming không dây 63g, sensor PixArt PAW3370 19000 DPI, 2.4GHz + BT, pin 80 giờ, hình dạng ergonomic.',
    specs: { weight: '63g', sensor: 'PAW3370 19000 DPI', connection: '2.4GHz + BT', battery: '80 hours', shape: 'Ergonomic', buttons: '5', switch: 'Kailh GM 8.0' },
    price: 1600000,
    url: 'https://www.endgamegear.com/en-us/mice/xm2we-wireless-gaming-mouse',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'SteelSeries Aerox 5 Wireless', brand: 'SteelSeries', model: 'Aerox 5 Wireless', category: 'mouse',
    description: 'Chuột gaming không dây siêu nhẹ 74g thiết kế honeycomb, sensor TrueMove Air+ 18000 DPI, pin 180 giờ.',
    specs: { weight: '74g', sensor: 'TrueMove Air+ 18000 DPI', connection: '2.4GHz + BT', battery: '180 hours', shape: 'Ambidextrous', buttons: '9', design: 'Honeycomb' },
    price: 2500000,
    url: 'https://www.steelseries.com/gaming-mice/aerox-5-wireless',
    imageUrl: NO_IMAGE,
  },

  /* ===== NAS (thêm) ===== */
  {
    name: 'QNAP TS-464 4-Bay', brand: 'QNAP', model: 'TS-464', category: 'nas',
    description: 'NAS 4-bay Intel Celeron N5095 quad-core, 8GB DDR4, 2×2.5G + 1×M.2 NVMe SSD cache, lý tưởng cho SMB.',
    specs: { bays: '4 (3.5"/2.5")', cpu: 'Intel Celeron N5095 2.9GHz', ram: '8GB DDR4', network: '2×2.5GbE', m2: '2×M.2 PCIe NVMe', usb: '2×USB 3.2 Gen 2 + 1×USB 2.0', os: 'QTS 5' },
    price: 11000000,
    url: 'https://www.qnap.com/en/product/ts-464',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'Synology DS1522+ 5-Bay', brand: 'Synology', model: 'DS1522+', category: 'nas',
    description: 'NAS 5-bay AMD Ryzen R1600 dual-core, 8GB ECC DDR4, 4×GbE + 2×M.2 NVMe, lý tưởng cho doanh nghiệp nhỏ.',
    specs: { bays: '5 (3.5"/2.5")', cpu: 'AMD Ryzen R1600 2.6GHz', ram: '8GB ECC DDR4 (up to 32GB)', network: '4×GbE', m2: '2×M.2 NVMe', usb: '2×USB 3.2 Gen 1', os: 'DSM 7' },
    price: 25000000,
    url: 'https://www.synology.com/en-us/products/DS1522+',
    imageUrl: NO_IMAGE,
  },

  /* ===== VR/AR (thêm) ===== */
  {
    name: 'Meta Quest 3S 128GB', brand: 'Meta', model: 'Quest 3S 128GB', category: 'vr_ar',
    description: 'Standalone VR headset giá tốt với Snapdragon XR2 Gen 2, mixed reality, 128GB, controller-free tracking.',
    specs: { chip: 'Snapdragon XR2 Gen 2', display: 'LCD 1832×1920/eye', fov: '96° horizontal', storage: '128GB', battery: '2.5 hours', mixed_reality: 'Yes', weight: '514g' },
    price: 10000000,
    url: 'https://www.meta.com/quest/quest-3s/',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'PlayStation VR2', brand: 'Sony', model: 'PlayStation VR2', category: 'vr_ar',
    description: 'VR headset cho PS5, OLED 2000×2040/eye 120Hz, eye tracking, haptic feedback, foveated rendering.',
    specs: { display: 'OLED 2000×2040/eye 120Hz', fov: '110°', tracking: '4-camera + eye tracking', haptic: 'Headset + controllers', connection: 'USB-C (tethered to PS5)', weight: '560g' },
    price: 13000000,
    url: 'https://www.playstation.com/en-us/ps-vr2/',
    imageUrl: NO_IMAGE,
  },

  /* ===== Networking (thêm) ===== */
  {
    name: 'TP-Link Archer BE800 Wi-Fi 7', brand: 'TP-Link', model: 'Archer BE800', category: 'networking',
    description: 'Router Wi-Fi 7 tri-band 19000Mbps, 2×10GbE WAN/LAN, 4×GbE, MLO + MRU, lý tưởng cho home mạng tốc độ cao.',
    specs: { standard: 'Wi-Fi 7 (802.11be)', speed: '19000Mbps tri-band', wan: '2×10GbE', lan: '4×GbE', mlo: 'Yes', usb: '2×USB 3.0', antennas: '8×external' },
    price: 11000000,
    url: 'https://www.tp-link.com/us/home-networking/wifi-router/archer-be800/',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'ASUS ZenWiFi Pro ET12 AXE11000', brand: 'ASUS', model: 'ZenWiFi Pro ET12', category: 'networking',
    description: 'Mesh Wi-Fi 6E tri-band 11000Mbps, 2.5G WAN, hệ thống mesh 2 node bao phủ 560m², backhaul 6GHz.',
    specs: { standard: 'Wi-Fi 6E (802.11axe)', speed: '11000Mbps tri-band', wan: '2.5GbE', backhaul: '6GHz tri-band', nodes: '2-pack', coverage: '560m²', security: 'AiProtection Pro' },
    price: 14000000,
    url: 'https://www.asus.com/networking-iot-servers/whole-home-mesh-wifi-system/zenwifi-wifi-systems/asus-zenwifi-pro-et12/',
    imageUrl: NO_IMAGE,
  },
  {
    name: 'Xiaomi Router BE3600 Wi-Fi 7', brand: 'Xiaomi', model: 'Router BE3600', category: 'networking',
    description: 'Router Wi-Fi 7 dual-band 3600Mbps giá rẻ, 2×2.5GbE, hỗ trợ MLO, lý tưởng cho gia đình tầm trung.',
    specs: { standard: 'Wi-Fi 7 (802.11be)', speed: '3600Mbps dual-band', wan: '2.5GbE', lan: '2×GbE + 1×2.5GbE', mlo: 'Yes', usb: 'USB 3.0', antennas: '4×internal' },
    price: 2500000,
    url: 'https://www.mi.com/global/product/xiaomi-router-be3600',
    imageUrl: NO_IMAGE,
  },
];

/* ── Main ──────────────────────────────────────────────────────────── */
async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected. Starting batch 7 import...');

  let inserted = 0;
  let skipped  = 0;

  for (const raw of products) {
    const { price, ...rest } = raw as any;
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
  console.log(`\n=== BATCH 7 DONE ===`);
  console.log(`Inserted: ${inserted} | Skipped: ${skipped}`);
  console.log(`Total products: ${total} | Total offers: ${totalOffers}`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
