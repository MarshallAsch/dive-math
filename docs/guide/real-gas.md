# Real gas (Z)

## What it's for

Real gases at cylinder pressure hold fewer or more moles than the ideal gas law predicts. The compressibility factor Z corrects for that. The library uses it, when you opt in with `useRealGas`, for free-gas volumes, blending, cascades and boosters.

## Formulas

A virial fit per component:

$$Z_i(P) = 1 + a_iP + b_iP^2 + c_iP^3$$

Mixed linearly by mole fraction:

$$Z_{mix} = 1 + \sum_i F_i\,(Z_i - 1)$$

The ideal-gas pressure that holds the same moles, normalised so that 1 atm maps to 1 atm:

$$P_{ideal} = P\,\frac{Z(P_{atm})}{Z(P)}$$

- $P$: absolute pressure, bar. Always absolute, never gauge.
- $P_{atm} = 1.01325$ bar.
- $a_i, b_i, c_i$: fit coefficients for component $i$ (table below).
- $F_i$: fraction of component $i$ (O₂, N₂, He).

## Coefficients

| Gas |                 a |                 b |                 c |
| --- | ----------------: | ----------------: | ----------------: |
| o2  | -7.18092073703e-4 |  2.81852572808e-6 | -1.50290620492e-9 |
| n2  | -2.19260353292e-4 |  2.92844845532e-6 | -2.07613482075e-9 |
| he  |  4.87320026468e-4 | -8.83632921053e-8 | 5.33304543646e-11 |

## Assumptions and limits

- Valid for 0 to 500 bar absolute. Outside that range the functions throw a `RangeError`.
- The coefficient source does not state its reference temperature. Treat results as room-temperature approximations.
- `realPressureForIdealEquivalent` uses fixed-point iteration and throws if the answer leaves the model range.
- Z is evaluated at absolute pressure everywhere in the library.

## Sources

- Coefficients come from atdotde/realblender (a Python script), as used by Subsurface and by the GasPlanner scuba-physics library (MIT, copyright 2018 JirkaPok). See `THIRD_PARTY_NOTICES.md`.

## Examples

<!-- prettier-ignore -->
```ts example
import { AIR, gas } from '@marshallasch/dive-math/gas'
import { mixZ, idealEquivalentPressure } from '@marshallasch/dive-math/real-gas'
mixZ(AIR, 207) // => 1.0402
mixZ(gas(1), 207) // => 0.9588
idealEquivalentPressure(gas(0.25, 0.25), 200) // => 192.05
```

## API

See the [real-gas API reference](/api/real-gas/).
