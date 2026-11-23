import mongoose from 'mongoose';

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/smart_electronics_local');
  const db = mongoose.connection;
  const agg = await db.collection('products').aggregate([
    { $group: { _id: '$category', count: { $sum: 1 }, brands: { $addToSet: '$brand' } } },
    { $sort: { count: 1 } }
  ]).toArray();
  for (const r of agg) {
    console.log(r._id, ':', r.count, '| brands:', (r.brands as string[]).slice(0, 8).join(', '));
  }
  await mongoose.disconnect();
}
main().catch(console.error);
