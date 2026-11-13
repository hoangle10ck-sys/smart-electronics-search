import { CATEGORIES } from './dictionary';

/**
 * Canonical catalog taxonomy. `watch` is retained as a legacy alias and is
 * normalized to `smartwatch`; no other category is collapsed.
 */
export const CATEGORY_ALIASES: Record<string, string> = {
  watch: 'smartwatch',
};

export const CANONICAL_CATEGORIES = Object.entries(CATEGORIES)
  .filter(([key]) => key !== 'watch')
  .map(([key, value]) => ({ key, label: value.label }));

export const CANONICAL_CATEGORY_KEYS = CANONICAL_CATEGORIES.map(({ key }) => key);

export function canonicalCategory(category: string): string {
  return CATEGORY_ALIASES[category] ?? category;
}
