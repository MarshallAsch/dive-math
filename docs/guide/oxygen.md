# Oxygen exposure

## What it's for

Tracks oxygen toxicity. The CNS clock uses the NOAA single-exposure limits, and OTU tracks pulmonary exposure. `dailyExposure` runs a whole day of dives and surface intervals.

## The NOAA table

The single-exposure limits, from the NOAA Diving Manual:

| ppO₂ (ata) | Limit (min) |
| ---------: | ----------: |
|        0.6 |         720 |
|        0.7 |         570 |
|        0.8 |         450 |
|        0.9 |         360 |
|        1.0 |         300 |
|        1.1 |         240 |
|        1.2 |         210 |
|        1.3 |         180 |
|        1.4 |         150 |
|        1.5 |         120 |
|        1.6 |          45 |

Between rows the limit is linearly interpolated. Below 0.6 ata there is no limit (`Infinity`, and no CNS accrues).

::: warning Above 1.6 ata
NOAA publishes no limit above 1.6 ata. `cnsLimitMinutes` clamps to 45 minutes there, which understates the exposure. Do not plan above 1.6.
:::

## Formulas

$$CNS\% = 100\,\frac{t}{t_{lim}}$$

$$OTU = t\left(\frac{pO_2 - 0.5}{0.5}\right)^{0.83}$$

Surface decay, with a 90 minute half-time:

$$CNS(t) = CNS_0 \cdot 0.5^{\,t/90}$$

- $t$: time at the segment's $pO_2$, minutes.
- $t_{lim}$: the NOAA limit for that $pO_2$, minutes (interpolated).
- $pO_2$: oxygen partial pressure, ata. No OTU accrue at or below 0.5 ata.
- $CNS_0$: CNS percent at the start of a surface interval.

## Assumptions and limits

- CNS percent is summed across segments, and decays only during surface intervals.
- Each dive segment uses one constant $pO_2$.
- `dailyExposure` reports the peak and final CNS percent, total OTU and a per-dive breakdown.
- This is a planning aid, not a guarantee of safety.

## Sources

- CNS limits: NOAA Diving Manual, oxygen partial pressure and exposure time limits.
- OTU exponent 0.83 and 0.5 ata threshold, and the 90 minute half-time, are the constants used in the source.

## Examples

<!-- prettier-ignore -->
```ts example
import { cnsLimitMinutes, segmentOtu, dailyExposure } from 'dive-math/oxygen'
cnsLimitMinutes(1.4) // => 150
segmentOtu({ ppo2: 1.4, minutes: 30 }) // => 48.86
dailyExposure([{ type: 'dive', ppo2: 1.4, minutes: 30 }, { type: 'surface', minutes: 90 }]).endCnsPercent // => 10
```

## API

See the [oxygen API reference](/api/oxygen/).
