import { DatafeedItem } from './accesstradeClient';
import { BRANDS } from './dictionary';
import { normalize } from '../utils/text';
import { normalizeSpecs } from '../utils/specs';

export const ACCESTRADE_DATAFEED_DOCS = 'https://developers.accesstrade.vn/api-publisher-vietnamese/lay-thong-tin-datafeeds';
export const ACCESTRADE_TERMS_URL = 'https://biz.accesstrade.vn/dieu-khoan/';
export const ACCESTRADE_LISTING_LICENSE = 'AccessTrade publisher campaign feed; use with the corresponding campaign affiliate link';

export function normalizeAccessTradeProductUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.*|fbclid|gclid|msclkid|ref|referrer)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch {
    return null;
  }
}

export const ACCESTRADE_SELLERS: Record<string, { sourceKey: string; name: string }> = {
  'cellphones.com.vn': { sourceKey: 'accesstrade-cellphones', name: 'CellphoneS' },
  'thegioididong.com': { sourceKey: 'accesstrade-thegioididong', name: 'Thế Giới Di Động' },
};

const SMARTPHONE_BRANDS = new Set([
  'Apple', 'Samsung', 'Xiaomi', 'Redmi', 'POCO', 'Oppo', 'Vivo', 'Realme', 'OnePlus', 'Google', 'Honor', 'Huawei',
  'Motorola', 'Nothing', 'Nokia', 'Tecno', 'Infinix', 'Sony', 'Asus', 'Lenovo', 'ZTE', 'Meizu', 'Sharp', 'Vsmart',
].map(normalize));
const SMARTWATCH_BRANDS = new Set([
  'Apple', 'Samsung', 'Garmin', 'Huawei', 'Xiaomi', 'Redmi', 'Amazfit', 'Fitbit', 'Google', 'Oppo', 'Vivo', 'Realme',
  'Honor', 'OnePlus', 'Colmi', 'Haylou', 'Mibro', 'Coros', 'Polar', 'Suunto', 'Withings', 'CMF', 'Mobvoi', 'Motorola',
].map(normalize));
const DESKTOP_CPU_BRANDS = new Set(['AMD', 'Intel'].map(normalize));
const LAPTOP_BRANDS = new Set([
  'Apple', 'Acer', 'Asus', 'Dell', 'HP', 'Lenovo', 'MSI', 'Microsoft', 'Huawei', 'Xiaomi', 'Samsung', 'Gigabyte', 'Razer',
  'LG', 'Honor', 'Chuwi', 'Teclast', 'Thunderobot', 'Mechrevo', 'Colorful', 'Framework', 'Fujitsu', 'Dynabook', 'Toshiba',
  'Vaio', 'Medion', 'Avita', 'Jumper', 'Machenike', 'Infinix', 'Tecno',
].map(normalize));

const knownBrands: Array<{ name: string; aliases?: string[] }> = [
  ...Object.entries(BRANDS).map(([name, aliases]) => ({ name, aliases })),
  ...[
    'Aukey', 'Baseus', 'Ugreen', 'Innostyle', 'Energizer', 'Zadez', 'eValu', 'AVA+', 'Ulanzi', 'North Bayou', 'Camel',
    'Rapoo', 'Soundcore', 'Edifier', 'QCY', 'Colmi', 'Klipsch', 'Monster', 'Microlab', 'Wanbo', 'Beecube', 'HyperDrive',
    'CMN', 'Havit', 'Xmobile', 'E-Dra', 'Fuhlen', 'DareU', 'Akko', 'Lofree', 'Machenike', 'Hoco', 'Momax', 'Mophie',
    'Belkin', 'Choetech', 'Mcdodo', 'Usams', 'Lention', 'Orico', 'Divoom', 'Marshall', 'Jabra', 'Plantronics', 'Poly',
    'TCL', 'Hisense', 'Coocaa', 'Xiaomi', 'Redmi', 'POCO', 'Realme', 'OnePlus', 'Oppo', 'Vivo', 'Honor', 'Huawei',
    'Motorola', 'Nothing', 'Google', 'Nokia', 'Tecno', 'Infinix', 'Asanzo', 'Toshiba', 'Adata', 'Lexar', 'PNY', 'Kioxia',
    'SanDisk', 'Transcend', 'TeamGroup', 'Patriot', 'Colorful', 'Palit', 'Leadtek', 'Zotac', 'Sapphire', 'PowerColor',
    'XFX', 'Inno3D', 'PNY', 'Gainward', 'Arktek', 'ViewSonic', 'AOC', 'Acer', 'BenQ', 'Philips', 'Epson', 'Brother',
    'Fujifilm', 'Panasonic', 'DJI', 'Imou', 'Ezviz', 'Tapo', 'D-Link', 'Mercusys', 'Totolink', 'Ruijie', 'Asrock',
    'NZXT', 'Deepcool', 'Thermaltake', 'Antec', 'FSP', 'Cooler Master', 'Lian Li', 'SilverStone', 'Jonsbo', 'Montech',
    'Keychron', 'Glorious', 'Endgame Gear', 'Lamzu', 'Pulsar', 'Finalmouse', 'SteelSeries', 'HyperX', 'Shure', 'Rode',
    'Focusrite', 'Yamaha', 'Behringer', 'Mackie', 'Presonus', 'Zoom', 'Elgato', 'Audio-Technica', 'ATK', 'VGN', 'Ajazz',
  ].map((name): { name: string; aliases?: string[] } => ({ name })),
  { name: 'Xiaomi', aliases: ['Mijia'] },
].sort((a, b) => Math.max(b.name.length, ...(b.aliases ?? []).map((alias) => alias.length)) - Math.max(a.name.length, ...(a.aliases ?? []).map((alias) => alias.length)));

function has(text: string, pattern: RegExp) { return pattern.test(text); }

export function parseAccessTradeDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const match = value.trim().match(/^(\d{2})-(\d{2})-(\d{4})T(\d{2}):(\d{2}):(\d{2})$/);
  if (match) {
    const [, dd, mm, yyyy, hh, min, ss] = match;
    const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss)));
    if (date.getUTCFullYear() === Number(yyyy) && date.getUTCMonth() === Number(mm) - 1 && date.getUTCDate() === Number(dd)) return date;
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function classifyAccessTradeListing(item: DatafeedItem): string | null {
  const text = normalize(String(item.name ?? ''));
  if (!text || /\b(clothing|apparel|fashion|shoes|grocery|cosmetic|beauty|book|furniture|decor|kitchen appliance)\b/.test(text)) return null;
  if (has(text, /\b(buyback|cam ket gia thu|thu cu doi moi|trade in|da qua su dung|refurbished|renewed|like new)\b/) || /\b(cu)\s*$/.test(text)) return null;
  if (has(text, /\b(op lung|bao da|smart folio|screen protector|mieng dan|dan cuong luc|kinh cuong luc|tui laptop|balo.*may anh|camera bag|tui dung|tui chong soc|mouse pad|lot chuot|tripod|gia treo|khung treo|tv mount|wall mount|stand cho man hinh)\b/)) return null;
  if (has(text, /\b(cpu cooler|cooler cpu|cpu fan|cpu heatsink|thermal paste|tan nhiet cpu|bo tan nhiet cpu|aio liquid cooler)\b/)) return null;

  // Classify accessories before the device they attach to (for example, a TV mount is not a TV).
  if (has(text, /\b(gia treo tivi|khung treo tivi|tv mount|wall mount|gia treo man hinh|stand cho man hinh|tripod|chan de may anh|balo.*may anh|camera bag|bo loc may anh|boc che.*may anh|camera lens|ong kinh|den flash.*may anh|flash cho may anh|bo kit.*may anh|pin.*may anh|mouse pad|lot chuot|tay cam|controller|gamepad|remote|cap sac|cap chuyen|usb hub|adapter chuyen|case|op lung|mieng dan|dan cuong luc|kinh cuong luc|screen protector|bao da|tui dung|tui chong soc|tui laptop|cap dung laptop|dock|tua vit.*laptop|dung cu sua chua.*(laptop|dien thoai|may anh))\b/)) return 'electronics_accessory';
  if (has(text, /\b(may lanh|may dieu hoa|dieu hoa|air conditioner|air conditioning|aircon)\b/)
    && !has(text, /\b(oto|xe hoi|car air conditioner|air conditioner cleaner|may rua dieu hoa)\b/)) return 'air_conditioner';
  if (has(text, /\b(tai nghe|headphone|headset|earphone|earbud|airpods|galaxy buds|wf-[a-z0-9-]+)\b/)) return 'headphone';
  if (has(text, /\b(chuot|mouse)\b/) && !has(text, /\b(mouse pad|lot chuot)\b/)) return 'mouse';
  if (has(text, /\b(smartwatch|smart watch|dong ho thong minh|apple watch|galaxy watch|garmin (?:venu|forerunner|vivoactive|fenix|instinct)|watch ultra)\b/)) return 'smartwatch';
  if (has(text, /\b(ban phim|keyboard)\b/) && has(text, /\b(tablet|ipad|galaxy tab|matepad|redmi pad|lenovo tab)\b/)) return 'keyboard';
  if (has(text, /\b(may tinh bang|tablet|ipad|matepad|galaxy tab|redmi pad|lenovo tab)\b/)) return 'tablet';
  if (has(text, /\b(ban phim|keyboard)\b/)) return 'keyboard';
  if (has(text, /\b(power bank|powerbank|pin sac du phong|sac du phong|cu sac|bo sac|adapter sac|sac usb|usb charger|charger|sac nhanh|sac khong day)\b/)) return 'charger';
  if (has(text, /\b(dien thoai|smartphone|iphone|galaxy (?:s|z|a|m)\d|redmi (?:note|\d)|poco [a-z0-9]|pixel \d|phone [1-9])\b/)) return 'phone';
  if (has(text, /\b(laptop|notebook|macbook|chromebook|may tinh xach tay)\b/)
    && !has(text, /\b(ram|ssd|hdd|o cung|pin laptop|de tan nhiet|tui laptop|cap sac)\b/)) return 'laptop';
  if (has(text, /\b(desktop|mini pc|may tinh de ban|all-in-one pc|may bo|pc gaming|workstation)\b/)) return 'desktop';
  if (has(text, /\b(mainboard|motherboard|bo mach chu)\b/)) return 'motherboard';
  if (has(text, /\b(ram|memory module|bo nho ram|ddr[345])\b/)) return 'ram';
  if (has(text, /\b(ssd|hdd|hard drive|solid state|o cung|nvme)\b/)) return 'storage';
  if (has(text, /\b(cpu|processor|bo vi xu ly|intel core i[3579]-?\d|amd ryzen [3579] [0-9])\b/)
    && !has(text, /\b(laptop|notebook|macbook|mini pc|desktop)\b/)) return 'cpu';
  if (has(text, /\b(gpu|graphics card|video card|card man hinh|geforce rtx|geforce gtx|radeon rx|quadro rtx|vga)\b/)
    && !has(text, /\b(laptop|notebook|macbook)\b/)) return 'gpu';
  if (has(text, /\b(projector|may chieu|beamer)\b/)) return 'projector';
  if (has(text, /\b(tv|tivi|television|smart tv|google tv|oled tv|qled tv)\b/)) return 'tv';
  if (has(text, /\b(may anh|digital camera|mirrorless camera|camera ip|camera wifi|camera an ninh|camera giam sat|webcam)\b/)) {
    if (has(text, /\b(webcam)\b/)) return 'webcam';
    return 'camera';
  }
  if (has(text, /\b(man hinh|monitor|gaming display)\b/) && !has(text, /\b(studio monitor|monitor speaker)\b/)) return 'monitor';
  if (has(text, /\b(audio interface|audio mixer|studio monitor|pa system|live sound mixer|mixer digital|midi controller)\b/)) return 'professional_audio';
  if (has(text, /\b(router|wifi mesh|wifi mesh|bo phat wifi|access point|switch mang|network switch|wifi 6|wifi 7|modem)\b/)) return 'networking';
  if (has(text, /\b(loa|speaker|soundbar|subwoofer)\b/)) return 'speaker';
  if (has(text, /\b(microphone|microphone|mic thu am|micro thu am|micro khong day)\b/)) return 'microphone';
  if (has(text, /\b(printer|scanner|may in|may quet)\b/) && !has(text, /\b(ink|muc in|cartridge)\b/)) return 'printer_scanner';
  if (has(text, /\b(vr headset|virtual reality|augmented reality|mixed reality|ar glasses|meta quest|apple vision pro)\b/)) return 'vr_ar';
  if (has(text, /\b(drone|quadcopter|flycam|uav)\b/)) return 'drone';
  if (has(text, /\b(nas|network attached storage|storage server|synology ds\d|qnap ts-?)\b/)) return 'nas';
  if (has(text, /\b(smart bulb|smart plug|smart lock|smart thermostat|smart sensor|smart home|home automation|den thong minh|den ngu thong minh|smart lamp|smart lighting)\b/)) return 'smart_home';
  if (has(text, /\b(uninterruptible power supply|ups battery|ups)\b/)) return 'ups';
  if (has(text, /\b(capture card|capture device|video capture|stream deck|streaming device)\b/)) return 'streaming_capture';
  if (has(text, /\b(e-reader|ereader|e reader|ebook reader|kindle|kobo)\b/)) return 'ereader';
  if (has(text, /\b(adapter|cap chuyen doi|cap usb|hub usb|phu kien|accessory|bao ve|day sac|cable)\b/)) return 'electronics_accessory';
  return null;
}

export function extractFeedBrand(item: DatafeedItem): string | null {
  if (typeof item.brand === 'string' && item.brand.trim()) return item.brand.trim();
  const title = normalize(String(item.name ?? ''));
  let best: { name: string; position: number; tokenLength: number } | null = null;
  for (const brand of knownBrands) {
    for (const candidate of [brand.name, ...(brand.aliases ?? [])]) {
      const normalized = normalize(candidate);
      if (!normalized) continue;
      const position = ` ${title} `.indexOf(` ${normalized} `);
      if (position < 0) continue;
      if (normalized === 'hp' && /\d(?:[.,]\d+)?\s*$/.test(title.slice(0, position))) continue;
      if (!best || position < best.position || (position === best.position && normalized.length > best.tokenLength)) {
        best = { name: brand.name, position, tokenLength: normalized.length };
      }
    }
  }
  return best?.name ?? null;
}

function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[\s,]/g, '')) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function safeHttps(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

export function mapAccessTradeCatalogListing(item: DatafeedItem, options: { domain: string; imageUsageAuthorized: boolean; maxAgeDays?: number; now?: Date }) {
  const seller = ACCESTRADE_SELLERS[options.domain];
  const name = typeof item.name === 'string' ? item.name.trim() : '';
  const category = classifyAccessTradeListing(item);
  const brand = extractFeedBrand(item);
  const productUrl = safeHttps(item.url);
  const affiliateUrl = safeHttps(item.aff_link);
  const sourceProductId = typeof item.product_id === 'string' && item.product_id.trim() ? item.product_id.trim()
    : typeof item.sku === 'string' && item.sku.trim() ? item.sku.trim() : typeof item.sku === 'number' ? String(item.sku) : null;
  const sourceUpdatedAt = parseAccessTradeDate(item.update_time);
  const now = options.now ?? new Date();
  const ageMs = sourceUpdatedAt ? now.getTime() - sourceUpdatedAt.getTime() : Number.POSITIVE_INFINITY;
  const maxAgeMs = Math.max(1, options.maxAgeDays ?? 14) * 24 * 60 * 60 * 1000;
  const isCurrent = Boolean(sourceUpdatedAt && ageMs >= -60 * 60 * 1000 && ageMs <= maxAgeMs);
  const statusDiscount = String(item.status_discount) === '1';
  const listedPrice = positiveNumber(item.price);
  const discountPrice = positiveNumber(item.discount);
  const price = statusDiscount && discountPrice ? discountPrice : listedPrice;
  const originalPrice = statusDiscount && listedPrice && price && listedPrice > price ? listedPrice : null;
  const currency = typeof item.currency === 'string' && item.currency.trim() ? item.currency.trim().toUpperCase()
    : seller ? 'VND' : null;
  const imageUrl = safeHttps(item.image);
  if (!seller || !name || !brand || !category || !sourceProductId || !productUrl || !affiliateUrl || !isCurrent || !price || currency !== 'VND') return null;
  const normalizedBrand = normalize(brand);
  if (category === 'phone' && !SMARTPHONE_BRANDS.has(normalizedBrand)) return null;
  if (category === 'smartwatch' && !SMARTWATCH_BRANDS.has(normalizedBrand)) return null;
  if (category === 'cpu' && !DESKTOP_CPU_BRANDS.has(normalizedBrand)) return null;
  if (category === 'laptop' && !LAPTOP_BRANDS.has(normalizedBrand)) return null;

  const title = normalize(name);
  const tags = [
    ...(category === 'headphone' && /\b(anc|active noise cancellation|active noise cancelling|chong on chu dong)\b/.test(title) ? ['anc'] : []),
    ...(/\b(gaming|game thu|choi game)\b/.test(title) ? ['gaming'] : []),
    ...(/\b(bluetooth|wireless|khong day)\b/.test(title) ? ['wireless'] : []),
  ];
  const sourceKey = seller!.sourceKey;
  const dataAttribution = `Thông tin sản phẩm và ưu đãi từ ${seller!.name} qua ACCESSTRADE`;
  const feedNotes = `Tên sản phẩm, mã feed, ảnh và giá được cung cấp trong Datafeed của ${seller!.name}; chỉ hiển thị cùng liên kết affiliate của cùng sản phẩm.`;
  const evidenceBase = { sourceName: seller!.name, sourceUrl: productUrl!, retrievedAt: now, verifiedAt: sourceUpdatedAt! };
  const specifications: Record<string, unknown> = {};
  const capacities = [...name.matchAll(/\b(\d{1,4})\s*(tb|gb)\b/gi)];
  const ram = category === 'ram'
    ? name.match(/\b(\d{1,3})\s*gb\b/i)
    : name.match(/\b(\d{1,3})\s*gb\s*(?:ram|memory)\b|\b(\d{1,3})\s*gb\s*[/+]\s*\d{1,4}\s*(?:tb|gb)\b/i)
      ?? (['phone', 'tablet', 'laptop'].includes(category) && capacities.length >= 2 ? name.match(/\b(\d{1,3})\s*gb\b/i) : null);
  const ramGB = ram ? Number(ram[1] ?? ram[2]) : null;
  if (ramGB) specifications.ramGB = ramGB;
  const storage = capacities.length > 1 ? capacities.at(-1) : capacities[0];
  if (category === 'ram') {
    const memoryType = name.match(/\b(ddr[345])\b/i);
    const memoryFrequency = name.match(/\b(\d{3,5})\s*mhz\b/i);
    if (memoryType) specifications.memoryType = memoryType[1].toUpperCase();
    if (memoryFrequency) specifications.memoryFrequencyMHz = Number(memoryFrequency[1]);
  } else if (storage && (!ramGB || Number(storage[1]) !== ramGB)) specifications.storage = `${storage[1]} ${storage[2].toUpperCase()}`;
  const power = name.match(/\b(\d{1,3}(?:[.,]\d{1,2})?)\s*w\b/i);
  if (power) specifications.listedPowerW = Number(power[1].replace(',', '.'));
  const capacity = name.match(/\b(\d{1,5}(?:[.,]\d{3})*)\s*mah\b/i);
  if (capacity) specifications.batteryCapacityMah = Number(capacity[1].replace(/[.,]/g, ''));
  if (category === 'air_conditioner') {
    const coolingHp = name.match(/\b(\d+(?:[.,]\d+)?)\s*(?:hp|h\.p\.)\b/i);
    if (coolingHp) specifications.coolingCapacityHp = Number(coolingHp[1].replace(',', '.'));
    const coolingBtu = name.match(/\b([\d,]+)\s*btu(?:\s*\/?\s*(?:h|hr))?\b/i);
    if (coolingBtu) specifications.coolingCapacityBtuH = Number(coolingBtu[1].replace(/,/g, ''));
    const refrigerant = name.match(/\b(r\s*32|r\s*410a|r\s*22)\b/i);
    if (refrigerant) specifications.refrigerant = refrigerant[1].replace(/\s+/g, '').toUpperCase();
    if (/\binverter\b/i.test(name)) specifications.technology = 'Inverter';
  }
  if (category === 'monitor' || category === 'tv') {
    const screenSize = name.match(/\b(\d{2}(?:[.,]\d+)?)\s*(?:inch(?:es)?|["″])/i);
    if (screenSize) specifications.screenSizeInches = Number(screenSize[1].replace(',', '.'));
    const resolution = name.match(/\b(8k|4k|qhd|uhd|full hd|fhd|2k|1080p|1440p)\b/i);
    if (resolution) specifications.resolution = resolution[1].toUpperCase();
    const panel = name.match(/\b(qd-oled|oled|qled|qned|nanocell|mini led|ips|va)\b/i);
    if (panel) specifications.panelType = panel[1].toUpperCase();
    const refreshRate = name.match(/\b(\d{2,3})\s*hz\b/i);
    if (refreshRate) specifications.refreshRateHz = Number(refreshRate[1]);
    const responseTime = name.match(/\b(\d+(?:[.,]\d+)?)\s*ms\b/i);
    if (responseTime && category === 'monitor') specifications.responseTimeMs = Number(responseTime[1].replace(',', '.'));
  }
  if (category === 'networking') {
    const wifiGeneration = name.match(/\bwi\s*[- ]?fi\s*([567])\b/i);
    if (wifiGeneration) specifications.wifiGeneration = Number(wifiGeneration[1]);
  }
  if (category === 'camera' || category === 'webcam') {
    const megapixels = name.match(/\b(\d+(?:[.,]\d+)?)\s*mp\b/i);
    if (megapixels) specifications.megapixels = Number(megapixels[1].replace(',', '.'));
  }
  const specs = normalizeSpecs(specifications);
  const description = typeof item.desc === 'string' && item.desc.trim() ? item.desc.trim() : null;
  const imagePermissionEvidence = imageUrl && options.imageUsageAuthorized
    ? `Ảnh do Datafeed ACCESSTRADE trả về trong cùng dòng mã sản phẩm; chỉ dùng trên thẻ có liên kết affiliate của chiến dịch. ${ACCESTRADE_TERMS_URL}` : null;
  const imageAttribution = imageUrl && options.imageUsageAuthorized ? `${seller!.name} qua ACCESSTRADE` : null;
  const sourceEvidence = [
    { evidenceType: 'identity', ...evidenceBase, notes: `${feedNotes} Mã sản phẩm feed: ${sourceProductId}.` },
    { evidenceType: 'product_page', ...evidenceBase, notes: 'Liên kết sản phẩm được nhà bán cung cấp qua Datafeed; tên/mã sản phẩm đi cùng liên kết trong cùng bản ghi.' },
    ...(Object.keys(specifications).length ? [{ evidenceType: 'specifications', ...evidenceBase, notes: 'Only fields explicitly present in the retailer listing title are extracted; this is not a complete manufacturer specification sheet.' }] : []),
    { evidenceType: 'retailer_feed', sourceName: 'ACCESSTRADE Datafeed', sourceUrl: ACCESTRADE_DATAFEED_DOCS, retrievedAt: now, verifiedAt: sourceUpdatedAt!, notes: feedNotes },
    { evidenceType: 'offer', sourceName: 'ACCESSTRADE Datafeed', sourceUrl: ACCESTRADE_DATAFEED_DOCS, retrievedAt: now, verifiedAt: sourceUpdatedAt!, notes: `Giá ${price.toLocaleString('en-US')} VND; thời gian update_time ${String(item.update_time)}.` },
    ...(imageUrl && options.imageUsageAuthorized ? [
      { evidenceType: 'image', sourceName: 'ACCESSTRADE Datafeed', sourceUrl: productUrl!, retrievedAt: now, verifiedAt: sourceUpdatedAt!, notes: 'Ảnh URL được trả về cùng mã sản phẩm và trang bán hàng trong một bản ghi feed.' },
      { evidenceType: 'image_rights', sourceName: 'ACCESSTRADE campaign terms', sourceUrl: ACCESTRADE_TERMS_URL, retrievedAt: now, verifiedAt: sourceUpdatedAt!, notes: imagePermissionEvidence! },
    ] : []),
  ];
  const idToken = normalize(`${options.domain}-${sourceProductId}`).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const model = name;
  const offer = {
    sellerName: seller!.name,
    price,
    originalPrice,
    discount: originalPrice ? originalPrice - price : null,
    currency: 'VND',
    productUrl,
    affiliateUrl,
    availability: typeof item.availability === 'string' ? item.availability : null,
    source: sourceKey,
    sourceProductId,
    verified: true,
    priceVerificationStatus: 'verified' as const,
    verificationNote: null,
    sourceRetrievedAt: now,
    verifiedAt: sourceUpdatedAt,
    lastUpdated: sourceUpdatedAt,
  };
  const product = {
    name,
    brand,
    model,
    modelNumber: null,
    family: null,
    generation: null,
    releaseYear: null,
    productStatus: 'active',
    category,
    description,
    imageUrl: imageUrl && options.imageUsageAuthorized ? imageUrl : null,
    imageSource: imageUrl && options.imageUsageAuthorized ? productUrl : null,
    imageSourceUrl: imageUrl && options.imageUsageAuthorized ? productUrl : null,
    imageAuthor: imageUrl && options.imageUsageAuthorized ? seller!.name : null,
    imageRetrievedAt: imageUrl && options.imageUsageAuthorized ? now : null,
    imageUsagePermission: imageUrl && options.imageUsageAuthorized ? 'granted' : 'not_provided',
    imagePermissionEvidence,
    imageLicense: imageUrl && options.imageUsageAuthorized ? 'ACCESSTRADE campaign feed' : null,
    imageLicenseUrl: imageUrl && options.imageUsageAuthorized ? ACCESTRADE_TERMS_URL : null,
    imageAttribution,
    imageVisualIdentityChecked: false,
    imageVerificationBasis: imageUrl && options.imageUsageAuthorized ? 'publisher_feed_same_product_record' : null,
    sourceUrl: productUrl,
    productUrl,
    specificationSourceUrl: productUrl,
    verified: true,
    verifiedAt: sourceUpdatedAt,
    verificationScope: 'retailer_feed',
    productVerificationStatus: 'verified',
    imageVerificationStatus: 'pending',
    urlVerificationStatus: 'verified',
    // Feed rows can be internally verified for product/price but still need
    // image identity and a complete product record before public listing.
    publicationStatus: 'pending',
    specifications,
    specs,
    normalizedSpecs: specs,
    variants: [],
    sourceEvidence,
    dataAttribution,
    dataSourceUrl: ACCESTRADE_DATAFEED_DOCS,
    dataLicense: ACCESTRADE_LISTING_LICENSE,
    dataLicenseUrl: ACCESTRADE_TERMS_URL,
    source: 'accesstrade',
    sourceProductId,
    sourceProductIds: [sourceProductId],
    sourceKey,
    dedupeKey: `accesstrade-listing:${idToken}`,
    electronicStatus: 'approved',
    price: null,
    originalPrice: null,
    rating: null,
    sold: null,
    stock: null,
    tags,
    searchText: normalize([name, brand, category, description ?? '', JSON.stringify(specifications), ...tags].join(' ')),
  };
  return { category, brand, model, sourceProductId, sourceKey, product, offer, updatedAt: sourceUpdatedAt!, imageIncluded: Boolean(product.imageUrl) };
}
