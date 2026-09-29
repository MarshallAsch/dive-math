# Gas density

## What it's for

Breathing-gas density at depth. High density raises work of breathing, so technical divers cap it.

## Formulas

$$\rho = P\sum_i F_i\,\rho_i$$

- $\rho$: gas density at depth, g/L.
- $P$: absolute pressure at depth, ata.
- $F_i$: fraction of component $i$ (O₂, N₂, He).
- $\rho_i$: density of component $i$ at 0 °C and 1 atm: O₂ 1.42897, N₂ 1.2506, He 0.17846 g/L.

Limits used by the library:

- Recommended maximum: 5.2 g/L.
- Hard maximum: 6.3 g/L.

`depthForDensity` inverts the formula for a density target.

## Assumptions and limits

- Ideal gas: density is proportional to pressure. There is no compressibility correction.
- Component densities are taken at 0 °C, not at a breathing temperature.
- The limits are exported as `RECOMMENDED_MAX_DENSITY` and `HARD_MAX_DENSITY`. The library does not enforce them.

## Sources

- Component densities: CRC Handbook of Chemistry and Physics.
- 5.2 and 6.3 g/L limits: Anthony & Mitchell, Rebreathers and Scientific Diving (2016).

## Examples

<!-- prettier-ignore -->
```ts example
import { AIR } from '@marshallasch/dive-math/gas'
import { densityAtDepth, depthForDensity } from '@marshallasch/dive-math/density'
densityAtDepth(AIR, 30) // => 5.15
depthForDensity(AIR, 5.2) // => 30.38
```

## API

See the [density API reference](/api/density/).
