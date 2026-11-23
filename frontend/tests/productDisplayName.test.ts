import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getProductDisplayName } from '../src/productDisplayName';

test('removes a parenthetical release year when the catalog model confirms the name', () => {
  assert.equal(getProductDisplayName({
    name: 'iPhone SE (3rd generation, 2022)', brand: 'Apple', model: 'iPhone SE (3rd generation)',
  }), 'iPhone SE (3rd generation)');
});

test('removes a storage variant from the title when the canonical model matches', () => {
  assert.equal(getProductDisplayName({ name: 'iPhone 17e 512GB', brand: 'Apple', model: 'iPhone 17e' }), 'iPhone 17e');
});

test('keeps meaningful model suffixes and unmatched capacity variants', () => {
  assert.equal(getProductDisplayName({ name: 'iPhone 15 Pro Max 256GB', brand: 'Apple', model: 'iPhone 15 Pro Max' }), 'iPhone 15 Pro Max');
  assert.equal(getProductDisplayName({ name: 'Radeon RX 6600 XT 8GB', brand: 'AMD', model: 'RX 6600 XT Gaming OC' }), 'Radeon RX 6600 XT 8GB');
});

test('removes release-year annotations from the checked-in catalog titles', () => {
  const catalogPath = new URL('../../backend/src/seed/catalog.json', import.meta.url);
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as Array<{ name: string; brand?: string | null; model?: string | null }>;
  const datedProducts = catalog.filter(({ name }) => /,\s*(?:19|20)\d{2}\)|\s+\((?:19|20)\d{2}\)$/i.test(name));

  assert.ok(datedProducts.length > 0, 'expected the catalog fixture to include dated titles');
  for (const product of datedProducts) {
    assert.doesNotMatch(getProductDisplayName(product), /,\s*(?:19|20)\d{2}\)|\s+\((?:19|20)\d{2}\)$/i, product.name);
  }
});
