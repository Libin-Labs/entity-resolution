export interface EntityRecord {
  id: string;
  fields: Readonly<Record<string, string | null>>;
}
export interface MatchRule {
  field: string;
  weight: number;
  method: 'exact' | 'edit';
}
export interface MatchExplanation {
  field: string;
  similarity: number;
  weight: number;
}
export interface EntityMatch {
  left: string;
  right: string;
  score: number;
  explanation: MatchExplanation[];
}
export interface ResolutionOptions {
  rules: readonly MatchRule[];
  blockBy?: readonly string[];
  threshold?: number;
  maxRecords?: number;
  maxComparisons?: number;
  maxEditCells?: number;
}
export class EntityResolutionError extends Error {
  constructor(
    readonly code: 'invalid' | 'limit',
    message: string,
  ) {
    super(message);
    this.name = 'EntityResolutionError';
  }
}
export function normalizeEntityText(value: string): string {
  if (typeof value !== 'string' || value.length > 512)
    throw new EntityResolutionError('invalid', 'Text must be at most 512 UTF-16 units.');
  const normalized = value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  if (normalized.length > 512)
    throw new EntityResolutionError('invalid', 'Normalized text exceeds 512 UTF-16 units.');
  return normalized;
}
export function textSimilarity(left: string, right: string): number {
  const a = Array.from(normalizeEntityText(left)),
    b = Array.from(normalizeEntityText(right));
  if (!a.length || !b.length) return a.length === b.length ? 1 : 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = current;
  }
  return 1 - previous[b.length]! / Math.max(a.length, b.length);
}
export function resolveEntities(input: readonly EntityRecord[], options: ResolutionOptions) {
  const maxRecords = options?.maxRecords ?? 1000,
    maxComparisons = options?.maxComparisons ?? 100000;
  const threshold = options?.threshold ?? 0.85;
  const maxEditCells = options?.maxEditCells ?? 10000000;
  if (
    !Number.isSafeInteger(maxRecords) ||
    maxRecords < 1 ||
    maxRecords > 10000 ||
    !Number.isSafeInteger(maxComparisons) ||
    maxComparisons < 1 ||
    maxComparisons > 1000000 ||
    !Array.isArray(input) ||
    input.length > maxRecords ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 1 ||
    !Number.isSafeInteger(maxEditCells) ||
    maxEditCells < 1 ||
    maxEditCells > 100000000 ||
    !Array.isArray(options?.rules) ||
    !options.rules.length ||
    options.rules.length > 32
  )
    throw new EntityResolutionError('invalid', 'Invalid records, threshold or limits.');
  const rules = options.rules.map((rule) => {
    if (
      !rule ||
      typeof rule.field !== 'string' ||
      !rule.field ||
      rule.field.length > 128 ||
      !Number.isFinite(rule.weight) ||
      rule.weight <= 0 ||
      !['exact', 'edit'].includes(rule.method)
    )
      throw new EntityResolutionError('invalid', 'Invalid match rule.');
    return { ...rule };
  });
  if (new Set(rules.map((rule) => rule.field)).size !== rules.length)
    throw new EntityResolutionError('invalid', 'Duplicate match rule.');
  const weight = rules.reduce((sum, rule) => sum + rule.weight, 0);
  if (!Number.isFinite(weight))
    throw new EntityResolutionError('invalid', 'Weight total overflow.');
  const blockBy = options.blockBy ?? [];
  if (
    !Array.isArray(blockBy) ||
    blockBy.length > 16 ||
    blockBy.some((field) => typeof field !== 'string' || !field || field.length > 128)
  )
    throw new EntityResolutionError('invalid', 'Invalid blocking fields.');
  const ids = new Set<string>();
  const rows = input.map((row) => {
    if (
      !row ||
      typeof row.id !== 'string' ||
      !row.id ||
      row.id.length > 256 ||
      ids.has(row.id) ||
      !row.fields ||
      Object.getPrototypeOf(row.fields) !== Object.prototype ||
      Object.keys(row.fields).length > 128
    )
      throw new EntityResolutionError('invalid', 'Invalid/duplicate entity.');
    ids.add(row.id);
    const fields = new Map<string, string | null>();
    for (const key of Object.keys(row.fields)) {
      const descriptor = Object.getOwnPropertyDescriptor(row.fields, key)!;
      if (
        !('value' in descriptor) ||
        (descriptor.value !== null && typeof descriptor.value !== 'string')
      )
        throw new EntityResolutionError('invalid', 'Fields must contain string/null data.');
      fields.set(key, descriptor.value === null ? null : normalizeEntityText(descriptor.value));
    }
    return { id: row.id, fields };
  });
  const blocks = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const values = blockBy.map((field) => row.fields.get(field));
    // Missing blocking values cannot establish a shared block.
    if (values.some((value) => value === undefined || value === null || value === '')) return;
    const key = JSON.stringify(values);
    const group = blocks.get(key) ?? [];
    group.push(index);
    blocks.set(key, group);
  });
  const matches: EntityMatch[] = [];
  const parent = rows.map((_, index) => index);
  const root = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]!]!;
      index = parent[index]!;
    }
    return index;
  };
  let comparisons = 0;
  let editCells = 0;
  for (const block of blocks.values())
    for (let i = 0; i < block.length; i++)
      for (let j = i + 1; j < block.length; j++) {
        if (++comparisons > maxComparisons)
          throw new EntityResolutionError('limit', 'Comparison budget exhausted.');
        const a = rows[block[i]!]!,
          b = rows[block[j]!]!;
        const explanation = rules.map((rule) => {
          const left = a.fields.get(rule.field),
            right = b.fields.get(rule.field);
          if (left && right && rule.method === 'edit') {
            editCells += Array.from(left).length * Array.from(right).length;
            if (editCells > maxEditCells)
              throw new EntityResolutionError('limit', 'Edit-distance work budget exhausted.');
          }
          const similarity =
            !left || !right
              ? 0
              : rule.method === 'exact'
                ? Number(left === right)
                : textSimilarity(left, right);
          return { field: rule.field, similarity, weight: rule.weight };
        });
        const score = Math.min(
          1,
          explanation.reduce((sum, item) => sum + item.similarity * (item.weight / weight), 0),
        );
        if (score >= threshold) {
          matches.push({ left: a.id, right: b.id, score, explanation });
          parent[root(block[j]!)] = root(block[i]!);
        }
      }
  const groups = new Map<number, string[]>();
  rows.forEach((row, index) => {
    const key = root(index);
    const group = groups.get(key) ?? [];
    group.push(row.id);
    groups.set(key, group);
  });
  return { matches, groups: [...groups.values()], comparisons };
}
