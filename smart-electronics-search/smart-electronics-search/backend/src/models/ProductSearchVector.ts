import { Schema, model } from 'mongoose';

const productSearchVectorSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, required: true, unique: true },
  embedding: { type: [Number], required: true },
  contentHash: { type: String, required: true },
  embeddingModel: { type: String, required: true },
  normalizedBrand: { type: String, default: null },
  category: { type: String, required: true },
  publicationStatus: { type: String, required: true },
  productVerificationStatus: { type: String, required: true },
}, { timestamps: true, collection: 'productsearchvectors', versionKey: false });

export const ProductSearchVector = model('ProductSearchVector', productSearchVectorSchema);
