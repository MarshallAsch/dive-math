/**
 * Unit conversion. The library works in metric SI (bar, m, L, °C, L/min);
 * convert imperial input/output at the UI edge with these helpers.
 * Conversions are plain arithmetic and do not validate their input.
 * @module
 */

/** psi per bar. Source: NIST SP 811 Appendix B (1 psi = 6.894757 kPa). */
export const PSI_PER_BAR = 14.5037738
/** Litres per cubic foot. Source: NIST SP 811 (1 ft³ = 28.316846592 L). */
export const L_PER_CUFT = 28.3168466
/** Feet per metre. Source: international foot, 0.3048 m exactly. */
export const FT_PER_M = 3.280839895
/** 0 °C in kelvin. Source: SI definition. */
export const KELVIN_OFFSET = 273.15

/** Pressure unit: bar or psi. */
export type PressureUnit = 'bar' | 'psi'
/** Depth unit: metres or feet. */
export type DepthUnit = 'm' | 'ft'
/** Volume unit: litres or cubic feet. */
export type VolumeUnit = 'l' | 'cf'
/** Flow-rate unit: litres or cubic feet per minute. */
export type FlowUnit = 'lpm' | 'cfm'
/** Temperature unit: Celsius or Fahrenheit. */
export type TempUnit = 'C' | 'F'

/** bar → psi. @example barToPsi(200) // 2900.75 */
export const barToPsi = (bar: number): number => bar * PSI_PER_BAR
/** psi → bar. @example psiToBar(3000) // 206.84 */
export const psiToBar = (psi: number): number => psi / PSI_PER_BAR
/** metres → feet. @example mToFt(30) // 98.43 */
export const mToFt = (m: number): number => m * FT_PER_M
/** feet → metres. @example ftToM(100) // 30.48 */
export const ftToM = (ft: number): number => ft / FT_PER_M
/** litres → cubic feet. @example litresToCuft(1000) // 35.31 */
export const litresToCuft = (l: number): number => l / L_PER_CUFT
/** cubic feet → litres. @example cuftToLitres(80) // 2265.35 */
export const cuftToLitres = (cf: number): number => cf * L_PER_CUFT
/** L/min → cu ft/min. @example lpmToCfm(42.5) // 1.5 */
export const lpmToCfm = (lpm: number): number => lpm / L_PER_CUFT
/** cu ft/min → L/min. @example cfmToLpm(1.5) // 42.48 */
export const cfmToLpm = (cfm: number): number => cfm * L_PER_CUFT
/** °C → °F. @example cToF(20) // 68 */
export const cToF = (c: number): number => (c * 9) / 5 + 32
/** °F → °C. @example fToC(68) // 20 */
export const fToC = (f: number): number => ((f - 32) * 5) / 9
/** °C → K. @example cToK(20) // 293.15 */
export const cToK = (c: number): number => c + KELVIN_OFFSET
/** K → °C. @example kToC(293.15) // 20 */
export const kToC = (k: number): number => k - KELVIN_OFFSET

/** Any pressure unit → bar. @example toBar(3000, 'psi') // 206.84 */
export const toBar = (value: number, unit: PressureUnit): number =>
	unit === 'psi' ? psiToBar(value) : value
/** bar → any pressure unit. @example fromBar(200, 'psi') // 2900.75 */
export const fromBar = (bar: number, unit: PressureUnit): number =>
	unit === 'psi' ? barToPsi(bar) : bar
/** Any depth unit → metres. @example toMeters(100, 'ft') // 30.48 */
export const toMeters = (value: number, unit: DepthUnit): number =>
	unit === 'ft' ? ftToM(value) : value
/** metres → any depth unit. @example fromMeters(30, 'ft') // 98.43 */
export const fromMeters = (m: number, unit: DepthUnit): number =>
	unit === 'ft' ? mToFt(m) : m
/** Any volume unit → litres. @example toLitres(80, 'cf') // 2265.35 */
export const toLitres = (value: number, unit: VolumeUnit): number =>
	unit === 'cf' ? cuftToLitres(value) : value
/** litres → any volume unit. @example fromLitres(2265.35, 'cf') // 80 */
export const fromLitres = (l: number, unit: VolumeUnit): number =>
	unit === 'cf' ? litresToCuft(l) : l
/** Any flow unit → L/min. @example toLpm(1.5, 'cfm') // 42.48 */
export const toLpm = (value: number, unit: FlowUnit): number =>
	unit === 'cfm' ? cfmToLpm(value) : value
/** L/min → any flow unit. @example fromLpm(42.5, 'cfm') // 1.5 */
export const fromLpm = (lpm: number, unit: FlowUnit): number =>
	unit === 'cfm' ? lpmToCfm(lpm) : lpm
/** Any temperature unit → °C. @example toCelsius(68, 'F') // 20 */
export const toCelsius = (value: number, unit: TempUnit): number =>
	unit === 'F' ? fToC(value) : value
/** °C → any temperature unit. @example fromCelsius(20, 'F') // 68 */
export const fromCelsius = (c: number, unit: TempUnit): number =>
	unit === 'F' ? cToF(c) : c
