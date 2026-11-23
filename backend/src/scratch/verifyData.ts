import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_electronics_local';

async function verify() {
  await mongoose.connect(MONGO_URI);
  const prodCol = mongoose.connection.collection('products');
  const offerCol = mongoose.connection.collection('offers');

  const totalProds = await prodCol.countDocuments();
  const totalOffers = await offerCol.countDocuments();

  console.log(`=== DATABASE AUDIT ===`);
  console.log(`Total Products: ${totalProds}`);
  console.log(`Total Offers:   ${totalOffers}`);

  // 1. Check duplicate names
  const dupes = await prodCol.aggregate([
    { $group: { _id: '$name', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();
  console.log(`Duplicate product names: ${dupes.length}`);
  if (dupes.length > 0) console.log('Dupes:', dupes.slice(0, 5));

  // 2. Check missing fields
  const missingImg = await prodCol.countDocuments({
    $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }, { imageUrl: '' }]
  });
  console.log(`Missing Image: ${missingImg}`);

  const missingUrl = await prodCol.countDocuments({
    $or: [{ url: { $exists: false } }, { url: null }, { url: '' }]
  });
  console.log(`Missing URL: ${missingUrl}`);

  const missingSpecs = await prodCol.countDocuments({
    $or: [{ specs: { $exists: false } }, { specs: null }]
  });
  console.log(`Missing Specs: ${missingSpecs}`);

  // 3. Offers check
  const zeroPrice = await offerCol.countDocuments({
    $or: [{ price: { $lte: 0 } }, { price: { $exists: false } }]
  });
  console.log(`Invalid / Zero Price Offers: ${zeroPrice}`);

  await mongoose.disconnect();
}

verify().catch(console.error);
