import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
	applyOverfill,
	effectiveHotFill,
	HEAT_COEFF,
	hotTarget,
	removeOverfill,
	settledPressure,
	tempRise,
} from './temperature'

describe('hot fill (Gay-Lussac, absolute pressure)', () => {
	// (230 + 1.01325) × 293.15 / 313.15 − 1.01325.
	it('230 bar at 40 °C settles to 215.25 bar at 20 °C', () =>
		expect(settledPressure(230, 40, 20)).toBeCloseTo(215.2458, 4))
	it('hotTarget inverts settledPressure (property)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0, max: 300, noNaN: true }),
				fc.double({ min: -20, max: 80, noNaN: true }),
				fc.double({ min: -20, max: 80, noNaN: true }),
				(bar, hot, cold) => {
					// settledPressure takes a gauge pressure (>= 0); a fill colder
					// than the settled temperature can need a sub-atmospheric one.
					const hotBar = hotTarget(bar, hot, cold)
					fc.pre(hotBar >= 0)
					return Math.abs(settledPressure(hotBar, hot, cold) - bar) < 1e-9
				},
			),
		)
	})
	it('rejects temperatures at or below absolute zero', () => {
		expect(() => settledPressure(200, -273.15, 20)).toThrow(RangeError)
		expect(() => hotTarget(200, 40, -300)).toThrow(RangeError)
	})
	// MIGRATION.md
	it('rejects a non-physical hot temperature instead of passing through', () => {
		expect(() => settledPressure(200, -300, 20)).toThrow(RangeError)
		expect(() => hotTarget(200, 0 - 273.15, 20)).toThrow(RangeError)
	})
	it('overfill is a flat percentage', () => {
		expect(applyOverfill(200, 10)).toBeCloseTo(220, 12)
		expect(removeOverfill(220, 10)).toBeCloseTo(200, 12)
		expect(() => applyOverfill(200, -100)).toThrow(RangeError)
	})
	it('tempRise is linear in fill rate', () => {
		expect(HEAT_COEFF).toBe(0.7)
		expect(tempRise(20)).toBeCloseTo(14, 12)
		expect(tempRise(0)).toBe(0)
		expect(tempRise(-5)).toBe(0)
	})
	it('effectiveHotFill dispatches by mode', () => {
		const base = { overfillPct: 10, fillTempC: 40, settledTempC: 20 }
		expect(effectiveHotFill(200, { ...base, mode: 'off' })).toBe(200)
		expect(effectiveHotFill(200, { ...base, mode: 'simple' })).toBeCloseTo(
			220,
			12,
		)
		expect(effectiveHotFill(200, { ...base, mode: 'detailed' })).toBe(
			hotTarget(200, 40, 20),
		)
	})
})

describe('temperature (ported)', () => {
	it('a hot fill settles to a lower pressure when it cools', () => {
		const cold = settledPressure(200, 40, 20)
		expect(cold).toBeLessThan(200)
		expect(cold).toBeCloseTo((201.013 * 293.15) / 313.15 - 1.01325, 2)
	})
	it('hotTarget is the inverse of settledPressure', () => {
		expect(settledPressure(hotTarget(200, 40, 20), 40, 20)).toBeCloseTo(200, 4)
	})
	it('no change when fill and settled temps are equal', () => {
		expect(settledPressure(200, 25, 25)).toBeCloseTo(200, 6)
	})
	it('overfill round-trips', () => {
		expect(removeOverfill(applyOverfill(200, 10), 10)).toBeCloseTo(200, 6)
	})
	it('tempRise is linear (0.7 °C per bar/min)', () => {
		expect(tempRise(40)).toBeCloseTo(28, 6)
	})
	it('detailed mode is hotter than cold when fill is warmer', () => {
		const hot = effectiveHotFill(200, {
			mode: 'detailed',
			overfillPct: 10,
			fillTempC: 40,
			settledTempC: 20,
		})
		expect(hot).toBeGreaterThan(200)
		expect(hot).toBeCloseTo((201.013 * 313.15) / 293.15 - 1.01325, 2)
	})
})

describe('gauge pressure guards', () => {
	it('settledPressure rejects a negative hotBar', () =>
		expect(() => settledPressure(-1, 40, 20)).toThrow(/hotBar/))
	it('hotTarget rejects a negative coldBar', () =>
		expect(() => hotTarget(-1, 40, 20)).toThrow(/coldBar/))
	it('zero gauge is allowed', () =>
		expect(settledPressure(0, 20, 20)).toBeCloseTo(0, 12))
})
