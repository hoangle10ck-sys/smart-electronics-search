import { Product } from '../models/Product';
import { Offer } from '../models/Offer';
import { PendingProduct } from '../models/PendingProduct';
import { SyncRepository } from './accesstradeSync';
import { normalizeProduct } from './productNormalizer';

export const mongoCatalogRepository: SyncRepository = {
  async findProduct(filter) {
    const product = await Product.findOne(filter).select('_id').lean();
    return product ? { id: product._id } : null;
  },
  async findProducts(filter) {
    const products = await Product.find(filter).select('_id').limit(2).lean();
    return products.map((product) => ({ id: product._id }));
  },
  async findOffer(filter) {
    const offer = await Offer.findOne(filter).select('lastUpdated').lean();
    return offer ? { lastUpdated: offer.lastUpdated } : null;
  },
  async upsertProduct(filter, value) {
    const sourceId = typeof value.sourceProductId === 'string' ? value.sourceProductId : null;
    const update: Record<string, unknown> = { $set: { ...value, ...normalizeProduct(value) } };
    if (sourceId) update.$addToSet = { sourceProductIds: sourceId };
    const result = await Product.updateOne(filter, update, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
    const product = await Product.findOne(filter).select('_id').lean();
    if (!product) throw new Error('Không đọc lại được sản phẩm sau khi upsert');
    return { id: product._id, created: result.upsertedCount > 0 };
  },
  async upsertOffer(filter, value) {
    await Offer.updateOne(filter, { $set: value }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
  },
  async upsertPending(filter, value) {
    await PendingProduct.updateOne(filter, { $set: { ...value, productVerificationStatus: value.productVerificationStatus ?? 'pending', imageVerificationStatus: value.imageVerificationStatus ?? 'pending', urlVerificationStatus: value.urlVerificationStatus ?? 'pending', publicationStatus: value.publicationStatus ?? 'pending', lastSeenAt: new Date(), classification: 'pending_review' } }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
  },
};
