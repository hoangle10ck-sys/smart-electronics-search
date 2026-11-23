import { basename } from 'node:path';
import { configureLocalEnvironment, LOCAL_DATABASE_NAME } from './localEnvironment';

configureLocalEnvironment();

const requestedFile = process.argv[2] ?? 'research-pending.json';
const fileName = basename(requestedFile);
if (requestedFile !== fileName || !/^research-pending(?:[-a-z0-9]*)?\.json$/i.test(fileName)) {
  throw new Error('Pass a research-pending JSON filename located in backend/src/seed.');
}

process.env.RESEARCH_PENDING_FILE = fileName;
process.env.RESEARCH_BATCH_KEY = `local-data-expansion:${fileName}:${Date.now()}`;
console.log(`Importing reviewed research candidates into ${LOCAL_DATABASE_NAME} as pending records: ${fileName}`);
void import('./seed/importResearchPending');
