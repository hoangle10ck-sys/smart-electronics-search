import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFilter, resolveTechApiCandidateOrdering } from './searchService';
import { parseQuery } from './queryParser';

test('generic máy tính search is restricted to laptops and desktops', () => {
  const parsed = parseQuery('Máy tính');
  const filter = buildFilter(parsed, true);
  assert.deepEqual(filter.category, { $in: ['laptop', 'desktop'] });
});

test('specific computer searches stay within their requested category', () => {
  const laptop = buildFilter(parseQuery('máy tính xách tay'), true);
  const desktop = buildFilter(parseQuery('máy tính để bàn'), true);
  assert.deepEqual(laptop.category, { $in: ['laptop'] });
  assert.deepEqual(desktop.category, { $in: ['desktop'] });
});

test('TechAPI candidate ordering remains legacy unless stable_v1 is explicitly enabled', () => {
  assert.equal(resolveTechApiCandidateOrdering({}), 'legacy');
  assert.equal(resolveTechApiCandidateOrdering({ TECHAPI_CANDIDATE_ORDERING: 'stable_v1' }), 'stable_v1');
  assert.equal(resolveTechApiCandidateOrdering({ TECHAPI_CANDIDATE_ORDERING: 'legacy' }), 'legacy');
  assert.throws(() => resolveTechApiCandidateOrdering({ TECHAPI_CANDIDATE_ORDERING: 'unknown' }), /must be either/);
});
