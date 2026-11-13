import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalize } from '../utils/text';
import { CANONICAL_CATEGORY_KEYS } from '../services/taxonomy';

export type CatalogProduct = {
  sourceProductId: string; name: string; brand: string; model: string; category: string;
  imageUrl: string; imageSource: string; imageUsagePermission: 'granted'; imageLicense: string;
  imageLicenseUrl: string; imageAttribution: string; productUrl: string; specificationSourceUrl: string;
  specifications: Record<string, string>; specs: Record<string, string | number>;
  source: 'curated'; verified: true; verifiedAt: string;
};

export function validateCatalogProducts(products: CatalogProduct[]) {
  const required = ['sourceProductId', 'name', 'brand', 'model', 'category', 'imageUrl', 'imageSource', 'imageLicense', 'imageLicenseUrl', 'imageAttribution', 'productUrl', 'specificationSourceUrl'];
  if (!products.length) throw new Error('catalog.json is empty; no products were imported');
  for (const product of products) {
    const missing = required.filter((field) => !product[field as keyof CatalogProduct]);
    if (missing.length || product.verified !== true || product.imageUsagePermission !== 'granted' || !Object.keys(product.specifications ?? {}).length) {
      throw new Error(`Incomplete/unverified product ${product.sourceProductId}: ${missing.join(', ') || 'verification or image license missing'}`);
    }
    if (!Number.isFinite(Date.parse(product.verifiedAt))) throw new Error(`Invalid verification date for ${product.sourceProductId}`);
    if (!CANONICAL_CATEGORY_KEYS.includes(product.category)) throw new Error(`Unknown canonical category ${product.category} for ${product.sourceProductId}`);
  }
  const uniqueKeys = new Set(products.map((product) => normalize(`${product.brand}-${product.model}`)));
  if (uniqueKeys.size !== products.length) throw new Error('Duplicate brand/model entries in catalog.json');
}

export async function checkCatalogUrl(value: string, image = false) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`Expected public HTTPS URL: ${value}`);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'smart-electronics-search/1.0 (licensed catalog URL verification)' },
      signal: AbortSignal.timeout(12000),
    });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': 'smart-electronics-search/1.0 (licensed catalog URL verification)', Range: 'bytes=0-0' },
        signal: AbortSignal.timeout(12000),
      });
      await response.body?.cancel();
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    if (!response.ok) throw new Error(`URL verification failed (HTTP ${response.status}): ${value}`);
    if (image && !response.headers.get('content-type')?.toLowerCase().startsWith('image/')) {
      throw new Error(`Image URL did not return an image: ${value}`);
    }
    return;
  }
}

export async function loadAndValidateCatalog() {
  const products = JSON.parse(await readFile(resolve(__dirname, 'catalog.json'), 'utf8')) as CatalogProduct[];
  validateCatalogProducts(products);
  const checks = products.flatMap((product) => [
    () => checkCatalogUrl(product.imageUrl, true),
    () => checkCatalogUrl(product.productUrl),
    () => checkCatalogUrl(product.specificationSourceUrl),
  ]);
  let next = 0;
  const workers = Array.from({ length: Math.min(8, checks.length) }, async () => {
    while (next < checks.length) {
      const index = next++;
      await checks[index]();
    }
  });
  await Promise.all(workers);
  return products;
}
