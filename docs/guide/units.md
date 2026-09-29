# Units

## What it's for

The library works in metric internally: bar, metres, litres, degrees Celsius and litres per minute. The `units` module converts imperial input and output at the edges of your app. Conversions are plain arithmetic and do not validate their input.

## Formulas

$$p_{psi} = 14.5037738\,p_{bar}$$

$$d_{ft} = 3.280839895\,d_m$$

$$V_L = 28.3168466\,V_{ft^3}$$

$$T_F = \tfrac95 T_C + 32$$

- $p_{psi}$, $p_{bar}$: pressure in psi and bar.
- $d_{ft}$, $d_m$: depth in feet and metres.
- $V_L$, $V_{ft^3}$: volume in litres and cubic feet. Flow rates use the same factor (L/min and cu ft/min).
- $T_F$, $T_C$: temperature in degrees Fahrenheit and Celsius. Kelvin is $T_K = T_C + 273.15$.

## Assumptions and limits

- Conversions do not validate input. NaN in gives NaN out.
- Every conversion is available in both directions, as named helpers (`psiToBar`, `mToFt`, `cuftToLitres`) and as unit-string helpers (`toBar`, `fromMeters`, `toLpm`).
- Unit strings are `'bar' | 'psi'`, `'m' | 'ft'`, `'l' | 'cf'`, `'lpm' | 'cfm'` and `'C' | 'F'`.

## Sources

- psi per bar: NIST SP 811 Appendix B (1 psi = 6.894757 kPa).
- Litres per cubic foot: NIST SP 811 (1 ft³ = 28.316846592 L).
- Feet per metre: the international foot, exactly 0.3048 m.
- Kelvin offset: SI definition.

## Examples

<!-- prettier-ignore -->
```ts example
import { psiToBar, cuftToLitres, toLpm } from '@marshallasch/dive-math/units'
psiToBar(3000) // => 206.84
cuftToLitres(80) // => 2265.35
toLpm(1.5, 'cfm') // => 42.48
```

## API

See the [units API reference](/api/units/).
