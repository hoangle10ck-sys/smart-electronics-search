import { Schema, model } from 'mongoose';

const dataSourceSchema = new Schema(
  {
    sourceKey: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    adapter: { type: String, enum: ['accesstrade', 'csv'], required: true },
    domain: { type: String, default: null },
    sellerName: { type: String, default: null },
    termsUrl: { type: String, default: null },
    dataUsageAuthorized: { type: Boolean, default: false },
    dataPermissionEvidence: { type: String, default: null },
    imageUsageAuthorized: { type: Boolean, default: false },
    imagePermissionEvidence: { type: String, default: null },
    legalReviewedAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    lastRunAt: { type: Date, default: null },
    lastRunStats: { type: Schema.Types.Mixed, default: null },
    lastRunError: { type: String, default: null },
  },
  { timestamps: true }
);

export const DataSource = model('DataSource', dataSourceSchema);
