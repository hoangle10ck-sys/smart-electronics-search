import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import adminAccesstradeRoutes from '../routes/adminAccesstrade';
import { fetchAllDatafeeds, fetchDatafeedPage } from './accesstradeClient';
import { classifyElectronics } from './electronicsClassifier';
import { mapDatafeedItem, syncDatafeedItems, SyncRepository, validExternalUrl } from './accesstradeSync';
import { parseProductCsv } from './csvProductAdapter';
import { validateCatalogBody, validateOfferBody } from '../routes/adminCatalog';

const laptop = {
  product_id: 'demo-1', name: 'ASUS gaming laptop', brand: 'ASUS', model: 'X1500', cate: 'Laptop',
  price: 30000000, discount: 27000000, image: 'https://cdn.example/item.jpg',
  url: 'https://shop.example/item', aff_link: 'https://go.example/item', campaign: 'Shop',
};

test('datafeed client paginates and constrains request parameters', async () => {
  const urls: URL[] = [];
  const result = await fetchAllDatafeeds({ apiKey: 'test-token', limit: 999, retries: 0, fetchImpl: async (input, init) => {
    urls.push(new URL(String(input)));
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Token test-token');
    const page = Number(new URL(String(input)).searchParams.get('page'));
    return new Response(JSON.stringify({ total: 201, data: page === 1 ? Array.from({ length: 200 }, (_, i) => ({ product_id: `p-${i}` })) : [{ product_id: 'p-200' }] }), { status: 200 });
  } });
  assert.equal(result.items.length, 201);
  assert.equal(urls[0].searchParams.get('limit'), '200');
  assert.equal(urls[0].searchParams.get('domain'), 'fptshop.com.vn');
});

test('diagnostic page omits empty domain and differentiates an empty success response', async () => {
  const result = await fetchDatafeedPage({ apiKey: 'test-token', page: 1, domain: '', retries: 0, fetchImpl: async (input) => {
    assert.equal(new URL(String(input)).search, '?page=1&limit=10');
    return new Response(JSON.stringify({ total: 0, data: [] }), { status: 200 });
  } });
  assert.equal(result.status, 200);
  assert.equal(result.total, 0);
  assert.deepEqual(result.items, []);
  await assert.rejects(fetchDatafeedPage({ apiKey: 'test-token', page: 1, retries: 0, fetchImpl: async () => new Response('', { status: 403 }) }), /HTTP 403/);
});

test('classification approves electronics, rejects unrelated items and holds ambiguous items', () => {
  assert.equal(classifyElectronics(laptop).status, 'approved');
  const console = classifyElectronics({ name: 'PlayStation 5 Slim game console', brand: 'Sony', cate: 'Gaming Console' });
  const headset = classifyElectronics({ name: 'Meta Quest 3 virtual reality headset', brand: 'Meta', cate: 'VR / AR' });
  const drone = classifyElectronics({ name: 'DJI Mini 4 Pro drone', brand: 'DJI', cate: 'Drone' });
  assert.equal(console.status, 'approved'); assert.equal(console.category, 'gaming_console');
  assert.equal(headset.status, 'approved'); assert.equal(headset.category, 'vr_ar');
  assert.equal(drone.status, 'approved'); assert.equal(drone.category, 'drone');
  assert.equal(classifyElectronics({ name: 'T-shirt', cate: 'Clothing' }).status, 'rejected');
  assert.equal(classifyElectronics({ name: 'New item', cate: 'Other' }).status, 'pending_review');
});

test('image URL is withheld until the source has image permission', () => {
  const denied = mapDatafeedItem(laptop, 'shop.example', { imageUsageAuthorized: false });
  const granted = mapDatafeedItem(laptop, 'shop.example', { imageUsageAuthorized: true, imagePermissionEvidence: 'contract-123', imageTermsUrl: 'https://shop.example/terms' });
  assert.equal(denied.product?.imageUrl, null);
  assert.equal(denied.product?.imageUsagePermission, 'not_authorized');
  assert.equal(denied.pending.raw.image, null);
  assert.equal(granted.product?.imageUrl, laptop.image);
  const withoutTerms = mapDatafeedItem(laptop, 'shop.example', { imageUsageAuthorized: true, imagePermissionEvidence: 'contract-123' });
  assert.equal(withoutTerms.product?.imageUrl, null);
  assert.equal(withoutTerms.pending.raw.image, null);
});

test('price verification is separate from product verification and requires a VND offer link', () => {
  const pricedFeed = { ...laptop, currency: 'VND', specifications: { cpu: 'Intel Core' }, update_time: '2026-11-10T10:00:00Z' };
  const mapped = mapDatafeedItem(pricedFeed, 'shop.example');
  assert.equal(mapped.product?.price, null);
  assert.equal(mapped.offer.verified, true);
  assert.equal(mapped.offer.verifiedAt?.toISOString(), '2026-11-10T10:00:00.000Z');
  const noCurrency = mapDatafeedItem({ ...pricedFeed, currency: undefined }, 'shop.example');
  assert.equal(noCurrency.offer.verified, false);
  assert.equal(noCurrency.offer.verifiedAt, null);
});

test('CSV adapter parses supplied facts, limits rows and rejects duplicate headers', () => {
  const parsed = parseProductCsv('name,category,brand,model,price,sellerName,productUrl\n"ASUS laptop",Laptop,ASUS,X1500,25000000,Shop,https://shop.example/p');
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].model, 'X1500');
  assert.equal(parsed.items[0].price, '25000000');
  assert.throws(() => parseProductCsv('name,category\nA,Laptop\nB,Laptop', 1));
  assert.throws(() => parseProductCsv('name,name\nx,y'));
});

test('sync is idempotent and does not persist rejected non-electronics', async () => {
  const products = new Set<string>();
  let offers = 0;
  const repo: SyncRepository = {
    async upsertProduct(filter) { const key = String(filter.dedupeKey); const created = !products.has(key); products.add(key); return { id: key, created }; },
    async upsertOffer() { offers += 1; },
    async upsertPending() {},
  };
  const catalogReadyLaptop = {
    ...laptop, product_id: 'catalog-ready-1', image: 'https://cdn.example/item.jpg', url: 'https://shop.example/item',
    family: 'Gaming Laptop', generation: '2025 generation', specifications: { cpu: 'Intel Core i7' },
  };
  const permissions = { imageUsageAuthorized: true, imagePermissionEvidence: 'license-approval-123', imageTermsUrl: 'https://shop.example/terms' };
  const first = await syncDatafeedItems([catalogReadyLaptop, { name: 'T-shirt', cate: 'Clothing' }], repo, 'shop.example', permissions);
  const second = await syncDatafeedItems([catalogReadyLaptop], repo, 'shop.example', permissions);
  assert.equal(first.created, 1);
  assert.equal(first.rejected, 1);
  assert.equal(second.updated, 1);
  assert.equal(products.size, 1);
  assert.equal(offers, 2);
  const pending = await syncDatafeedItems([laptop], repo, 'shop.example');
  assert.equal(pending.pendingReview, 1);
});

test('Admin status is closed if token config is absent and never echoes the secret', async () => {
  const prior = process.env.ADMIN_API_TOKEN;
  delete process.env.ADMIN_API_TOKEN;
  const app = express();
  app.use('/api/admin/accesstrade', adminAccesstradeRoutes);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr !== 'string');
  try {
    assert.equal((await fetch(`http://127.0.0.1:${addr.port}/api/admin/accesstrade/status`)).status, 503);
    process.env.ADMIN_API_TOKEN = 'test-admin-secret';
    const response = await fetch(`http://127.0.0.1:${addr.port}/api/admin/accesstrade/status`, { headers: { Authorization: 'Bearer invalid' } });
    assert.equal(response.status, 401);
    assert.doesNotMatch(await response.text(), /test-admin-secret/);
  } finally {
    if (prior === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = prior;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('external URL validation accepts only public HTTPS URLs', () => {
  assert.equal(validExternalUrl('https://shop.example/p'), 'https://shop.example/p');
  assert.equal(validExternalUrl('http://127.0.0.1/admin'), null);
  assert.equal(validExternalUrl('javascript:alert(1)'), null);
  for (const url of [
    'https://127.0.0.1/admin', 'https://10.0.0.8/', 'https://172.16.1.4/',
    'https://192.168.1.10/', 'https://169.254.169.254/latest/meta-data/',
    'https://[::1]/', 'https://[fd00::1]/', 'https://host.docker.internal/',
    'https://service.internal/', 'https://router.local/', 'https://printer.test/',
    'https://2130706433/admin',
  ]) assert.equal(validExternalUrl(url), null, `must reject non-public URL: ${url}`);
});

test('catalog verification requires model specs, a working product URL and licensed image attribution', () => {
  const body = {
    name: 'Product', brand: 'Brand', model: 'Model-1', family: 'Book Series', generation: '2026 generation', category: 'laptop',
    imageUrl: 'https://images.example/item.jpg', imageSource: 'https://commons.wikimedia.org/wiki/File:Item.jpg',
    imageUsagePermission: 'granted', imageLicense: 'CC BY 4.0', imageLicenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    imageAttribution: 'Author, Wikimedia Commons', productUrl: 'https://vendor.example/product/model-1',
    specificationSourceUrl: 'https://vendor.example/specs/model-1', specifications: { cpu: 'Verified CPU' }, specs: { cpu: 'Verified CPU' }, verified: true,
    sourceEvidence: ['identity', 'product_page', 'specifications', 'image', 'image_rights'].map((evidenceType) => ({
      evidenceType, sourceName: 'Official / licensed source', sourceUrl: 'https://vendor.example/source/model-1',
      retrievedAt: '2026-11-10T00:00:00.000Z', verifiedAt: '2026-11-10T00:00:00.000Z',
    })),
  };
  assert.equal(validateCatalogBody(body).errors.length, 0);
  assert.ok(validateCatalogBody({ ...body, imageAttribution: '' }).errors.length > 0);
  assert.ok(validateCatalogBody({ ...body, productUrl: 'http://vendor.example/product' }).errors.length > 0);
});

test('Offer validation keeps price evidence attached to a seller URL and currency', () => {
  const valid = validateOfferBody({ sellerName: 'Seller', source: 'seller-feed', price: 25000000, currency: 'VND', productUrl: 'https://seller.example/product', verified: true });
  assert.equal(valid.errors.length, 0);
  assert.equal(valid.data?.verified, true);
  assert.ok(validateOfferBody({ sellerName: 'Seller', price: 25000000, currency: 'VND', productUrl: '', verified: true }).errors.length > 0);
  assert.ok(validateOfferBody({ sellerName: 'Seller', price: 25000000, currency: 'USD', productUrl: 'https://seller.example/product', verified: true }).errors.length === 0);
});
