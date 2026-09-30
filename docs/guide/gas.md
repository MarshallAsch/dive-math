# Gas: MOD, END, best mix

## What it's for

Breathing-gas basics: oxygen partial pressure, maximum operating depth (MOD), equivalent narcotic depth (END), equivalent air depth (EAD) and the best mix for a depth.

## Formulas

$$pO_2 = F_{O_2}\,P$$

$$MOD = \left(\frac{pO_{2,max}}{F_{O_2}} - P_s\right)k_w$$

$$END_{O_2} = \big(P\,(1 - F_{He}) - P_s\big)\,k_w$$

$$END_{N_2} = EAD = \left(\frac{P\,F_{N_2}}{0.791} - P_s\right)k_w$$

Best mix for a depth:

$$F_{O_2} = \min\!\left(1, \frac{pO_2}{P}\right) \qquad F_{He} = \max\!\left(0, 1 - \frac{P_{END}}{P}\right)$$

- $F_{O_2}$, $F_{He}$, $F_{N_2}$: gas fractions, 0 to 1 (never percent).
- $P$: absolute pressure at the depth, ata. $P_s$: surface pressure, ata. $k_w$: metres per bar.
- $pO_2$: oxygen partial pressure, ata. $pO_{2,max}$: the limit you choose, ata.
- $P_{END}$: the absolute pressure at the target END depth, ata.
- $0.791$ is the nitrogen fraction of `AIR`.

## The two END models

- `'o2-narcotic'` (default): oxygen and nitrogen are narcotic, helium is not. Only the helium share is discounted, so the narcotic pressure is $P(1 - F_{He})$.
- `'n2-only'`: only nitrogen counts, compared against the nitrogen in air. This is the classic equivalent air depth, so `ead()` is `end()` with this model.

`bestMix` and `bestFhe` size helium using the O₂-narcotic model. The result never exceeds 1 in total, so helium is capped at $1 - F_{O_2}$.

## Floor at surface and negative values

END can come out negative for a helium-rich mix at shallow depth, meaning it is less narcotic than air at the surface. Pass `floorAtSurface: true` to clamp the result at the surface (0 m by default).

A negative MOD means the mix is not breathable even at the surface, because $pO_{2,max} < F_{O_2}$.

## Assumptions and limits

- Fractions are validated: each in 0..1 and `fo2 + fhe <= 1`. Nitrogen is derived.
- `AIR` is 20.9% oxygen with the remainder nitrogen (argon lumped in).
- Narcosis is modelled as a simple equivalence, not a physiological prediction.

## Sources

- `AIR` composition: NOAA Diving Manual.

## Examples

<!-- prettier-ignore -->
```ts example
import { AIR, gas, mod, end, ead, bestMix } from 'dive-math/gas'
mod(gas(0.32), 1.4) // => 33.75
end(gas(0.18, 0.45), 60, { model: 'n2-only' }) // => 22.74
ead(gas(0.32), 30) // => 24.39
end(gas(0.21, 0.35), 5, { floorAtSurface: true }) // => 0
bestMix({ depthM: 30, maxPpo2: 1.4 }).fo2 // => 0.35
mod(AIR, 1.4) // => 56.99
```

## API

See the [gas API reference](/api/gas/).
