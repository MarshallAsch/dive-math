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

| Option                          | Default                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `descentRate` / `ascentRate`    | 20 / 10 m/min                                                                                       |
| `stopInterval` / `lastStopM`    | 3 / 3 m (any multiple of `stopInterval`)                                                            |
| `roundStops`                    | `true`: every stop ends on a whole minute of runtime (Baker's convention)                           |
| `maxDecoPpo2` / `maxBottomPpo2` | 1.6 / 1.4 ata; deco gases switch at the first stop-grid depth where the gas is within `maxDecoPpo2` |
| `switchMinutes`                 | 0                                                                                                   |
| `safetyStop`                    | `false` (3 min at 5 m on no-deco dives when `true`)                                                 |
| `waterVapour`                   | 0.0627 bar                                                                                          |

`Level.minutes` is the time **at** depth, after the descent or ascent to it.

Input limits (library guards that bound the planner's work; out-of-range values throw `RangeError`, in `planDive`, `timeToSurface` and `bailoutPlan` alike):

| Input                        | Limit                                     |
| ---------------------------- | ----------------------------------------- |
| `levels`                     | 1 to 1000 entries (`MAX_LEVELS`)          |
| `Level.depthM`               | 0 to 1000 m (`MAX_DEPTH_M`)               |
| `descentRate` / `ascentRate` | at least 0.1 m/min (`MIN_RATE_M_PER_MIN`) |
| `stopInterval`               | at least 0.1 m (`MIN_STOP_INTERVAL_M`)    |
| `switchMinutes`              | 0 to 1440 min (`MAX_DECO_MINUTES`)        |

Gas-switch holds count toward `MAX_DECO_MINUTES` like stops: past it the plan is truncated with `deco-too-long`.

- With `surfacePressure: 1.01325`, 6 m is 1.613 ata, so O₂ is not selected at 6 m unless `maxDecoPpo2` ≥ ~1.62.
- `ndl()` excludes off-gassing during the ascent, so it is stricter than the planner's direct-ascent no-stop check.
- CCR diluent flush: when the setpoint is below the diluent's ppO₂, the loop's ppO₂ is the diluent's, taken as $f_{O_2} \cdot P_{amb}$; the model's inert pressure is then $f_{O_2} \cdot P_{H_2O}$ lower than breathing the diluent on open circuit: about 0.013 bar for air (≈ 0.5 % of the inert pressure where the flush starts), rising with the diluent's O₂ (≈ 1.4 % for EAN32, ≈ 4.7 % for a 50 % diluent at a 0.7 setpoint). This makes the model slightly less conservative in that regime.

## CCR bailout

`bailoutPlan` evaluates a bailout at the end of every level below the surface and returns the worst bailout point among the ends of the levels (largest bailout gas requirement; ties go to the longer runtime). For each candidate it replays the bottom to that level's end, then ascends on open circuit on `bailoutGases` with gas switches at MOD. The bailout starts on the richest bailout gas within `maxDecoPpo2` at that depth (the leanest, with a `no-breathable-gas` warning, if none is). `bailoutDepthM` and `bailoutRuntimeMinutes` report where and when the chosen bailout starts.

Cost grows with the number of levels: each candidate runs a full open-circuit deco ascent, so `bailoutPlan` is roughly one `planDive` per level. A few levels returns in milliseconds; profiles near the `MAX_LEVELS` cap (1000 deep CCR levels) can take several seconds. It is synchronous, so in a UI run it off the main thread (e.g. in a Web Worker) for long multi-level profiles.

## Air breaks

`airBreaks` schedules periodic breaks onto a lower ppO₂ during decompression. The breaks are run through the tissue model, so stop times grow to make up for them.

```ts
airBreaks: {
  oc?:  { onMinutes?: 20, breakMinutes?: 5, triggerPpo2?: 1.4 },
  ccr?: { onMinutes?: 60, breakMinutes?: 5, triggerSetpoint?: 1.3, breakSetpoint?: 0.7 },
}
```

A mode with no key takes no breaks; `{ oc: {} }` turns on open-circuit breaks with the defaults, and a field left `undefined` keeps its default. `onMinutes` and `breakMinutes` must be at least one minute (`MIN_BREAK_CLOCK_MINUTES`). OC 20/5 is the common technical-diving O₂ break. CCR 60/5 follows the US Navy MK 16 practice described by Hoyt et al. (2025), who recommend periodic five-minute breaks during decompression at "an inspired PO₂ equivalent to breathing air at the same depth" but prescribe no regimen. The 1.4 OC trigger, 1.3 CCR trigger and 0.7 break setpoint are conventions chosen for this library.

- **The clock** runs only during the deco ascent, while the OC inspired ppO₂ (or the CCR setpoint in force) is at or above the trigger. It carries across stops and gas switches. Below the trigger it pauses; a continuous stretch below the trigger of at least `breakMinutes` counts as a break and resets it.
- **A break starts** when the clock is full and the stop isn't clear yet.
- **Break gas.** OC: the leanest carried gas (the gas the ascent started on, plus the deco gases) that is breathable at the depth and below the trigger. CCR: the loop at `breakSetpoint`, bounded by the diluent.
- **A stop may end mid-break.** The rest of the break is flown through the ascent (those segments are marked `airBreak`) and into the next stop. A break that runs out in transit finishes on arrival: the whole travel segment is flown on the break gas, and the leftover transit minutes don't count toward the clock. The clock state for a travel segment (on, paused or mid-break) is judged at its departure depth. The break gas is re-selected at each depth; if none qualifies, the break ends early without resetting the clock.
- If a break is due but no break gas exists, the plan stays on the normal gas and warns `no-break-gas`.

Break pieces are separate `stop` segments with `airBreak: true`. Each `DecoStop` reports its `breakMinutes`. With breaks, clearing is not monotonic in the wait: padding a stop can start a break, and the travel is then flown on the leaner break gas, which can on-gas fast compartments. The stop-time search therefore checks the wait it finds, and a stop rounded up to a whole minute of runtime is re-checked and extended by whole minutes until the next stop is clear. The stop found may be slightly longer than the shortest possible one, never shorter.

## Oxygen exposure

`oxygenLimits` picks the CNS limit set: `'noaa-1991'` (default) or `'hoyt-2025'` (see [oxygen exposure](./oxygen.md)). Bottom-profile segments (descents, levels, and ascents between levels) are `working` unless the level says otherwise: a level's `phase` applies to the level and the travel into it. The deco ascent (the ascent and stop segments after the last level, including a safety stop) is `resting`.

`DivePlan.oxygen` holds the totals (`working` and `resting` under Hoyt). Every segment carries the cumulative `cnsPercent` and `otu` at its end. `dayExposure` takes the day's earlier dives and surface intervals (the `dailyExposure` items) for the daily checks. Those checks have no decay: surface intervals don't reduce them.

## Warnings

Plans never throw for unsafe-but-valid dives; they return `warnings`:

- `hypoxic`: ppO₂ below 0.16;
- `ppo2-high`: above `maxBottomPpo2` on descents and levels, or `maxDecoPpo2` on the ascent;
- `density-recommended` / `density-hard`: above 5.2 / 6.2 g/L;
- `ceiling-violated`: a multi-level ascent above the GF-high ceiling;
- `no-breathable-gas`: no gas within the ppO₂ limits at a stop depth;
- `cns-single`: NOAA single-exposure CNS over 100 %; `cns-working` / `cns-resting` under Hoyt 2025;
- `cns-daily`: this dive plus `dayExposure` over the 24-hour limits;
- `otu-daily`: this dive plus `dayExposure` over 850 OTU (REPEX day 1);
- `no-break-gas`: an air break was due at a depth but no break gas was available;
- `deco-too-long`: more than 24 h of stops. The plan is truncated: it stops at the depth where it was truncated, and `runtimeMinutes` and `gasUse` cover only the planned part.

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
planDive({ ...ccr, oxygenLimits: 'hoyt-2025' }).oxygen.resting! < 100 // => true
const tmx = { levels: [{ depthM: 60, minutes: 40, breathing: { kind: 'oc' as const, gas: gas(0.18, 0.45) } }], decoGases: [gas(0.5), gas(1)], gfLow: 0.4, gfHigh: 0.85 }
planDive(tmx).runtimeMinutes // => 134.3
planDive({ ...tmx, airBreaks: { oc: { triggerPpo2: 1.3 } } }).runtimeMinutes // => 142.3
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
