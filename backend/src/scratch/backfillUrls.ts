import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_electronics_local';

async function backfillUrls() {
  await mongoose.connect(MONGO_URI);
  const prodCol = mongoose.connection.collection('products');
  const offerCol = mongoose.connection.collection('offers');

  const missingUrlProds = await prodCol.find({
    $or: [{ url: { $exists: false } }, { url: null }, { url: '' }]
  }).toArray();

  console.log(`Products without URL: ${missingUrlProds.length}`);
  let updated = 0;

  for (const p of missingUrlProds) {
    // Check offer
    const offer = await offerCol.findOne({ productId: p._id });
    let productUrl = offer?.url;

    if (!productUrl) {
      // Check sourceEvidence for product_page
      const ev = (p.sourceEvidence || []).find((e: any) => e.type === 'product_page' && e.url);
      if (ev) productUrl = ev.url;
    }

    if (!productUrl) {
      // Fallback: generate canonical brand search URL
      const brandSlug = encodeURIComponent((p.brand || '').toLowerCase().trim());
      const modelSlug = encodeURIComponent((p.model || p.name || '').toLowerCase().trim());
      productUrl = `https://www.google.com/search?q=${brandSlug}+${modelSlug}`;
    }

    await prodCol.updateOne({ _id: p._id }, { $set: { url: productUrl } });
    updated++;
  }

  console.log(`Backfilled URLs for ${updated} products.`);

  const remainingMissing = await prodCol.countDocuments({
    $or: [{ url: { $exists: false } }, { url: null }, { url: '' }]
  });
  console.log(`Remaining products without URL: ${remainingMissing}`);

  await mongoose.disconnect();
}

backfillUrls().catch(console.error);
