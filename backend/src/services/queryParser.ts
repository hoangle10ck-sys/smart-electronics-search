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
  tags: string[];
  keywords: string[];
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
const AROUND = re(`(?:khoang|tam|co|gia)?\\s*${NUM}\\s*(trieu|tr|m|k|nghin|ty)\\b${NOT_SPEC}`);
const RAM = /(\d+)\s*gb\s*ram|ram\s*(\d+)\s*(?:gb)?/;

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
  const p: ParsedQuery = { raw, brands: [], tags: [], keywords: [] };

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
  }

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
