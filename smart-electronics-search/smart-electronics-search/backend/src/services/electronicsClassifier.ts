import { DatafeedItem } from './accesstradeClient';
import { normalize } from '../utils/text';
import { CANONICAL_CATEGORY_KEYS } from './taxonomy';

export type Classification = { status: 'approved' | 'pending_review' | 'rejected'; category: string | null; reasons: string[] };

const categoryTerms: Record<string, string[]> = {
  air_conditioner: ['air conditioner', 'air conditioning', 'aircon', 'may lanh', 'dieu hoa'],
  laptop: ['laptop', 'notebook', 'may tinh xach tay', 'macbook', 'thinkpad', 'chromebook'],
  desktop: ['desktop', 'pc', 'may tinh de ban'],
  phone: ['phone', 'mobile phone', 'smartphone', 'dien thoai', 'mobile', 'iphone', 'galaxy'],
  tablet: ['tablet', 'ipad', 'may tinh bang'],
  smartwatch: ['smartwatch', 'smart watch', 'dong ho thong minh', 'watch'],
  cpu: ['cpu', 'processor', 'bo vi xu ly', 'intel core', 'amd ryzen'],
  gpu: ['gpu', 'graphics card', 'video card', 'card man hinh', 'geforce', 'radeon', 'rtx ', 'gtx '],
  ram: ['ram', 'memory module', 'bo nho ram', 'ddr4', 'ddr5'],
  storage: ['ssd', 'hdd', 'hard drive', 'solid state', 'o cung'],
  motherboard: ['mainboard', 'motherboard', 'bo mach chu'],
  gaming_console: ['gaming console', 'game console', 'playstation', 'xbox', 'nintendo switch', 'ps5', 'ps4'],
  projector: ['projector', 'may chieu', 'beamer'],
  printer_scanner: ['printer scanner', 'printer', 'scanner', 'may in', 'may quet'],
  vr_ar: ['vr headset', 'virtual reality', 'augmented reality', 'mixed reality', 'ar glasses', 'meta quest', 'apple vision pro'],
  drone: ['drone', 'quadcopter', 'unmanned aerial vehicle', 'uav'],
  nas: ['network attached storage', 'nas', 'storage server'],
  smart_home: ['smart home', 'home automation', 'smart bulb', 'smart plug', 'smart lock', 'smart thermostat', 'smart sensor'],
  ups: ['uninterruptible power supply', 'ups battery', 'ups', 'backup power supply'],
  microphone: ['microphone', 'mic', 'condenser mic', 'studio microphone'],
  streaming_capture: ['capture card', 'capture device', 'video capture', 'streaming device', 'stream deck'],
  ereader: ['e-reader', 'ereader', 'e reader', 'ebook reader', 'kindle', 'kobo'],
  professional_audio: ['professional audio', 'audio interface', 'audio mixer', 'studio monitor', 'pa system', 'live sound mixer'],
  monitor: ['monitor', 'man hinh'],
  keyboard: ['keyboard', 'ban phim'],
  mouse: ['mouse', 'chuot'],
  headphone: ['headphone', 'earphone', 'earbud', 'tai nghe', 'airpods', 'galaxy buds'],
  speaker: ['speaker', 'loa'],
  charger: ['power bank', 'powerbank', 'charger', 'sac du phong', 'pin du phong', 'cu sac', 'sac nhanh'],
  webcam: ['webcam'],
  camera: ['camera', 'may anh'],
  tv: ['television', 'smart tv', 'tivi'],
  networking: ['router', 'network', 'wifi', 'switch mang', 'bo phat song'],
  electronics_accessory: ['electronics accessory', 'phu kien dien tu', 'charger', 'sac dien thoai', 'cap sac', 'adapter'],
};
const nonElectronicTerms = ['clothing', 'apparel', 'fashion', 'shoes', 'food', 'grocery', 'cosmetic', 'beauty', 'book', 'furniture', 'decor', 'home appliance', 'kitchen', 'quần áo', 'my pham', 'thuc pham'];
const genericElectronicCategories = ['electronics', 'computer & office', 'computers', 'computer accessories', 'mobile & accessories', 'digital products', 'technology'];
const electronicBrands = ['apple', 'samsung', 'xiaomi', 'asus', 'dell', 'hp', 'lenovo', 'acer', 'msi', 'sony', 'jbl', 'logitech', 'oppo', 'lg', 'anker', 'razer', 'realme', 'intel', 'amd', 'nvidia', 'kingston', 'crucial', 'corsair', 'western digital', 'seagate', 'tp-link', 'tplink', 'gigabyte', 'asrock', 'aoc', 'viewsonic', 'benq', 'philips', 'canon', 'nikon', 'garmin', 'bose', 'beats', 'huawei', 'netgear', 'ubiquiti', 'hikvision', 'dahua', 'nintendo', 'microsoft', 'meta', 'dji', 'synology', 'qnap', 'epson', 'brother', 'elgato', 'shure', 'rode', 'yamaha', 'focusrite', 'amazon'];
const electronicSpecKeys = ['ram', 'storage', 'cpu', 'gpu', 'processor', 'screen', 'display', 'battery', 'camera', 'capacity', 'memory', 'resolution', 'frequency', 'connectivity'];
export const ALLOWED_ELECTRONIC_CATEGORIES = CANONICAL_CATEGORY_KEYS;

function includesTerm(text: string, terms: string[]): boolean {
  const padded = ` ${text} `;
  return terms.some((term) => padded.includes(` ${normalize(term)} `));
}

export function classifyElectronics(item: DatafeedItem): Classification {
  const category = normalize(String(item.cate ?? item.category ?? item.category_name ?? ''));
  const name = normalize(String(item.name ?? ''));
  const brand = normalize(String(item.brand ?? ''));
  const description = normalize(String(item.desc ?? item.description ?? ''));
  if (includesTerm(`${category} ${name}`, nonElectronicTerms)) {
    return { status: 'rejected', category: null, reasons: ['Danh mục hoặc tên thể hiện sản phẩm ngoài nhóm điện tử'] };
  }

  const mappedCategory = Object.entries(categoryTerms).find(([, terms]) => includesTerm(name, terms))?.[0]
    ?? Object.entries(categoryTerms).find(([, terms]) => includesTerm(category, terms))?.[0]
    ?? null;
  const categorySignal = includesTerm(category, [...Object.values(categoryTerms).flat(), ...genericElectronicCategories]);
  const productSignal = includesTerm(`${name} ${description}`, Object.values(categoryTerms).flat());
  const brandSignal = includesTerm(`${brand} ${name}`, electronicBrands);
  const specsValue = item.specs ?? item.specifications;
  const specs = specsValue && typeof specsValue === 'object' ? specsValue as Record<string, unknown> : {};
  const specSignal = Object.keys(specs).some((key) => electronicSpecKeys.includes(normalize(key)) && specs[key] !== null && specs[key] !== '');
  if (mappedCategory && ((categorySignal && (productSignal || specSignal || brandSignal)) || (productSignal && (brandSignal || specSignal)))) {
    return { status: 'approved', category: mappedCategory, reasons: [] };
  }
  return { status: 'pending_review', category: mappedCategory, reasons: ['Chưa đủ tín hiệu để xác nhận sản phẩm thuộc lĩnh vực điện tử'] };
}
