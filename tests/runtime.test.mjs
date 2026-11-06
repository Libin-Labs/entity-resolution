import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEntityText,
  textSimilarity,
  resolveEntities,
  EntityResolutionError,
} from '../dist/esm/index.js';
test('documented workflow produces required outputs', async () => {
  const records = [
    { id: 'a', fields: { name: 'Alice Smith', country: 'GB' } },
    { id: 'b', fields: { name: 'Alic Smith', country: 'gb' } },
    { id: 'c', fields: { name: 'Other', country: 'US' } },
  ];
  const result = resolveEntities(records, {
    blockBy: ['country'],
    rules: [{ field: 'name', weight: 1, method: 'edit' }],
    threshold: 0.8,
  });
  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.groups, [['a', 'b'], ['c']]);
  assert.equal(normalizeEntityText('  ALICE   Smith '), 'alice smith');
  assert.equal(textSimilarity('same', 'same'), 1);
});
test('edit metric matches known values and code-point distances', () => {
  assert.equal(textSimilarity('kitten', 'sitting'), 1 - 3 / 7);
  assert.equal(textSimilarity('😀a', '😀b'), 0.5);
  assert.equal(textSimilarity('', ''), 1);
  assert.equal(textSimilarity('', 'a'), 0);
});
test('normalization handles compatibility and repeated spaces', () => {
  assert.equal(normalizeEntityText(' Ａ  B '), 'a b');
});
test('missing match values are not positive evidence', () => {
  const r = resolveEntities(
    [
      { id: 'a', fields: { name: null } },
      { id: 'b', fields: {} },
    ],
    { rules: [{ field: 'name', method: 'exact', weight: 1 }] },
  );
  assert.equal(r.matches.length, 0);
});
test('blocking requires all nonempty fields and reports exact comparisons', () => {
  const r = resolveEntities(
    [
      { id: 'a', fields: { name: 'x', country: 'gb' } },
      { id: 'b', fields: { name: 'x', country: 'gb' } },
      { id: 'c', fields: { name: 'x' } },
    ],
    { rules: [{ field: 'name', method: 'exact', weight: 1 }], blockBy: ['country'] },
  );
  assert.equal(r.comparisons, 1);
  assert.deepEqual(r.groups, [['a', 'b'], ['c']]);
});
test('weighted missing evidence is not reweighted away', () => {
  const r = resolveEntities(
    [
      { id: 'a', fields: { name: 'x' } },
      { id: 'b', fields: { name: 'x' } },
    ],
    {
      rules: [
        { field: 'name', method: 'exact', weight: 1 },
        { field: 'address', method: 'exact', weight: 3 },
      ],
      threshold: 0.2,
    },
  );
  assert.equal(r.matches[0].score, 0.25);
  assert.equal(r.matches[0].explanation[1].similarity, 0);
});
test('candidate components explicitly allow nonmatching endpoints', () => {
  const r = resolveEntities(
    [
      { id: 'a', fields: { x: 'abc' } },
      { id: 'b', fields: { x: 'abd' } },
      { id: 'c', fields: { x: 'add' } },
    ],
    { rules: [{ field: 'x', method: 'edit', weight: 1 }], threshold: 0.6 },
  );
  assert.equal(r.matches.length, 2);
  assert.deepEqual(r.groups, [['a', 'b', 'c']]);
});
test('comparison and edit work budgets fail explicitly', () => {
  const rows = [
    { id: 'a', fields: { x: 'aaaa' } },
    { id: 'b', fields: { x: 'aaab' } },
    { id: 'c', fields: { x: 'aaac' } },
  ];
  assert.throws(
    () =>
      resolveEntities(rows, {
        rules: [{ field: 'x', method: 'edit', weight: 1 }],
        maxEditCells: 1,
      }),
    { code: 'limit' },
  );
  assert.throws(
    () =>
      resolveEntities(rows, {
        rules: [{ field: 'x', method: 'exact', weight: 1 }],
        maxComparisons: 1,
      }),
    { code: 'limit' },
  );
});
test('duplicate IDs, invalid weights and getter fields reject', () => {
  const row = { id: 'a', fields: { x: 'a' } };
  assert.throws(() =>
    resolveEntities([row, row], { rules: [{ field: 'x', method: 'exact', weight: 1 }] }),
  );
  assert.throws(() =>
    resolveEntities([row], { rules: [{ field: 'x', method: 'exact', weight: 0 }] }),
  );
  let invoked = false;
  const fields = {};
  Object.defineProperty(fields, 'x', {
    enumerable: true,
    get() {
      invoked = true;
      return 'a';
    },
  });
  assert.throws(() =>
    resolveEntities([{ id: 'a', fields }], { rules: [{ field: 'x', method: 'exact', weight: 1 }] }),
  );
  assert.equal(invoked, false);
});
