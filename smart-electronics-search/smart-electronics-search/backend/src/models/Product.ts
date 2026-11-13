import { Schema, model } from 'mongoose';

const variantSchema = new Schema(
  {
    name: { type: String, default: null },
    sku: { type: String, default: null },
    modelNumber: { type: String, default: null },
    attributes: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const sourceEvidenceSchema = new Schema(
  {
    evidenceType: { type: String, required: true },
    sourceName: { type: String, required: true },
    sourceUrl: { type: String, required: true },
    retrievedAt: { type: Date, required: true },
    verifiedAt: { type: Date, required: true },
    notes: { type: String, default: null },
  },
  { _id: false }
);

const productSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, index: true },
    model: { type: String, default: null },
    modelNumber: { type: String, default: null, index: true },
    sku: { type: String, default: null },
    normalizedName: { type: String, default: null },
    normalizedBrand: { type: String, default: null },
    normalizedModel: { type: String, default: null },
    normalizedModelNumber: { type: String, default: null },
    normalizedSku: { type: String, default: null },
    aliases: { type: [String], default: [] },
    brand: { type: String, default: null, index: true },
    family: { type: String, default: null, index: true },
    generation: { type: String, default: null, index: true },
    releaseYear: { type: Number, default: null },
    productStatus: { type: String, enum: ['active', 'discontinued', 'end_of_life', 'unknown'], default: 'unknown', index: true },
    category: { type: String, required: true, index: true },
    price: { type: Number, default: null, index: true },
    originalPrice: Number,
    description: { type: String, default: null },
    imageUrl: { type: String, default: null },
    localOnlyAsset: { type: Boolean, default: false, index: true },
    imageSource: { type: String, default: null },
    imageSourceUrl: { type: String, default: null },
    imageAuthor: { type: String, default: null },
    imageRetrievedAt: { type: Date, default: null },
    imageUsagePermission: { type: String, enum: ['granted', 'not_authorized', 'not_provided'], default: 'not_provided', index: true },
    imagePermissionEvidence: { type: String, default: null },
    imageLicense: { type: String, default: null },
    imageLicenseUrl: { type: String, default: null },
    imageAttribution: { type: String, default: null },
    imageVisualIdentityChecked: { type: Boolean, default: false },
    imageVerificationBasis: { type: String, default: null },
    sourceUrl: { type: String, default: null },
    productUrl: { type: String, default: null },
    specificationSourceUrl: { type: String, default: null },
    verified: { type: Boolean, default: false, index: true },
    verifiedAt: { type: Date, default: null },
    verificationScope: { type: String, enum: ['manufacturer', 'retailer_feed', 'open_dataset', 'curated', null], default: null, index: true },
    productVerificationStatus: { type: String, enum: ['verified', 'pending', 'rejected'], default: 'pending', index: true },
    imageVerificationStatus: { type: String, enum: ['verified', 'pending', 'rejected'], default: 'pending', index: true },
    urlVerificationStatus: { type: String, enum: ['verified', 'pending', 'rejected'], default: 'pending', index: true },
    publicationStatus: { type: String, enum: ['published', 'pending', 'hidden'], default: 'pending', index: true },
    specifications: { type: Schema.Types.Mixed, default: null },
    variants: { type: [variantSchema], default: [] },
    sourceEvidence: { type: [sourceEvidenceSchema], default: [] },
    catalogQuality: { type: Schema.Types.Mixed, default: null },
    catalogQualityCheckedAt: { type: Date, default: null },
    duplicateReview: { type: Schema.Types.Mixed, default: null },
    dataAttribution: { type: String, default: null },
    dataSourceUrl: { type: String, default: null },
    dataLicense: { type: String, default: null },
    dataLicenseUrl: { type: String, default: null },
    source: { type: String, default: 'sample', index: true },
    sourceProductId: { type: String, default: null },
    sourceKey: { type: String, default: null, index: true },
    dedupeKey: { type: String, unique: true, sparse: true },
    sourceProductIds: { type: [String], default: [] },
    electronicStatus: { type: String, enum: ['approved', 'pending_review'], default: 'approved', index: true },
    specs: { type: Schema.Types.Mixed, default: {} }, // ram, storage (GB), cpu, gpu, screen, battery...
    normalizedSpecs: { type: Schema.Types.Mixed, default: {} },
    tags: { type: [String], default: [], index: true }, // gaming, office, camera, battery...
    rating: { type: Number, default: 4 },
    sold: { type: Number, default: 0 },
    stock: { type: Number, default: 10 },
    searchText: { type: String, default: '' }, // văn bản đã bỏ dấu để so khớp
  },
  { timestamps: true }
);

productSchema.index({ electronicStatus: 1, category: 1, brand: 1, price: 1 });
productSchema.index({ name: 'text', description: 'text', searchText: 'text' });
productSchema.index({ normalizedModel: 1, normalizedBrand: 1 });
productSchema.index({ normalizedModelNumber: 1 });
productSchema.index({ normalizedSku: 1 });
productSchema.index({ aliases: 1 });
productSchema.index({ category: 1, normalizedBrand: 1, 'normalizedSpecs.ramGB': 1 });
productSchema.index({ category: 1, 'normalizedSpecs.storageGB': 1 });
productSchema.index({ category: 1, 'normalizedSpecs.storageType': 1 });
productSchema.index({ category: 1, 'normalizedSpecs.vramGB': 1 });

export const Product = model('Product', productSchema);
