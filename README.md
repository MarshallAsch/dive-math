# @marshallasch/dive-math

Scuba diving math for TypeScript: gas laws, MOD/END, blending, fills, oxygen exposure, gas planning and CCR loop math.

[![npm](https://img.shields.io/npm/v/@marshallasch/dive-math)](https://www.npmjs.com/package/@marshallasch/dive-math)
[![CI](https://github.com/MarshallAsch/dive-math/actions/workflows/ci.yml/badge.svg)](https://github.com/MarshallAsch/dive-math/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-marshallasch.github.io-blue)](https://marshallasch.github.io/dive-math/)

> **Safety.** This library is a reference implementation for education and tooling. It is not a dive computer or a
> blending certification. Verify every fill and dive plan independently, with training and approved tools.

## Install

```sh
npm install @marshallasch/dive-math
```

The package is ESM-only, has zero runtime dependencies, and ships its own types.

## Quick start

```ts
import { gas, mod, end, bestMix } from '@marshallasch/dive-math/gas'

mod(gas(0.32), 1.4) // => 33.75
end(gas(0.18, 0.45), 60) // => 28.5
bestMix({ depthM: 60, maxPpo2: 1.4, targetEndM: 30 }).fhe // => 0.4286
```

Import from the package root for everything, or from a subpath to keep bundles small.

## Modules

| Module    | Subpath                             | What it covers                                            |
| --------- | ----------------------------------- | --------------------------------------------------------- |
| units     | `@marshallasch/dive-math/units`     | Pressure, depth, volume, flow and temperature conversions |
| pressure  | `@marshallasch/dive-math/pressure`  | Depth/pressure (ATA), water type, gauge/absolute          |
| altitude  | `@marshallasch/dive-math/altitude`  | Surface pressure at altitude, theoretical ocean depth     |
| gas       | `@marshallasch/dive-math/gas`       | Gas mixes, ppO₂, MOD, END, EAD, best mix                  |
| density   | `@marshallasch/dive-math/density`   | Gas density and density limits                            |
| real-gas  | `@marshallasch/dive-math/real-gas`  | Virial compressibility (Z) for O₂, N₂ and He mixes        |
| cylinders | `@marshallasch/dive-math/cylinders` | Cylinder tables, free gas, tank factor                    |
| equipment | `@marshallasch/dive-math/equipment` | Booster presets and common mixes                          |
| blending  | `@marshallasch/dive-math/blending`  | Partial-pressure blending, top-up mixes, nitrox stick     |
| fill      | `@marshallasch/dive-math/fill`      | Cascade, booster and hot-fill calculations                |
| oxygen    | `@marshallasch/dive-math/oxygen`    | CNS and OTU oxygen exposure                               |
| planning  | `@marshallasch/dive-math/planning`  | SAC/RMV, rock bottom, turn pressures, tank matching       |
| ccr       | `@marshallasch/dive-math/ccr`       | Loop ppO₂ and inert fractions, SCR, O₂ cell checks        |

## Documentation

- Docs site: <https://marshallasch.github.io/dive-math/>
- Moving from the fill-station math: [MIGRATION.md](./MIGRATION.md)

## License

MIT. Real-gas virial coefficients and reference values are derived from
[GasPlanner](https://github.com/jirkapok/GasPlanner) (MIT); see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
