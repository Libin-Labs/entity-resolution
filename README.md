# @lp-labs/entity-resolution

Bounded explainable entity matching with blocking, weighted fuzzy scores and candidate components.

Original independent MIT TypeScript implementation with **zero runtime or peer dependencies**. ESM/CommonJS with separate declarations; Node 18+ and compatible browser runtimes. No external code is downloaded or service started at import. TypeScript/Prettier are development-only tools.

## Install

```sh
npm install @lp-labs/entity-resolution
```

## Working example

```js
import assert from 'node:assert/strict';
import {
  normalizeEntityText,
  textSimilarity,
  resolveEntities,
  EntityResolutionError,
} from '@lp-labs/entity-resolution';
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
```

CommonJS: `const api = require('@lp-labs/entity-resolution')`. Use type-only imports for exported interfaces in TypeScript.

## Behavior, customization, limits and performance

Records are unique IDs and plain string/null field data. NFKC, Unicode lowercase and whitespace collapse are deterministic normalization rules, NOT transliteration, language-aware collation or a personal-identity guarantee. Strings max512 UTF-16 units before normalization; edit distance operates on Unicode code points. Similarity = 1 - LevenshteinDistance/maxLength, both empty strings =1 for standalone helper, but missing/null/empty match fields ALWAYS score0 in resolution to avoid evidence from absent data.

Rules have unique fields, positive finite weights, exact/edit methods. Weights normalize over ALL rules (missing evidence is not reweighted). Default threshold .85, range0..1. Blocking uses AND across all blockBy fields after normalization; a missing/empty blocking field yields no candidates. Empty blockBy compares all pairs. Default maxRecords1,000 (ceiling10,000), maxComparisons100,000 (ceiling1,000,000), maxEditCells10,000,000 (ceiling100,000,000) bounds aggregate dynamic-programming cell work. Exceeding any budget throws; never returns a misleading partial result. Helpers use O(text length squared) work/O(text length) scratch; blocking uses O(records), matching O(pairs times rules plus edit cells).

Matches include every rule contribution and original IDs. groups are connected components, including singleton records; transitively grouped records need NOT match each other. These are review CANDIDATES, never automatic deletion/merge decisions or verified identities. Stable input order determines groups and match ordering. No trained models, phonetic datasets, external service, PII telemetry or bundled metadata.

## Errors and application integration

The 512 UTF-16-unit text limit applies both before and after normalization, since compatibility normalization can expand ligatures. Expansion beyond the bound rejects explicitly rather than unexpectedly consuming edit-distance work.

Use the exported error class and its documented code (where present); invalid structural input throws rather than silently defaulting. Await async methods and handle rejections. Trusted adapters/callbacks must meet documented ownership and isolation requirements. Hostile proxies and custom prototype objects are outside the contract; ordinary data properties are required. No runtime network/worker/database dependency is hidden behind the API. Examples use Node assertions for reproducible outcomes, not as package dependencies. The declared bounded subset is the supported functionality, not a claim of complete compatibility with another library.

## Complete API and customization contract

The public declaration below specifies all exported functions, field names, options, return shapes and error codes. Configure explicit limits and supply callbacks/adapters through these interfaces; do not modify package internals. Optional fields follow the defaults and missing-data policies above. TypeScript consumers receive this same contract through both ESM and CommonJS exports.

```ts
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
export declare class EntityResolutionError extends Error {
  readonly code: 'invalid' | 'limit';
  constructor(code: 'invalid' | 'limit', message: string);
}
export declare function normalizeEntityText(value: string): string;
export declare function textSimilarity(left: string, right: string): number;
export declare function resolveEntities(
  input: readonly EntityRecord[],
  options: ResolutionOptions,
): {
  matches: EntityMatch[];
  groups: string[][];
  comparisons: number;
};
```

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
