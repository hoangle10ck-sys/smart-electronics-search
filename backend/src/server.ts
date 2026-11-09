import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { connectDB } from './config/db';
import productRoutes from './routes/products';

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/products', productRoutes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Lỗi máy chủ', detail: err.message });
});

const PORT = Number(process.env.PORT) || 5000;
connectDB()
  .then(() => app.listen(PORT, () => console.log(`🚀 API chạy tại http://localhost:${PORT}`)))
  .catch((e) => { console.error('❌ Không kết nối được MongoDB:', e.message); process.exit(1); });
