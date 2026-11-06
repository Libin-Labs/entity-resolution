import {
  normalizeEntityText,
  textSimilarity,
  resolveEntities,
  EntityResolutionError,
} from '@lp-labs/entity-resolution';
const api = [normalizeEntityText, textSimilarity, resolveEntities, EntityResolutionError];
void api;
const report = resolveEntities([{ id: 'a', fields: { name: 'A' } }], {
  rules: [{ field: 'name', weight: 1, method: 'exact' }],
});
const score: number | undefined = report.matches[0]?.score;
const normalized: string = normalizeEntityText('a');
void score;
void normalized;
