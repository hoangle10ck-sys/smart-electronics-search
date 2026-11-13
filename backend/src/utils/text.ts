import { CATEGORIES } from '../services/dictionary';

/** Chữ thường, bỏ dấu tiếng Việt, gom khoảng trắng. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(\d)\s*[-–—]\s*(\d)/g, '$1 den $2')
    // Keep decimal separators such as 3.2 GHz, but treat sentence punctuation as a word boundary.
    .replace(/(?<!\d)\.(?!\d)/g, ' ')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildSearchText(p: {
  name: string; brand: string; category: string; description?: string; tags?: string[]; specs?: Record<string, unknown>;
}): string {
  return normalize(
    [p.name, p.brand, p.category, CATEGORIES[p.category]?.label ?? '', p.description ?? '', ...(p.tags ?? []), ...Object.values(p.specs ?? {})].join(' ')
  );
}
