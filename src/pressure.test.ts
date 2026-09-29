import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Water } from './types'
import {
	absToGauge,
	ATM_BAR,
	ataAtDepth,
	depthAtAta,
	gaugeToAbs,
	METERS_PER_BAR,
	metersPerBar,
	SURFACE_ATA,
	surfacePressure,
} from './pressure'

describe('constants', () => {
	it('salt water is 10 m/bar, fresh 10.3 m/bar', () => {
		expect(METERS_PER_BAR).toEqual({ salt: 10, fresh: 10.3 })
		expect(metersPerBar()).toBe(10)
		expect(metersPerBar('fresh')).toBe(10.3)
	})
	// ISO 2533 standard atmosphere: 101 325 Pa.
	it('ATM_BAR', () => expect(ATM_BAR).toBe(1.01325))
	it('SURFACE_ATA', () => expect(SURFACE_ATA).toBe(1))
	it('rejects unknown water', () =>
		expect(() => metersPerBar('brackish' as Water)).toThrow(RangeError))
})

describe('surfacePressure', () => {
	it('defaults to 1 ata', () => expect(surfacePressure()).toBe(1))
	it('uses the override', () =>
		expect(surfacePressure({ surfacePressure: 0.8 })).toBe(0.8))
	it('rejects non-positive overrides', () =>
		expect(() => surfacePressure({ surfacePressure: 0 })).toThrow(RangeError))
})

describe('ataAtDepth', () => {
	it('is 1 ata at the surface', () => expect(ataAtDepth(0)).toBe(1))
	it('is 4 ata at 30 m salt', () => expect(ataAtDepth(30)).toBe(4))
	it('is 4 ata at 30.9 m fresh', () =>
		expect(ataAtDepth(30.9, { water: 'fresh' })).toBeCloseTo(4, 12))
	it('adds to a custom surface pressure', () =>
		expect(ataAtDepth(10, { surfacePressure: 0.8 })).toBeCloseTo(1.8, 12))
	it('rejects negative depth', () =>
		expect(() => ataAtDepth(-1)).toThrow(RangeError))
	it('rejects NaN depth', () => expect(() => ataAtDepth(NaN)).toThrow(/depthM/))
})

describe('depthAtAta', () => {
	it('is 30 m at 4 ata salt', () => expect(depthAtAta(4)).toBe(30))
	it('is negative below surface pressure', () =>
		expect(depthAtAta(0.5)).toBe(-5))
	it('inverts ataAtDepth (property)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0, max: 500, noNaN: true }),
				fc.constantFrom<Water>('salt', 'fresh'),
				fc.double({ min: 0.5, max: 1.1, noNaN: true }),
				(d, water, sp) => {
					const opts = { water, surfacePressure: sp }
					return Math.abs(depthAtAta(ataAtDepth(d, opts), opts) - d) < 1e-9
				},
			),
		)
	})
	it('is monotonic in depth (property)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0, max: 500, noNaN: true }),
				fc.double({ min: 0, max: 500, noNaN: true }),
				(a, b) => (a <= b ? ataAtDepth(a) <= ataAtDepth(b) : true),
			),
		)
	})
})

describe('gauge ↔ absolute', () => {
	it('0 bar gauge = 1.01325 bar absolute', () =>
		expect(gaugeToAbs(0)).toBe(1.01325))
	it('round trips', () =>
		expect(absToGauge(gaugeToAbs(200))).toBeCloseTo(200, 12))
	it('rejects NaN', () => expect(() => gaugeToAbs(NaN)).toThrow(RangeError))
	it('rejects NaN in absToGauge', () =>
		expect(() => absToGauge(NaN)).toThrow(RangeError))
})

describe('reference cases', () => {
	it('is 1 ata at the surface', () => {
		expect(ataAtDepth(0)).toBe(1)
	})
	it('adds one atmosphere per 10 metres', () => {
		expect(ataAtDepth(30)).toBe(4)
	})
	it('inverts back to depth', () => {
		expect(depthAtAta(4.375)).toBeCloseTo(33.75, 6)
	})
})

describe('ported: fill-station', () => {
	it('uses 10 m for salt and 10.3 m for fresh', () => {
		expect(metersPerBar('salt')).toBe(10)
		expect(metersPerBar('fresh')).toBe(10.3)
	})
	it('is 1 ata at the surface', () => {
		expect(ataAtDepth(0, { water: 'salt' })).toBe(1)
	})
	it('adds 1 ata per 10 m in salt water', () => {
		expect(ataAtDepth(30, { water: 'salt' })).toBeCloseTo(4, 6)
	})
	it('uses 10.3 m per bar in fresh water', () => {
		expect(ataAtDepth(10.3, { water: 'fresh' })).toBeCloseTo(2, 6)
	})
})
