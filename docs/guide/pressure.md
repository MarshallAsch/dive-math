# Pressure and depth

## What it's for

Converts between depth and absolute pressure, and between gauge and absolute pressure. Every depth-based function in the library takes the same optional `water` and `surfacePressure` options.

## Formulas

$$P = P_s + \frac{d}{k_w}$$

$$d = (P - P_s)\,k_w$$

$$P_{abs} = P_{gauge} + 1.01325$$

- $P$: absolute pressure at depth, ata.
- $P_s$: surface pressure, ata. Defaults to `SURFACE_ATA = 1`.
- $d$: depth, m.
- $k_w$: metres of water per bar. $k_{salt} = 10$ and $k_{fresh} = 10.3$ m/bar.
- $P_{gauge}$, $P_{abs}$: gauge and absolute pressure, bar.

## Why 1 ata for depth and 1.01325 bar for fills

Depth math follows the dive-table convention: the surface is 1 ata, 10 m of salt water adds 1 ata, so 30 m is exactly 4 ata. That keeps the numbers people expect from tables and computers.

Fill math is different. A cylinder gauge reads pressure above the atmosphere, and gas laws need absolute pressure, so gauge to absolute uses the real standard atmosphere, `ATM_BAR = 1.01325`. The two constants do different jobs and are never mixed.

## Assumptions and limits

- Salt water is 10 m per bar and fresh water is 10.3 m per bar (a fixed ratio, not a density calculation).
- `depthAtAta` is negative when the pressure is below the surface pressure.
- Negative depths, and non-finite inputs, throw a `RangeError`.
- To dive at altitude, pass a different `surfacePressure` (see [Altitude](./altitude)).

## Sources

- Salt: 10 m per bar, 33 fsw per atm (dive-table convention).
- Fresh: 10.3 m per bar, from 34 ffw vs 33 fsw per atm, so 10 × 34/33.
- `ATM_BAR`: ISO 2533 / ICAO standard atmosphere (101 325 Pa).

## Examples

<!-- prettier-ignore -->
```ts example
import { ataAtDepth, depthAtAta } from 'dive-math/pressure'
ataAtDepth(30) // => 4
depthAtAta(2.5, { water: 'fresh' }) // => 15.45
```

## API

See the [pressure API reference](/api/pressure/).
