import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { AddressInfo } from 'node:net';
import adminCollectorRoutes from '../src/routes/adminCollector';

test('collector API rejects the retired crawler adapter without touching MongoDB', async (t) => {
  const previousToken = process.env.ADMIN_API_TOKEN;
  const token = 'collector-adapter-removal-test-token';
  process.env.ADMIN_API_TOKEN = token;

  const app = express();
  app.use(express.json());
  app.use('/api/admin/collector', adminCollectorRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', resolve);
  });

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousToken === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = previousToken;
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}/api/admin/collector`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const sourceResponse = await fetch(`${baseUrl}/sources`, {
    method: 'POST', headers,
    body: JSON.stringify({ sourceKey: 'retired-crawler', name: 'Retired crawler', adapter: 'watercrawl' }),
  });
  assert.equal(sourceResponse.status, 400);

  const crawlResponse = await fetch(`${baseUrl}/sources/retired-crawler/crawl`, { method: 'POST', headers, body: '{}' });
  assert.equal(crawlResponse.status, 404);
});
