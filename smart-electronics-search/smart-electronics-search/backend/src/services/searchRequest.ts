import { BRANDS, CATEGORIES, TAGS } from './dictionary';
import { ParsedQuery, SortMode, parseQuery } from './queryParser';
import { SearchMode } from './searchService';
import { CANONICAL_CATEGORY_KEYS, canonicalCategory } from './taxonomy';
import { normalize } from '../utils/text';

export interface ValidatedSearchRequest {
  query: string;
  page: number;
  limit: number;
  sort?: SortMode;
  mode: SearchMode;
}

type ValidationResult = { data: ValidatedSearchRequest; error?: never } | { data?: never; error: string };

function numberField(value: unknown, field: string, min: number, max: number, integer = true): number | undefined | string {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)) || parsed < min || parsed > max) return `${field} is out of range`;
  return parsed;
}

function canonicalBrand(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const target = normalize(value);
  return Object.entries(BRANDS).find(([brand, aliases]) => normalize(brand) === target || aliases.some((alias) => normalize(alias) === target))?.[0];
}

function explicitCategories(query: ParsedQuery, raw: string) {
  const normalized = ` ${normalize(raw)} `;
  return query.category && (CATEGORIES[query.category]?.terms ?? []).some((term) => normalized.includes(` ${normalize(term)} `));
}

export function validateSearchRequest(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'request body/query must be an object' };
  const value = input as Record<string, any>;
  const rawQuery = value.query ?? value.q ?? '';
  if (typeof rawQuery !== 'string' || rawQuery.length > 300) return { error: 'query must be a string with at most 300 characters' };
  const filters: string[] = [rawQuery.trim()].filter(Boolean);
  const parsedQuery = parseQuery(rawQuery.trim());
  if (parsedQuery.validationIssues.length) return { error: parsedQuery.validationIssues.join(' ') };

  let category: string | undefined;
  if (value.category !== undefined) {
    if (typeof value.category !== 'string') return { error: 'category must be a string' };
    category = canonicalCategory(value.category.trim());
    if (!CANONICAL_CATEGORY_KEYS.includes(category) || !(category in CATEGORIES)) return { error: 'category is not supported' };
    if (parsedQuery.category && explicitCategories(parsedQuery, rawQuery) && parsedQuery.category !== category) return { error: 'category conflicts with the query text' };
    if (!(parsedQuery.category && parsedQuery.category === category)) filters.push(CATEGORIES[category].terms[0]!);
  }

  const rawBrands = value.brands ?? value.brand;
  let brands: string[] = [];
  if (rawBrands !== undefined) {
    const list = Array.isArray(rawBrands) ? rawBrands : [rawBrands];
    if (!list.length || list.length > 8) return { error: 'brand must contain 1 to 8 supported brands' };
    const resolved = list.map(canonicalBrand);
    if (resolved.some((brand) => !brand)) return { error: 'brand contains an unsupported value' };
    brands = [...new Set(resolved as string[])];
    if (parsedQuery.brands.length && !parsedQuery.brands.some((brand) => brands.includes(brand))) return { error: 'brand conflicts with the query text' };
    if (!parsedQuery.brands.length) filters.push(...brands);
  }

  const minPrice = numberField(value.minPrice, 'minPrice', 0, 1_000_000_000_000);
  const maxPrice = numberField(value.maxPrice, 'maxPrice', 1, 1_000_000_000_000);
  if (typeof minPrice === 'string') return { error: minPrice };
  if (typeof maxPrice === 'string') return { error: maxPrice };
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) return { error: 'minPrice cannot exceed maxPrice' };
  if ((minPrice !== undefined || maxPrice !== undefined) && (parsedQuery.minPrice !== undefined || parsedQuery.maxPrice !== undefined)) return { error: 'provide budget in either the query or filter fields, not both' };
  if (minPrice !== undefined && maxPrice !== undefined) filters.push(`từ ${minPrice} đến ${maxPrice}`);
  else if (minPrice !== undefined) filters.push(`trên ${minPrice}`);
  else if (maxPrice !== undefined) filters.push(`dưới ${maxPrice}`);
  if (value.currency !== undefined && String(value.currency).toUpperCase() !== 'VND') return { error: 'only VND is supported for price filters' };

  const specs = value.specifications ?? value.specs ?? {};
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return { error: 'specifications must be an object' };
  const allowedSpecKeys = new Set(['ramGB', 'storageGB', 'storageType', 'vramGB', 'displayInches']);
  if (Object.keys(specs).some((key) => !allowedSpecKeys.has(key))) return { error: 'specifications contains an unsupported key' };
  const specLimits: Record<string, [number, number, boolean]> = {
    ramGB: [1, 2048, true], storageGB: [1, 1_000_000, true], vramGB: [1, 256, true], displayInches: [3, 100, false],
  };
  for (const [key, bounds] of Object.entries(specLimits)) {
    const parsed = numberField(specs[key], key, bounds[0], bounds[1], bounds[2]);
    if (typeof parsed === 'string') return { error: parsed };
    if (typeof parsed === 'number') {
      const existing = (parsedQuery as any)[key === 'ramGB' ? 'ram' : key];
      if (existing !== undefined && existing !== parsed) return { error: `${key} conflicts with the query text` };
      if (existing === undefined) {
        if (key === 'ramGB') filters.push(`RAM ${parsed}GB`);
        else if (key === 'storageGB') filters.push(`${parsed}GB storage`);
        else if (key === 'vramGB') filters.push(`VRAM ${parsed}GB`);
        else if (key === 'displayInches') filters.push(`${parsed} inch`);
      }
    }
  }
  if (specs.storageType !== undefined) {
    if (typeof specs.storageType !== 'string' || !['ssd', 'hdd'].includes(specs.storageType.toLowerCase())) return { error: 'storageType must be ssd or hdd' };
    const storageType = specs.storageType.toLowerCase();
    if (parsedQuery.storageType && parsedQuery.storageType !== storageType) return { error: 'storageType conflicts with the query text' };
    if (!parsedQuery.storageType) filters.push(storageType.toUpperCase());
  }

  const useCases = value.useCases ?? value.use_cases ?? [];
  if (!Array.isArray(useCases) || useCases.length > 12 || useCases.some((tag) => typeof tag !== 'string' || !(tag in TAGS))) return { error: 'useCases must contain supported use-case names' };
  for (const tag of useCases as string[]) if (!parsedQuery.tags.includes(tag)) filters.push(TAGS[tag]!.terms[0]!);

  const page = numberField(value.page, 'page', 1, 1000) ?? 1;
  const limit = numberField(value.limit, 'limit', 1, 60) ?? 24;
  if (typeof page === 'string') return { error: page };
  if (typeof limit === 'string') return { error: limit };
  const sortRaw = value.sort === undefined ? 'relevance' : String(value.sort);
  const sort = sortRaw === 'relevance' ? undefined : (['price_asc', 'price_desc', 'popular', 'rating'].includes(sortRaw) ? sortRaw as SortMode : null);
  if (sort === null) return { error: 'sort must be relevance, price_asc, price_desc, popular, or rating' };
  const modeRaw = value.searchMode ?? value.search_mode ?? 'hybrid';
  if (!['hybrid', 'exact', 'keyword', 'semantic'].includes(modeRaw)) return { error: 'searchMode must be hybrid, exact, keyword, or semantic' };
  const query = filters.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (!query) return { error: 'query or at least one supported filter is required' };
  if (query.length > 300) return { error: 'combined query and filters exceed 300 characters' };
  return { data: { query, page: page as number, limit: limit as number, sort: sort ?? undefined, mode: modeRaw as SearchMode } };
}
