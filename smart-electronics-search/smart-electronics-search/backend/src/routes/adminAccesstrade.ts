import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth';
import { AccesstradeError, fetchDatafeedPage } from '../services/accesstradeClient';
import { syncDatafeedItems } from '../services/accesstradeSync';
import { DataSource } from '../models/DataSource';
import { SyncRun } from '../models/SyncRun';
import { mongoCatalogRepository } from '../services/mongoCatalogRepository';

const router = Router();
let syncRunning = false;

router.get('/status', requireAdmin, async (_req, res, next) => {
  try {
    const latest = await SyncRun.findOne({ source: 'accesstrade' }).sort({ startedAt: -1 }).lean();
    res.json({ running: syncRunning, latest });
  } catch (error) { next(error); }
});

router.post('/sync', requireAdmin, async (_req, res) => {
  if (syncRunning) return res.status(409).json({ message: 'Một lượt đồng bộ đang chạy' });
  syncRunning = true;
  const domain = process.env.ACCESSTRADE_DOMAIN?.trim() || 'fptshop.com.vn';
  console.info(`[accesstrade] Sync started for ${domain}`);
  let run: any;
  try {
    const source = await DataSource.findOne({ sourceKey: 'accesstrade-fptshop' }).lean();
    if (!source?.dataUsageAuthorized) return res.status(403).json({ message: 'Chưa có bằng chứng quyền sử dụng dữ liệu cho feed FPT Shop; cấu hình nguồn trong collector trước khi import' });
    run = await SyncRun.create({ source: 'accesstrade', sourceKey: source.sourceKey, mode: 'import', page: 1, status: 'running', startedAt: new Date() });
    const data = await fetchDatafeedPage({
      apiKey: process.env.ACCESSTRADE_API_KEY ?? '',
      baseUrl: process.env.ACCESSTRADE_BASE_URL,
      domain: source.domain || domain,
      page: 1,
      limit: 20,
    });
    const stats = await syncDatafeedItems(data.items, {
      ...mongoCatalogRepository,
    }, source.domain || domain, { source: 'accesstrade', sourceKey: source.sourceKey, sellerName: source.sellerName, imageUsageAuthorized: source.imageUsageAuthorized, imagePermissionEvidence: source.imagePermissionEvidence, imageTermsUrl: source.termsUrl });
    const finalStats = { ...stats, pages: 1, upstreamTotal: data.total };
    await SyncRun.updateOne({ _id: run._id }, { $set: { status: 'succeeded', finishedAt: new Date(), stats: finalStats, error: null } });
    console.info(`[accesstrade] Sync completed: fetched=${stats.fetched} created=${stats.created} updated=${stats.updated} pending=${stats.pendingReview} rejected=${stats.rejected}`);
    return res.json({ status: 'succeeded', stats: finalStats });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định khi đồng bộ';
    const upstreamStatus = error instanceof AccesstradeError ? error.status : undefined;
    if (run?._id) await SyncRun.updateOne({ _id: run._id }, { $set: { status: 'failed', finishedAt: new Date(), error: message } });
    console.error(`[accesstrade] Sync failed${upstreamStatus ? ` (HTTP ${upstreamStatus})` : ''}: ${message}`);
    return res.status(upstreamStatus ? 502 : 500).json({ message, upstreamStatus });
  } finally {
    syncRunning = false;
  }
});

export default router;
