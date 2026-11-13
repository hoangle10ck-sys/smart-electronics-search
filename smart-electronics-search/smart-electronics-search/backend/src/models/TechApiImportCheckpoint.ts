import { Schema, model } from 'mongoose';

const techApiImportCheckpointSchema = new Schema({
  fileKey: { type: String, required: true, unique: true },
  sourcePath: { type: String, required: true },
  sourceCommit: { type: String, required: true },
  sha256: { type: String, required: true },
  recordCount: { type: Number, required: true },
  importedAt: { type: Date, required: true },
}, { timestamps: true, collection: 'techapiimportcheckpoints', versionKey: false });

export const TechApiImportCheckpoint = model('TechApiImportCheckpoint', techApiImportCheckpointSchema);
