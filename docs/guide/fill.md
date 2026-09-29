# Filling

## What it's for

Fill-station math: cascade filling from storage banks, air-driven boosters, and hot-fill compensation for cylinders that cool after filling.

## Formulas

### Cascade equalisation

Connecting a bank to the target equalises them. In absolute pressure:

$$P_{eq} = \frac{P_tV_t/Z_t + P_bV_b/Z_b}{V_t/Z_t + V_b/Z_b}$$

- $P_t$, $P_b$: absolute pressure in the target and the bank, bar.
- $V_t$, $V_b$: water volume of the target and the bank, L.
- $Z_t$, $Z_b$: compressibility factors (1 when `useRealGas` is off).

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

- Pressures are gauge bar in inputs and results. The math converts to absolute internally.
- The real-gas cascade and booster models use Z at each side's pressure and are first-order approximations.
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
