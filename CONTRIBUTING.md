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

## Maintainer setup (one-time)

The workflows only run in `MarshallAsch/dive-math` (forks skip docs and release).

1. **Repository:** create `MarshallAsch/dive-math` (public) and push the history as `main`.
2. **GitHub Pages:** Settings → Pages → Source: **GitHub Actions**. The `Docs` workflow then deploys `docs/.vitepress/dist` on every push to `main`, served at <https://marshallasch.github.io/dive-math/> (VitePress `base` is `/dive-math/`).
3. **Branch protection** on `main`: require the `CI / check` and `CI / test-node-matrix` checks.
4. **First npm publish** (trusted publishing needs the package to exist):

   ```sh
   npx changeset version
   git commit -am "chore: release 0.1.0"
   npm run build
   npm publish --access public
   ```

5. **Trusted publisher:** on npmjs.com, package settings → Trusted publishing → GitHub Actions, repository `MarshallAsch/dive-math`, workflow `release.yml`. Do this before merging any `chore: release` PR; later releases then publish from CI with provenance and no stored token.

## Releasing

Add a changeset with each user-facing change. On `main`, the `Release` workflow opens a `chore: release` PR that bumps the version and updates `CHANGELOG.md`; merging it publishes to npm.
