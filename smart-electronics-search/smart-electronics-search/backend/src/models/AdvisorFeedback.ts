import { Schema, model } from 'mongoose';

const advisorFeedbackSchema = new Schema({
  conversationId: { type: String, required: true, maxlength: 64, index: true },
  assistantMessageId: { type: String, required: true, maxlength: 64 },
  rating: { type: String, required: true, enum: ['helpful', 'not_helpful'] },
  reportType: { type: String, required: true, enum: ['none', 'wrong_advice', 'irrelevant_product'], default: 'none' },
  errorCategory: { type: String, enum: ['query_understanding', 'search', 'catalog_data', 'product_evaluation', 'qwen_explanation', null], default: null },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
  assistantIntent: { type: String, maxlength: 80, default: null },
}, {
  timestamps: true,
  collection: 'advisorfeedback',
  versionKey: false,
});

advisorFeedbackSchema.index({ conversationId: 1, assistantMessageId: 1, reportType: 1, productId: 1 }, { unique: true });
advisorFeedbackSchema.index({ createdAt: -1, errorCategory: 1 });

export const AdvisorFeedback = model('AdvisorFeedback', advisorFeedbackSchema);
