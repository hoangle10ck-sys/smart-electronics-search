import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from './queryParser';

test('extracts structured budget and hardware constraints from a Vietnamese natural query', () => {
  const parsed = parseQuery('laptop gaming dưới 20 triệu RAM 16GB 1TB SSD VRAM 8GB 15.6 inch để lập trình');
  assert.equal(parsed.category, 'laptop');
  assert.equal(parsed.maxPrice, 20_000_000);
  assert.equal(parsed.ram, 16);
  assert.equal(parsed.storageGB, 1000);
  assert.equal(parsed.storageType, 'ssd');
  assert.equal(parsed.vramGB, 8);
  assert.equal(parsed.displayInches, 15.6);
  assert.deepEqual(new Set(parsed.tags), new Set(['gaming', 'programming']));
  assert.equal(parsed.keywords.includes('ssd'), false);
});

test('parses a minimum RAM requirement without treating the capacity as storage', () => {
  const parsed = parseQuery('Thêm RAM tối thiểu 16GB.');
  assert.equal(parsed.ram, 16);
  assert.equal(parsed.storageGB, undefined);
  assert.equal(parsed.category, 'ram');
});

test('keeps explicit component categories after extracting their capacities', () => {
  const ram = parseQuery('RAM 16GB');
  assert.equal(ram.category, 'ram');
  assert.equal(ram.ram, 16);
  const storage = parseQuery('SSD 1TB');
  assert.equal(storage.category, 'storage');
  assert.equal(storage.storageGB, 1000);
  const laptop = parseQuery('Laptop RAM 16GB');
  assert.equal(laptop.category, 'laptop');
  assert.equal(laptop.ram, 16);
});

test('does not interpret storage capacity as the budget', () => {
  const parsed = parseQuery('điện thoại 256GB dưới 8 triệu');
  assert.equal(parsed.maxPrice, 8_000_000);
  assert.equal(parsed.storageGB, 256);
});
