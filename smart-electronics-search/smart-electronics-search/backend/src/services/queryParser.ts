import { normalize } from '../utils/text';
import { BRANDS, CATEGORIES, KEEP_AS_KEYWORD, STOPWORDS, TAGS } from './dictionary';

export type SortMode = 'price_asc' | 'price_desc' | 'popular' | 'rating';

export interface ParsedQuery {
  raw: string;
  category?: string;
  brands: string[];
  minPrice?: number;
  maxPrice?: number;
  ram?: number;
  storageGB?: number;
  storageType?: 'ssd' | 'hdd';
  vramGB?: number;
  displayInches?: number;
  tags: string[];
  keywords: string[];
  validationIssues: string[];
  sort?: SortMode;
}

const NUM = '(\\d+(?:\\.\\d+)?)';
const UNIT = '(trieu|tr|m|k|nghin|ty)?\\b';
const NOT_SPEC = '(?!\\s*(?:gb|tb|inch|hz|mah|mp|w|g)\\b)'; // "256 gb" không phải giá
const re = (s: string) => new RegExp(s);

const RANGE = re(`(?:tu\\s+)?${NUM}\\s*${UNIT}\\s*(?:den|toi)\\s*${NUM}\\s*${UNIT}${NOT_SPEC}`);
const UP = re(`(?:tu\\s+)?${NUM}\\s*${UNIT}\\s*tro len`);
const DOWN = re(`${NUM}\\s*${UNIT}\\s*tro xuong`);
const MAX = re(`(?:duoi|toi da|khong qua|re hon|nho hon)\\s*${NUM}\\s*${UNIT}${NOT_SPEC}`);
const MIN = re(`(?:tren|toi thieu|lon hon|it nhat)\\s*${NUM}\\s*${UNIT}${NOT_SPEC}`);
const AROUND = re(`(?:khoang|tam|xap xi|quanh)(?:\\s+gia)?\\s*${NUM}\\s*(trieu|tr|m|k|nghin|ty)\\b${NOT_SPEC}`);
const BARE_BUDGET = re(`${NUM}\\s*(trieu|tr|m|k|nghin|ty)\\b${NOT_SPEC}`);
const RAM = /(\d+)\s*gb\s*ram|ram\s*(?:(?:toi thieu|it nhat|minimum|min|at least)\s*)?(\d+)\s*(?:gb)?/;
const STORAGE = /(\d+(?:\.\d+)?)\s*(tb|gb)\s*(?:ssd|storage|o cung)?|(?:ssd|storage|o cung)\s*(\d+(?:\.\d+)?)\s*(tb|gb)/;
const STORAGE_TYPE = /\b(ssd|solid state drive|nvme|hdd|hard disk drive)\b/;
const VRAM = /(?:vram|gpu memory|bo nho do hoa)\s*(\d+(?:\.\d+)?)\s*(tb|gb)?|(\d+(?:\.\d+)?)\s*(tb|gb)\s*vram/;
const DISPLAY = /(\d+(?:\.\d+)?)\s*(?:inch|inches|in|\")/;

function toVnd(n: string, unit?: string): number {
  const v = parseFloat(n);
  switch (unit) {
    case 'trieu': case 'tr': case 'm': return v * 1e6;
    case 'k': case 'nghin': return v * 1e3;
    case 'ty': return v * 1e9;
    default: return v <= 200 ? v * 1e6 : v; // "dưới 15" => 15 triệu
  }
}

const hasPhrase = (text: string, term: string) => ` ${text} `.includes(` ${term} `);
const removePhrase = (text: string, term: string) => (` ${text} `).split(` ${term} `).join('  ').trim();

/** Tìm thuật ngữ dài nhất khớp trong từng nhóm. */
function bestTerm(text: string, terms: string[]): string | undefined {
  return terms.filter((t) => hasPhrase(text, t)).sort((a, b) => b.length - a.length)[0];
}

export function parseQuery(raw: string): ParsedQuery {
  let text = normalize(raw);
  const categoryFromOriginalText = Object.entries(CATEGORIES)
    .flatMap(([key, category]) => category.terms
      .filter((term) => hasPhrase(text, term))
      .map((term) => ({ key, term })))
    .sort((left, right) => right.term.length - left.term.length)[0]?.key;
  const p: ParsedQuery = { raw, brands: [], tags: [], keywords: [], validationIssues: [] };

  // ---- sắp xếp
  const sorts: [string[], SortMode][] = [
    [['re nhat', 'gia thap nhat'], 'price_asc'],
    [['dat nhat', 'gia cao nhat'], 'price_desc'],
    [['ban chay', 'pho bien', 'nhieu nguoi mua'], 'popular'],
    [['tot nhat', 'danh gia cao'], 'rating'],
  ];
  for (const [terms, mode] of sorts) if (terms.some((t) => hasPhrase(text, t))) { p.sort = mode; break; }

  // ---- RAM
  const ramM = text.match(RAM);
  if (ramM) { p.ram = parseInt(ramM[1] || ramM[2], 10); text = text.replace(ramM[0], ' '); }

  const storageM = text.match(STORAGE);
  if (storageM) {
    const amount = Number(storageM[1] || storageM[3]);
    const unit = (storageM[2] || storageM[4] || 'gb').toLowerCase();
    // Consumer storage labels use decimal units: 1 TB = 1,000 GB.
    p.storageGB = Math.round(amount * (unit === 'tb' ? 1000 : 1));
    const storageText = normalize(storageM[0]);
    if (/\b(ssd|nvme)\b/.test(storageText)) p.storageType = 'ssd';
    else if (/\bhdd\b/.test(storageText)) p.storageType = 'hdd';
    text = text.replace(storageM[0], ' ');
  }
  const storageTypeM = text.match(STORAGE_TYPE);
  if (storageTypeM) {
    p.storageType = /hdd|hard disk drive/.test(storageTypeM[1]) ? 'hdd' : 'ssd';
    text = text.replace(storageTypeM[0], ' ');
  }
  const vramM = text.match(VRAM);
  if (vramM) {
    const amount = Number(vramM[1] || vramM[3]);
    const unit = (vramM[2] || vramM[4] || 'gb').toLowerCase();
    p.vramGB = Math.round(amount * (unit === 'tb' ? 1024 : 1));
    text = text.replace(vramM[0], ' ');
  }
  const displayM = text.match(DISPLAY);
  if (displayM) { p.displayInches = Number(displayM[1]); text = text.replace(displayM[0], ' '); }

  // ---- giá
  const take = (r: RegExp) => { const m = text.match(r); if (m) text = text.replace(m[0], ' '); return m; };
  let m: RegExpMatchArray | null;
  if ((m = take(RANGE))) {
    const a = toVnd(m[1], m[2] ?? m[4]);
    const b = toVnd(m[3], m[4] ?? m[2]);
    p.minPrice = Math.min(a, b); p.maxPrice = Math.max(a, b);
  } else if ((m = take(UP))) p.minPrice = toVnd(m[1], m[2]);
  else if ((m = take(DOWN))) p.maxPrice = toVnd(m[1], m[2]);
  else if ((m = take(MAX))) p.maxPrice = toVnd(m[1], m[2]);
  else if ((m = take(MIN))) p.minPrice = toVnd(m[1], m[2]);
  else if ((m = take(AROUND))) {
    const v = toVnd(m[1], m[2]);
    p.minPrice = Math.round(v * 0.8); p.maxPrice = Math.round(v * 1.2);
  } else if ((m = take(BARE_BUDGET))) {
    // A bare amount in a shopping query is a budget ceiling. Use a range only
    // when the customer explicitly says “khoảng/tầm/xấp xỉ/quanh”.
    p.maxPrice = toVnd(m[1], m[2]);
  }

  if ([p.minPrice, p.maxPrice].some((value) => value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1_000_000_000_000))) {
    p.validationIssues.push('Giá phải nằm trong khoảng từ 0 đến 1.000.000.000.000 VND.');
    delete p.minPrice;
    delete p.maxPrice;
  }
  if (p.ram !== undefined && (!Number.isFinite(p.ram) || p.ram < 1 || p.ram > 2048)) {
    p.validationIssues.push('RAM yêu cầu phải nằm trong khoảng từ 1 đến 2048 GB.');
    delete p.ram;
  }
  if (p.storageGB !== undefined && (!Number.isFinite(p.storageGB) || p.storageGB < 1 || p.storageGB > 1_000_000)) {
    p.validationIssues.push('Dung lượng lưu trữ phải nằm trong khoảng từ 1 đến 1.000.000 GB.');
    delete p.storageGB;
  }
  if (p.vramGB !== undefined && (!Number.isFinite(p.vramGB) || p.vramGB < 1 || p.vramGB > 256)) {
    p.validationIssues.push('VRAM yêu cầu phải nằm trong khoảng từ 1 đến 256 GB.');
    delete p.vramGB;
  }
  if (p.displayInches !== undefined && (!Number.isFinite(p.displayInches) || p.displayInches < 3 || p.displayInches > 100)) {
    p.validationIssues.push('Kích thước màn hình phải nằm trong khoảng từ 3 đến 100 inch.');
    delete p.displayInches;
  }

  // ---- loại sản phẩm (thuật ngữ dài nhất thắng)
  let bestCat: { key: string; term: string } | undefined;
  for (const [key, c] of Object.entries(CATEGORIES)) {
    const t = bestTerm(text, c.terms);
    if (t && (!bestCat || t.length > bestCat.term.length)) bestCat = { key, term: t };
  }
  if (bestCat) {
    p.category = bestCat.key;
    for (const t of CATEGORIES[bestCat.key].terms) if (!KEEP_AS_KEYWORD.has(t)) text = removePhrase(text, t);
  } else if (categoryFromOriginalText) p.category = categoryFromOriginalText;

  // ---- hãng
  for (const [name, terms] of Object.entries(BRANDS)) {
    if (terms.some((t) => hasPhrase(text, t))) {
      p.brands.push(name);
      for (const t of terms) if (!KEEP_AS_KEYWORD.has(t)) text = removePhrase(text, t);
    }
  }

  // ---- nhu cầu sử dụng
  for (const [key, tag] of Object.entries(TAGS)) {
    const hit = tag.terms.filter((t) => hasPhrase(text, t));
    if (hit.length) { p.tags.push(key); hit.forEach((t) => (text = removePhrase(text, t))); }
  }

  // ---- từ khoá còn lại (tên dòng máy, model...)
  p.keywords = [...new Set(text.split(' ').filter((w) => w && !STOPWORDS.has(w) && (w.length > 1 || /\d/.test(w))))];
  return p;
}
