# Blending

## What it's for

Plans gas fills. `partialPressureBlend` works out how much helium, oxygen and top-up gas to add. `topUp` gives the mix you get after topping up. `nitroxStickFlowRate` and `nitroxStickSupplyDraw` size continuous nitrox blending.

## Formulas

### Top-up

$$r = \frac{P_{s,abs}}{P_{f,abs}} \qquad F = r\,F_s + (1 - r)\,F_t$$

- $P_{s,abs}$, $P_{f,abs}$: start and final absolute pressure, bar.
- $F_s$, $F_t$: fraction of a gas in the start gas and the top-up gas. Apply the formula to both O₂ and He.

### Partial-pressure blend

Adding pure He, pure O₂ and a top-up gas to a cylinder, the added partial pressures $p_{He}$ and $p_{O_2}$ solve a 2×2 linear system (the top-up share is whatever pressure remains):

$$\begin{bmatrix}1-F_{He,t} & -F_{He,t}\\ -F_{O_2,t} & 1-F_{O_2,t}\end{bmatrix}\begin{bmatrix}p_{He}\\p_{O_2}\end{bmatrix} = \begin{bmatrix}F_{He}P_f - F_{He,s}P_s - F_{He,t}(P_f-P_s)\\ F_{O_2}P_f - F_{O_2,s}P_s - F_{O_2,t}(P_f-P_s)\end{bmatrix}$$

- $P_s$, $P_f$: start and final gauge pressure, bar.
- $F_{He}$, $F_{O_2}$: target fractions. $F_{He,s}$, $F_{O_2,s}$: start-gas fractions. $F_{He,t}$, $F_{O_2,t}$: top-up gas fractions.
- $p_{He}$, $p_{O_2}$: pressure of pure helium and pure oxygen to add, bar. The top-up gas adds $p_{top} = P_f - P_s - p_{He} - p_{O_2}$.

### Bleed-down

If a solution needs a negative partial, the start gas is in the way and some must be bled off first. Each partial is affine in the start pressure $P_s$, so each is a straight line in $P_s$. The library rebuilds each line from two evaluations ($P_s = 0$ and the real start pressure) and takes the highest bleed target that keeps all three partials at or above zero. No search or iteration is needed.

### Nitrox stick

$$Q_{O_2} = Q_{air}\,\frac{F - 0.209}{1 - F}$$

- $Q_{O_2}$: oxygen injection rate. $Q_{air}$: air flow. Both in the same units (for example L/min).
- $F$: target O₂ fraction. 0.209 is the O₂ fraction of `AIR`.

## Reason codes

When no plan exists the result has `feasible: false` and a `reason`. It is never thrown.

| Reason               | Meaning                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `top-up-unusable`    | The top-up gas has no usable O₂/inert direction, so the system is singular. |
| `drain-insufficient` | Even bleeding the cylinder empty cannot reach the target.                   |

## What `useRealGas` does

With `useRealGas: true`, the pure-gas additions in `partialPressureBlend` are scaled by the component Z at the absolute final pressure (an approximation). `topUp` iterates the mole balance with Z of the start and final mix, up to 10 fixed-point steps. See [Real gas](./real-gas).

## Assumptions and limits

- All pressures in inputs and results are gauge bar unless named `Abs`.
- `order` sets the fill sequence and must be a permutation of `['he', 'o2', 'top']`. It does not change the amounts.
- The top-up gas defaults to `AIR`.
- Temperature effects are not modelled here. See [Filling](./fill) for hot fills.
- The nitrox stick functions assume ideal gas, and a target at or below air returns 0.

## Sources

The library cites no external source for these; they are mole balances applied to absolute pressures.

## Examples

<!-- prettier-ignore -->
```ts example
import { AIR, gas } from '@marshallasch/dive-math/gas'
import { partialPressureBlend, topUp, nitroxStickFlowRate } from '@marshallasch/dive-math/blending'
const r = partialPressureBlend({ startBar: 0, startGas: AIR, finalBar: 200, targetGas: gas(0.18, 0.45) })
r.pHe // => 90
r.pO2 // => 16.45
r.feasible // => true
topUp({ startBar: 100, startGas: gas(0.32), topGas: AIR, finalBar: 200 }).gas.fo2 // => 0.2648
nitroxStickFlowRate({ targetFo2: 0.32, airFlow: 300 }) // => 48.97
```

## API

See the [blending API reference](/api/blending/).
