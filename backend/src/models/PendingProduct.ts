import { Schema, model } from 'mongoose';

const pendingProductSchema = new Schema(
  {
    sourceKey: { type: String, required: true, unique: true },
    source: { type: String, required: true },
    reasons: { type: [String], default: [] },
    raw: { type: Schema.Types.Mixed, required: true },
    classification: { type: String, enum: ['pending_review', 'rejected'], default: 'pending_review' },
    productVerificationStatus: { type: String, enum: ['verified', 'pending', 'rejected'], default: 'pending', index: true },
    imageVerificationStatus: { type: String, enum: ['verified', 'pending', 'rejected'], default: 'pending', index: true },
    urlVerificationStatus: { type: String, enum: ['verified', 'pending', 'rejected'], default: 'pending', index: true },
    publicationStatus: { type: String, enum: ['published', 'pending', 'hidden'], default: 'pending', index: true },
    reviewedAt: { type: Date, default: null },
    reviewDecision: { type: String, enum: ['approved', 'rejected', null], default: null },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const PendingProduct = model('PendingProduct', pendingProductSchema);
