import { Schema, model } from 'mongoose';

const syncRunSchema = new Schema(
  {
    source: { type: String, required: true },
    sourceKey: { type: String, default: null, index: true },
    mode: { type: String, enum: ['dry-run', 'import', 'update', 'price-dry-run', 'price-sync'], default: 'dry-run' },
    page: { type: Number, default: 1 },
    status: { type: String, enum: ['running', 'succeeded', 'partial', 'failed'], required: true, index: true },
    startedAt: { type: Date, required: true, index: true },
    finishedAt: { type: Date, default: null },
    stats: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

export const SyncRun = model('SyncRun', syncRunSchema);
