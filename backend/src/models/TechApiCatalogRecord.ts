import { Schema, model } from 'mongoose';

const techApiCatalogRecordSchema = new Schema(
  {
    sourceKey: { type: String, required: true, unique: true },
    sourceCategory: { type: String, required: true, index: true },
    sourceSlug: { type: String, required: true },
    name: { type: String, required: true, index: true },
    sourceRecordUrl: { type: String, required: true },
    sourceListUrl: { type: String, required: true },
    dataAttribution: { type: String, required: true },
    dataSourceUrl: { type: String, required: true },
    dataLicense: { type: String, required: true },
    dataLicenseUrl: { type: String, required: true },
    licenseTermsUrl: { type: String, required: true },
    workflowStatus: { type: String, enum: ['discovery_only'], default: 'discovery_only', index: true },
    raw: { type: Schema.Types.Mixed, required: true },
    searchText: { type: String, default: '', index: true },
    detailsFetchedAt: { type: Date, default: null, index: true },
    detailsSha256: { type: String, default: null },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

techApiCatalogRecordSchema.index({ sourceCategory: 1, sourceSlug: 1 }, { unique: true });

export const TechApiCatalogRecord = model('TechApiCatalogRecord', techApiCatalogRecordSchema);
