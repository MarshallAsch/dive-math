# Equipment

## What it's for

Reference data for fill-station and dive tools: gas booster presets you can feed into the [fill](./fill) functions, and a list of common gas mixes.

## Boosters

`BOOSTERS` lists air-driven gas boosters.

| Model                      | Ratio | Two-stage | Drive swept (L/stroke) | Max strokes/min |
| -------------------------- | ----: | :-------: | ---------------------: | --------------: |
| Haskel AG-30               |  30:1 |    no     |                  1.535 |              60 |
| Haskel AG-50               |  50:1 |    no     |                  1.535 |              60 |
| Haskel AG-62               |  62:1 |    no     |                  1.535 |              60 |
| Haskel AG-75               |  75:1 |    no     |                  1.535 |              60 |
| Haskel AG-102              | 102:1 |    no     |                  1.535 |              60 |
| Haskel AG-152              | 152:1 |    no     |                  1.535 |              60 |
| USUN XB30                  |  30:1 |    no     |                  0.942 |              60 |
| USUN XBD30 (double-acting) |  30:1 |    no     |                  0.942 |             120 |
| USUN GB40                  |  40:1 |    no     |                  2.412 |              60 |
| USUN GBD40 (double-acting) |  40:1 |    no     |                  2.412 |             120 |
| USUN GB40-OL-F (O₂)        |  40:1 |    no     |                  2.412 |              60 |
| USUN GBT 15/40 (2-stage)   |  40:1 |    yes    |                  2.412 |             120 |
| USUN SBT 15/40 (2-stage)   |  40:1 |    yes    |                  1.473 |             120 |

### How the booster data is sourced

- The ratio is the nominal pressure (area) ratio, inferred from each model designation, since the model number is the ratio by the standard naming convention.
- Sources: Haskel AG-series product pages, and USUN dive boosters.
- The USUN GBT and SBT 15/40 are two-stage (15:1 first stage, 40:1 output stage). The single-ratio model approximates them by the 40:1 output stage, so drive-gas estimates for those are rough. For other brands and models, enter custom values.
- Drive swept volume is the geometric air-drive volume per stroke (one gas delivery), so it does not depend on drive pressure. The drive air per stroke is derived at the running drive pressure.
- Total drive air over a fill is thermodynamic (roughly the receiver to supply pressure ratio) and does not depend on swept volume. Swept volume only sets the stroke rate.
- Double-acting models ("D", GBT, SBT) deliver on both strokes. The per-stroke swept volume is the same as the single-acting equivalent, and the difference is a higher maximum stroke rate.
- USUN drive bores: XB 100 mm, GB 160 mm, GBT 160 mm, SBT 125 mm, all with a 120 mm stroke.
- All six Haskel AG models share one 146 mm (5.75 in) air-drive head with a stroke of about 3.6 in (derived, plus or minus 10%), giving 1.535 L per stroke at about 60 strokes per minute. The ratio is set by the gas piston, not the drive.

## Common mixes

`COMMON_MIXES` is a list of `{ name, gas }` presets. Fractions are 0 to 1, and Air uses the library `AIR` (20.9% oxygen).

| Name           |    O₂ |   He |    N₂ |
| -------------- | ----: | ---: | ----: |
| Air            | 0.209 |    0 | 0.791 |
| EAN28          |  0.28 |    0 |  0.72 |
| EAN32          |  0.32 |    0 |  0.68 |
| EAN36          |  0.36 |    0 |  0.64 |
| EAN40          |   0.4 |    0 |   0.6 |
| EAN50          |   0.5 |    0 |   0.5 |
| EAN80          |   0.8 |    0 |   0.2 |
| Oxygen         |     1 |    0 |     0 |
| Trimix 21/35   |  0.21 | 0.35 |  0.44 |
| Trimix 18/45   |  0.18 | 0.45 |  0.37 |
| Trimix 15/55   |  0.15 | 0.55 |   0.3 |
| Trimix 12/60   |  0.12 |  0.6 |  0.28 |
| Trimix 10/70   |   0.1 |  0.7 |   0.2 |
| Helitrox 35/25 |  0.35 | 0.25 |   0.4 |

## Assumptions and limits

- Booster figures are reference values for estimates, not manufacturer guarantees. Verify against your own equipment.
- A `maxCpm` or `driveSweptL` of 0 means unknown.

## Sources

- Haskel AG-series product pages (haskel.com, fluidprocesscontrol.com), OM-3F manual and Nuvair specs for the shared drive head.
- USUN dive boosters (diverightinscuba.com/usun), u-sun.cn, made-in-china and DRIS for drive dimensions.

## Examples

<!-- prettier-ignore -->
```ts example
import { BOOSTERS, COMMON_MIXES } from 'dive-math/equipment'
BOOSTERS.length > 0 // => true
COMMON_MIXES[0].gas.fo2 // => 0.209
```

## API

See the [equipment API reference](/api/equipment/).
