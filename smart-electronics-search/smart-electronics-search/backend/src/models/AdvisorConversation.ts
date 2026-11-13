import { Schema, model } from 'mongoose';

const recommendationSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  fitScore: { type: Number, required: true, min: 0, max: 100 },
  matchScore: { type: Number, min: 0, max: 100, default: null },
  dataConfidence: { type: Number, min: 0, max: 100, default: null },
  matchingStatus: { type: String, enum: ['fully_matching', 'incomplete', 'not_matching', 'historical_reference'], default: 'incomplete' },
  fullyMatching: { type: Boolean, default: false },
  resultKind: { type: String, enum: ['current_search', 'previous_search'], default: 'current_search' },
  fitReasons: { type: [String], default: [] },
  budgetStatus: { type: String, enum: ['within_budget', 'over_budget', 'price_unknown', 'not_specified'], default: 'not_specified' },
}, { _id: false });

const messageSchema = new Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  messageId: { type: String, default: null, maxlength: 64 },
  clientMessageId: { type: String, default: null },
  content: { type: String, required: true, maxlength: 4000 },
  intent: { type: String, default: null },
  needsClarification: { type: Boolean, default: false },
  suggestedQuestions: { type: [String], default: [] },
  recommendations: { type: [recommendationSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const searchResultSchema = new Schema({
  searchId: { type: String, required: true },
  query: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  productIds: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },
}, { _id: false });

const conversationSchema = new Schema({
  conversationId: { type: String, required: true, unique: true, index: true },
  messages: { type: [messageSchema], default: [] },
  requirements: { type: Schema.Types.Mixed, default: {} },
  currentCategory: { type: String, default: null },
  currentBudget: { type: Schema.Types.Mixed, default: null },
  preferences: { type: [String], default: [] },
  currentProducts: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },
  lastSearchResults: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },
  currentSearchId: { type: String, default: null },
  currentSearchQuery: { type: String, default: '' },
  currentSearchResults: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },
  previousSearchResults: { type: [searchResultSchema], default: [] },
  conversationProductReferences: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },
  conversationSummary: { type: String, default: '' },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });

conversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AdvisorConversation = model('AdvisorConversation', conversationSchema);
