# dive-math

Previously published as `@marshallasch/dive-math` (0.1.0); the package is now unscoped.

## 0.2.0

### Minor Changes

- cd8bc06: Add `dive-math/deco`: a Bühlmann ZH-L16C decompression planner with Baker gradient factors — multi-level and repeat dives, open circuit and CCR (low/high setpoints), CCR bailout planning, CNS/OTU, gas use and gas-density warnings. Validated against DecoTengu's worked example, Baker's "Deep Stops" schedule, GasPlanner's tissue model and an independent clean-room reference. Reference implementation — not a dive computer.
- 1e275bd: Oxygen exposure and air breaks: choose NOAA 1991 (default) or the Hoyt 2025 revised 1.3 ata CNS limits (240 min per working/resting phase up to 1.3 ata, one shared NOAA clock above it, warning only when both guidelines are exceeded); NOAA 24-hour day limits; REPEX multi-day OTU checks; per-segment cumulative CNS/OTU and oxygen-limit warnings on plans (with earlier same-day dives via `dayExposure`); and configurable OC/CCR air breaks during decompression, run through the tissue model.

### Patch Changes

- ba38720: Bound planner inputs so hostile or nonsensical values fail fast instead of running away: at most 1000 `levels` (`MAX_LEVELS`), `Level.depthM` ≤ 1000 m (`MAX_DEPTH_M`), `ascentRate` / `descentRate` ≥ 0.1 m/min (`MIN_RATE_M_PER_MIN`), `stopInterval` ≥ 0.1 m (`MIN_STOP_INTERVAL_M`), `switchMinutes` ≤ `MAX_DECO_MINUTES`, air-break `onMinutes` / `breakMinutes` ≥ 1 min (`MIN_BREAK_CLOCK_MINUTES`, was 1 s), and `boosterFillProfile` `steps` ≤ 10 000 (`MAX_PROFILE_STEPS`); out-of-range values throw `RangeError`. Gas-switch holds now count toward `MAX_DECO_MINUTES` (`deco-too-long`). Per-segment CNS is computed in one pass via the new `cnsRunningTotals` (same results). `HARD_MAX_DENSITY` is now 6.2 g/L (was 6.3), per Anthony & Mitchell 2016.

## 0.1.0

### Minor Changes

- 0b4fde6: Initial release: units, pressure, altitude, gas (MOD/END/EAD/best mix), density, real-gas Z,
  cylinders, equipment, blending, fill (cascade/booster/hot fill), oxygen (CNS/OTU), planning and
  CCR/SCR math.
