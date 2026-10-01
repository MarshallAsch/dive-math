# dive-math

Previously published as `@marshallasch/dive-math` (0.1.0); the package is now unscoped.

## 0.2.0

### Minor Changes

- cd8bc06: Add `dive-math/deco`: a Bühlmann ZH-L16C decompression planner with Baker gradient factors — multi-level and repeat dives, open circuit and CCR (low/high setpoints), CCR bailout planning, CNS/OTU, gas use and gas-density warnings. Validated against DecoTengu's worked example, Baker's "Deep Stops" schedule, GasPlanner's tissue model and an independent clean-room reference. Reference implementation — not a dive computer.

## 0.1.0

### Minor Changes

- 0b4fde6: Initial release: units, pressure, altitude, gas (MOD/END/EAD/best mix), density, real-gas Z,
  cylinders, equipment, blending, fill (cascade/booster/hot fill), oxygen (CNS/OTU), planning and
  CCR/SCR math.
