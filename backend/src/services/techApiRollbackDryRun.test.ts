import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectId } from 'bson';
import { compareTechApiSnapshots } from './techApiRollbackDryRun';

test('rollback dry-run detects catalog additions, changes, missing records, and checkpoint SHA changes', () => {
  const before = {
    catalog: [
      { sourceKey: 'catalog:a', raw: { first: 1, second: 2 } },
      { sourceKey: 'catalog:b', raw: { value: 'before' } },
    ],
    checkpoints: [{ fileKey: 'file:a', sha256: 'old', recordCount: 2 }],
  };
  const after = {
    catalog: [
      { sourceKey: 'catalog:a', raw: { second: 2, first: 1 } },
      { sourceKey: 'catalog:b', raw: { value: 'after' } },
      { sourceKey: 'catalog:c', raw: { value: 'added' } },
    ],
    checkpoints: [{ fileKey: 'file:a', sha256: 'new', recordCount: 2 }, { fileKey: 'file:b', sha256: 'extra', recordCount: 1 }],
  };
  const result = compareTechApiSnapshots(before, after);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.deletionsSupported, false);
  assert.deepEqual(result.counts.catalog, { added: 1, changed: 1, missing: 0, unchanged: 1 });
  assert.deepEqual(result.counts.checkpoints, { added: 1, changed: 1, missing: 0, unchanged: 0 });
  assert.equal(result.catalog.find(({ key }) => key === 'catalog:a')?.status, 'unchanged', 'object key ordering is canonicalized');
  assert.equal(result.catalog.find(({ key }) => key === 'catalog:c')?.afterCanonicalEjson?.includes('added'), true);
  assert.equal(result.checkpoints.find(({ key }) => key === 'file:a')?.beforeSha256?.length, 64);
});

test('rollback dry-run canonical EJSON preserves BSON types, nested values, and array order', () => {
  const id = new ObjectId('507f1f77bcf86cd799439011');
  const baseline = { catalog: [{ sourceKey: 'catalog:a', id, observedAt: new Date('2026-01-01T00:00:00Z'), list: [1, 2] }], checkpoints: [] };
  const same = { catalog: [{ list: [1, 2], observedAt: new Date('2026-01-01T00:00:00Z'), id, sourceKey: 'catalog:a' }], checkpoints: [] };
  const reorderedArray = { catalog: [{ sourceKey: 'catalog:a', id, observedAt: new Date('2026-01-01T00:00:00Z'), list: [2, 1] }], checkpoints: [] };
  assert.equal(compareTechApiSnapshots(baseline, same).catalog[0].status, 'unchanged');
  assert.equal(compareTechApiSnapshots(baseline, reorderedArray).catalog[0].status, 'changed');
});

test('rollback dry-run marks missing records without claiming deletion is supported', () => {
  const result = compareTechApiSnapshots({
    catalog: [{ sourceKey: 'catalog:gone', raw: { value: true } }],
    checkpoints: [{ fileKey: 'file:gone', sha256: 'abc' }],
  }, { catalog: [], checkpoints: [] });
  assert.equal(result.catalog[0].status, 'missing');
  assert.equal(result.catalog[0].missingIsDeletable, false);
  assert.equal(result.checkpoints[0].status, 'missing');
  assert.equal(result.checkpoints[0].missingIsDeletable, false);
  assert.ok(result.catalog[0].beforeCanonicalEjson);
});

test('rollback dry-run refuses missing or duplicate business keys', () => {
  assert.throws(() => compareTechApiSnapshots({ catalog: [{ raw: {} } as any], checkpoints: [] }, { catalog: [], checkpoints: [] }), /without sourceKey/);
  assert.throws(() => compareTechApiSnapshots({ catalog: [{ sourceKey: 'same' }, { sourceKey: 'same' }], checkpoints: [] }, { catalog: [], checkpoints: [] }), /duplicate sourceKey/);
  assert.throws(() => compareTechApiSnapshots({ catalog: [], checkpoints: [{ fileKey: 'same' }, { fileKey: 'same' }] }, { catalog: [], checkpoints: [] }), /duplicate fileKey/);
});
