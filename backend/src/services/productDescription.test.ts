import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateCatalogProducts } from '../seed/catalogValidation';
import { buildProductDescription } from './productDescription';

test('description summary uses only the given specification facts', () => {
  const description = buildProductDescription('Product A', { cpu: 'Example CPU', memory: '16 GB', display: '15.6 inch' });
  assert.equal(description, 'Thông tin theo catalog của Product A: Bộ xử lý: Example CPU; Màn hình: 15.6 inch; RAM / bộ nhớ: 16 GB.');
  assert.equal(buildProductDescription('Product A', { sourceUrl: 'https://example.test' }), null);
});

test('the curated seed catalog can generate sourced descriptions from its existing specifications', async () => {
  const products = JSON.parse(await readFile(resolve(__dirname, '../seed/catalog.json'), 'utf8'));
  validateCatalogProducts(products);
  assert.equal(products.length, 111);
  assert.ok(products.every((product: any) => buildProductDescription(product.name, product.specifications)));
});
