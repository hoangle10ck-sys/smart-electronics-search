import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoClient } from 'mongodb';
import { configureLocalEnvironment, LOCAL_DATABASE_NAME } from './localEnvironment';

configureLocalEnvironment();

async function ensureSafeLocalTarget() {
  const client = new MongoClient(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 3000 });
  try {
    await client.connect();
    const products = client.db(LOCAL_DATABASE_NAME).collection('products');
    const existing = await products.countDocuments({});
    const curated = await products.countDocuments({ source: 'curated' });
    if (existing !== curated) {
      throw new Error(`Refusing to seed ${LOCAL_DATABASE_NAME}: it already contains non-curated products.`);
    }
  } finally {
    await client.close();
  }
}

ensureSafeLocalTarget()
  .then(async () => {
    console.log(`Seeding catalog into local MongoDB database: ${LOCAL_DATABASE_NAME}; using the verification metadata already recorded in catalog.json.`);
    const { seedCatalog } = await import('./seed/catalogSeed');
    await seedCatalog({ verifyUrls: false });
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Local catalog seed failed');
    void mongoose.disconnect();
    process.exitCode = 1;
  });
