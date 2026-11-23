import mongoose from 'mongoose';
const MONGO_URI = 'mongodb://127.0.0.1:27017/smart_electronics_local';
mongoose.connect(MONGO_URI).then(async () => {
  const col = mongoose.connection.collection('products');
  const cats = ['gpu','cpu','ram','storage','motherboard','power_supply'];
  for (const cat of cats) {
    const items = await col.find({category: cat}, {projection: {name:1}}).toArray();
    console.log(`\n=== ${cat} (${items.length}) ===`);
    items.forEach(p => console.log('  -', p.name));
  }
  await mongoose.disconnect();
});
