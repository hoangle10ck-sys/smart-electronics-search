import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { connectDB } from '../config/db';
import { Offer } from '../models/Offer';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';

const EXPECTED_DATABASE = 'smart_electronics';

async function main() {
  await connectDB();
  if (mongoose.connection.name !== EXPECTED_DATABASE) {
    throw new Error(`Catalog backup only supports the expected database ${EXPECTED_DATABASE}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDirectory = join(tmpdir(), `smart-electronics-catalog-backup-${timestamp}`);
  await mkdir(backupDirectory, { recursive: false });

  const collections = [Product.collection, Offer.collection, SyncRun.collection];
  const manifest: Array<{ collection: string; documents: number; file: string }> = [];
  for (const collection of collections) {
    const documents = await collection.find({}).toArray();
    const file = `${collection.collectionName}.ejson`;
    await writeFile(join(backupDirectory, file), EJSON.stringify(documents, { relaxed: false }), { encoding: 'utf8', flag: 'wx' });
    manifest.push({ collection: collection.collectionName, documents: documents.length, file });
  }

  await writeFile(join(backupDirectory, 'manifest.json'), JSON.stringify({
    database: mongoose.connection.name,
    createdAt: new Date().toISOString(),
    collections: manifest,
  }, null, 2), { encoding: 'utf8', flag: 'wx' });
  console.log(JSON.stringify({
    database: mongoose.connection.name,
    backupDirectory,
    collections: manifest.length,
    documents: manifest.reduce((sum, item) => sum + item.documents, 0),
  }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Catalog backup failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
