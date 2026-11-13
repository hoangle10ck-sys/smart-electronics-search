import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { AddressInfo } from 'node:net';
import productRoutes from '../src/routes/products';

test('legacy product creation endpoint requires admin authentication before writing', async (t) => {
  const previousToken = process.env.ADMIN_API_TOKEN;
  delete process.env.ADMIN_API_TOKEN;

  const app = express();
  app.use(express.json());
  app.use('/api/products', productRoutes);
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
  const url = `http://127.0.0.1:${address.port}/api/products`;
  const body = JSON.stringify({ name: 'Test product', category: 'laptop' });

  const unconfigured = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal(unconfigured.status, 503);

  process.env.ADMIN_API_TOKEN = 'unit-test-admin-token';
  const unauthenticated = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal(unauthenticated.status, 401);
});
