import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { EJSON } from 'bson';

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db!;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(tmpdir(), `smart-electronics-search-mongo-backup-${stamp}`);
  await mkdir(backupDir, { recursive: false });
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).filter(({ name }) => !name.startsWith('system.'));
  const manifest: Array<{ collection: string; documents: number; file: string }> = [];
  for (const { name } of collections) {
    const records = await db.collection(name).find({}).toArray();
    const file = `${name}.ejson`;
    await writeFile(join(backupDir, file), EJSON.stringify(records, { relaxed: false }), { encoding: 'utf8', flag: 'wx' });
    manifest.push({ collection: name, documents: records.length, file });
  }
  await writeFile(join(backupDir, 'manifest.json'), JSON.stringify({ database: db.databaseName, createdAt: new Date().toISOString(), collections: manifest }, null, 2), { encoding: 'utf8', flag: 'wx' });
  console.log(JSON.stringify({ backupDir, collections: manifest.length, documents: manifest.reduce((sum, row) => sum + row.documents, 0) }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'MongoDB backup failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
