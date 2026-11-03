---
'dive-math': patch
---

Bound planner inputs so hostile or nonsensical values fail fast instead of running away: at most 1000 `levels` (`MAX_LEVELS`), `Level.depthM` ≤ 1000 m (`MAX_DEPTH_M`), `ascentRate` / `descentRate` ≥ 0.1 m/min (`MIN_RATE_M_PER_MIN`), `stopInterval` ≥ 0.1 m (`MIN_STOP_INTERVAL_M`), `switchMinutes` ≤ `MAX_DECO_MINUTES`, air-break `onMinutes` / `breakMinutes` ≥ 1 min (`MIN_BREAK_CLOCK_MINUTES`, was 1 s), and `boosterFillProfile` `steps` ≤ 10 000 (`MAX_PROFILE_STEPS`); out-of-range values throw `RangeError`. Gas-switch holds now count toward `MAX_DECO_MINUTES` (`deco-too-long`). Per-segment CNS is computed in one pass via the new `cnsRunningTotals` (same results). `HARD_MAX_DENSITY` is now 6.2 g/L (was 6.3), per Anthony & Mitchell 2016.
