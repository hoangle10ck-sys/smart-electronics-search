import { Product } from '../models/Product';
import { CATEGORIES, TAGS } from './dictionary';
import { parseQuery, ParsedQuery, SortMode } from './queryParser';
import { escapeRegex, normalize } from '../utils/text';

type Filter = Record<string, unknown>;

function buildFilter(p: ParsedQuery, o: { ram: boolean; brand: boolean; widen: number }): Filter {
  const f: Filter = {};
  if (p.category) f.category = p.category;
  if (o.brand && p.brands.length) f.brand = { $in: p.brands };
  if (p.minPrice !== undefined || p.maxPrice !== undefined) {
    const price: Record<string, number> = {};
    if (p.minPrice !== undefined) price.$gte = Math.round(p.minPrice * (1 - o.widen));
    if (p.maxPrice !== undefined) price.$lte = Math.round(p.maxPrice * (1 + o.widen));
    f.price = price;
  }
  if (o.ram && p.ram) f['specs.ram'] = { $gte: p.ram };
  return f;
}

export async function smartSearch(q: string, limit = 24, sortOverride?: SortMode) {
  const parsed = parseQuery(q);
  const notes: string[] = [];

  // Thử điều kiện chặt trước, không có kết quả thì nới dần và báo cho người dùng biết.
  const steps = [
    { note: '', ram: true, brand: true, widen: 0 },
    { note: 'Không có máy đúng cấu hình RAM, đã nới điều kiện RAM.', ram: false, brand: true, widen: 0 },
    { note: 'Đã nới khoảng giá thêm 25% để có kết quả gần nhất.', ram: false, brand: true, widen: 0.25 },
    { note: 'Không có đúng hãng yêu cầu, đã gợi ý thêm hãng khác.', ram: false, brand: false, widen: 0.25 },
  ];
  let candidates: any[] = [];
  let seen = '';
  for (const s of steps) {
    const filter = buildFilter(parsed, s);
    const key = JSON.stringify(filter);
    if (key === seen) continue;
    seen = key;
    candidates = await Product.find(filter).limit(300).lean();
    if (candidates.length) { if (s.note) notes.push(s.note); break; }
  }

  // Chấm điểm mức độ phù hợp
  const scored = candidates.map((c) => {
    const name = normalize(c.name);
    const reasons: string[] = [];
    let relevance = 0;

    const tagHits = parsed.tags.filter((t) => (c.tags ?? []).includes(t));
    tagHits.forEach((t) => reasons.push(`Phù hợp nhu cầu: ${TAGS[t].label}`));
    relevance += tagHits.length * 3;

    for (const k of parsed.keywords) {
      if (name.includes(k)) relevance += 2;
      else if (c.searchText?.includes(k)) relevance += 1;
    }
    if (parsed.ram && (c.specs?.ram ?? 0) >= parsed.ram) reasons.push(`RAM ${c.specs.ram}GB`);
    if (parsed.maxPrice && c.price <= parsed.maxPrice) reasons.push('Trong ngân sách');

    let score = relevance * 2 + (c.rating ?? 4) * 0.4 + Math.log10((c.sold ?? 0) + 1) * 0.3;
    if (parsed.maxPrice) score += (c.price / parsed.maxPrice) * 0.5; // ưu tiên máy tận dụng hết ngân sách
    return { ...c, score: Number(score.toFixed(2)), relevance, reasons };
  });

  const hasSignal = parsed.tags.length > 0 || parsed.keywords.length > 0;
  let results = scored;
  if (hasSignal) {
    const matched = scored.filter((x) => x.relevance > 0);
    if (matched.length) results = matched;
    else notes.push('Chưa có sản phẩm khớp hoàn toàn nhu cầu, đây là các sản phẩm gần nhất.');
  }

  const sort = sortOverride ?? parsed.sort;
  const cmp: Record<SortMode, (a: any, b: any) => number> = {
    price_asc: (a, b) => a.price - b.price,
    price_desc: (a, b) => b.price - a.price,
    popular: (a, b) => b.sold - a.sold,
    rating: (a, b) => b.rating - a.rating,
  };
  results.sort(sort ? cmp[sort] : (a, b) => b.score - a.score);

  return {
    query: q,
    intent: {
      category: parsed.category ? CATEGORIES[parsed.category].label : undefined,
      brands: parsed.brands,
      minPrice: parsed.minPrice,
      maxPrice: parsed.maxPrice,
      ram: parsed.ram,
      tags: parsed.tags.map((t) => TAGS[t].label),
      keywords: parsed.keywords,
    },
    notes,
    total: results.length,
    items: results.slice(0, limit).map(({ relevance, searchText, ...rest }) => rest),
  };
}

export async function suggestProducts(q: string, limit = 6) {
  const tokens = normalize(q).split(' ').filter(Boolean).slice(0, 4);
  if (!tokens.length) return [];
  return Product.find({ $and: tokens.map((t) => ({ searchText: { $regex: escapeRegex(t) } })) })
    .sort({ sold: -1 })
    .limit(limit)
    .select('name category')
    .lean();
}
