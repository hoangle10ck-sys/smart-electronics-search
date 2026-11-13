import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Offer } from '../models/Offer';
import { PendingProduct } from '../models/PendingProduct';
import { Product } from '../models/Product';

async function main() {
  await connectDB();
  try {
    const validOfferFilter = {
      verified: true,
      priceVerificationStatus: 'verified',
      price: { $gt: 0 },
      currency: 'VND',
      productUrl: { $type: 'string', $ne: '' },
    };
    const [productTotal, offerTotal, positiveOffers, verifiedOffers, publishedProducts, pendingProducts, verifiedProducts, pendingQueueTotal] = await Promise.all([
      Product.countDocuments(),
      Offer.countDocuments(),
      Offer.countDocuments({ price: { $gt: 0 } }),
      Offer.countDocuments(validOfferFilter),
      Product.countDocuments({ publicationStatus: 'published' }),
      Product.countDocuments({ publicationStatus: 'pending' }),
      Product.countDocuments({ productVerificationStatus: 'verified' }),
      PendingProduct.countDocuments(),
    ]);
    const publishedRows = await Product.find({ publicationStatus: 'published' }).select('_id brand model name category specs').lean();
    const publishedIds = publishedRows.map((row) => row._id);
    const withVerifiedOffers = await Offer.distinct('productId', { ...validOfferFilter, productId: { $in: publishedIds } });
    const priceCoverageByCategory = publishedRows.reduce<Record<string, { published: number; withVerifiedPrice: number }>>((summary, row) => {
      const category = row.category || 'uncategorized';
      summary[category] ??= { published: 0, withVerifiedPrice: 0 };
      summary[category].published += 1;
      if (withVerifiedOffers.some((id) => String(id) === String(row._id))) summary[category].withVerifiedPrice += 1;
      return summary;
    }, {});
    const importedOffers = await Offer.find({ source: 'web-research' })
      .populate('productId', 'name model category specs')
      .select('sellerName variantLabel price originalPrice discount currency productUrl sourceRetrievedAt sourceProductId verified priceVerificationStatus productId')
      .lean();
    console.log(JSON.stringify({
      database: mongoose.connection.name,
      products: { total: productTotal, published: publishedProducts, publicationPending: pendingProducts, modelVerified: verifiedProducts },
      pendingProductQueue: pendingQueueTotal,
      offers: { total: offerTotal, withPositivePrice: positiveOffers, verifiedWithUsableUrl: verifiedOffers },
      publishedProductPriceCoverage: {
        withVerifiedOffer: withVerifiedOffers.length,
        withoutVerifiedOffer: Math.max(0, publishedProducts - withVerifiedOffers.length),
        byCategory: priceCoverageByCategory,
      },
      unpricedPublishedProducts: publishedRows
        .filter((row) => !withVerifiedOffers.some((id) => String(id) === String(row._id)))
        .map(({ brand, model, name, category }) => ({ brand, model, name, category })),
      webResearchOffers: importedOffers,
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Price coverage report failed.');
  await mongoose.disconnect();
  process.exitCode = 1;
});
