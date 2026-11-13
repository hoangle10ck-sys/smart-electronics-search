import { Schema, model } from 'mongoose';

const searchFeedbackSchema = new Schema({
  query: { type: String, required: true, maxlength: 300 },
  productId: { type: Schema.Types.ObjectId, default: null, index: true },
  feedback: { type: String, required: true, enum: ['helpful', 'not_helpful', 'wrong_product', 'wrong_price', 'not_relevant'] },
  searchMethod: { type: String, enum: ['hybrid', 'exact', 'keyword', 'semantic'], default: 'hybrid' },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'searchfeedback', versionKey: false });

export const SearchFeedback = model('SearchFeedback', searchFeedbackSchema);
