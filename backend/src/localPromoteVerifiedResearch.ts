import { basename } from 'node:path';
import { MongoClient } from 'mongodb';
import { configureLocalEnvironment, LOCAL_DATABASE_NAME } from './localEnvironment';

configureLocalEnvironment();

const args = process.argv.slice(2);
const fileArgument = args.find((argument) => argument.startsWith('--file='));
const requestedFile = fileArgument?.slice('--file='.length) ?? 'research-pending.json';
const fileName = basename(requestedFile);
if (requestedFile !== fileName || !/^research-pending(?:[-a-z0-9]*)?\.json$/i.test(fileName)) {
  throw new Error('Use --file=<research-pending filename> from backend/src/seed.');
}

const sourceKeys = args.filter((argument) => argument !== fileArgument);
if (!sourceKeys.length) throw new Error('Pass at least one exact web-research source key to promote.');
process.env.RESEARCH_PENDING_FILE = fileName;

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 3000 });
  let missingKeys = sourceKeys;
  try {
    await client.connect();
    const publicRows = await client.db(LOCAL_DATABASE_NAME).collection('products').find({
      sourceKey: { $in: sourceKeys }, publicationStatus: 'published',
      productVerificationStatus: 'verified', imageVerificationStatus: 'verified', urlVerificationStatus: 'verified',
    }, { projection: { sourceKey: 1 } }).toArray();
    const alreadyPublic = new Set(publicRows.map((row) => String(row.sourceKey)));
    missingKeys = sourceKeys.filter((key) => !alreadyPublic.has(key));
  } finally {
    await client.close();
  }

  if (!missingKeys.length) {
    console.log(`Selected records are already published in ${LOCAL_DATABASE_NAME}; no source checks or writes were needed.`);
    return;
  }
  process.argv = [process.argv[0], process.argv[1], ...missingKeys];
  console.log(`Revalidating and promoting selected records in ${LOCAL_DATABASE_NAME} from ${fileName}.`);
  await import('./seed/promoteVerifiedResearch');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Local research promotion failed');
  process.exitCode = 1;
});
