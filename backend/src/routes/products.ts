import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { Product } from '../models/Product';
import { smartSearch, suggestProducts } from '../services/searchService';
import { buildSearchText } from '../utils/text';

const router = Router();
const SORTS = ['price_asc', 'price_desc', 'popular', 'rating'] as const;

// GET /api/products/search?q=laptop gaming dưới 20 triệu&limit=24&sort=price_asc
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.status(400).json({ message: 'Thiếu từ khoá tìm kiếm (q)' });
    const limit = Math.min(Number(req.query.limit) || 24, 60);
    const sort = SORTS.find((s) => s === req.query.sort);
    res.json(await smartSearch(q, limit, sort));
  } catch (e) { next(e); }
});

// GET /api/products/suggest?q=iph  -> gợi ý tên sản phẩm khi gõ
router.get('/suggest', async (req, res, next) => {
  try { res.json(await suggestProducts(String(req.query.q ?? ''))); } catch (e) { next(e); }
});

// GET /api/products?category=laptop&page=1&pageSize=20
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Number(req.query.pageSize) || 20, 100);
    const filter = req.query.category ? { category: String(req.query.category) } : {};
    const [items, total] = await Promise.all([
      Product.find(filter).select('-searchText').sort({ sold: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      Product.countDocuments(filter),
    ]);
    res.json({ page, pageSize, total, items });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'ID không hợp lệ' });
    const item = await Product.findById(req.params.id).select('-searchText').lean();
    if (!item) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    res.json(item);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const b = req.body;
    const created = await Product.create({ ...b, searchText: buildSearchText(b) });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

export default router;
