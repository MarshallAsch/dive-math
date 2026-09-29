import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
	barToPsi,
	cfmToLpm,
	cToF,
	cToK,
	cuftToLitres,
	fromBar,
	fromCelsius,
	fromLitres,
	fromLpm,
	fromMeters,
	ftToM,
	FT_PER_M,
	fToC,
	kToC,
	KELVIN_OFFSET,
	L_PER_CUFT,
	litresToCuft,
	lpmToCfm,
	mToFt,
	psiToBar,
	PSI_PER_BAR,
	toBar,
	toCelsius,
	toLitres,
	toLpm,
	toMeters,
} from './units'

describe('constants', () => {
	// NIST SP 811 Appendix B: 1 psi = 6.894757e3 Pa → 1 bar = 14.5037738 psi.
	it('PSI_PER_BAR', () => expect(PSI_PER_BAR).toBe(14.5037738))
	// NIST SP 811: 1 ft³ = 2.831685e-2 m³ (exact: 0.028316846592).
	it('L_PER_CUFT', () => expect(L_PER_CUFT).toBe(28.3168466))
	// International foot = 0.3048 m exactly → 3.280839895 ft/m.
	it('FT_PER_M', () => expect(FT_PER_M).toBeCloseTo(1 / 0.3048, 9))
	it('KELVIN_OFFSET', () => expect(KELVIN_OFFSET).toBe(273.15))
})

describe('direct conversions', () => {
	it('3000 psi = 206.8427 bar (AL80 service pressure)', () =>
		expect(psiToBar(3000)).toBeCloseTo(206.8427, 4))
	it('200 bar = 2900.75 psi', () =>
		expect(barToPsi(200)).toBeCloseTo(2900.75, 2))
	it('100 ft = 30.48 m exactly', () => expect(ftToM(100)).toBeCloseTo(30.48, 9))
	it('30 m = 98.4252 ft', () => expect(mToFt(30)).toBeCloseTo(98.4252, 4))
	it('80 cuft = 2265.35 L', () =>
		expect(cuftToLitres(80)).toBeCloseTo(2265.35, 2))
	it('1000 L = 35.3147 cuft', () =>
		expect(litresToCuft(1000)).toBeCloseTo(35.3147, 4))
	it('1 cfm = 28.3168 lpm', () => expect(cfmToLpm(1)).toBeCloseTo(28.3168, 4))
	it('28.3168466 lpm = 1 cfm', () =>
		expect(lpmToCfm(28.3168466)).toBeCloseTo(1, 9))
	it('water freezes at 32 °F', () => expect(cToF(0)).toBe(32))
	it('-40 is the same in °C and °F', () => expect(fToC(-40)).toBe(-40))
	it('20 °C = 293.15 K', () => expect(cToK(20)).toBeCloseTo(293.15, 12))
	it('0 K = -273.15 °C', () => expect(kToC(0)).toBe(-273.15))
})

describe('tagged conversions', () => {
	it('metric units are identity', () => {
		expect(toBar(123, 'bar')).toBe(123)
		expect(fromBar(123, 'bar')).toBe(123)
		expect(toMeters(9, 'm')).toBe(9)
		expect(fromMeters(9, 'm')).toBe(9)
		expect(toLitres(12, 'l')).toBe(12)
		expect(fromLitres(12, 'l')).toBe(12)
		expect(toLpm(40, 'lpm')).toBe(40)
		expect(fromLpm(40, 'lpm')).toBe(40)
		expect(toCelsius(15, 'C')).toBe(15)
		expect(fromCelsius(15, 'C')).toBe(15)
	})
	it('imperial units convert', () => {
		expect(toBar(3000, 'psi')).toBeCloseTo(206.8427, 4)
		expect(fromBar(200, 'psi')).toBeCloseTo(2900.75, 2)
		expect(toMeters(100, 'ft')).toBeCloseTo(30.48, 9)
		expect(fromMeters(30, 'ft')).toBeCloseTo(98.4252, 4)
		expect(toLitres(80, 'cf')).toBeCloseTo(2265.35, 2)
		expect(fromLitres(2265.35, 'cf')).toBeCloseTo(80, 3)
		expect(toLpm(1, 'cfm')).toBeCloseTo(28.3168, 4)
		expect(fromLpm(28.3168466, 'cfm')).toBeCloseTo(1, 9)
		expect(toCelsius(212, 'F')).toBeCloseTo(100, 12)
		expect(fromCelsius(100, 'F')).toBeCloseTo(212, 12)
	})
})

// Review Focus #5: UI re-edits must not drift.
describe('round trips (property)', () => {
	const value = fc.double({ min: -1e6, max: 1e6, noNaN: true })
	const close = (a: number, b: number) =>
		Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b))
	it.each([
		['psi', (v: number) => barToPsi(psiToBar(v))],
		['ft', (v: number) => mToFt(ftToM(v))],
		['cf', (v: number) => litresToCuft(cuftToLitres(v))],
		['cfm', (v: number) => lpmToCfm(cfmToLpm(v))],
		['F', (v: number) => cToF(fToC(v))],
		['K', (v: number) => cToK(kToC(v))],
	])('%s', (_name, roundTrip) => {
		fc.assert(fc.property(value, (v) => close(roundTrip(v), v)))
	})
})

describe('ported: fill-station', () => {
	it('converts pressure psi <-> bar', () => {
		expect(toBar(145.037738, 'psi')).toBeCloseTo(10, 4)
		expect(toBar(10, 'bar')).toBe(10)
		expect(fromBar(10, 'psi')).toBeCloseTo(145.037738, 3)
		expect(fromBar(10, 'bar')).toBe(10)
	})
	it('converts depth ft <-> m', () => {
		expect(toMeters(33, 'ft')).toBeCloseTo(10.0584, 3)
		expect(toMeters(10, 'm')).toBe(10)
		expect(fromMeters(10, 'ft')).toBeCloseTo(32.8084, 3)
	})
	it('converts litres back to the display unit', () => {
		expect(fromLitres(28.3168466, 'cf')).toBeCloseTo(1, 4)
		expect(fromLitres(5, 'l')).toBe(5)
	})
	it('cf → litres, l identity', () => {
		expect(toLitres(1, 'cf')).toBeCloseTo(28.3168466, 6)
		expect(toLitres(50, 'l')).toBe(50)
	})
	it('converts flow to litres-per-minute', () => {
		expect(toLpm(1, 'cfm')).toBeCloseTo(28.3168, 3)
		expect(toLpm(10, 'lpm')).toBe(10)
	})
	it('converts litres-per-minute back to the display unit', () => {
		expect(fromLpm(28.3168466, 'cfm')).toBeCloseTo(1, 4)
		expect(fromLpm(10, 'lpm')).toBe(10)
	})
	it('converts F to C and back', () => {
		expect(toCelsius(32, 'F')).toBeCloseTo(0, 6)
		expect(toCelsius(212, 'F')).toBeCloseTo(100, 6)
		expect(fromCelsius(0, 'F')).toBeCloseTo(32, 6)
	})
	it('is identity for celsius', () => {
		expect(toCelsius(20, 'C')).toBe(20)
		expect(fromCelsius(20, 'C')).toBe(20)
	})
})

describe('reference cases', () => {
	it('converts metres to feet', () => {
		expect(mToFt(42).toFixed(1)).toBe('137.8')
	})
	it('converts feet to metres', () => {
		expect(ftToM(100).toFixed(1)).toBe('30.5')
	})
	it('length round-trips within a millimetre', () => {
		expect(ftToM(mToFt(37))).toBeCloseTo(37, 6)
	})
	it('converts bar to psi', () => {
		// full-precision constants
		expect(barToPsi(207)).toBeCloseTo(3002.281, 3)
	})
	it('converts psi to bar', () => {
		expect(psiToBar(500).toFixed(1)).toBe('34.5')
	})
	it('pressure round-trips', () => {
		expect(psiToBar(barToPsi(182))).toBeCloseTo(182, 6)
	})
	it('converts celsius to fahrenheit', () => {
		expect(Math.round(cToF(20))).toBe(68)
	})
	it('converts fahrenheit to celsius', () => {
		expect(fToC(68).toFixed(1)).toBe('20.0')
	})
})
