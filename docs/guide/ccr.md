# Rebreathers

## What it's for

Closed-circuit rebreather (CCR) loop maths, semi-closed (SCR) mass balance, and O₂ cell health classification.

## Formulas

### CCR loop

The loop ppO₂ a CCR can hold is the setpoint, but never above ambient (pure O₂) and never below the diluent's ppO₂:

$$pO_{2,loop} = \min\big(P,\ \max(SP,\ F_{O_2,dil}\,P)\big)$$

The loop O₂ fraction is $pO_{2,loop}/P$. The remaining inert gas is split in the diluent's helium to nitrogen ratio:

$$F_{He} = \frac{(1 - F_{O_2})\,F_{He,dil}}{1 - F_{O_2,dil}}$$

- $P$: absolute pressure at depth, ata. $SP$: setpoint, ata.
- $F_{O_2,dil}$, $F_{He,dil}$: diluent fractions. $F_{O_2}$, $F_{He}$: loop fractions.

### SCR

Steady-state loop O₂ fraction from an oxygen mass balance:

$$F = \frac{Q\,F_s - \dot V_{O_2}}{Q - \dot V_{O_2}}$$

Fresh-gas addition of a passive SCR, where a fixed $1/K$ of each breath is dumped at ambient pressure and replaced:

$$Q = \frac{RMV\,P}{K}$$

- $Q$: fresh-gas supply, surface L/min. $F_s$: supply O₂ fraction. $\dot V_{O_2}$: metabolic O₂ uptake, surface L/min.
- $RMV$: respiratory minute volume, L/min. $K$: bellows ratio. $P$: absolute pressure, ata.

### O₂ cells

A healthy galvanic cell reads about 4.78 times its air reading in pure oxygen:

$$mV_{O_2} \approx 4.78\,mV_{air}$$

Deviation of the measured pure-O₂ reading from that theoretical value sets the verdict:

| Deviation      | Verdict                               |
| -------------- | ------------------------------------- |
| above +2.5%    | `FAIL` (`high-deviation`)             |
| −2.5% to +2.5% | `PASS` (`within-spec`)                |
| −5% to −2.5%   | `QUALIFIED_PENDING` (`low-deviation`) |
| below −5%      | `FAIL` (`ratio-collapse`)             |

## Assumptions and limits

- Loop gas is a steady-state idealisation. Real loops lag the setpoint.
- `hypoxicFloor` uses `HYPOXIC_PPO2 = 0.16` ata by default. Some agencies use 0.18. It returns the shallowest depth where the diluent is breathable, or 0 at the surface.
- `scrLoopFo2` throws if the supply rate does not exceed the metabolic rate, and is floored at 0.
- Cell classification has ambient limits per brand: Aii 10 to 14 mV and AST 9 to 14 mV. Above the ceiling is a `FAIL`. Below the manufacturer floor is an `ambientFlag: 'low'` caution and the verdict still comes from the ratio. Below an absolute floor of 8 mV is a `FAIL`.
- Greenflash is a solid-state optical sensor, so the ratio test does not apply and `classifyO2Cell` returns `null`.

## Sources

- SCR mass balance: the standard steady-state SCR mass balance (for example Nuckols et al., US Navy SCR analyses).
- Hypoxic floor: a commonly cited floor in IANTD and TDI trimix standards (some agencies use 0.18).
- O₂ cell classification: implemented from the maintainer's classification rules. The 8 mV floor reflects a known end-of-life dropout signature.

## Examples

<!-- prettier-ignore -->
```ts example
import { AIR, gas } from 'dive-math/gas'
import { effectivePpo2, loopInertFractions, hypoxicFloor, scrLoopFo2, classifyO2Cell } from 'dive-math/ccr'
effectivePpo2({ setpoint: 1.3, diluent: AIR, depthM: 2 }) // => 1.2
loopInertFractions({ setpoint: 1.3, diluent: gas(0.18, 0.45), depthM: 30 }).fhe // => 0.3704
hypoxicFloor(gas(0.1, 0.7)) // => 6
scrLoopFo2({ supplyFo2: 0.5, supplyRateLpm: 15, vo2Lpm: 1 }) // => 0.4643
classifyO2Cell({ brand: 'Aii', ambientMv: 11, o2Mv: 50 })?.status === 'QUALIFIED_PENDING' // => true
```

## API

See the [ccr API reference](/api/ccr/).
