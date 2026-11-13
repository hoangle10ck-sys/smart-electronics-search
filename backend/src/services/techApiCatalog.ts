import { createHash } from 'node:crypto';

export const TECHAPI_ROOT = 'https://gettechapi.github.io/TechAPI';
export const TECHAPI_LICENSE_URL = 'https://github.com/GetTechAPI/TechAPI/blob/main/data/LICENSE.md';
export const TECHAPI_REPOSITORY_URL = 'https://github.com/GetTechAPI/TechAPI';

export type TechApiCatalogRef = {
  sourceCategory: string;
  sourceSlug: string;
  name: string;
  sourceRecordUrl: string;
  raw?: Record<string, unknown>;
};

export type TechApiImageReference = {
  imageUrl: string;
  filePageUrl: string;
  license: string;
  attribution: string;
};

const knownCategories = new Set(['smartphone', 'tablet', 'smartwatch', 'pda', 'gpu', 'cpu', 'laptop', 'monitor', 'device_catalog', 'soc']);

export function assertLocalMongoUri(uri: string): void {
  let parsed: URL;
  try { parsed = new URL(uri); } catch { throw new Error('MONGODB_URI is invalid. Provide a local MongoDB URI through the process environment.'); }
  const hostname = parsed.hostname.toLowerCase();
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)
    || !['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)
    || parsed.protocol === 'mongodb+srv:') {
    throw new Error('This importer only permits a MongoDB service on localhost; remote databases are blocked.');
  }
}

export function techApiDetailUrl(recordUrl: string): string {
  const url = new URL(recordUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'gettechapi.github.io' || !url.pathname.startsWith('/TechAPI/v1/')) {
    throw new Error('TechAPI record URL is outside the official HTTPS API host.');
  }
  if (url.search || url.hash) throw new Error('TechAPI record URL must not include query or fragment data.');
  if (!url.pathname.endsWith('/index.json')) url.pathname = `${url.pathname.replace(/\/$/, '')}/index.json`;
  return url.toString();
}

export function validateTechApiDetail(reference: TechApiCatalogRef, value: unknown): Record<string, any> {
  if (!knownCategories.has(reference.sourceCategory)) throw new Error(`Unsupported TechAPI category: ${reference.sourceCategory}`);
  if (!reference.sourceSlug.trim() || !reference.name.trim()) throw new Error('TechAPI reference is missing its slug or name.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`TechAPI detail is not an object: ${reference.sourceSlug}`);
  const detail = value as Record<string, any>;
  if (typeof detail.slug !== 'string' || detail.slug !== reference.sourceSlug) throw new Error(`TechAPI detail slug mismatch: ${reference.sourceSlug}`);
  if (typeof detail.name !== 'string' || detail.name.trim().toLowerCase() !== reference.name.trim().toLowerCase()) throw new Error(`TechAPI detail name mismatch: ${reference.sourceSlug}`);
  return detail;
}

export function techApiDetailSha256(detail: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(detail)).digest('hex');
}

export function techApiImageReference(raw: Record<string, any>): TechApiImageReference | null {
  const imageUrl = typeof raw.image_url === 'string' ? raw.image_url : '';
  const license = typeof raw.image_license === 'string' ? raw.image_license.trim() : '';
  const attribution = typeof raw.image_attribution === 'string' ? raw.image_attribution.trim() : '';
  if (!license || !attribution) return null;

  let image: URL;
  try { image = new URL(imageUrl); } catch { return null; }
  if (image.protocol !== 'https:' || image.hostname !== 'upload.wikimedia.org') return null;
  const pathParts = image.pathname.split('/').filter(Boolean);
  let filename: string;
  try { filename = decodeURIComponent(pathParts[pathParts.length - 1] ?? ''); } catch { return null; }
  if (!filename || filename.includes('/') || filename.includes('\\')) return null;

  return {
    imageUrl: image.toString(),
    filePageUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename).replace(/%20/g, '_')}`,
    license,
    attribution,
  };
}

function scalarStrings(value: unknown, depth = 0): string[] {
  if (depth > 3 || value == null) return [];
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => scalarStrings(item, depth + 1));
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap((item) => scalarStrings(item, depth + 1));
  return [];
}

const ignoredSearchField = /^(id|slug|url|.*url.*|.*image.*|.*logo.*|.*license.*|.*attribution.*|score|verified|source_urls|created_at|updated_at)$/i;

export function buildTechApiSearchText(raw: Record<string, unknown>): string {
  const values: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (ignoredSearchField.test(key)) continue;
    values.push(key.replace(/_/g, ' '), ...scalarStrings(value));
  }
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].join(' ').slice(0, 20000);
}
