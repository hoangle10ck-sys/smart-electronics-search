import 'dotenv/config';
import mongoose from 'mongoose';

const collectionName = 'productsearchvectors';
const indexName = process.env.MONGODB_VECTOR_SEARCH_INDEX?.trim() || 'product_embedding_vector_index';
const dimensions = Number(process.env.MONGODB_VECTOR_DIMENSIONS || 1024);

async function main() {
  const apply = process.argv.includes('--apply');
  const statusOnly = process.argv.includes('--status');
  const definition = {
    name: indexName,
    type: 'vectorSearch',
    definition: {
      fields: [
        { type: 'vector', path: 'embedding', numDimensions: dimensions, similarity: 'cosine' },
        { type: 'filter', path: 'category' },
        { type: 'filter', path: 'normalizedBrand' },
        { type: 'filter', path: 'publicationStatus' },
        { type: 'filter', path: 'productVerificationStatus' },
      ],
    },
  };
  if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 8192) throw new Error('MONGODB_VECTOR_DIMENSIONS must be an integer from 1 to 8192');
  if (!apply && !statusOnly) {
    console.log(JSON.stringify({ mode: 'dry-run', collection: collectionName, definition, note: 'No MongoDB command was issued. Pass --apply to create the Atlas Vector Search index.' }, null, 2));
    return;
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  mongoose.set('autoIndex', false);
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db!;
  if (statusOnly) {
    const indexes = await db.collection(collectionName).listSearchIndexes().toArray();
    console.log(JSON.stringify({ mode: 'status', collection: collectionName, indexes }, null, 2));
    await mongoose.disconnect();
    return;
  }
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (!collections.length) await db.createCollection(collectionName);
  const result = await db.command({ createSearchIndexes: collectionName, indexes: [definition] });
  console.log(JSON.stringify({ mode: 'apply', collection: collectionName, result }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Vector index creation failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
