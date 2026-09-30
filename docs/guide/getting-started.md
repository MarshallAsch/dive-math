# Getting started

## Install

```sh
npm install @marshallasch/dive-math
```

The package is ESM-only, has zero runtime dependencies, and ships its own types.

### Requirements

- **Node.js 22 or later.** CommonJS projects can load it with `import()`, or with `require()` (Node 22.12+ loads ES modules synchronously).
- **TypeScript 4.7 or later**, with `moduleResolution` set to `node16`, `nodenext` or `bundler` (5.0+). The legacy `node`/`node10` resolution can't see the subpath exports, and a `node16` project must itself be ESM (`"type": "module"` or `.mts`).
- **Bundlers and browsers:** works with any bundler (Vite, Next.js, webpack); output is ES2022 (Chrome/Edge 94+, Firefox 93+, Safari 16.4+).

## Imports

Import from the package root to get everything:

```ts
import { mod, gas } from '@marshallasch/dive-math'
```

Or import from a subpath (one per module) to keep bundles small: `units`, `pressure`, `altitude`, `gas`, `density`,
`real-gas`, `cylinders`, `equipment`, `blending`, `fill`, `oxygen`, `planning`, `ccr`.

```ts example
import { gas, mod, end, bestMix } from '@marshallasch/dive-math/gas'

mod(gas(0.32), 1.4) // => 33.75
end(gas(0.18, 0.45), 60) // => 28.5
bestMix({ depthM: 60, maxPpo2: 1.4, targetEndM: 30 }).fhe // => 0.4286
```

Next: [Conventions](./conventions).
