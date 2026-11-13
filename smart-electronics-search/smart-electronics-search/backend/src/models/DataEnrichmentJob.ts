import { Schema, model } from 'mongoose';

const dataEnrichmentJobSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, unique: true, index: true },
    fieldStatuses: { type: Schema.Types.Mixed, required: true },
    missingFields: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['pending', 'running', 'retry', 'needs_review', 'completed'],
      required: true,
      default: 'pending',
      index: true,
    },
    attempts: { type: Number, min: 0, default: 0 },
    lastError: { type: String, default: null },
    lastAttemptAt: { type: Date, default: null },
    nextAttemptAt: { type: Date, default: null, index: true },
    checkpoint: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true, collection: 'dataenrichmentjobs' },
);

dataEnrichmentJobSchema.index({ status: 1, nextAttemptAt: 1 });

export const DataEnrichmentJob = model('DataEnrichmentJob', dataEnrichmentJobSchema);
