# Gas planning

## What it's for

Surface air consumption (SAC) and respiratory minute volume (RMV), rock-bottom gas, turn pressures for thirds and halves, and bailout time.

## Formulas

$$SAC = \frac{\Delta P}{t\,P}$$

$$RMV = SAC \cdot V$$

$$\text{rock bottom} = n\,s\,RMV\left(P\!\left(\tfrac d2\right)\frac{d}{r} + \sum_i P_i\,t_i\right)$$

- $SAC$: surface consumption as a pressure rate, bar/min (or psi/min if the input is psi).
- $\Delta P$: pressure used, in the same unit. $t$: time, minutes. $P$: absolute pressure at the average depth, ata.
- $RMV$: respiratory minute volume at the surface, L/min. $V$: cylinder water volume, L.
- $n$: team size. $s$: stress factor applied to $RMV$.
- $d$: depth, m. $r$: ascent rate, m/min. $P(d/2)$: pressure at half the depth, which averages the ascent.
- $P_i$, $t_i$: absolute pressure and duration of stop $i$, ata and minutes.
- The result is surface litres. `minGasPressure` divides by the cylinder volume to give a pressure.

`sac()` is the volume form: total litres used divided by $t\,P$.

## Turn pressures by volume

`turnPressures` sets thirds and halves from gas volume, not pressure. Volume is capacity times actual fill pressure, not the rated maximum.

Both rules are team limits. The cylinder holding less usable volume sets a shared ceiling, and the same volume is then expressed as a pressure for each cylinder. A larger cylinder therefore shows a lower turn pressure for the same litres.

This is deliberate. With mismatched cylinders, matching pressure readings is unsafe: the diver on the bigger cylinder has already used more gas, and in a shared-gas emergency the smaller cylinder might not hold enough to cover both divers. Thirds have no reserve subtracted. Halves subtract the shared reserve.

## Assumptions and limits

- Ideal gas: volume is capacity times gauge pressure.
- `bailoutMinutes` is a direct-ascent estimate at a fixed average depth. It is not stop-inclusive and is not decompression planning.
- CCR metabolic O₂ rate (`ccrO2Rate`) is independent of depth.
- Invalid input (negative volumes, zero time, a `teamSize` of zero) throws a `RangeError`.

## Sources

The library cites no published source for these. They are standard consumption and reserve formulas. The turn-pressure rationale is the reasoning recorded in the source comments.

## Examples

<!-- prettier-ignore -->
```ts example
import { sac, rockBottom, turnPressures, bailoutMinutes } from '@marshallasch/dive-math/planning'
sac(1800, 20, 30) // => 20
rockBottom({ rmvLpm: 20, depthM: 30, ascentRateMpm: 9, stops: [{ depthM: 5, minutes: 3 }], stressFactor: 2, teamSize: 2 }) // => 1026.67
turnPressures({ capA: 11.1, capB: 12.9, fillABar: 200, fillBBar: 200, reserveBar: 50 }).thirdsB // => 57.36
bailoutMinutes(2220, 42.5, 30) // => 13.06
```

## API

See the [planning API reference](/api/planning/).
