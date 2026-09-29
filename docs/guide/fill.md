# Filling

## What it's for

Fill-station math: cascade filling from storage banks, air-driven boosters, and hot-fill compensation for cylinders that cool after filling.

## Formulas

### Cascade equalisation

Connecting a bank to the target equalises them. Gas is conserved, so the equilibrium pressure satisfies a mole balance:

$$V_t\,n(P_{eq}) + V_b\,n(P_{eq}) = V_t\,n(P_t) + V_b\,n(P_b) \qquad n(P) = \texttt{idealEquivalentPressure}(g, P)$$

$$P_{eq} = \texttt{realPressureForIdealEquivalent}\!\left(g,\ \frac{V_t\,n(P_t) + V_b\,n(P_b)}{V_t + V_b}\right)$$

- $P_t$, $P_b$, $P_{eq}$: absolute pressure in the target, the bank and at equilibrium, bar.
- $V_t$, $V_b$: water volume of the target and the bank, L.
- $n(P)$: moles per litre of cylinder, as ideal-equivalent absolute bar. With `useRealGas` off, $n(P) = P$ and this is the volume-weighted mean $P_{eq} = (P_tV_t + P_bV_b)/(V_t + V_b)$.

When `desiredPressure` stops a bank part-way, the bank gives up exactly the moles the target gains: $n_b' = n_b - (n(P_{desired}) - n_t)\,V_t/V_b$, converted back with `realPressureForIdealEquivalent`. The booster's free equalisation uses the same balance.

Banks are connected lowest pressure first, and a bank at or below the target pressure is skipped.

### Booster

$$P_{max} = R\,P_{drive}$$

$$V_{drive} = \int \frac{P_{recv}}{P_{inlet}}\,dq$$

- $R$: booster ratio. $P_{drive}$: maximum drive pressure the regulator supplies, bar gauge. $P_{max}$ is the stall ceiling: a target above it is infeasible (`exceeds-stall`).
- $V_{drive}$: drive air used, free litres. $q$: gas delivered to the receiver, surface litres.
- $P_{recv}$: receiver absolute pressure. $P_{inlet}$: supply (inlet) absolute pressure, which falls as gas is drawn and is capped by `regulatedInletBar` for a two-stage regulated inlet.

The drive pressure actually used ramps up to about receiver pressure divided by ratio, so the geometric ratio cancels out of the drive-air integral. The integral is evaluated numerically. Free equalisation from the supply happens first when the supply starts above the receiver.

### Gay-Lussac (hot fills)

$$P_{cold} = P_{hot}\,\frac{T_{cold}}{T_{hot}}$$

- $P_{hot}$, $P_{cold}$: absolute pressure at the fill and settled temperatures, bar.
- $T_{hot}$, $T_{cold}$: temperatures in kelvin.

`settledPressure` and `hotTarget` apply this at fixed volume and convert to and from gauge. `applyOverfill` is a flat percentage on gauge pressure.

### Heat of filling

`tempRise` estimates the temperature rise as `HEAT_COEFF` times the fill rate in bar per minute. `HEAT_COEFF = 0.7` °C per (bar/min) is an empirical fill-station heuristic, not a published value.

## Assumptions and limits

- Pressures are gauge bar in inputs and results, except `boosterTiming`'s `supplyAbsBar`, which is absolute. The math converts to absolute internally.
- The real-gas cascade and booster equalisation are exact mole balances within the virial Z model. The booster drive-air integral and `boosterTiming` gas-per-cycle use Z at the local pressure.
- `boosterTiming` returns `null` when the booster geometry or fill-rate limit is missing.
- A fill that cannot be done is returned as `feasible: false` with a reason (`exceeds-stall` or `supply-insufficient`), never thrown.
- Gay-Lussac assumes a fixed cylinder volume and a settled temperature you supply.

## Sources

The library cites no external source for the cascade and booster models beyond the mole balance itself. Equipment data for boosters is documented in [Equipment](./equipment). The heat coefficient is a heuristic.

## Examples

<!-- prettier-ignore -->
```ts example
import { cascade, settledPressure, booster } from '@marshallasch/dive-math/fill'
cascade({ banks: [{ volume: 50, pressure: 300 }], target: { volume: 11.1, startPressure: 0 } }).finalPressure // => 245.5
settledPressure(230, 40, 20) // => 215.25
booster({ ratio: 40, driveP: 8, supplyVol: 50, supplyStart: 150, receiverVol: 11.1, receiverStart: 0, target: 200 }).maxOutput // => 320
```

## API

See the [fill API reference](/api/fill/).
