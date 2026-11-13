import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseQuery } from './queryParser';
import { CANONICAL_CATEGORIES, canonicalCategory } from './taxonomy';

test('watch aliases normalize to smartwatch without dropping other categories', () => {
  assert.equal(canonicalCategory('watch'), 'smartwatch');
  assert.equal(canonicalCategory('monitor'), 'monitor');
  assert.equal(parseQuery('smartwatch').category, 'smartwatch');
  assert.equal(parseQuery('đồng hồ thông minh').category, 'smartwatch');
  assert.equal(CANONICAL_CATEGORIES.length, 35);
  assert.equal(parseQuery('SoC Snapdragon').category, 'soc');
  assert.ok(CANONICAL_CATEGORIES.some(({ key }) => key === 'tv'));
  assert.ok(CANONICAL_CATEGORIES.some(({ key }) => key === 'keyboard'));
  assert.equal(parseQuery('PlayStation 5 console').category, 'gaming_console');
  assert.equal(parseQuery('Meta Quest virtual reality headset').category, 'vr_ar');
  assert.equal(parseQuery('Kindle Paperwhite e-reader').category, 'ereader');
  assert.equal(parseQuery('studio audio interface').category, 'professional_audio');
});
