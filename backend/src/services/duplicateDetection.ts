import { normalizeProduct } from './productNormalizer';
import { normalize } from '../utils/text';

export interface DuplicateCandidateInput extends Record<string, any> {
  _id: unknown;
  name?: string;
  brand?: string;
  model?: string;
  modelNumber?: string;
  sku?: string;
}

export interface DuplicateCandidateGroup {
  identityType: 'sku' | 'model_number' | 'brand_model' | 'alias';
  normalizedIdentity: string;
  reviewType: 'same_identity_review' | 'same_model_different_configuration';
  productIds: string[];
  products: Array<{ id: string; name?: string; brand?: string; model?: string; modelNumber?: string; configuration: Record<string, unknown> }>;
}

function keysFor(product: DuplicateCandidateInput) {
  const normalized = normalizeProduct(product);
  const brand = normalized.normalizedBrand ?? '';
  const keys: string[] = [];
  if (normalized.normalizedSku) keys.push(`sku:${normalized.normalizedSku}`);
  if (normalized.normalizedModelNumber) keys.push(`model_number:${brand}:${normalized.normalizedModelNumber}`);
  if (normalized.normalizedModel) keys.push(`brand_model:${brand}:${normalized.normalizedModel}`);
  for (const alias of normalized.aliases) keys.push(`alias:${brand}:${alias}`);
  return [...new Set(keys)];
}

function configuration(product: DuplicateCandidateInput) {
  const normalized = normalizeProduct(product).normalizedSpecs;
  return {
    ramGB: normalized.ramGB ?? null,
    storageGB: normalized.storageGB ?? null,
    storageType: normalized.storageType ?? null,
    vramGB: normalized.vramGB ?? null,
    cpuModel: normalize(String(normalized.cpuModel ?? '')) || null,
    gpuModel: normalize(String(normalized.gpuModel ?? '')) || null,
  };
}

/** Reports exact identifier collisions for human review; it never merges products. */
export function detectDuplicateCandidates(products: DuplicateCandidateInput[]): DuplicateCandidateGroup[] {
  const groups = new Map<string, DuplicateCandidateInput[]>();
  for (const product of products) {
    for (const key of keysFor(product)) groups.set(key, [...(groups.get(key) ?? []), product]);
  }
  const candidates: DuplicateCandidateGroup[] = [];
  for (const [key, matches] of groups) {
    const unique = [...new Map(matches.map((product) => [String(product._id), product])).values()];
    if (unique.length < 2) continue;
    const configurations = unique.map(configuration);
    const reviewType = new Set(configurations.map((value) => JSON.stringify(value))).size > 1
      ? 'same_model_different_configuration'
      : 'same_identity_review';
    const [identityType, ...identityParts] = key.split(':');
    candidates.push({
      identityType: identityType as DuplicateCandidateGroup['identityType'], normalizedIdentity: identityParts.join(':'), reviewType,
      productIds: unique.map((product) => String(product._id)),
      products: unique.map((product) => ({
        id: String(product._id), name: product.name, brand: product.brand, model: product.model, modelNumber: product.modelNumber,
        configuration: configuration(product),
      })),
    });
  }
  return candidates;
}
