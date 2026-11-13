import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { connectDB } from './config/db';
import { ProductSearchVector } from './models/ProductSearchVector';
import { DEFAULT_EMBEDDING_MODEL } from './services/productEmbeddings';
import productRoutes from './routes/products';
import adminAccesstradeRoutes from './routes/adminAccesstrade';
import adminCollectorRoutes from './routes/adminCollector';
import adminCatalogRoutes from './routes/adminCatalog';
import v1Routes from './routes/v1';

const app = express();
let healthCache: { expiresAt: number; payload: Record<string, any> } | null = null;
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/csv', limit: '2mb' }));

function modelInstalled(models: string[], configuredName: string) {
  const canonical = configuredName.trim().toLocaleLowerCase().replace(/:latest$/, '');
  return models.some((name) => name.trim().toLocaleLowerCase().replace(/:latest$/, '') === canonical);
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/v1/health', async (_req, res) => {
  if (!healthCache || healthCache.expiresAt <= Date.now()) {
    const mongo = mongoose.connection.readyState === 1;
    const baseUrl = (process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    let ollama: Record<string, unknown> = { status: 'unavailable', queryModel: false, embeddingModel: false };
    try {
      const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        const payload = await response.json() as any;
        const models = (payload?.models ?? []).map((model: any) => String(model.name ?? ''));
        const queryModel = process.env.OLLAMA_QUERY_MODEL?.trim() || 'qwen3:4b';
        const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
        ollama = { status: 'available', queryModel: modelInstalled(models, queryModel), embeddingModel: modelInstalled(models, embeddingModel) };
      }
    } catch { /* A missing local AI service is a degraded mode; keyword search remains available. */ }
    let vectorSearch: Record<string, unknown> = { enabled: process.env.MONGODB_VECTOR_SEARCH_ENABLED === 'true', status: 'disabled' };
    if (mongo && vectorSearch.enabled) {
      try {
        const indexes = await ProductSearchVector.collection.listSearchIndexes().toArray();
        const name = process.env.MONGODB_VECTOR_SEARCH_INDEX?.trim() || 'product_embedding_vector_index';
        const index = indexes.find((item: any) => item.name === name) as any;
        vectorSearch = { enabled: true, status: index?.status ?? 'missing', queryable: index?.queryable === true };
      } catch { vectorSearch = { enabled: true, status: 'unavailable', queryable: false }; }
    }
    const modelUnavailable = ollama.status !== 'available' || ollama.queryModel !== true || (vectorSearch.enabled && ollama.embeddingModel !== true);
    const vectorUnavailable = vectorSearch.enabled && vectorSearch.queryable !== true;
    const status = mongo ? (modelUnavailable || vectorUnavailable ? 'degraded' : 'ok') : 'unavailable';
    healthCache = { expiresAt: Date.now() + 15_000, payload: { ok: mongo, version: 'v1', status, services: { mongodb: mongo ? 'connected' : 'disconnected', ollama, vectorSearch } } };
  }
  res.status(healthCache.payload.ok ? 200 : 503).json(healthCache.payload);
});
app.use('/api/products', productRoutes);
app.use('/api/v1', v1Routes);
app.use('/api/v1/products', productRoutes);
app.use('/api/admin/accesstrade', adminAccesstradeRoutes);
app.use('/api/admin/collector', adminCollectorRoutes);
app.use('/api/admin/catalog', adminCatalogRoutes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Lỗi máy chủ' });
});

const PORT = Number(process.env.PORT) || 5000;
connectDB()
  .then(() => app.listen(PORT, () => console.log(`🚀 API chạy tại http://localhost:${PORT}`)))
  .catch((e) => { console.error('❌ Không kết nối được MongoDB:', e.message); process.exit(1); });
