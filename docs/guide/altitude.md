# Altitude

## What it's for

Barometric pressure at altitude, and the Cross correction for using sea-level tables at altitude. Combine it with the depth functions by passing the altitude's surface pressure.

## Formulas

The ICAO barometric formula:

$$P(h) = 1.01325\,\left(1 - \frac{0.0065\,h}{288.15}\right)^{5.25588}$$

The Cross correction (theoretical ocean depth):

$$d_{TOD} = d \cdot \frac{P_0}{P(h)}$$

- $P(h)$: barometric pressure at altitude $h$, bar.
- $h$: altitude above sea level, m.
- $P_0 = 1.01325$ bar: sea-level standard pressure.
- $d$: actual depth at altitude, m. $d_{TOD}$: the sea-level depth with the same pressure ratio, m.
- $288.15$ K is the sea-level temperature, $0.0065$ K/m the lapse rate and $5.25588$ the exponent $g_0M/(RL)$.

## Using it with depth math

`surfaceAtaAtAltitude` returns the surface pressure relative to sea level (1.0 at 0 m). Pass it as `surfacePressure` to any depth function:

```ts
import { surfaceAtaAtAltitude } from 'dive-math/altitude'
import { mod, gas } from 'dive-math/gas'

mod(gas(0.32), 1.4, { surfacePressure: surfaceAtaAtAltitude(1500) })
```

## Assumptions and limits

- ICAO standard atmosphere, troposphere only. Altitude must be in the range −500 m up to (not including) 11 000 m, otherwise a `RangeError` is thrown.
- A standard atmosphere is assumed. Real weather shifts the surface pressure by a few percent.
- This is pressure math only. It says nothing about decompression at altitude.

## Sources

- ICAO Doc 7488/3: $T_0 = 288.15$ K, lapse rate 0.0065 K/m, exponent 5.25588.
- Sea-level pressure: ISO 2533 / ICAO (101 325 Pa).

## Examples

<!-- prettier-ignore -->
```ts example
import { surfacePressureAtAltitude, surfaceAtaAtAltitude, theoreticalOceanDepth } from 'dive-math/altitude'
import { ataAtDepth } from 'dive-math/pressure'
surfacePressureAtAltitude(1000) // => 0.899
ataAtDepth(10, { surfacePressure: surfaceAtaAtAltitude(1000) }) // => 1.887
theoreticalOceanDepth(30, 1000) // => 33.82
```

## API

See the [altitude API reference](/api/altitude/).
