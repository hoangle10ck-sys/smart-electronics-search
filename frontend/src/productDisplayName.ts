import type { Product } from './api';

type ProductNameSource = Pick<Product, 'name'> & Partial<Pick<Product, 'brand' | 'model'>>;

function withoutReleaseYear(value: string): string {
  return value
    .replace(/,\s*(?:19|20)\d{2}(?=\))/g, '')
    .replace(/\s+\((?:19|20)\d{2}\)$/i, '')
    .trim();
}

function withoutBrandPrefix(value: string, brand: string | null | undefined): string {
  const cleanBrand = brand?.trim();
  return cleanBrand && value.toLocaleLowerCase().startsWith(`${cleanBrand.toLocaleLowerCase()} `)
    ? value.slice(cleanBrand.length).trim()
    : value;
}

export function getProductDisplayName(product: ProductNameSource): string {
  const cleanName = withoutReleaseYear(product.name.trim());
  const model = product.model?.trim();
  if (!model) return cleanName;

  const cleanModel = withoutReleaseYear(model);
  const nameWithoutBrand = withoutBrandPrefix(cleanName, product.brand);
  const modelWithoutBrand = withoutBrandPrefix(cleanModel, product.brand);
  const nameWithoutStorageVariant = nameWithoutBrand.replace(/\s+\d+(?:[.,]\d+)?\s*(?:GB|TB)$/i, '').trim();

  if (nameWithoutBrand.toLocaleLowerCase() === modelWithoutBrand.toLocaleLowerCase()
    || nameWithoutStorageVariant.toLocaleLowerCase() === modelWithoutBrand.toLocaleLowerCase()) {
    return modelWithoutBrand;
  }

  return cleanName;
}
