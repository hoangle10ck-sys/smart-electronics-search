import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProduct } from './productNormalizer';
import { detectDuplicateCandidates } from './duplicateDetection';

test('normalizes product identifiers while preserving variant identifiers as aliases', () => {
  const normalized = normalizeProduct({
    name: 'ASUS ROG Zephyrus G14', brand: 'ASUS', model: 'ROG Zephyrus G14', modelNumber: 'GA403UV',
    variants: [{ sku: 'ASUS-GA403UV-01', name: '16GB / 1TB' }],
  });
  assert.equal(normalized.normalizedName, 'asus rog zephyrus g14');
  assert.equal(normalized.normalizedBrand, 'asus');
  assert.equal(normalized.normalizedModel, 'rog zephyrus g14');
  assert.equal(normalized.normalizedModelNumber, 'ga403uv');
  assert.ok(normalized.aliases.includes('asus ga403uv 01'));
  assert.ok(normalized.aliases.includes('16gb 1tb'));
});

test('normalizes only unambiguous hardware capacities and leaves the source data alone', () => {
  const source = {
    name: 'Example laptop', brand: 'Dell', model: 'XPS 15',
    specs: { ram: '32 GB DDR5', storage: '1TB NVMe', vram: '8 GB', cpu: 'Intel Core Ultra 7 155H', gpu: 'NVIDIA RTX 4060' },
    specifications: { 'Display Size': '15.6 inch', 'Refresh Rate': '120 Hz', 'Other memory': 'shared/system memory' },
  };
  const normalized = normalizeProduct(source);
  assert.deepEqual(normalized.normalizedSpecs, {
    ramGB: 32, storageGB: 1024, storageType: 'ssd', vramGB: 8,
    cpuModel: 'Intel Core Ultra 7 155H', gpuModel: 'NVIDIA RTX 4060',
    displayInches: 15.6, refreshRateHz: 120,
  });
  assert.equal(source.specs.storage, '1TB NVMe');
  assert.equal(source.specifications['Other memory'], 'shared/system memory');
});

test('keeps variant capacity options and unknown values out of normalized numeric fields', () => {
  const normalized = normalizeProduct({
    name: 'Configurable laptop', brand: 'Lenovo', model: 'ThinkBook',
    specs: { ram: '8GB or 16GB', storage: 'varies by configuration', vram: 'integrated graphics' },
  });
  assert.deepEqual(normalized.normalizedSpecs, {});
});

test('reports shared model identifiers with different configurations for manual review', () => {
  const duplicates = detectDuplicateCandidates([
    { _id: 'one', name: 'Dell XPS 15', brand: 'Dell', model: 'XPS 15', modelNumber: '9530', specs: { ram: 16, storage: '1TB SSD', cpu: 'Core i7-13700H' } },
    { _id: 'two', name: 'Dell XPS 15', brand: 'Dell', model: 'XPS 15', modelNumber: '9530', specs: { ram: 32, storage: '2TB SSD', cpu: 'Core i7-13700H' } },
  ]);
  assert.ok(duplicates.some((group) => group.identityType === 'model_number' && group.reviewType === 'same_model_different_configuration'));
  assert.deepEqual(new Set(duplicates.flatMap((group) => group.productIds)), new Set(['one', 'two']));
});
