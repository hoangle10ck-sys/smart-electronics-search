import { basename } from 'node:path';
import { configureLocalEnvironment, LOCAL_DATABASE_NAME } from './localEnvironment';

configureLocalEnvironment();

const batchArgument = process.argv.find((argument) => argument.startsWith('--batch-file='));
const requestedFile = batchArgument?.slice('--batch-file='.length) ?? 'price-research-batch-2026-11-11.json';
const fileName = basename(requestedFile);
if (requestedFile !== fileName || !/^price-research-batch-[a-z0-9-]+\.json$/i.test(fileName)) {
  throw new Error('Use --batch-file=<price-research-batch filename> from backend/src/seed.');
}

console.log(`Importing verified price observations into ${LOCAL_DATABASE_NAME} from ${fileName}.`);
void import('./seed/importVerifiedWebPrices');
