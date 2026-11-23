import 'dotenv/config';

export const LOCAL_DATABASE_NAME = 'smart_electronics_local';

/** Force local demo processes away from any URI configured in backend/.env. */
export function configureLocalEnvironment() {
  process.env.PORT = '5000';
  process.env.MONGODB_URI = `mongodb://127.0.0.1:27017/${LOCAL_DATABASE_NAME}?directConnection=true`;
  process.env.TECHAPI_STORAGE = 'mongo';
  process.env.TECHAPI_SQLITE_ACCESS = 'readonly';
  process.env.SEARCH_PROVIDER = 'none';
  process.env.SEARCH_EVAL_SKIP_OLLAMA = 'true';
  process.env.SEARCH_EVAL_SKIP_DISCOVERY = 'true';
  process.env.MONGODB_VECTOR_SEARCH_ENABLED = 'false';
}
