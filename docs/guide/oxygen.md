# Oxygen exposure

## What it's for

Tracks oxygen toxicity. The CNS clock uses the NOAA 1991 limits by default, or the Hoyt 2025 revision for ppO₂ ≤ 1.3. OTU tracks pulmonary exposure, with REPEX for multi-day missions. `dailyExposure` runs a whole day of dives and surface intervals.

## The NOAA table

The NOAA Diving Manual limits:

| ppO₂ (ata) | Single (min) | 24 h day (min) |
| ---------: | -----------: | -------------: |
|        0.6 |          720 |            720 |
|        0.7 |          570 |            570 |
|        0.8 |          450 |            450 |
|        0.9 |          360 |            360 |
|        1.0 |          300 |            300 |
|        1.1 |          240 |            270 |
|        1.2 |          210 |            240 |
|        1.3 |          180 |            210 |
|        1.4 |          150 |            180 |
|        1.5 |          120 |            180 |
|        1.6 |           45 |            150 |

Between rows the limit is linearly interpolated. Below 0.6 ata there is no limit (`Infinity`, and no CNS accrues).

::: warning Above 1.6 ata
NOAA publishes no limit above 1.6 ata. `cnsLimitMinutes` clamps to the 1.6 row there, which understates the exposure. Do not plan above 1.6.
:::

## Hoyt 2025 limits

Hoyt et al. (2025), endorsed at a NOAA workshop, revise the limit at an inspired ppO₂ of 1.3 only: up to **240 min of working dive followed by up to 240 min of resting decompression** per dive, and the same combined total per 24 hours (from the start of the first dive). With `limits: 'hoyt-2025'`:

- Every exposure has a `phase`, `'working'` or `'resting'`, and each phase has its own clock.
- At ppO₂ ≤ 1.3 the limit is 240 min per phase, or the NOAA limit where that is longer (≤ 1.0 ata). The paper proposes no increase below 1.3 but notes the 1.3 limit can be applied there with less risk.
- Above 1.3 the NOAA limits apply unchanged, charged to the exposure's phase. Note the step at 1.3: 240 min at 1.3, 180 min just above it.
- `cnsPercent` is the larger of the two phases; 100 % in either is the limit.

Caveats from the paper: the data come mostly from precisely controlled ppO₂, so minimise upward drift around a setpoint. "Resting" means no more activity than needed to hold position (formally an RMV below 22.5 L/min). Beyond 8 hours is poorly informed by data. Following the limits does not guarantee that CNS toxicity won't occur.

## REPEX

`repex(dailyOtu)` checks a multi-day mission against the REPEX cumulative OTU allowance: 850 on day 1, 1400 by day 2, 1860 by day 3, …, 4200 by day 14, then 300 more per day up to day 30.

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
- `dailyExposure` reports the peak and final CNS percent (decaying, NOAA single-exposure limits under either set), total OTU, a per-dive breakdown, and `daily`: all dives against the 24-hour limits with no decay. Items are assumed to fall within one 24-hour window from the first dive.
- This is a planning aid, not a guarantee of safety.

## Sources

- CNS limits: NOAA Diving Manual (1991), oxygen partial pressure and exposure time limits.
- Revised 1.3 ata limits: Hoyt J, Murphy FG, Pollock NW, et al. Revised guideline for central nervous system oxygen toxicity exposure limits when using an inspired PO₂ of 1.3 atmospheres. Diving Hyperb Med. 2025;55(3):262–270. doi:10.28920/dhm55.3.262-270.
- REPEX: Hamilton RW. Tolerating exposure to high oxygen levels: Repex and other methods. MTS Journal 23(4), 1989.
- OTU exponent 0.83 and 0.5 ata threshold, and the 90 minute half-time, are the constants used in the source.

## Examples

<!-- prettier-ignore -->
```ts example
import { cnsLimitMinutes, cnsTotals, segmentOtu, dailyExposure, repex } from 'dive-math/oxygen'
cnsLimitMinutes(1.4) // => 150
segmentOtu({ ppo2: 1.4, minutes: 30 }) // => 48.86
dailyExposure([{ type: 'dive', ppo2: 1.4, minutes: 30 }, { type: 'surface', minutes: 90 }]).endCnsPercent // => 10
cnsLimitMinutes(1.3, { daily: true }) // => 210
cnsLimitMinutes(1.3, { limits: 'hoyt-2025', phase: 'resting' }) // => 240
cnsTotals([{ ppo2: 1.3, minutes: 240, phase: 'working' }, { ppo2: 1.3, minutes: 120, phase: 'resting' }], { limits: 'hoyt-2025' }).cnsPercent // => 100
repex([800, 700]).exceeded // => true
```

## API

See the [oxygen API reference](/api/oxygen/).
