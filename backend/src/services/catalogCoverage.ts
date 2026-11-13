import { Offer } from '../models/Offer';
import { PendingProduct } from '../models/PendingProduct';
import { Product } from '../models/Product';
import { CANONICAL_CATEGORIES, canonicalCategory } from './taxonomy';

const requiredEvidence = ['identity', 'product_page', 'specifications', 'image', 'image_rights'];

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasHttps(value: unknown) {
  return typeof value === 'string' && /^https:\/\//i.test(value);
}

function uniqueKey(category: string, brand: string, model: string, fallback: string) {
  return `${category}|${brand.trim().toLowerCase()}|${model.trim().toLowerCase() || fallback}`;
}

export async function readCatalogCoverage() {
  const [products, pendingRows, totalOffers, verifiedPricedOffers, rejected] = await Promise.all([
    Product.find({}).select('name brand model category family generation verified verifiedAt electronicStatus productVerificationStatus imageVerificationStatus urlVerificationStatus publicationStatus imageUrl imageSource imageUsagePermission imagePermissionEvidence imageLicense imageLicenseUrl imageAttribution productUrl specificationSourceUrl specifications variants sourceEvidence').lean(),
    PendingProduct.find({ classification: 'pending_review', reviewDecision: null }).select('sourceKey raw productVerificationStatus imageVerificationStatus urlVerificationStatus publicationStatus').lean(),
    Offer.countDocuments(),
    Offer.countDocuments({ verified: true, verifiedAt: { $ne: null }, price: { $gt: 0 }, currency: 'VND', productUrl: { $type: 'string', $ne: '' } }),
    PendingProduct.countDocuments({ classification: 'rejected' }),
  ]);

  const models = new Map<string, any>();
  const categoryRows = new Map<string, any>();
  let unidentifiedRecords = 0;
  const ensureCategory = (category: string) => {
    const key = canonicalCategory(category || 'uncategorized');
    if (!categoryRows.has(key)) categoryRows.set(key, { category: key, totalModels: 0, verifiedModels: 0, pendingModels: 0, publishedModels: 0, publicationPendingModels: 0, hiddenModels: 0, imageVerifiedModels: 0, urlVerifiedModels: 0, missingImages: 0, missingSpecifications: 0, missingUrls: 0, missingImageRights: 0, brands: new Map<string, any>() });
    return categoryRows.get(key);
  };

  const addModel = (value: any, fallback: string, isResearchPending: boolean) => {
    const category = canonicalCategory(String(value.category ?? value.cate ?? 'uncategorized'));
    const brand = hasText(value.brand) ? value.brand.trim() : '(brand not recorded)';
    const model = hasText(value.model) ? value.model.trim() : '';
    if (!model && !isResearchPending) { unidentifiedRecords += 1; return; }
    const key = uniqueKey(category, brand, model, fallback);
    const imageRights = value.imageUsagePermission === 'granted' && hasText(value.imageUrl) && hasText(value.imageSource)
      && hasText(value.imageLicense) && hasText(value.imageLicenseUrl) && hasText(value.imageAttribution);
    const hasSpecs = value.specifications && typeof value.specifications === 'object' && Object.keys(value.specifications).length > 0;
    const hasUrls = hasHttps(value.productUrl) && hasHttps(value.specificationSourceUrl);
    const evidenceTypes = new Set((Array.isArray(value.sourceEvidence) ? value.sourceEvidence : Array.isArray(value.evidence) ? value.evidence : []).map((item: any) => item?.evidenceType));
    const evidenceComplete = Boolean(value.family && value.generation && model && requiredEvidence.every((type) => evidenceTypes.has(type)) && imageRights);
    const verified = !isResearchPending && value.verified === true && value.verifiedAt && value.electronicStatus !== 'pending_review'
      && imageRights && hasUrls && hasSpecs && model && brand !== '(brand not recorded)';
    const current = models.get(key) ?? {
      key, category, brand, model: model || '(model not recorded)', family: hasText(value.family) ? value.family.trim() : '(family not recorded)',
      generation: hasText(value.generation) ? value.generation.trim() : '(generation not recorded)',
      verified: false, evidenceComplete: false, imageRights: false, hasSpecs: false, hasUrls: false,
      productVerificationStatus: 'pending', imageVerificationStatus: 'pending', urlVerificationStatus: 'pending', publicationStatus: 'pending',
      variants: 0, recordCount: 0,
    };
    current.verified ||= Boolean(verified);
    if (value.productVerificationStatus === 'verified' || (!isResearchPending && verified)) current.productVerificationStatus = 'verified';
    if (value.imageVerificationStatus === 'verified' || (!isResearchPending && imageRights)) current.imageVerificationStatus = 'verified';
    if (value.urlVerificationStatus === 'verified' || (!isResearchPending && value.publicationStatus === 'published' && hasUrls)) current.urlVerificationStatus = 'verified';
    if (value.publicationStatus === 'published') current.publicationStatus = 'published';
    else if (value.publicationStatus === 'hidden' && current.publicationStatus !== 'published') current.publicationStatus = 'hidden';
    current.evidenceComplete ||= evidenceComplete;
    current.imageRights ||= Boolean(imageRights);
    current.hasSpecs ||= Boolean(hasSpecs);
    current.hasUrls ||= Boolean(hasUrls);
    current.variants = Math.max(current.variants, Array.isArray(value.variants) ? value.variants.length : 0);
    current.recordCount += 1;
    if (current.family === '(family not recorded)' && hasText(value.family)) current.family = value.family.trim();
    if (current.generation === '(generation not recorded)' && hasText(value.generation)) current.generation = value.generation.trim();
    models.set(key, current);
  };

  for (const product of products) addModel(product, String(product._id), false);
  for (const pending of pendingRows) addModel(pending.raw ?? {}, String(pending.sourceKey), true);

  for (const row of models.values()) {
    if (row.publicationStatus !== 'published' && row.publicationStatus !== 'hidden') row.publicationStatus = 'pending';
    const category = ensureCategory(row.category);
    const status = row.verified ? 'verified' : 'pending';
    category.totalModels += 1;
    category[`${status}Models`] += 1;
    if (row.publicationStatus === 'published') category.publishedModels += 1;
    else if (row.publicationStatus === 'hidden') category.hiddenModels += 1;
    else category.publicationPendingModels += 1;
    if (row.imageVerificationStatus === 'verified') category.imageVerifiedModels += 1;
    if (row.urlVerificationStatus === 'verified') category.urlVerifiedModels += 1;
    if (!row.imageRights) { category.missingImages += 1; category.missingImageRights += 1; }
    if (!row.hasSpecs) category.missingSpecifications += 1;
    if (!row.hasUrls) category.missingUrls += 1;

    const brand = category.brands.get(row.brand) ?? { brand: row.brand, totalModels: 0, verifiedModels: 0, pendingModels: 0, families: new Map<string, any>() };
    brand.totalModels += 1;
    brand[`${status}Models`] += 1;
    const family = brand.families.get(row.family) ?? { family: row.family, totalModels: 0, verifiedModels: 0, pendingModels: 0, generations: new Map<string, any>() };
    family.totalModels += 1;
    family[`${status}Models`] += 1;
    const generation = family.generations.get(row.generation) ?? { generation: row.generation, models: [] };
    generation.models.push({ model: row.model, status, productVerificationStatus: row.productVerificationStatus, imageVerificationStatus: row.imageVerificationStatus, urlVerificationStatus: row.urlVerificationStatus, publicationStatus: row.publicationStatus, evidenceComplete: row.evidenceComplete, imageRights: row.imageRights, hasSpecifications: row.hasSpecs, hasProductAndSpecsUrls: row.hasUrls, variants: row.variants });
    family.generations.set(row.generation, generation);
    brand.families.set(row.family, family);
    category.brands.set(row.brand, brand);
  }

  const hierarchy = CANONICAL_CATEGORIES.map(({ key, label }) => {
    const row = ensureCategory(key);
    return {
      category: key, label,
      totalModels: row.totalModels, verifiedModels: row.verifiedModels, pendingModels: row.pendingModels,
      missingImages: row.missingImages, missingSpecifications: row.missingSpecifications, missingUrls: row.missingUrls,
      brands: [...row.brands.values()].map((brand: any) => ({
        brand: brand.brand, totalModels: brand.totalModels, verifiedModels: brand.verifiedModels, pendingModels: brand.pendingModels,
        families: [...brand.families.values()].map((family: any) => ({
          family: family.family, totalModels: family.totalModels, verifiedModels: family.verifiedModels, pendingModels: family.pendingModels,
          generations: [...family.generations.values()].map((generation: any) => ({
            generation: generation.generation,
            models: generation.models.sort((a: any, b: any) => a.model.localeCompare(b.model)),
          })).sort((a: any, b: any) => a.generation.localeCompare(b.generation)),
        })).sort((a: any, b: any) => a.family.localeCompare(b.family)),
      })).sort((a: any, b: any) => a.brand.localeCompare(b.brand)),
    };
  });

  const all = [...models.values()];
  return {
    generatedAt: new Date().toISOString(),
    source: 'MongoDB',
    totals: {
      productRecords: products.length,
      uniqueModels: all.length,
      verifiedModels: all.filter((row) => row.verified).length,
      pendingModels: all.filter((row) => !row.verified).length,
      productVerificationVerified: all.filter((row) => row.productVerificationStatus === 'verified').length,
      imageVerificationVerified: all.filter((row) => row.imageVerificationStatus === 'verified').length,
      urlVerificationVerified: all.filter((row) => row.urlVerificationStatus === 'verified').length,
      publishedModels: all.filter((row) => row.publicationStatus === 'published').length,
      publicationPendingModels: all.filter((row) => row.publicationStatus === 'pending').length,
      hiddenModels: all.filter((row) => row.publicationStatus === 'hidden').length,
      evidenceCompleteModels: all.filter((row) => row.evidenceComplete).length,
      brandCount: new Set(all.map((row) => row.brand)).size,
      familyCount: new Set(all.map((row) => `${row.category}|${row.brand}|${row.family}`).filter((key) => !key.endsWith('|(family not recorded)'))).size,
      generationCount: new Set(all.map((row) => `${row.category}|${row.brand}|${row.family}|${row.generation}`).filter((key) => !key.endsWith('|(generation not recorded)'))).size,
      variants: all.reduce((sum, row) => sum + row.variants, 0),
      modelsMissingImages: all.filter((row) => !row.imageRights).length,
      modelsMissingSpecifications: all.filter((row) => !row.hasSpecs).length,
      modelsMissingUrls: all.filter((row) => !row.hasUrls).length,
      modelsMissingImageRights: all.filter((row) => !row.imageRights).length,
      unidentifiedRecords,
      offers: totalOffers,
      verifiedPricedOffers,
      rejectedRecords: rejected,
    },
    categories: hierarchy,
  };
}
