# Contributing

## Setup

```sh
npm ci
npm test
npm run docs:dev
```

`npm test` first regenerates the doc-example tests (`scripts/extract-examples.mjs`), then runs Vitest.

## Sources for constants and reference values

Every constant in `src/` and every reference value in a test carries a comment citing its source (standard, paper,
table, or the project it was verified against). Do not add unsourced numbers.

## Doc examples

Fenced blocks tagged `ts example` in `docs/guide/*.md` are extracted into Vitest files under
`test/examples/generated/` by `scripts/extract-examples.mjs`, and run in CI.

- A line `expr // => 33.75` becomes `expect(expr).toBeCloseTo(33.75, 2)` (decimals = digits shown).
- `expr // => true` / `false` becomes `expect(expr).toBe(...)`.
- Assertion lines must be expressions, not declarations (`const x = f() // => 1` will not work).
- Imports are hoisted and merged; use the public `@marshallasch/dive-math/...` specifiers.

## Changesets

Add a changeset for any user-facing change:

```sh
npx changeset
```
