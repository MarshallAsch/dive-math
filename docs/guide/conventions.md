# Conventions

These rules apply to every function in the library.

## Units

Everything is metric internally: bar, metres, litres, degrees Celsius and minutes. Imperial units exist only in the
[`units`](/api/units/) module, at the edges.

## Fractions

Gas fractions run from 0 to 1, never percent. A `Gas` is `{ fo2, fhe }`; nitrogen (`fn2`) is always derived.

## Gauge vs absolute

Pressures are gauge by default. Absolute parameters and returns have names ending in `Abs`, or are documented as
absolute. Use `gaugeToAbs` to convert.

## Water types

Depth math takes `water: 'salt' | 'fresh'`, default `'salt'`. Metres per bar are `METERS_PER_BAR = { salt: 10, fresh: 10.3 }`.

## SURFACE_ATA vs ATM_BAR

Depth math uses `SURFACE_ATA = 1` by default, overridable through an optional `surfacePressure`. Fill math uses
`ATM_BAR = 1.01325` for gauge to absolute conversion. They are different constants for different jobs.

## AIR

`AIR = { fo2: 0.209, fhe: 0 }` is used everywhere, including presets.

## Errors vs `feasible`

Impossible input (NaN, infinity, negative depth or volume, fractions out of range, `fo2 + fhe > 1`) throws a
`RangeError` whose message names the parameter. A valid request with no solution is returned as data:
`feasible: false` with a string-literal `reason` code. It is never thrown.

## No rounding

The library never rounds, and it carries no UI copy. Round and word things at the edge.

## `useRealGas`

Every function that can use real-gas behaviour takes `useRealGas?: boolean` inside its input object, defaulting to
`false`. The compressibility factor Z is always evaluated at absolute pressure (see [Real gas](./real-gas)).

```ts example
import { toBar, fromMeters } from '@marshallasch/dive-math/units'
import { ataAtDepth, gaugeToAbs } from '@marshallasch/dive-math/pressure'

toBar(3000, 'psi') // => 206.84
fromMeters(30, 'ft') // => 98.43
ataAtDepth(30.9, { water: 'fresh' }) // => 4
gaugeToAbs(0) // => 1.01325
```
