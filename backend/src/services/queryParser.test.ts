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

test('treats generic máy tính as laptop and desktop without a stray tinh keyword', () => {
  for (const query of ['Máy tính', 'Tìm máy tính', 'may tinh']) {
    const parsed = parseQuery(query);
    assert.equal(parsed.category, undefined, query);
    assert.deepEqual(parsed.categoryGroup, ['laptop', 'desktop'], query);
    assert.equal(parsed.keywords.includes('tinh'), false, query);
    assert.equal(parsed.keywords.length, 0, query);
  }
});

test('specific computer categories remain more specific than generic máy tính', () => {
  assert.equal(parseQuery('máy tính xách tay').category, 'laptop');
  assert.equal(parseQuery('máy tính để bàn').category, 'desktop');
  assert.equal(parseQuery('máy tính bảng').category, 'tablet');
  assert.equal(parseQuery('máy tính xách tay').categoryGroup, undefined);
});

test('extracts refresh rate, resolution, power watts, and memory type constraints', () => {
  const monitor = parseQuery('màn hình 27 inch 2K 144Hz');
  assert.equal(monitor.category, 'monitor');
  assert.equal(monitor.displayInches, 27);
  assert.equal(monitor.resolution, 'QHD');
  assert.equal(monitor.refreshRateHz, 144);

  const psu = parseQuery('nguồn máy tính 750W');
  assert.equal(psu.category, 'power_supply');
  assert.equal(psu.powerWatts, 750);

  const ram = parseQuery('RAM DDR5 32GB');
  assert.equal(ram.category, 'ram');
  assert.equal(ram.memoryType, 'DDR5');
  assert.equal(ram.ram, 32);

  const tv4k = parseQuery('tivi 4K 120Hz');
  assert.equal(tv4k.resolution, '4K');
  assert.equal(tv4k.refreshRateHz, 120);
});
