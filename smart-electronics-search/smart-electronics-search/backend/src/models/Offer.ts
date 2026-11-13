import { Schema, model } from 'mongoose';

const offerSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    sellerName: { type: String, required: true },
    variantLabel: { type: String, default: null },
    price: { type: Number, default: null, min: 0 },
    originalPrice: { type: Number, default: null, min: 0 },
    discount: { type: Number, default: null, min: 0 },
    currency: { type: String, default: null },
    productUrl: { type: String, default: null },
    affiliateUrl: { type: String, default: null },
    availability: { type: String, default: null },
    source: { type: String, required: true, index: true },
    sourceProductId: { type: String, default: null },
    verified: { type: Boolean, default: false, index: true },
    priceVerificationStatus: { type: String, enum: ['verified', 'pending', 'rejected'], default: 'pending', index: true },
    verificationNote: { type: String, default: null },
    sourceRetrievedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    lastRunId: { type: Schema.Types.ObjectId, default: null },
    lastUpdated: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

offerSchema.index({ productId: 1, source: 1, sellerName: 1 }, { unique: true });
offerSchema.index({ price: 1, lastUpdated: -1 });

export const Offer = model('Offer', offerSchema);
