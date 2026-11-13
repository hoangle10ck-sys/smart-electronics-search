import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { Offer } from '../models/Offer';
import { Product } from '../models/Product';
import { requireAdmin } from '../middleware/adminAuth';
import { buildSearchText, normalize, escapeRegex } from '../utils/text';
import { ALLOWED_ELECTRONIC_CATEGORIES } from '../services/electronicsClassifier';
import { CANONICAL_CATEGORIES } from '../services/taxonomy';
import { validExternalUrl } from '../services/accesstradeSync';
import { readCatalogCoverage } from '../services/catalogCoverage';
import { verifyModelPage } from '../services/urlVerification';
import { normalizeSpecs } from '../utils/specs';
import { normalizeProduct } from '../services/productNormalizer';

const router = Router();
router.use(requireAdmin);

function text(value: unknown, max = 500): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

export function validateCatalogBody(body: any, prior?: Record<string, any>) {
  const value = { ...(prior ?? {}), ...(body ?? {}) };
  const name = text(value.name, 300);
  const brand = text(value.brand, 120);
  const model = text(value.model, 200);
  const modelNumber = text(value.modelNumber, 120);
  const family = text(value.family, 160);
  const generation = text(value.generation, 160);
  const category = text(value.category, 80);
  const imageUrl = validExternalUrl(value.imageUrl);
  const productUrl = validExternalUrl(value.productUrl);
  const specificationSourceUrl = validExternalUrl(value.specificationSourceUrl);
  const imageSource = validExternalUrl(value.imageSource);
  const imageSourceUrl = value.imageSourceUrl ? validExternalUrl(value.imageSourceUrl) : imageSource;
  const imageLicenseUrl = validExternalUrl(value.imageLicenseUrl);
  const specifications = value.specifications;
  const specs = normalizeSpecs(value.specs);
  const variants = value.variants ?? [];
  const sourceEvidence = value.sourceEvidence ?? [];
  const productVerificationStatus = value.productVerificationStatus ?? (value.verified === true ? 'verified' : 'pending');
  const imageVerificationStatus = value.imageVerificationStatus ?? 'pending';
  const urlVerificationStatus = value.urlVerificationStatus ?? 'pending';
  const productStatus = value.productStatus ?? 'unknown';
  const releaseYear = value.releaseYear == null || value.releaseYear === '' ? null : Number(value.releaseYear);
  const imageRetrievedAt = value.imageRetrievedAt ? new Date(value.imageRetrievedAt) : null;
  const errors: string[] = [];
  if (!name || !brand || !model) errors.push('name, brand, model are required');
  if (!category || !ALLOWED_ELECTRONIC_CATEGORIES.includes(category)) errors.push('category is not allowed');
  if (!imageUrl || !productUrl || !specificationSourceUrl) errors.push('valid HTTPS imageUrl, productUrl, and specificationSourceUrl are required');
  if (value.imageSourceUrl && !imageSourceUrl) errors.push('imageSourceUrl must be a public HTTPS URL');
  if (!specifications || typeof specifications !== 'object' || Array.isArray(specifications) || !Object.keys(specifications).length) errors.push('specifications must be a non-empty object');
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) errors.push('specs must be an object');
  if (releaseYear != null && (!Number.isInteger(releaseYear) || releaseYear < 1800 || releaseYear > new Date().getUTCFullYear() + 1)) errors.push('releaseYear must be a plausible calendar year');
  if (imageRetrievedAt && !Number.isFinite(imageRetrievedAt.getTime())) errors.push('imageRetrievedAt must be a valid date');
  if (!['active', 'discontinued', 'end_of_life', 'unknown'].includes(productStatus)) errors.push('productStatus is invalid');
  if (!['verified', 'pending', 'rejected'].includes(productVerificationStatus)) errors.push('productVerificationStatus is invalid');
  if (!['verified', 'pending', 'rejected'].includes(imageVerificationStatus)) errors.push('imageVerificationStatus is invalid');
  if (!['verified', 'pending', 'rejected'].includes(urlVerificationStatus)) errors.push('urlVerificationStatus is invalid');
  if (!Array.isArray(variants) || variants.some((variant) => !variant || typeof variant !== 'object' || Array.isArray(variant) || (variant.attributes != null && (typeof variant.attributes !== 'object' || Array.isArray(variant.attributes))))) errors.push('variants must be an array of variant objects');
  const validEvidenceTypes = ['identity', 'product_page', 'specifications', 'image', 'image_rights', 'lifecycle'];
  if (!Array.isArray(sourceEvidence) || sourceEvidence.some((evidence) => !evidence || typeof evidence !== 'object' || !validEvidenceTypes.includes(evidence.evidenceType) || !text(evidence.sourceName, 200) || !validExternalUrl(evidence.sourceUrl) || !Number.isFinite(Date.parse(evidence.retrievedAt)) || !Number.isFinite(Date.parse(evidence.verifiedAt)))) {
    errors.push('sourceEvidence entries require a supported evidenceType, source name, HTTPS URL, retrievedAt, and verifiedAt');
  }
  const imageRightsDocumented = Boolean(imageSource && imageLicenseUrl && text(value.imageLicense, 100) && text(value.imageAttribution, 500));
  const evidenceTypes = new Set(Array.isArray(sourceEvidence) ? sourceEvidence.map((evidence: any) => evidence?.evidenceType) : []);
  if (value.imageUsagePermission === 'granted' && !imageRightsDocumented) errors.push('image permission requires license URL, source, and attribution');
  if (productVerificationStatus === 'verified') {
    for (const requiredType of ['identity', 'specifications']) {
      if (!evidenceTypes.has(requiredType)) errors.push(`verified products require ${requiredType} source evidence`);
    }
    if (!family || !generation || !model || !brand || !specifications || !Object.keys(specifications).length) errors.push('verified products require model, brand, family, generation, and specifications');
  }
  if (imageVerificationStatus === 'verified' && (value.imageUsagePermission !== 'granted' || !imageRightsDocumented || !value.imageVisualIdentityChecked || !evidenceTypes.has('image') || !evidenceTypes.has('image_rights'))) errors.push('verified images require visual identity review, image evidence, documented reuse permission, and image_rights evidence');
  if (urlVerificationStatus === 'verified' && (!evidenceTypes.has('product_page') || !evidenceTypes.has('specifications'))) errors.push('verified URLs require product_page and specifications source evidence');
  const price = value.price == null || value.price === '' ? null : Number(value.price);
  if (price != null && (!Number.isFinite(price) || price <= 0)) errors.push('price must be a positive number or empty');
  if (errors.length) return { errors };
  const now = new Date();
  const publicationStatus = productVerificationStatus === 'rejected' || imageVerificationStatus === 'rejected' || urlVerificationStatus === 'rejected'
    ? 'hidden'
    : productVerificationStatus === 'verified' && imageVerificationStatus === 'verified' && urlVerificationStatus === 'verified' && value.imageUsagePermission === 'granted' && imageRightsDocumented && value.imageVisualIdentityChecked
      ? 'published'
      : 'pending';
  const sourceProductId = text(value.sourceProductId, 200) ?? `catalog:${normalize(`${brand}-${model}`).replace(/\s+/g, '-')}`;
  const data = {
      name, brand, model, category, imageUrl, productUrl, sourceUrl: productUrl,
      modelNumber, sku: text(value.sku, 120), family, generation, releaseYear, productStatus,
      specificationSourceUrl, imageSource, imageSourceUrl,
      imageAuthor: text(value.imageAuthor, 300), imageRetrievedAt,
      imageVisualIdentityChecked: value.imageVisualIdentityChecked === true,
      imageUsagePermission: value.imageUsagePermission === 'granted' ? 'granted' : 'not_authorized',
      imageLicense: text(value.imageLicense, 100), imageLicenseUrl, imageAttribution: text(value.imageAttribution, 500),
      specifications, specs, variants, sourceEvidence, price, source: 'curated', sourceProductId, sourceKey: `catalog:${sourceProductId}`,
      dedupeKey: `catalog:${normalize(`${brand}-${model}`).replace(/\s+/g, '-')}`,
      verified: productVerificationStatus === 'verified', verifiedAt: productVerificationStatus === 'verified' ? (value.verifiedAt ? new Date(value.verifiedAt) : now) : null,
      productVerificationStatus, imageVerificationStatus, urlVerificationStatus, publicationStatus,
      electronicStatus: productVerificationStatus === 'verified' ? 'approved' : 'pending_review', rating: null, sold: null, stock: null,
      description: text(value.description, 2000), searchText: buildSearchText({ name: name!, brand: brand!, category: category!, description: text(value.description, 2000) ?? undefined, specs }),
  };
  return {
    errors,
    data: { ...data, ...normalizeProduct(data) },
  };
}

export function validateOfferBody(body: any, prior?: Record<string, any>) {
  const value = { ...(prior ?? {}), ...(body ?? {}) };
  const sellerName = text(value.sellerName, 160);
  const source = text(value.source, 120) ?? 'curated';
  const currency = text(value.currency, 8)?.toUpperCase() ?? null;
  const productUrl = validExternalUrl(value.productUrl);
  const affiliateUrl = value.affiliateUrl ? validExternalUrl(value.affiliateUrl) : null;
  const price = value.price == null || value.price === '' ? null : Number(value.price);
  const originalPrice = value.originalPrice == null || value.originalPrice === '' ? null : Number(value.originalPrice);
  const verified = value.verified === true;
  const errors: string[] = [];
  if (!sellerName || !source) errors.push('sellerName and source are required');
  if (!productUrl || (value.affiliateUrl && !affiliateUrl)) errors.push('offer URLs must be public HTTPS URLs');
  if (price != null && (!Number.isFinite(price) || price <= 0)) errors.push('price must be a positive number or empty');
  if (originalPrice != null && (!Number.isFinite(originalPrice) || originalPrice <= 0)) errors.push('originalPrice must be a positive number or empty');
  if (currency && !/^[A-Z]{3}$/.test(currency)) errors.push('currency must be a three-letter ISO code');
  if (verified && (price == null || !currency || !productUrl)) errors.push('verified offers require price, currency, and product URL');
  const lastUpdated = value.lastUpdated ? new Date(value.lastUpdated) : new Date();
  if (!Number.isFinite(lastUpdated.getTime())) errors.push('lastUpdated must be a valid date');
  const sourceRetrievedAt = value.sourceRetrievedAt ? new Date(value.sourceRetrievedAt) : new Date();
  if (!Number.isFinite(sourceRetrievedAt.getTime())) errors.push('sourceRetrievedAt must be a valid date');
  const verifiedAt = verified ? (value.verifiedAt ? new Date(value.verifiedAt) : new Date()) : null;
  if (verifiedAt && !Number.isFinite(verifiedAt.getTime())) errors.push('verifiedAt must be a valid date');
  return errors.length ? { errors } : {
    errors,
    data: {
      sellerName, source, currency, productUrl, affiliateUrl, price, originalPrice,
      discount: price != null && originalPrice != null && originalPrice > price ? originalPrice - price : null,
      availability: text(value.availability, 120), verified,
      priceVerificationStatus: verified ? 'verified' : 'pending',
      verificationNote: text(value.verificationNote, 800), sourceRetrievedAt, verifiedAt, lastUpdated,
      sourceProductId: text(value.sourceProductId, 200),
    },
  };
}

router.get('/taxonomy', async (_req, res, next) => {
  try {
    const [brands, families, generations] = await Promise.all([
      Product.distinct('brand', { brand: { $type: 'string', $ne: '' } }),
      Product.distinct('family', { family: { $type: 'string', $ne: '' } }),
      Product.distinct('generation', { generation: { $type: 'string', $ne: '' } }),
    ]);
    res.json({ categories: CANONICAL_CATEGORIES, brands: brands.sort(), families: families.sort(), generations: generations.sort() });
  } catch (error) { next(error); }
});

router.get('/coverage', async (_req, res, next) => {
  try { res.json(await readCatalogCoverage()); }
  catch (error) { next(error); }
});

router.get('/products', async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { source: 'curated' };
    if (typeof req.query.category === 'string' && ALLOWED_ELECTRONIC_CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
    for (const field of ['brand', 'family', 'generation']) {
      if (typeof req.query[field] === 'string' && req.query[field].trim()) filter[field] = req.query[field].trim().slice(0, 160);
    }
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const regex = new RegExp(escapeRegex(req.query.q.trim().slice(0, 100)), 'i');
      filter.$or = [{ name: regex }, { brand: regex }, { model: regex }, { modelNumber: regex }, { family: regex }, { generation: regex }];
    }
    const products = await Product.find(filter).sort({ updatedAt: -1 }).limit(500).select('-searchText').lean();
    res.json(products);
  } catch (error) { next(error); }
});

router.get('/products/:id/offers', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'invalid product id' });
    const product = await Product.findOne({ _id: req.params.id, source: 'curated' }).select('_id').lean();
    if (!product) return res.status(404).json({ message: 'product not found' });
    res.json(await Offer.find({ productId: product._id }).sort({ lastUpdated: -1 }).lean());
  } catch (error) { next(error); }
});

router.post('/products/:id/offers', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'invalid product id' });
    const product = await Product.findOne({ _id: req.params.id, source: 'curated' }).select('_id').lean();
    if (!product) return res.status(404).json({ message: 'product not found' });
    const validated = validateOfferBody(req.body);
    if (validated.errors.length) return res.status(400).json({ message: validated.errors.join('; ') });
    const offer = await Offer.findOneAndUpdate(
      { productId: product._id, source: validated.data!.source, sellerName: validated.data!.sellerName },
      { $set: { ...validated.data, productId: product._id } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    res.status(201).json(offer);
  } catch (error) { next(error); }
});

router.put('/products/:id/offers/:offerId', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id) || !isValidObjectId(req.params.offerId)) return res.status(400).json({ message: 'invalid product or offer id' });
    const product = await Product.findOne({ _id: req.params.id, source: 'curated' }).select('_id').lean();
    if (!product) return res.status(404).json({ message: 'product not found' });
    const prior = await Offer.findOne({ _id: req.params.offerId, productId: product._id }).lean();
    if (!prior) return res.status(404).json({ message: 'offer not found' });
    const validated = validateOfferBody(req.body, prior as Record<string, any>);
    if (validated.errors.length) return res.status(400).json({ message: validated.errors.join('; ') });
    const duplicate = await Offer.findOne({ productId: product._id, source: validated.data!.source, sellerName: validated.data!.sellerName, _id: { $ne: prior._id } }).select('_id').lean();
    if (duplicate) return res.status(409).json({ message: 'seller/source offer already exists for this product' });
    const offer = await Offer.findByIdAndUpdate(prior._id, { $set: { ...validated.data, productId: product._id } }, { new: true, runValidators: true }).lean();
    res.json(offer);
  } catch (error) { next(error); }
});

router.post('/products', async (req, res, next) => {
  try {
    const validated = validateCatalogBody(req.body);
    if (validated.errors.length) return res.status(400).json({ message: validated.errors.join('; ') });
    if (validated.data!.urlVerificationStatus === 'verified') {
      await Promise.all([
        verifyModelPage(validated.data!.productUrl!, validated.data!.model!),
        verifyModelPage(validated.data!.specificationSourceUrl!, validated.data!.model!),
      ]);
    }
    const product = await Product.findOneAndUpdate({ dedupeKey: validated.data!.dedupeKey }, { $set: validated.data }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }).lean();
    res.status(201).json(product);
  } catch (error) { next(error); }
});

router.put('/products/:id', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'invalid product id' });
    const prior = await Product.findOne({ _id: req.params.id, source: 'curated' }).lean();
    if (!prior) return res.status(404).json({ message: 'product not found' });
    const validated = validateCatalogBody(req.body, prior as Record<string, any>);
    if (validated.errors.length) return res.status(400).json({ message: validated.errors.join('; ') });
    if (validated.data!.urlVerificationStatus === 'verified') {
      await Promise.all([
        verifyModelPage(validated.data!.productUrl!, validated.data!.model!),
        verifyModelPage(validated.data!.specificationSourceUrl!, validated.data!.model!),
      ]);
    }
    const duplicate = await Product.findOne({ dedupeKey: validated.data!.dedupeKey, _id: { $ne: prior._id } }).select('_id').lean();
    if (duplicate) return res.status(409).json({ message: 'brand/model already exists in catalog' });
    const product = await Product.findByIdAndUpdate(prior._id, { $set: validated.data }, { new: true, runValidators: true }).lean();
    res.json(product);
  } catch (error) { next(error); }
});

router.delete('/products/:id', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'invalid product id' });
    const product = await Product.findOneAndDelete({ _id: req.params.id, source: 'curated' });
    if (!product) return res.status(404).json({ message: 'product not found' });
    await Offer.deleteMany({ productId: product._id });
    res.json({ deleted: true, id: product._id });
  } catch (error) { next(error); }
});

export default router;
