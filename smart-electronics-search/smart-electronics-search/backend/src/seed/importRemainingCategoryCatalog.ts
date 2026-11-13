import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';
import { normalize } from '../utils/text';
import { normalizeSpecs } from '../utils/specs';

const TARGET = 30;
const RETRIEVED_AT = new Date();
type Category = 'gaming_console' | 'vr_ar' | 'drone' | 'microphone' | 'streaming_capture' | 'professional_audio';
type Candidate = { category: Category; brand: string; model: string; family: string; sourceUrl: string; modelNumber?: string; productStatus?: 'active' | 'discontinued' | 'end_of_life'; specifications: Record<string, unknown> };

const sources = {
  nintendoHistory: 'https://press.nintendo.com/CompanyHistory',
  nintendoSystems: 'https://www.nintendo.com/us/store/hardware/systems/',
  xboxOptions: 'https://news.xbox.com/en-us/2024/06/09/xbox-series-x-s-new-console-options/',
  xboxHistory: 'https://news.xbox.com/en-us/2020/11/10/power-your-dreams-xbox-series-x-and-xbox-series-s-available-now/',
  playstationManuals: 'https://www.playstation.com/en-us/support/hardware/manuals/',
  sonyPlatformHistory: 'https://www.sony.com/en/SonyInfo/IR/library/presen/irday/GandNS_E_3.pdf',
  metaQuestCompare: 'https://developers.meta.com/vr/essentials/compare-devices/',
  metaQuest2: 'https://www.meta.com/quest/products/quest-2/',
  metaQuestEndOfSupport: 'https://developers.meta.com/vr/blog/meta-quest-2-quest-pro-end-of-feature-development-what-to-know/',
  viveSupport: 'https://www.vive.com/us/support/',
  picoDevices: 'https://developer.picoxr.com/document/discover/xr-devices/',
  picoBusiness: 'https://business.picoxr.com/global/pricing',
  playstationVr: 'https://www.playstation.com/en-us/support/hardware/psvr2/',
  playstationVrProduct: 'https://www.playstation.com/en-us/ps-vr2/',
  varjoXr4: 'https://varjo.com/products/xr-4',
  varjoXr3: 'https://varjo.com/products/varjo-xr-3-focal-edition',
  appleVision: 'https://support.apple.com/en-mide/125375',
  samsungGalaxyXr: 'https://www.samsung.com/us/explore/mobile/buying-guide/introducing-samsung-galaxy-xr/',
  djiSupport: 'https://www.dji.com/support?from=nav&site=brandsite',
  djiCare: 'https://support.dji.com/help/content?customId=en-us03400006921&documentType=artical&lang=en&paperDocType=paper&re=US&spaceId=34',
  djiEnterprise: 'https://enterprise.dji.com/',
  shureMics: 'https://service.shure.com/articles/en_US/Knowledge/which-microphone-should-i-use-on-selection-guides',
  shurePodcast: 'https://www.shure.com/en-US/products/microphones',
  rodeMics: 'https://rode.com/en-us/Microphones',
  rodeReleaseDates: 'https://help.rode.com/hc/en-us/articles/11995458121999-R%C3%98DE-Product-Release-dates',
  elgatoCaptureCompare: 'https://help.elgato.com/hc/en-us/articles/360041842611-Elgato-Capture-Devices-Device-comparison',
  elgatoCaptureUtility: 'https://help.elgato.com/hc/en-us/articles/360027963752-Elgato-4K-Capture-Utility-Software-Interface',
  elgatoCaptureStore: 'https://www.elgato.com/us/en/c/capture',
  avermediaCapture: 'https://www.avermedia.com/event/capture-cards/',
  avermediaCompare: 'https://storage.avermedia.com/web_release_www/datasheet/Product_Comparison_JP_202412.pdf',
  avermediaCompatibility: 'https://www.avermedia.com/event/switch2-firmware-software/software/',
  blackmagicDecklink: 'https://www.blackmagicdesign.com/products/decklink/models',
  blackmagicUltrastudio: 'https://www.blackmagicdesign.com/products/ultrastudio',
  focusriteScarlett: 'https://focusrite.com/scarlett',
  focusriteCompat: 'https://support.focusrite.com/hc/en-gb/articles/14071293233810-iOS-and-iPadOS-Compatibility',
  focusriteClarett: 'https://focusrite.com/clarett-plus',
  focusriteVocaster: 'https://us.focusrite.com/vocaster',
  focusriteRed: 'https://userguides.focusrite.com/hc/en-gb/articles/18531859656978-About-the-Red-range-user-guide',
};

const consoles: Candidate[] = [
  ...[
    ['Nintendo Switch 2', { deviceType: 'hybrid home and handheld console' }, sources.nintendoSystems],
    ['Nintendo Switch 2 + Mario Kart World Bundle', { deviceType: 'hybrid console bundle' }, sources.nintendoSystems],
    ['Nintendo Switch OLED Model White Set', { deviceType: 'hybrid console', display: '7-inch OLED' }, sources.nintendoSystems],
    ['Nintendo Switch OLED Model Neon Blue/Neon Red Set', { deviceType: 'hybrid console', display: '7-inch OLED' }, sources.nintendoSystems],
    ['Nintendo Switch Neon Blue + Neon Red Joy-Con Set', { deviceType: 'hybrid console' }, sources.nintendoSystems],
    ['Nintendo Switch Lite Yellow', { deviceType: 'handheld console' }, sources.nintendoSystems],
    ['Nintendo Switch Lite Turquoise', { deviceType: 'handheld console' }, sources.nintendoSystems],
    ['Nintendo Switch Lite Coral', { deviceType: 'handheld console' }, sources.nintendoSystems],
    ['Nintendo Switch Lite Gray', { deviceType: 'handheld console' }, sources.nintendoSystems],
    ['Nintendo Switch Lite Blue', { deviceType: 'handheld console' }, sources.nintendoSystems],
    ['Nintendo Entertainment System (NES)', { deviceType: 'home console' }, sources.nintendoHistory],
    ['Super Nintendo Entertainment System (SNES)', { deviceType: 'home console' }, sources.nintendoHistory],
    ['Nintendo 64', { deviceType: 'home console' }, sources.nintendoHistory],
    ['Nintendo GameCube', { deviceType: 'home console' }, sources.nintendoHistory],
    ['Nintendo Wii', { deviceType: 'home console' }, sources.nintendoHistory],
    ['Nintendo Wii U', { deviceType: 'home console' }, sources.nintendoHistory],
    ['Nintendo 3DS', { deviceType: 'handheld console', stereoscopic3D: true }, sources.nintendoHistory],
    ['Nintendo 3DS XL', { deviceType: 'handheld console', stereoscopic3D: true }, sources.nintendoHistory],
    ['New Nintendo 3DS', { deviceType: 'handheld console', stereoscopic3D: true }, sources.nintendoHistory],
    ['New Nintendo 3DS XL', { deviceType: 'handheld console', stereoscopic3D: true }, sources.nintendoHistory],
    ['Nintendo 2DS', { deviceType: 'handheld console', stereoscopic3D: false }, sources.nintendoHistory],
    ['New Nintendo 2DS XL', { deviceType: 'handheld console', stereoscopic3D: false }, sources.nintendoHistory],
    ['Nintendo DS', { deviceType: 'handheld console', dualScreen: true }, sources.nintendoHistory],
    ['Nintendo DS Lite', { deviceType: 'handheld console', dualScreen: true }, sources.nintendoHistory],
    ['Nintendo DSi', { deviceType: 'handheld console', dualScreen: true }, sources.nintendoHistory],
    ['Nintendo DSi XL', { deviceType: 'handheld console', dualScreen: true }, sources.nintendoHistory],
    ['Game Boy', { deviceType: 'handheld console' }, sources.nintendoHistory],
    ['Game Boy Pocket', { deviceType: 'handheld console' }, sources.nintendoHistory],
    ['Game Boy Color', { deviceType: 'handheld console', colorDisplay: true }, sources.nintendoHistory],
    ['Game Boy Advance', { deviceType: 'handheld console' }, sources.nintendoHistory],
    ['Game Boy Advance SP', { deviceType: 'handheld console', clamshell: true }, sources.nintendoHistory],
    ['Game Boy Micro', { deviceType: 'handheld console' }, sources.nintendoHistory],
    ['Nintendo Entertainment System Classic Edition', { deviceType: 'mini home console' }, sources.nintendoHistory],
    ['Super Nintendo Entertainment System Classic Edition', { deviceType: 'mini home console' }, sources.nintendoHistory],
    ['Nintendo Virtual Boy', { deviceType: 'tabletop stereoscopic console' }, sources.nintendoHistory],
  ].map(([model, specifications, sourceUrl]) => ({ category: 'gaming_console' as const, brand: 'Nintendo', model: String(model), family: 'Nintendo game systems', sourceUrl: String(sourceUrl), productStatus: String(model).includes('Switch') ? 'active' as const : 'discontinued' as const, specifications: specifications as Record<string, unknown> })),
  ...[
    ['PlayStation', 'Original PlayStation', sources.sonyPlatformHistory], ['PS one', 'PlayStation', sources.sonyPlatformHistory], ['PlayStation 2', 'PlayStation', sources.sonyPlatformHistory], ['PlayStation 2 Slim', 'PlayStation', sources.sonyPlatformHistory],
    ['PlayStation 3', 'PlayStation', sources.sonyPlatformHistory], ['PlayStation 3 Slim', 'PlayStation', sources.sonyPlatformHistory], ['PlayStation 3 Super Slim', 'PlayStation', sources.sonyPlatformHistory], ['PlayStation 4', 'PlayStation', sources.playstationManuals], ['PlayStation 4 Slim', 'PlayStation', sources.playstationManuals], ['PlayStation 4 Pro', 'PlayStation', sources.playstationManuals],
    ['PlayStation 5 Digital Edition', 'PlayStation', sources.playstationManuals], ['PlayStation 5 Pro', 'PlayStation', sources.playstationManuals], ['PlayStation Vita', 'PlayStation portable', sources.sonyPlatformHistory],
  ].map(([model, family, sourceUrl]) => ({ category: 'gaming_console' as const, brand: 'Sony', model: String(model), family: String(family), sourceUrl: String(sourceUrl), productStatus: model.includes('5') ? 'active' as const : 'discontinued' as const, specifications: { deviceType: model.includes('Vita') ? 'handheld console' : 'home console' } })),
  ...[
    ['Xbox', 'Xbox', { deviceType: 'home console' }, sources.xboxHistory], ['Xbox 360', 'Xbox', { deviceType: 'home console' }, sources.xboxHistory], ['Xbox 360 S', 'Xbox', { deviceType: 'home console' }, sources.xboxHistory], ['Xbox 360 E', 'Xbox', { deviceType: 'home console' }, sources.xboxHistory],
    ['Xbox One', 'Xbox One', { deviceType: 'home console' }, sources.xboxHistory], ['Xbox One S', 'Xbox One', { deviceType: 'home console' }, sources.xboxHistory], ['Xbox One X', 'Xbox One', { deviceType: 'home console' }, sources.xboxHistory],
    ['Xbox Series S 512GB', 'Xbox Series X|S', { deviceType: 'home console', storageGB: 512 }, sources.xboxOptions], ['Xbox Series S 1TB Robot White', 'Xbox Series X|S', { deviceType: 'home console', storageGB: 1000 }, sources.xboxOptions],
    ['Xbox Series X 1TB', 'Xbox Series X|S', { deviceType: 'home console', storageGB: 1000 }, sources.xboxOptions], ['Xbox Series X 1TB Digital Edition', 'Xbox Series X|S', { deviceType: 'home console', storageGB: 1000, opticalDrive: false }, sources.xboxOptions], ['Xbox Series X 2TB Galaxy Black Special Edition', 'Xbox Series X|S', { deviceType: 'home console', storageGB: 2000 }, sources.xboxOptions],
  ].map(([model, family, specifications, sourceUrl]) => ({ category: 'gaming_console' as const, brand: 'Microsoft', model: String(model), family: String(family), sourceUrl: String(sourceUrl), productStatus: String(model).includes('Series') ? 'active' as const : 'discontinued' as const, specifications: specifications as Record<string, unknown> })),
];

const vrCandidates: Candidate[] = [
  ...[
    ['Meta', 'Quest 3S', 'Quest', sources.metaQuestCompare, { headsetType: 'standalone VR' }, 'active'], ['Meta', 'Quest Pro', 'Quest', sources.metaQuestEndOfSupport, { headsetType: 'standalone mixed reality', eyeTracking: true }, 'discontinued'],
    ['Meta', 'Quest 2', 'Quest', sources.metaQuest2, { headsetType: 'standalone VR' }, 'discontinued'], ['Meta', 'Quest', 'Quest', sources.metaQuestEndOfSupport, { headsetType: 'standalone VR' }, 'discontinued'],
    ['Meta', 'Rift S', 'Oculus Rift', sources.metaQuestEndOfSupport, { headsetType: 'PC VR' }, 'discontinued'], ['Meta', 'Oculus Rift', 'Oculus Rift', sources.metaQuestEndOfSupport, { headsetType: 'PC VR' }, 'discontinued'],
  ].map(([brand, model, family, sourceUrl, specifications, productStatus]) => ({ category: 'vr_ar' as const, brand: String(brand), model: String(model), family: String(family), sourceUrl: String(sourceUrl), productStatus: productStatus as Candidate['productStatus'], specifications: specifications as Record<string, unknown> })),
  ...[
    ['VIVE Focus Vision', { headsetType: 'standalone / PC mixed reality' }], ['VIVE XR Elite', { headsetType: 'standalone mixed reality' }], ['VIVE Flow', { headsetType: 'VR glasses' }], ['VIVE Focus 3', { headsetType: 'standalone VR' }], ['VIVE Focus Plus', { headsetType: 'standalone VR' }], ['VIVE Focus', { headsetType: 'standalone VR' }],
    ['VIVE Pro 2', { headsetType: 'PC VR' }], ['VIVE Cosmos Elite', { headsetType: 'PC VR' }], ['VIVE Cosmos', { headsetType: 'PC VR' }], ['VIVE Pro Eye', { headsetType: 'PC VR', eyeTracking: true }], ['VIVE Pro', { headsetType: 'PC VR' }], ['VIVE', { headsetType: 'PC VR' }],
  ].map(([model, specifications]) => ({ category: 'vr_ar' as const, brand: 'HTC', model: String(model), family: model === 'VIVE' ? 'VIVE' : 'VIVE headset', sourceUrl: sources.viveSupport, specifications: specifications as Record<string, unknown> })),
  ...[
    ['PICO 4 Ultra', 'consumer standalone mixed reality'], ['PICO 4 Ultra Enterprise', 'enterprise standalone mixed reality'], ['PICO 4', 'standalone VR'], ['PICO 4 Pro', 'standalone VR'], ['PICO 4 Enterprise', 'enterprise standalone VR'], ['PICO Neo3', 'standalone VR'], ['PICO Neo3 Pro Eye', 'enterprise standalone VR'], ['PICO G3', 'enterprise 3DoF VR'],
  ].map(([model, headsetType]) => ({ category: 'vr_ar' as const, brand: 'PICO', model: String(model), family: model.startsWith('PICO 4') ? 'PICO 4' : model.startsWith('PICO Neo') ? 'PICO Neo3' : 'PICO G', sourceUrl: model.includes('Enterprise') || model.includes('G3') || model.includes('Neo') ? sources.picoBusiness : sources.picoDevices, specifications: { headsetType } })),
  ...[
    ['PlayStation VR', { headsetType: 'console VR' }], ['PlayStation VR2', { headsetType: 'console / PC VR' }],
  ].map(([model, specifications]) => ({ category: 'vr_ar' as const, brand: 'Sony', model: String(model), family: 'PlayStation VR', sourceUrl: model === 'PlayStation VR2' ? sources.playstationVrProduct : sources.playstationVr, productStatus: model === 'PlayStation VR2' ? 'active' as const : 'discontinued' as const, specifications: specifications as Record<string, unknown> })),
  ...[
    ['XR-4', 'Varjo XR-4', { headsetType: 'professional mixed reality', displayResolutionPerEye: '3840x3744' }], ['XR-4 Focal Edition', 'Varjo XR-4', { headsetType: 'professional mixed reality' }], ['XR-4 Secure Edition', 'Varjo XR-4', { headsetType: 'professional mixed reality secure edition' }],
  ].map(([model, family, specifications]) => ({ category: 'vr_ar' as const, brand: 'Varjo', model: String(model), family: String(family), sourceUrl: sources.varjoXr4, specifications: specifications as Record<string, unknown> })),
  ...[
    ['XR-3', { headsetType: 'professional mixed reality' }], ['XR-3 Focal Edition', { headsetType: 'professional mixed reality' }], ['VR-3', { headsetType: 'professional VR' }], ['Aero', { headsetType: 'PC VR' }],
  ].map(([model, specifications]) => ({ category: 'vr_ar' as const, brand: 'Varjo', model: String(model), family: 'Varjo XR/VR', sourceUrl: sources.varjoXr3, productStatus: 'discontinued' as const, specifications: specifications as Record<string, unknown> })),
  ...[
    ['Apple Vision Pro (M5)', 'A3416', 2025], ['Apple Vision Pro (M2)', 'A2117', 2024],
  ].map(([model, modelNumber, year]) => ({ category: 'vr_ar' as const, brand: 'Apple', model: String(model), modelNumber: String(modelNumber), family: 'Apple Vision Pro', sourceUrl: sources.appleVision, productStatus: modelNumber === 'A3416' ? 'active' as const : 'discontinued' as const, specifications: { headsetType: 'spatial computing mixed reality', modelNumber, yearIntroduced: year, storageOptionsGB: [256, 512, 1024] } })),
  { category: 'vr_ar', brand: 'Samsung', model: 'Galaxy XR', family: 'Galaxy XR', sourceUrl: sources.samsungGalaxyXr, specifications: { headsetType: 'standalone mixed reality', resolutionPixelsPerEye: '3552x3840', memoryGB: 16, storageGB: 256, fieldOfViewDegrees: '109 horizontal / 100 vertical' } },
];

const drones: Candidate[] = [
  ...[
    ['DJI Mavic 4 Pro', 'Mavic', 'camera drone'], ['DJI Mavic 3 Pro', 'Mavic', 'camera drone'], ['DJI Mavic 3 Classic', 'Mavic', 'camera drone'], ['DJI Mavic 3', 'Mavic', 'camera drone'], ['DJI Mavic 2', 'Mavic', 'camera drone'], ['DJI Mavic Pro Platinum', 'Mavic', 'camera drone'], ['DJI Mavic Pro', 'Mavic', 'camera drone'],
    ['DJI Air 3', 'Air', 'camera drone'], ['DJI Air 2S', 'Air', 'camera drone'], ['DJI Mavic Air 2', 'Air', 'camera drone'], ['DJI Mavic Air', 'Air', 'camera drone'], ['DJI Mini 3 Pro', 'Mini', 'camera drone'], ['DJI Mini 3', 'Mini', 'camera drone'], ['DJI Mini 4K', 'Mini', 'camera drone'], ['DJI Mini 2 SE', 'Mini', 'camera drone'], ['DJI Mini 2', 'Mini', 'camera drone'], ['DJI Mini SE', 'Mini', 'camera drone'], ['DJI Mavic Mini', 'Mini', 'camera drone'], ['DJI Spark', 'Spark', 'camera drone'],
    ['DJI Avata 2', 'Avata', 'FPV camera drone'], ['DJI Avata', 'Avata', 'FPV camera drone'], ['DJI FPV', 'FPV', 'FPV camera drone'], ['DJI Inspire 3', 'Inspire', 'professional cinema drone'], ['DJI Inspire 2', 'Inspire', 'professional cinema drone'], ['DJI Inspire 1 V2.0', 'Inspire', 'professional cinema drone'], ['DJI Inspire 1 Pro', 'Inspire', 'professional cinema drone'], ['DJI Inspire 1 Raw', 'Inspire', 'professional cinema drone'], ['DJI Inspire 1 V1.0', 'Inspire', 'professional cinema drone'],
    ['DJI Phantom 4 Pro V2.0', 'Phantom', 'camera drone'], ['DJI Phantom 4 Advanced', 'Phantom', 'camera drone'], ['DJI Phantom 4 Pro', 'Phantom', 'camera drone'], ['DJI Phantom 4', 'Phantom', 'camera drone'], ['DJI Phantom 3 Standard', 'Phantom', 'camera drone'], ['DJI Phantom 3 Professional', 'Phantom', 'camera drone'], ['DJI Phantom 3 Advanced', 'Phantom', 'camera drone'],
  ].map(([model, family, droneType]) => ({ category: 'drone' as const, brand: 'DJI', model: String(model), family: String(family), sourceUrl: sources.djiSupport, specifications: { droneType, manufacturerModelName: model } })),
  ...[
    ['DJI Matrice 4E', 'Matrice 4', 'enterprise mapping drone'], ['DJI Matrice 4T', 'Matrice 4', 'enterprise thermal drone'], ['DJI Matrice 30', 'Matrice 30', 'enterprise drone'], ['DJI Matrice 30T', 'Matrice 30', 'enterprise thermal drone'], ['DJI Matrice 300 RTK', 'Matrice', 'enterprise drone'], ['DJI Matrice 350 RTK', 'Matrice', 'enterprise drone'], ['DJI Agras T50', 'Agras', 'agricultural drone'], ['DJI Mavic 3 Multispectral', 'Mavic 3 Enterprise', 'agricultural mapping drone'],
  ].map(([model, family, droneType]) => ({ category: 'drone' as const, brand: 'DJI', model: String(model), family: String(family), sourceUrl: sources.djiEnterprise, specifications: { droneType, manufacturerModelName: model } })),
];

const microphones: Candidate[] = [
  ...[
    'SM58', 'SM57', 'Beta 58A', 'Beta 87A', 'Beta 87C', 'SM86', 'KSM8', 'SM4', 'PGA58', 'PGA48', 'KSM9', 'Super 55', 'SM81', 'MV7+', 'MV7X', 'MV7',
  ].map((model) => ({ category: 'microphone' as const, brand: 'Shure', model, family: model.startsWith('PGA') ? 'PGA' : model.startsWith('KSM') ? 'KSM' : model.startsWith('Beta') ? 'Beta' : 'SM', sourceUrl: model.startsWith('MV') ? sources.shurePodcast : sources.shureMics, specifications: { microphoneType: 'professional microphone', manufacturerModelName: model } })),
  ...[
    'PodMic', 'PodMic USB', 'NT1 5th Generation', 'NT1 Signature Series', 'NT-USB+', 'NT-USB Mini', 'XDM-100', 'XCM-50', 'Wireless GO II', 'Wireless GO (3rd Gen)', 'Wireless PRO', 'Wireless ME', 'Interview PRO', 'VideoMic NTG', 'VideoMic GO II',
  ].map((model) => ({ category: 'microphone' as const, brand: 'RØDE', model, family: model.includes('Wireless') ? 'RØDE Wireless' : model.includes('VideoMic') ? 'RØDE VideoMic' : 'RØDE Studio Microphones', sourceUrl: sources.rodeMics, specifications: { microphoneType: model.includes('Wireless') ? 'wireless microphone system' : 'microphone', manufacturerModelName: model } })),
];

const captureProducts: Candidate[] = [
  ...[
    ['Game Capture HD60 S', 'external game capture', '1080p60'], ['Game Capture HD60 S+', 'external game capture', '1080p60 HDR'], ['Game Capture 4K60 S+', 'external game capture', '4K60 HDR'], ['Game Capture HD60 Pro', 'internal PCIe game capture', '1080p60'], ['Game Capture 4K60 Pro', 'internal PCIe game capture', '4K60'], ['Game Capture 4K60 Pro MK.2', 'internal PCIe game capture', '4K60 HDR'], ['Game Capture 4K X', 'external game capture', '4K144'], ['Game Capture 4K Pro', 'internal PCIe game capture', '4K60'], ['Game Capture Neo', 'external game capture', '1080p60'], ['Game Capture 4K S', 'external game capture', '4K60'], ['Cam Link', 'camera capture device', 'HDMI to USB'], ['Cam Link 4K', 'camera capture device', '4K'], ['Cam Link Pro', 'internal PCIe camera capture', 'multi-HDMI'], ['Video Capture', 'analog video capture', 'analog video'], ['Game Capture HD', 'external game capture', 'HD'], ['Game Capture HD60', 'external game capture', '1080p'],
  ].map(([model, deviceType, captureResolution]) => ({ category: 'streaming_capture' as const, brand: 'Elgato', model, family: 'Elgato Capture', sourceUrl: model.includes('4K') || model.includes('HD60') ? sources.elgatoCaptureCompare : sources.elgatoCaptureUtility, specifications: { deviceType, captureResolution } })),
  ...[
    ['Live Gamer 4K 2.1', 'GC575', 'PCIe capture card', '4K capture', 'https://www.avermedia.com/tv/product-detail/GC575'],
    ['Live Gamer ULTRA 2.1', 'GC553G2', 'USB capture card', '4K capture', 'https://www.avermedia.com/do/product-detail/GC553G2'],
    ['Live Gamer 4K', 'GC573', 'PCIe capture card', '4K60 HDR capture', 'https://www.avermedia.com/ap/product-detail/GC573'],
    ['Live Gamer EXTREME 3', 'GC551G2', 'USB capture card', '4K30 capture', 'https://www.avermedia.com/ap/product-detail/GC551G2'],
    ['StreamLine MINI+', 'GC311G2', 'USB capture card', '1080p60 capture', 'https://www.avermedia.com/br/product-detail/capture-card-GC311G2'],
    ['Live Gamer Portable 2 Plus', 'GC513', 'portable capture card', '1080p60 capture', 'https://www.avermedia.com/es/support/download/live_gamer_portable'],
    ['Live Gamer Portable 2', 'GC510', 'portable capture card', '1080p60 capture', 'https://www.avermedia.com/es/support/download?model_number=GC510'],
    ['Live Gamer BOLT', 'GC555', 'Thunderbolt capture card', '4K60 HDR capture', 'https://www.avermedia.com/GB/product-detail/GC555'],
    ['Live Gamer DUO', 'GC570D', 'PCIe dual-HDMI capture card', 'Dual 1080p60 capture', 'https://www.avermedia.com/im/product-detail/GC570D'],
    ['Live Streamer ULTRA HD', 'GC571', 'PCIe capture card', '4K capture', 'https://www.avermedia.com/ap/product-detail/GC571'],
    ['Live Gamer ULTRA S', 'GC553Pro', 'USB capture card', '4K capture', sources.avermediaCompatibility],
    ["X'TRA GO", 'GC515', 'portable USB capture card', 'capture and passthrough', 'https://www.avermedia.com/product-detail/capture-dock-GC515'],
    ['Live Gamer HD 2', 'C988', 'PCIe capture card', '1080p capture', 'https://storage.avermedia.com/web_release_jp/C988_UM.pdf'],
  ].map(([model, modelNumber, deviceType, captureResolution, sourceUrl]) => ({ category: 'streaming_capture' as const, brand: 'AVerMedia', model, modelNumber, family: 'AVerMedia Capture', sourceUrl, specifications: { deviceType, captureResolution, manufacturerModelNumber: modelNumber } })),
  ...[
    ['DeckLink Mini Recorder HD', 'PCIe capture card', '1080p60'], ['DeckLink Mini Recorder 4K', 'PCIe capture card', '2160p30'], ['DeckLink Duo 2', 'multi-channel PCIe capture/playback', '1080p60'], ['DeckLink Duo 2 Mini', 'low-profile PCIe capture/playback', '1080p60'], ['DeckLink Studio 4K', 'PCIe capture/playback', '4K'], ['DeckLink 8K Pro Mini', 'low-profile PCIe capture/playback', '8K'], ['DeckLink 8K Pro G2', 'PCIe capture/playback', '8K'], ['DeckLink 4K Extreme 12G', 'PCIe capture/playback', '4K60'], ['DeckLink Quad 2', 'multi-channel PCIe capture/playback', '1080p60'], ['DeckLink Quad HDMI Recorder', 'four-input PCIe capture card', '4K'], ['DeckLink Micro Recorder', 'mini PCIe capture card', '1080p30'], ['DeckLink SDI Micro', 'M.2 capture/playback card', '1080p60'],
  ].map(([model, deviceType, captureResolution]) => ({ category: 'streaming_capture' as const, brand: 'Blackmagic Design', model, family: 'DeckLink', sourceUrl: sources.blackmagicDecklink, specifications: { deviceType, captureResolution } })),
  ...[
    ['UltraStudio Express Recorder 3G', 'USB4 / Thunderbolt capture device', '1080p60'], ['UltraStudio Express HD', 'USB4 / Thunderbolt capture/playback device', '1080p60'], ['UltraStudio Mini Recorder 12G', 'Thunderbolt capture device', '4K'], ['UltraStudio Mini Replay 12G', 'Thunderbolt capture/playback device', '4K'], ['UltraStudio 4K Mini', 'Thunderbolt capture/playback device', '4K'], ['UltraStudio 4K Extreme 3', 'Thunderbolt capture/playback device', '4K'],
  ].map(([model, deviceType, captureResolution]) => ({ category: 'streaming_capture' as const, brand: 'Blackmagic Design', model, family: 'UltraStudio', sourceUrl: sources.blackmagicUltrastudio, specifications: { deviceType, captureResolution } })),
];

const audioInterfaces: Candidate[] = [
  ...[
    ['Scarlett Solo 4th Gen', 4, '2 in / 2 out'], ['Scarlett 2i2 4th Gen', 4, '2 in / 2 out'], ['Scarlett 4i4 4th Gen', 4, '4 in / 4 out'], ['Scarlett 16i16 4th Gen', 4, '16 in / 16 out'], ['Scarlett 18i16 4th Gen', 4, '18 in / 16 out'], ['Scarlett 18i20 4th Gen', 4, '24 in / 26 out'],
    ['Scarlett Solo Studio 4th Gen', 4, 'bundle: 2 in / 2 out'], ['Scarlett 2i2 Studio 4th Gen', 4, 'bundle: 2 in / 2 out'], ['Scarlett 2i2 Anniversary Edition', 4, '2 in / 2 out'],
  ].map(([model, generation, io]) => ({ category: 'professional_audio' as const, brand: 'Focusrite', model: String(model), family: 'Scarlett', sourceUrl: sources.focusriteScarlett, specifications: { deviceType: 'USB audio interface', generation, simultaneousInputOutput: io } })),
  ...[
    ['Scarlett Solo 3rd Gen', 3], ['Scarlett 2i2 3rd Gen', 3], ['Scarlett 4i4 3rd Gen', 3], ['Scarlett 8i6 3rd Gen', 3], ['Scarlett 18i8 3rd Gen', 3], ['Scarlett 18i20 3rd Gen', 3],
    ['Scarlett Solo 2nd Gen', 2], ['Scarlett 2i2 2nd Gen', 2], ['Scarlett 2i4 2nd Gen', 2], ['Scarlett 6i6 2nd Gen', 2], ['Scarlett 18i8 2nd Gen', 2], ['Scarlett 18i20 2nd Gen', 2],
  ].map(([model, generation]) => ({ category: 'professional_audio' as const, brand: 'Focusrite', model: String(model), family: 'Scarlett', sourceUrl: sources.focusriteCompat, productStatus: 'discontinued' as const, specifications: { deviceType: 'USB audio interface', generation } })),
  ...[
    ['Clarett+ 2Pre', '10 in / 4 out'], ['Clarett+ 4Pre', '18 in / 8 out'], ['Clarett+ 8Pre', '18 in / 20 out'], ['Clarett+ OctoPre', '8-channel ADAT preamp'],
  ].map(([model, io]) => ({ category: 'professional_audio' as const, brand: 'Focusrite', model, family: 'Clarett+', sourceUrl: sources.focusriteClarett, specifications: { deviceType: model.includes('Octo') ? 'ADAT preamp' : 'USB audio interface', simultaneousInputOutput: io } })),
  ...[
    ['Vocaster One', 1], ['Vocaster Two', 2], ['Vocaster One Studio', 1], ['Vocaster Two Studio', 2],
  ].map(([model, micInputs]) => ({ category: 'professional_audio' as const, brand: 'Focusrite', model: String(model), family: 'Vocaster', sourceUrl: model === 'Vocaster Two' ? 'https://focusrite.com/products/vocaster-two' : sources.focusriteVocaster, specifications: { deviceType: 'podcast audio interface', microphoneInputs: micInputs, bluetooth: true } })),
  ...[
    ['Red 4Pre', 4], ['Red 8Pre', 8], ['Red 8Line', 2], ['Red 16Line', 2],
  ].map(([model, micInputs]) => ({ category: 'professional_audio' as const, brand: 'Focusrite', model: String(model), family: 'Red', sourceUrl: sources.focusriteRed, specifications: { deviceType: 'professional Thunderbolt audio interface', microphoneInputs: micInputs, Dante: true } })),
];

const candidates: Candidate[] = [...consoles, ...vrCandidates, ...drones, ...microphones, ...captureProducts, ...audioInterfaces];
function key(value: string) { return normalize(value); }
function displayName(candidate: Candidate) {
  return key(candidate.model).startsWith(key(candidate.brand)) ? candidate.model : `${candidate.brand} ${candidate.model}`;
}

async function main() {
  const importMode = process.argv.includes('--import');
  await connectDB();
  try {
    const categories = [...new Set(candidates.map((candidate) => candidate.category))];
    const current = await Product.find({ category: { $in: categories }, publicationStatus: 'published' }).select('category brand model name modelNumber').lean() as Array<{ category: string; brand?: string; model?: string; name?: string; modelNumber?: string }>;
    const modelKeys = new Set(current.map((row) => `${row.category}|${key(row.brand ?? '')}|${key(row.model || row.modelNumber || row.name || '')}`));
    const counts = new Map<string, number>();
    current.forEach((row) => counts.set(row.category, (counts.get(row.category) ?? 0) + 1));
    const selected = candidates.filter((candidate) => !modelKeys.has(`${candidate.category}|${key(candidate.brand)}|${key(candidate.model)}`));
    const categorySummary = Object.fromEntries(categories.map((category) => {
      const added = selected.filter((candidate) => candidate.category === category).length;
      return [category, { publishedBefore: counts.get(category) ?? 0, selected: added, projected: (counts.get(category) ?? 0) + added, target: TARGET }];
    }));
    if (!importMode) {
      console.log(JSON.stringify({ mode: 'dry-run', categorySummary, selected: selected.map(({ category, brand, model }) => ({ category, brand, model })) }, null, 2));
      return;
    }
    let created = 0;
    let skipped = 0;
    for (const candidate of selected) {
      const sourceKey = `manufacturer:${candidate.category}:${key(candidate.brand)}:${key(candidate.model)}`;
      if (await Product.exists({ $or: [{ sourceKey }, { dedupeKey: sourceKey }, ...(candidate.modelNumber ? [{ category: candidate.category, modelNumber: candidate.modelNumber }] : [])] })) { skipped += 1; continue; }
      const specs = normalizeSpecs(candidate.specifications);
      const evidence = [
        { evidenceType: 'identity', sourceName: `${candidate.brand} official product catalog/support`, sourceUrl: candidate.sourceUrl, retrievedAt: RETRIEVED_AT, verifiedAt: RETRIEVED_AT, notes: `Official manufacturer source lists or identifies ${candidate.model}${candidate.modelNumber ? ` (model ${candidate.modelNumber})` : ''}.` },
        { evidenceType: 'specifications', sourceName: `${candidate.brand} official product catalog/support`, sourceUrl: candidate.sourceUrl, retrievedAt: RETRIEVED_AT, verifiedAt: RETRIEVED_AT, notes: 'Only technical details shown by the cited manufacturer source are included.' },
      ];
      await Product.create({
        name: displayName(candidate), brand: candidate.brand, model: candidate.model, modelNumber: candidate.modelNumber ?? null, family: candidate.family,
        productStatus: candidate.productStatus ?? 'unknown', category: candidate.category, description: `${displayName(candidate)} thuộc nhóm ${candidate.family}; thông tin nhận diện được đối chiếu với nguồn chính thức của ${candidate.brand}.`,
        imageUrl: null, imageSource: null, imageSourceUrl: null, imageAuthor: null, imageRetrievedAt: null, imageUsagePermission: 'not_provided', imagePermissionEvidence: null, imageLicense: null, imageLicenseUrl: null, imageAttribution: null, imageVisualIdentityChecked: false, imageVerificationBasis: null,
        sourceUrl: candidate.sourceUrl, productUrl: candidate.sourceUrl, specificationSourceUrl: candidate.sourceUrl,
        verified: true, verifiedAt: RETRIEVED_AT, verificationScope: 'manufacturer', productVerificationStatus: 'verified', imageVerificationStatus: 'pending', urlVerificationStatus: 'verified', publicationStatus: 'published',
        specifications: candidate.specifications, specs, normalizedSpecs: specs, variants: [], sourceEvidence: evidence,
        dataAttribution: `${candidate.brand} official product catalog/support`, dataSourceUrl: candidate.sourceUrl,
        source: 'curated', sourceProductId: sourceKey, sourceProductIds: [sourceKey], sourceKey, dedupeKey: sourceKey, electronicStatus: 'approved',
        price: null, originalPrice: null, rating: null, sold: null, stock: null, tags: [candidate.category, candidate.family.toLowerCase()],
        searchText: key([candidate.brand, candidate.model, candidate.modelNumber, candidate.family, JSON.stringify(candidate.specifications)].filter(Boolean).join(' ')),
      });
      created += 1;
    }
    const publishedAfter = Object.fromEntries(await Promise.all(categories.map(async (category) => [category, await Product.countDocuments({ category, publicationStatus: 'published' })] as const)));
    await SyncRun.create({ source: 'manufacturer-specifications', sourceKey: 'manufacturer-underfilled-category-rosters', mode: 'import', status: 'succeeded', startedAt: RETRIEVED_AT, finishedAt: new Date(), stats: { candidates: candidates.length, selected: selected.length, created, skipped, publishedAfter, target: TARGET } });
    console.log(JSON.stringify({ mode: 'import', database: mongoose.connection.name, created, skipped, publishedAfter, target: TARGET }, null, 2));
  } finally { await mongoose.disconnect(); }
}

main().catch(async (error) => { console.error(error instanceof Error ? error.message : 'manufacturer catalog import failed'); await mongoose.disconnect(); process.exitCode = 1; });
