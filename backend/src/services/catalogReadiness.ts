const REQUIRED_READINESS_CONDITIONS = [
  { name: { $type: 'string', $regex: /\S/ } },
  { brand: { $type: 'string', $regex: /\S/ } },
  { model: { $type: 'string', $regex: /\S/ } },
  { category: { $type: 'string', $regex: /\S/ } },
  { description: { $type: 'string', $regex: /\S/ } },
  ...['identity', 'product_page', 'specifications', 'description', 'image', 'image_rights'].map((evidenceType) => ({
    sourceEvidence: { $elemMatch: { evidenceType, sourceUrl: { $type: 'string', $regex: /^https:\/\//i } } },
  })),
  { $or: [
    { specifications: { $type: 'object', $ne: {} } },
    { specs: { $type: 'object', $ne: {} } },
  ] },
  { productUrl: { $type: 'string', $regex: /^https:\/\//i } },
  { specificationSourceUrl: { $type: 'string', $regex: /^https:\/\//i } },
  { imageUrl: { $type: 'string', $regex: /^(?:https:\/\/|\/catalog-images\/[a-z0-9][a-z0-9._-]*\.(?:jpg|jpeg|png|webp)$)/i } },
  { imageVerificationStatus: 'verified' },
  { imageUsagePermission: 'granted' },
  { imageSource: { $type: 'string', $regex: /^https:\/\//i } },
  { imageLicense: { $type: 'string', $regex: /\S/ } },
  { imageLicenseUrl: { $type: 'string', $regex: /^https:\/\//i } },
  { imageAttribution: { $type: 'string', $regex: /\S/ } },
  { $or: [
    { imagePermissionEvidence: { $type: 'string', $regex: /\S/ } },
    { imageLicenseUrl: { $type: 'string', $regex: /^https:\/\//i }, imageAttribution: { $type: 'string', $regex: /\S/ } },
  ] },
];

export type ReadinessField = 'name' | 'brand' | 'model' | 'category' | 'description' | 'identityEvidence' | 'productPageEvidence' | 'specificationEvidence' | 'descriptionEvidence' | 'imageEvidence' | 'imageRightsEvidence' | 'specifications' | 'image' | 'productUrl' | 'specificationSourceUrl';

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpsUrl(value: unknown) {
  if (!hasText(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch { return false; }
}

function hasSpecifications(value: unknown) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).some((item) => item !== null && item !== undefined && item !== ''));
}

export function missingRecommendationFields(product: Record<string, any>): ReadinessField[] {
  const missing: ReadinessField[] = [];
  if (!hasText(product.name)) missing.push('name');
  if (!hasText(product.brand)) missing.push('brand');
  if (!hasText(product.model)) missing.push('model');
  if (!hasText(product.category)) missing.push('category');
  if (!hasText(product.description)) missing.push('description');
  const evidenceTypes = new Set((Array.isArray(product.sourceEvidence) ? product.sourceEvidence : [])
    .filter((evidence: any) => isHttpsUrl(evidence?.sourceUrl)).map((evidence: any) => evidence?.evidenceType));
  const requiredEvidence: Array<[string, ReadinessField]> = [
    ['identity', 'identityEvidence'], ['product_page', 'productPageEvidence'], ['specifications', 'specificationEvidence'],
    ['description', 'descriptionEvidence'], ['image', 'imageEvidence'], ['image_rights', 'imageRightsEvidence'],
  ];
  for (const [type, field] of requiredEvidence) if (!evidenceTypes.has(type)) missing.push(field);
  if (!hasSpecifications(product.specifications) && !hasSpecifications(product.specs)) missing.push('specifications');
  const localImage = typeof product.imageUrl === 'string' && /^\/catalog-images\/[a-z0-9][a-z0-9._-]*\.(jpg|jpeg|png|webp)$/i.test(product.imageUrl);
  const imageReady = (isHttpsUrl(product.imageUrl) || localImage)
    && product.imageVerificationStatus === 'verified'
    && product.imageUsagePermission === 'granted'
    && isHttpsUrl(product.imageSource)
    && hasText(product.imageLicense)
    && isHttpsUrl(product.imageLicenseUrl)
    && hasText(product.imageAttribution)
    && (hasText(product.imagePermissionEvidence) || (isHttpsUrl(product.imageLicenseUrl) && hasText(product.imageAttribution)));
  if (!imageReady) missing.push('image');
  if (!isHttpsUrl(product.productUrl)) missing.push('productUrl');
  if (!isHttpsUrl(product.specificationSourceUrl)) missing.push('specificationSourceUrl');
  return missing;
}

/** Adds the complete-facts gate without overwriting an existing Mongo $and filter. */
export function withRecommendationReadiness<T extends Record<string, any>>(filter: T): T {
  const priorAnd = Array.isArray(filter.$and) ? filter.$and : [];
  return { ...filter, $and: [...priorAnd, ...REQUIRED_READINESS_CONDITIONS] };
}

