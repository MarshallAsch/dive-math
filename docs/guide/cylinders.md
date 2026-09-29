# Cylinders

## What it's for

Reference tables of cylinders, plus free-gas capacity and tank factor helpers. Look a cylinder up by id in `CYLINDERS_BY_ID`, or iterate `DIVE_CYLINDERS`, `STORAGE_CYLINDERS` and `INDUSTRIAL_CYLINDERS`.

## Formulas

Ideal free gas, in surface litres:

$$V_{free} = V_w\,P_{gauge}$$

Real free gas, using the ideal-equivalent pressure from [Real gas](./real-gas):

$$V_{free} = V_w\left(P_{ideal}(P_{gauge} + 1.01325) - 1.01325\right)$$

Tank factor, cubic feet of free gas per 100 psi:

$$TF = \frac{100\,V_w}{28.3168466 \times 14.5037738}$$

- $V_w$: cylinder water volume, L. $P_{gauge}$: gauge pressure, bar.
- $P_{ideal}$: ideal-equivalent absolute pressure, bar.
- $V_{free}$: free gas, surface litres. $TF$: cu ft per 100 psi.

## Nominal vs real cubic feet

A cylinder's "cubic feet" rating (80 for an AL80) is a nominal free-gas figure, and it does not match what the cylinder holds at its rated pressure.

An AL80 has a water volume of 11.1 L and a service pressure of 3000 psi (206.8 bar). The ideal formula gives $11.1 \times 206.84 = 2296$ L, or about 81.1 cu ft. With real-gas behaviour at that pressure the cylinder holds about 77.9 cu ft, which is why an AL80 is closer to 77 cu ft than 80. Pass `useRealGas: true` to `freeGas` to get the real figure.

## Tables

Water volume is the internal volume. Rated pressure is the service pressure in bar gauge, converted from psi where the source uses psi.

### Dive cylinders (`DIVE_CYLINDERS`)

| ID    | Name                | Water volume (L) | Rated pressure (bar) | Material |
| ----- | ------------------- | ---------------: | -------------------: | -------- |
| AL80  | AL80 (S80)          |             11.1 |                206.8 | aluminum |
| AL63  | AL63 (S63)          |                9 |                206.8 | aluminum |
| AL40  | AL40                |              5.7 |                206.8 | aluminum |
| AL30  | AL30 (pony)         |              4.3 |                206.8 | aluminum |
| AL19  | AL19 (pony)         |              2.9 |                206.8 | aluminum |
| AL100 | AL100               |             12.9 |                227.5 | aluminum |
| HP15  | HP15                |                2 |                237.3 | steel    |
| HP23  | HP23                |                3 |                237.3 | steel    |
| HP71  | HP71                |                9 |                237.3 | steel    |
| HP80  | HP80                |             10.2 |                237.3 | steel    |
| HP100 | HP100 (Faber)       |             12.9 |                237.3 | steel    |
| HP117 | HP117 (Faber)       |               15 |                237.3 | steel    |
| HP120 | HP120 (Faber)       |             15.3 |                237.3 | steel    |
| HP133 | HP133 (Faber)       |               17 |                237.3 | steel    |
| HP149 | HP149 (Faber)       |               19 |                237.3 | steel    |
| HP119 | HP119 (Worthington) |               15 |                237.3 | steel    |
| HP130 | HP130 (Worthington) |             16.3 |                237.3 | steel    |
| LP27  | LP27                |                4 |                182.0 | steel    |
| LP50  | LP50                |              7.8 |                182.0 | steel    |
| LP85  | LP85                |               13 |                182.0 | steel    |
| LP95  | LP95                |               15 |                182.0 | steel    |
| LP108 | LP108               |               17 |                182.0 | steel    |
| LP120 | LP120               |               19 |                182.0 | steel    |
| S12   | Steel 12 L          |               12 |                232.0 | steel    |
| S15   | Steel 15 L          |               15 |                232.0 | steel    |
| S7    | Steel 7 L (stage)   |                7 |                232.0 | steel    |
| S3    | Steel 3 L (pony)    |                3 |                232.0 | steel    |

### Storage cylinders (`STORAGE_CYLINDERS`)

| ID       | Name              | Water volume (L) | Rated pressure (bar) | Material |
| -------- | ----------------- | ---------------: | -------------------: | -------- |
| UN45-310 | UN 45 L (310 bar) |               45 |                310.0 | steel    |
| UN50-300 | UN 50 L (300 bar) |               50 |                300.0 | steel    |
| UN50-232 | UN 50 L (232 bar) |               50 |                232.0 | steel    |

### Industrial cylinders (`INDUSTRIAL_CYLINDERS`)

| ID      | Name                        | Water volume (L) | Rated pressure (bar) | Material |
| ------- | --------------------------- | ---------------: | -------------------: | -------- |
| T       | T cylinder (Airgas 300)     |               49 |                165.0 | steel    |
| K       | K cylinder (Airgas 200)     |             43.8 |                156.0 | steel    |
| L50-200 | Linde/Messer 50 L (200 bar) |               50 |                200.0 | steel    |
| L50-300 | Linde/Messer 50 L (300 bar) |               50 |                300.0 | steel    |

## Assumptions and limits

- Free gas is above 0 gauge, so it is `volume × pressure` in the ideal case, not absolute.
- Tank factor is unrounded and ideal.
- Real-gas free gas defaults to `AIR`. Pass `gas` for other mixes.
- The real-gas model is valid to 500 bar absolute.

## Sources

Each row carries its own `source`. By group:

- Aluminium AL series: Luxfer scuba cylinder specifications (3000 psi service; AL100 at 3300 psi).
- HP series: Faber F-x Series HP exempt spec sheet (3442 psi), and Worthington/PST X-series spec sheet (3442 psi) for HP119 and HP130.
- LP series: Faber DOT 3AA LP spec sheet (2640 psi, +10%).
- S series: EN 1964 steel, water volume by definition (232 bar).
- Storage: UN/EN storage cylinders, water volume by definition.
- Industrial T and K: Airgas cylinder dimensions (ap003.pdf) and size chart (ap004.pdf). L50 series: Linde / Messer Reine Gase 2021.

## Examples

<!-- prettier-ignore -->
```ts example
import { CYLINDERS_BY_ID, freeGas, tankFactor } from '@marshallasch/dive-math/cylinders'
CYLINDERS_BY_ID.AL80.volumeL // => 11.1
freeGas({ volumeL: 10, pressureBar: 200, useRealGas: true }) // => 1928.6
tankFactor(11.1) // => 2.70
```

## API

See the [cylinders API reference](/api/cylinders/).
