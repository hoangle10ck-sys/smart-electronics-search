import { isIP } from 'node:net';
import { DatafeedItem } from './accesstradeClient';
import { ALLOWED_ELECTRONIC_CATEGORIES, classifyElectronics } from './electronicsClassifier';
import { normalize } from '../utils/text';
import { normalizeSpecs } from '../utils/specs';

export const ACCESTRADE_SOURCE = 'accesstrade';

export function validExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (isIP(hostname) || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.test')) return null;
    return url.toString();
  } catch { return null; }
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'string') value = value.replace(/[,.\s]/g, '');
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function sourceKeyFor(item: DatafeedItem, domain = 'fptshop.com.vn', source = ACCESTRADE_SOURCE): string {
  const stableId = textValue(item.product_id) ?? textValue(item.sku);
  const name = normalize(String(item.name ?? ''));
  const slug = name.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 160);
  return `${source}:${stableId ?? `${domain}:${slug}`}`;
}

export function dedupeKeyFor(item: DatafeedItem, domain = 'fptshop.com.vn', source = ACCESTRADE_SOURCE): string {
  const name = normalize(String(item.name ?? ''));
  const brand = normalize(String(item.brand ?? ''));
  const model = normalize(String(item.model ?? ''));
  const identity = brand && model ? `${brand}-${model}` : brand ? `${brand}-${name}` : `${source}-${domain}-${textValue(item.product_id) ?? textValue(item.sku) ?? name}`;
  const canonicalName = identity.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 180);
  return `product:${canonicalName}`;
}

export function mapDatafeedItem(item: DatafeedItem, domain = 'fptshop.com.vn', options: { source?: string; sourceKey?: string; imageUsageAuthorized?: boolean; imagePermissionEvidence?: string | null; imageTermsUrl?: string | null; sellerName?: string | null; reviewedCategory?: string } = {}) {
  const classification = options.reviewedCategory && ALLOWED_ELECTRONIC_CATEGORIES.includes(options.reviewedCategory)
    ? { status: 'approved' as const, category: options.reviewedCategory, reasons: ['Danh mục được Admin kiểm duyệt'] }
    : classifyElectronics(item);
  const source = options.source ?? ACCESTRADE_SOURCE;
  const sourceKey = options.sourceKey ?? source;
  const originalPrice = numberValue(item.price);
  const discountedPrice = numberValue(item.discount);
  const price = discountedPrice ?? originalPrice;
  const productUrl = validExternalUrl(item.url);
  const affiliateUrl = validExternalUrl(item.aff_link);
  const imageUrl = validExternalUrl(item.image);
  const imageTermsUrl = validExternalUrl(options.imageTermsUrl);
  const imagePermissionEvidence = textValue(options.imagePermissionEvidence);
  const permittedImageUrl = options.imageUsageAuthorized && imagePermissionEvidence && imageTermsUrl ? imageUrl : null;
  const sourceProductId = textValue(item.product_id) ?? textValue(item.sku);
  const sellerName = textValue(item.campaign) ?? textValue(item.merchant) ?? textValue(item.shop_name) ?? textValue(options.sellerName) ?? null;
  const updatedAtRaw = textValue(item.update_time);
  const sourceUpdatedAt = updatedAtRaw && Number.isFinite(Date.parse(updatedAtRaw)) ? new Date(updatedAtRaw) : null;
  const updatedAt = sourceUpdatedAt ?? new Date();
  const retrievedAt = new Date();
  const brand = textValue(item.brand);
  const description = textValue(item.desc);
  const name = textValue(item.name);
  const family = textValue(item.family ?? item.product_family);
  const generation = textValue(item.generation);
  const modelNumber = textValue(item.model_number ?? item.modelNumber);
  const releaseYearValue = Number(item.release_year ?? item.releaseYear);
  const releaseYear = Number.isInteger(releaseYearValue) && releaseYearValue >= 1800 && releaseYearValue <= new Date().getUTCFullYear() + 1 ? releaseYearValue : null;
  const productStatusRaw = textValue(item.product_status ?? item.productStatus);
  const productStatus = ['active', 'discontinued', 'end_of_life', 'unknown'].includes(productStatusRaw ?? '') ? productStatusRaw : 'unknown';
  const slug = normalize(name ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || null;
  const imagePermissionDocumented = Boolean(permittedImageUrl);
  const rawVariants = item.variants;
  const variants = Array.isArray(rawVariants) ? rawVariants.filter((variant) => variant && typeof variant === 'object' && !Array.isArray(variant)) : [];
  const sourceEvidence = productUrl ? [
    { evidenceType: 'identity', sourceName: sellerName ?? domain, sourceUrl: productUrl, retrievedAt, verifiedAt: retrievedAt },
    { evidenceType: 'product_page', sourceName: sellerName ?? domain, sourceUrl: productUrl, retrievedAt, verifiedAt: retrievedAt },
    ...(item.specifications && typeof item.specifications === 'object' && Object.keys(item.specifications as object).length ? [{ evidenceType: 'specifications', sourceName: sellerName ?? domain, sourceUrl: productUrl, retrievedAt, verifiedAt: retrievedAt }] : []),
    ...(permittedImageUrl ? [{ evidenceType: 'image', sourceName: sellerName ?? domain, sourceUrl: productUrl, retrievedAt, verifiedAt: retrievedAt }] : []),
    ...(imagePermissionDocumented && imageTermsUrl ? [{ evidenceType: 'image_rights', sourceName: 'Authorized source terms', sourceUrl: imageTermsUrl, retrievedAt, verifiedAt: retrievedAt }] : []),
  ] : [];
  return {
    classification,
    sourceKey: sourceKeyFor(item, domain, sourceKey),
    dedupeKey: dedupeKeyFor(item, domain, source),
    product: name && classification.category ? {
      name,
      slug,
      model: textValue(item.model),
      modelNumber,
      brand,
      family,
      generation,
      releaseYear,
      productStatus,
      category: classification.category,
      description,
      imageUrl: permittedImageUrl,
      imageSource: permittedImageUrl ? productUrl : null,
      imageSourceUrl: permittedImageUrl ? productUrl : null,
      imageAuthor: permittedImageUrl ? sellerName ?? domain : null,
      imageRetrievedAt: permittedImageUrl ? retrievedAt : null,
      imageUsagePermission: permittedImageUrl ? 'granted' : imageUrl ? 'not_authorized' : 'not_provided',
      imagePermissionEvidence: permittedImageUrl ? imagePermissionEvidence : null,
      imageLicense: imagePermissionDocumented ? 'Authorized under source terms' : null,
      imageLicenseUrl: imagePermissionDocumented ? imageTermsUrl : null,
      imageAttribution: permittedImageUrl ? sellerName ?? domain : null,
      imageVisualIdentityChecked: false,
      sourceUrl: productUrl,
      verifiedAt: sourceProductId && name ? updatedAt : null,
      specifications: item.specifications && typeof item.specifications === 'object' ? item.specifications : null,
      specs: normalizeSpecs(item.specs),
      variants,
      sourceEvidence,
      source,
      sourceProductId,
      verified: Boolean(sourceProductId && textValue(item.model) && family && generation && productUrl && item.specifications && typeof item.specifications === 'object' && Object.keys(item.specifications as object).length && imagePermissionDocumented && ['identity', 'product_page', 'specifications', 'image', 'image_rights'].every((type) => sourceEvidence.some((evidence) => evidence.evidenceType === type))),
      productVerificationStatus: Boolean(textValue(item.model) && family && generation && productUrl && item.specifications && typeof item.specifications === 'object' && Object.keys(item.specifications as object).length && sourceEvidence.some((evidence) => evidence.evidenceType === 'identity') && sourceEvidence.some((evidence) => evidence.evidenceType === 'specifications')) ? 'verified' : 'pending',
      imageVerificationStatus: 'pending',
      urlVerificationStatus: 'pending',
      publicationStatus: 'pending',
      rating: null,
      sold: null,
      stock: null,
      sourceKey: sourceKeyFor(item, domain, sourceKey),
      dedupeKey: dedupeKeyFor(item, domain, source),
      electronicStatus: 'approved',
      // Prices belong to Offers and must not inherit product verification status.
      price: null,
      originalPrice: null,
      searchText: normalize([name, brand ?? '', classification.category, description ?? '', JSON.stringify(item.specifications ?? {})].join(' ')),
    } : null,
    offer: {
      sellerName,
      price,
      originalPrice,
      discount: numberValue(item.discount_amount) ?? (originalPrice && price && originalPrice > price ? originalPrice - price : null),
      currency: textValue(item.currency),
      productUrl,
      affiliateUrl,
      availability: textValue(item.availability),
      source: sourceKey,
      lastUpdated: updatedAt,
      sourceProductId,
      verified: Boolean(sourceProductId && productUrl && price && textValue(item.currency)?.toUpperCase() === 'VND'),
      priceVerificationStatus: sourceProductId && productUrl && price && textValue(item.currency)?.toUpperCase() === 'VND' ? 'verified' : 'pending',
      verificationNote: sourceProductId && productUrl && price && textValue(item.currency)?.toUpperCase() === 'VND' ? null : 'Chờ xác minh giá, URL sản phẩm, mã nguồn và đơn vị tiền tệ.',
      sourceRetrievedAt: retrievedAt,
      verifiedAt: sourceProductId && productUrl && price && textValue(item.currency)?.toUpperCase() === 'VND' ? updatedAt : null,
    },
    pending: {
      sourceKey: sourceKeyFor(item, domain, sourceKey),
      source: sourceKey,
      productVerificationStatus: Boolean(textValue(item.model) && family && generation && productUrl && item.specifications && typeof item.specifications === 'object' && Object.keys(item.specifications as object).length && sourceEvidence.some((evidence) => evidence.evidenceType === 'identity') && sourceEvidence.some((evidence) => evidence.evidenceType === 'specifications')) ? 'verified' : 'pending',
      imageVerificationStatus: 'pending',
      urlVerificationStatus: 'pending',
      publicationStatus: 'pending',
      reasons: classification.reasons,
      raw: { ...item, image: permittedImageUrl ? item.image : null, aff_link: null },
    },
    hasImage: Boolean(permittedImageUrl),
    hasSourceImage: Boolean(imageUrl),
    hasPurchaseLink: Boolean(affiliateUrl || productUrl),
  };
}

export interface SyncRepository {
  upsertProduct(filter: Record<string, unknown>, value: Record<string, unknown>): Promise<{ id: unknown; created: boolean }>;
  findProduct?(filter: Record<string, unknown>): Promise<{ id: unknown } | null>;
  findProducts?(filter: Record<string, unknown>): Promise<{ id: unknown }[]>;
  findOffer?(filter: Record<string, unknown>): Promise<{ lastUpdated?: unknown } | null>;
  upsertOffer(filter: Record<string, unknown>, value: Record<string, unknown>): Promise<void>;
  upsertPending(filter: Record<string, unknown>, value: Record<string, unknown>): Promise<void>;
}

export async function syncDatafeedPrices(items: DatafeedItem[], repository: SyncRepository, domain = 'fptshop.com.vn', options: { sourceKey: string; sellerName?: string | null; dryRun?: boolean; maxAgeDays?: number } ) {
  const stats = { fetched: items.length, priced: 0, exactMatches: 0, offersCreatedOrUpdated: 0, unmatchedProducts: 0, ambiguousProducts: 0, stalePrices: 0, olderThanStored: 0, invalidPrices: 0 };
  const seen = new Set<string>();
  const maxAgeMs = Math.max(1, options.maxAgeDays ?? 14) * 24 * 60 * 60 * 1000;

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { stats.invalidPrices += 1; continue; }
    const mapped = mapDatafeedItem(item, domain, { source: 'accesstrade', sourceKey: options.sourceKey, sellerName: options.sellerName });
    const offer = mapped.offer;
    if (!offer.price || !offer.verified || !offer.currency || !offer.productUrl || !offer.sourceProductId || !mapped.classification.category) {
      stats.invalidPrices += 1;
      continue;
    }
    stats.priced += 1;
    if (Date.now() - offer.lastUpdated.getTime() > maxAgeMs) { stats.stalePrices += 1; continue; }

    const brand = textValue(item.brand);
    const model = textValue(item.model ?? item.model_number ?? item.modelNumber);
    const sku = textValue(item.sku);
    if (!brand || (!model && !sku) || (!repository.findProduct && !repository.findProducts)) { stats.unmatchedProducts += 1; continue; }
    const exactMatches: Record<string, unknown>[] = [];
    if (model) {
      const exactModel = new RegExp(`^${escapeRegex(model)}$`, 'i');
      exactMatches.push(
        { model: exactModel },
        { modelNumber: exactModel },
        { 'variants.name': exactModel },
        { 'variants.modelNumber': exactModel },
      );
    }
    if (sku) exactMatches.push({ 'variants.sku': new RegExp(`^${escapeRegex(sku)}$`, 'i') });
    const brandExact = new RegExp(`^${escapeRegex(brand)}$`, 'i');
    const filter = {
      brand: brandExact,
      category: mapped.classification.category,
      productVerificationStatus: 'verified',
      electronicStatus: { $in: ['approved', null] },
      $or: exactMatches,
    };
    let product: { id: unknown } | null = null;
    if (repository.findProducts) {
      const matches = await repository.findProducts(filter);
      if (matches.length > 1) { stats.ambiguousProducts += 1; continue; }
      product = matches[0] ?? null;
    } else {
      product = await repository.findProduct?.(filter) ?? null;
    }
    if (!product) { stats.unmatchedProducts += 1; continue; }
    stats.exactMatches += 1;

    const offerKey = `${String(product.id)}|${options.sourceKey}|${offer.sellerName ?? options.sellerName ?? domain}`;
    if (seen.has(offerKey)) continue;
    seen.add(offerKey);
    const offerFilter = { productId: product.id, source: options.sourceKey, sellerName: offer.sellerName ?? options.sellerName ?? domain };
    const priorOffer = await repository.findOffer?.(offerFilter);
    const priorUpdatedAt = priorOffer?.lastUpdated ? new Date(priorOffer.lastUpdated as string | number | Date) : null;
    if (priorUpdatedAt && Number.isFinite(priorUpdatedAt.getTime()) && priorUpdatedAt.getTime() > offer.lastUpdated.getTime()) {
      stats.olderThanStored += 1;
      continue;
    }
    if (!options.dryRun) {
      await repository.upsertOffer(
        offerFilter,
        { ...offer, sellerName: offer.sellerName ?? options.sellerName ?? domain, source: options.sourceKey, productId: product.id },
      );
      stats.offersCreatedOrUpdated += 1;
    }
  }
  return stats;
}

export async function syncDatafeedItems(items: DatafeedItem[], repository: SyncRepository, domain = 'fptshop.com.vn', options: { source?: string; sourceKey?: string; imageUsageAuthorized?: boolean; imagePermissionEvidence?: string | null; imageTermsUrl?: string | null; sellerName?: string | null; updateOnly?: boolean; reviewedCategory?: string } = {}) {
  const stats = { fetched: items.length, created: 0, updated: 0, skippedExistingOnly: 0, rejected: 0, pendingReview: 0, withSourceImage: 0, withPermittedImage: 0, withPrice: 0, withPurchaseLink: 0 };
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { stats.rejected += 1; continue; }
    const mapped = mapDatafeedItem(item, domain, options);
    if (seen.has(mapped.sourceKey)) continue;
    seen.add(mapped.sourceKey);
    if (mapped.classification.status === 'rejected') { stats.rejected += 1; continue; }
    if (mapped.classification.status === 'pending_review' || !mapped.product || !mapped.product.verified) {
      const missingEvidence = mapped.product && !mapped.product.verified ? ['Model data or licensed image/source evidence is incomplete; catalog approval is pending'] : [];
      await repository.upsertPending({ sourceKey: mapped.sourceKey }, { ...mapped.pending, reasons: [...mapped.classification.reasons, ...missingEvidence] });
      stats.pendingReview += 1;
      continue;
    }
    if (options.updateOnly) {
      const existing = await repository.findProduct?.({ dedupeKey: mapped.dedupeKey });
      if (!existing) { stats.skippedExistingOnly += 1; continue; }
    }
    const result = await repository.upsertProduct({ dedupeKey: mapped.dedupeKey }, mapped.product);
    if (mapped.offer.sellerName) await repository.upsertOffer({ productId: result.id, source: options.sourceKey ?? options.source ?? ACCESTRADE_SOURCE, sellerName: mapped.offer.sellerName }, { ...mapped.offer, productId: result.id });
    if (result.created) stats.created += 1; else stats.updated += 1;
    if (mapped.hasSourceImage) stats.withSourceImage += 1;
    if (mapped.hasImage) stats.withPermittedImage += 1;
    if (mapped.offer.price != null) stats.withPrice += 1;
    if (mapped.hasPurchaseLink) stats.withPurchaseLink += 1;
  }
  return stats;
}
