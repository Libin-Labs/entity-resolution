import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEntityText, textSimilarity, resolveEntities } from '../dist/esm/index.js';

test('normalization expansion remains bounded and distance is symmetric', () => {
  assert.throws(() => normalizeEntityText('\ufb03'.repeat(200)), { code: 'invalid' });
  for (const [a, b] of [
    ['cafe', 'café'],
    ['abc', 'a'],
    ['😀z', 'z😀'],
    ['', 'x'],
  ]) {
    assert.equal(textSimilarity(a, b), textSimilarity(b, a));
  }
});

test('blocking preserves distinct tuple values rather than delimiter collisions', () => {
  const result = resolveEntities(
    [
      { id: 'a', fields: { x: 'a|b', y: 'c', name: 'same' } },
      { id: 'b', fields: { x: 'a', y: 'b|c', name: 'same' } },
    ],
    { blockBy: ['x', 'y'], rules: [{ field: 'name', weight: 1, method: 'exact' }] },
  );
  assert.equal(result.comparisons, 0);
});
