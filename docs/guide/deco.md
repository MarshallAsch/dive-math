# Decompression

::: danger Not a dive computer
`dive-math/deco` is a reference implementation for planning software and education. Plans must be checked against
an approved planner and your training. Never dive a schedule from this library alone.
:::

## What it's for

Plans multi-level and repeat dives with the Bühlmann ZH-L16C model and Erik Baker's gradient factors. It covers open circuit with deco-gas switches, CCR with a fixed or low/high setpoint, and CCR bailout to open circuit. Each plan reports its stop schedule, runtime, CNS/OTU, gas use and safety warnings. The lower-level functions (tissue loading, ceiling, NDL, time to surface) are public for dive-log tools.

## Model

### Inspired inert gas

$$P_i = (P_{amb} - P_{H_2O}) \cdot f_{inert}$$

- $P_{amb}$: ambient pressure (ata) from `ataAtDepth`, so `water` and `surfacePressure` apply.
- $P_{H_2O}$: alveolar water vapour, default **0.0627 bar** (Bühlmann, RQ = 1). Pass `waterVapour: 0.0493` (Schreiner, RQ = 0.8) to reproduce Baker's published examples.
- On CCR: $P_i = \max(0,\ P_{amb} - P_{H_2O} - pO_{2,loop})$, split in the diluent's He:N₂ ratio. $pO_{2,loop}$ is the setpoint bounded by ambient and by the diluent's ppO₂.

### Tissue loading

Constant depth (Haldane) and linear depth change (Schreiner), exact, with no time-stepping:

$$P(t) = P_{i0} + R\left(t - \tfrac{1}{k}\right) - \left(P_{i0} - P_0 - \tfrac{R}{k}\right)e^{-kt}, \qquad k = \frac{\ln 2}{t_{1/2}}$$

$R$ is the rate of change of $P_i$ (bar/min); $R = 0$ is Haldane. CCR segments are split where the loop's inert pressure changes slope, so every piece stays exact.

### Tolerated pressure and ceiling (Baker)

$$P_{tol} = \frac{P_t - GF \cdot a}{GF/b - GF + 1}, \qquad a = \frac{a_{N_2}P_{N_2} + a_{He}P_{He}}{P_{N_2} + P_{He}},\ \text{same for } b$$

The ceiling is the deepest $P_{tol}$ over the 16 compartments, as a depth.

### Gradient factors

- The first stop is found by ascending at GF-low on the 3 m stop grid.
- From there, GF runs linearly from GF-low at the first stop to GF-high at the surface.
- A dive whose direct ascent is clear at GF-high (within its NDL) surfaces without stops.

### Coefficients

ZH-L16C, with compartment 1 = Bühlmann's "1b" (5.0 min N₂ / 1.88 min He). Source: Bühlmann, Völlm & Nussberger, _Tauchmedizin_ (2002), Tabelle 26 ([scan](https://www.nigelhewitt.co.uk/stuff/aab.jpg)); helium cross-checked against Baker, [_Understanding M-values_](https://www.shearwater.com/wp-content/uploads/2019/05/understanding_m-values.pdf), Table 3.

| Cpt | t½ N₂ | a N₂   | b N₂   | t½ He  | a He   | b He   |
| --- | ----- | ------ | ------ | ------ | ------ | ------ |
| 1   | 5.0   | 1.1696 | 0.5578 | 1.88   | 1.6189 | 0.4770 |
| 2   | 8.0   | 1.0000 | 0.6514 | 3.02   | 1.3830 | 0.5747 |
| 3   | 12.5  | 0.8618 | 0.7222 | 4.72   | 1.1919 | 0.6527 |
| 4   | 18.5  | 0.7562 | 0.7825 | 6.99   | 1.0458 | 0.7223 |
| 5   | 27.0  | 0.6200 | 0.8126 | 10.21  | 0.9220 | 0.7582 |
| 6   | 38.3  | 0.5043 | 0.8434 | 14.48  | 0.8205 | 0.7957 |
| 7   | 54.3  | 0.4410 | 0.8693 | 20.53  | 0.7305 | 0.8279 |
| 8   | 77.0  | 0.4000 | 0.8910 | 29.11  | 0.6502 | 0.8553 |
| 9   | 109.0 | 0.3750 | 0.9092 | 41.20  | 0.5950 | 0.8757 |
| 10  | 146.0 | 0.3500 | 0.9222 | 55.19  | 0.5545 | 0.8903 |
| 11  | 187.0 | 0.3295 | 0.9319 | 70.69  | 0.5333 | 0.8997 |
| 12  | 239.0 | 0.3065 | 0.9403 | 90.34  | 0.5189 | 0.9073 |
| 13  | 305.0 | 0.2835 | 0.9477 | 115.29 | 0.5181 | 0.9122 |
| 14  | 390.0 | 0.2610 | 0.9544 | 147.42 | 0.5176 | 0.9171 |
| 15  | 498.0 | 0.2480 | 0.9602 | 188.24 | 0.5172 | 0.9217 |
| 16  | 635.0 | 0.2327 | 0.9653 | 240.03 | 0.5119 | 0.9267 |

Surface tissues start saturated at $(P_{surf} - P_{H_2O}) \times 0.7902$ (N₂ + argon).

## Planning defaults

| Option                          | Default                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `descentRate` / `ascentRate`    | 20 / 10 m/min                                                                 |
| `stopInterval` / `lastStopM`    | 3 / 3 m (6 allowed)                                                           |
| `roundStops`                    | `true`: every stop ends on a whole minute of runtime (Baker's convention)     |
| `maxDecoPpo2` / `maxBottomPpo2` | 1.6 / 1.4 ata; deco gases switch at the first stop depth within `maxDecoPpo2` |
| `switchMinutes`                 | 0                                                                             |
| `safetyStop`                    | `false` (3 min at 5 m on no-deco dives when `true`)                           |
| `waterVapour`                   | 0.0627 bar                                                                    |

`Level.minutes` is the time **at** depth, after the descent or ascent to it.

## CCR bailout

`bailoutPlan` evaluates a bailout at the end of every level below the surface and returns the worst bailout point among the ends of the levels (largest bailout gas requirement; ties go to the longer runtime). For each candidate it replays the bottom to that level's end, then ascends on open circuit on `bailoutGases` with gas switches at MOD. `bailoutDepthM` and `bailoutRuntimeMinutes` report where and when the chosen bailout starts.

## Warnings

Plans never throw for unsafe-but-valid dives; they return `warnings`:

- `hypoxic`: ppO₂ below 0.16;
- `ppo2-high`: above `maxBottomPpo2` on descents and levels, or `maxDecoPpo2` on the ascent;
- `density-recommended` / `density-hard`: above 5.2 / 6.3 g/L;
- `ceiling-violated`: a multi-level ascent above the GF-high ceiling;
- `no-breathable-gas`: no gas within the ppO₂ limits at a stop depth;
- `deco-too-long`: more than 24 h of stops (the plan is truncated).

## Examples

<!-- prettier-ignore -->
```ts example
import { AIR, gas } from 'dive-math/gas'
import { planDive, bailoutPlan, surfaceInterval } from 'dive-math/deco'
const dive = { levels: [{ depthM: 18, minutes: 30, breathing: { kind: 'oc' as const, gas: AIR } }], gfLow: 0.4, gfHigh: 0.85 }
const first = planDive(dive)
first.stops.length // => 0
const second = planDive({ ...dive, startTissues: surfaceInterval(first.endTissues, 60) })
second.runtimeMinutes >= first.runtimeMinutes // => true
const baker = planDive({ levels: [{ depthM: 90, minutes: 15.5, breathing: { kind: 'oc', gas: gas(0.13, 0.5) } }], decoGases: [gas(0.36), gas(0.5), gas(0.8)], gfLow: 0.2, gfHigh: 0.75, waterVapour: 0.0493 })
baker.firstStopM // => 54
baker.runtimeMinutes > 119 && baker.runtimeMinutes < 121 // => true
const ccr = { levels: [{ depthM: 60, minutes: 25, breathing: { kind: 'ccr' as const, diluent: gas(0.18, 0.45), setpoint: 1.3 } }], gfLow: 0.3, gfHigh: 0.8 }
bailoutPlan(ccr, { bailoutGases: [gas(0.18, 0.45), gas(0.5), gas(1)], rmvLpm: 20 }).gasRequired.length // => 3
```

## Validation

- DecoTengu's worked example: tissue pressures to 6 decimals.
- Baker, "Clearing Up The Confusion About Deep Stops", Fig. 3: first stop 54 m; every stop within 1 min of the published runtime.
- GasPlanner's tissue model (MIT), run as a black box: all 16 compartments to 1e-9.
- An independent clean-room planner (`scripts/deco-reference/reference.py`): identical schedules to the second.
- Optional replay of Shearwater Cloud CSV logs (`test/fixtures/shearwater/`, not published).

## Known differences

- **GasPlanner / Subsurface** interpolate GF differently (more conservative: +0.4 to +10 min on typical dives). GasPlanner also has typos in the N₂ b of compartments 4 and 5.
- **Shearwater** doesn't publish its water-vapour value, GF anchoring or rounding.

## API

See the [API reference](/api/deco/).
