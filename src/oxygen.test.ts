import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
	CNS_HALF_LIFE_MIN,
	CNS_TABLE,
	cnsLimitMinutes,
	dailyExposure,
	segmentCns,
	segmentOtu,
} from './oxygen'

describe('CNS (NOAA single-exposure limits)', () => {
	// NOAA Diving Manual, oxygen exposure limits table.
	it.each([
		[0.6, 720],
		[1.0, 300],
		[1.2, 210],
		[1.4, 150],
		[1.5, 120],
		[1.6, 45],
	])('%s ata → %s min', (p, min) => expect(cnsLimitMinutes(p)).toBe(min))
	it('interpolates linearly', () =>
		expect(cnsLimitMinutes(1.45)).toBeCloseTo(135, 9))
	it('is unlimited below 0.6', () =>
		expect(cnsLimitMinutes(0.5)).toBe(Infinity))
	it('clamps above 1.6 to 45 min', () => expect(cnsLimitMinutes(1.8)).toBe(45))
	it('limits never increase with ppO₂ (property)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0.6, max: 1.6, noNaN: true }),
				fc.double({ min: 0.6, max: 1.6, noNaN: true }),
				(a, b) => (a <= b ? cnsLimitMinutes(a) >= cnsLimitMinutes(b) : true),
			),
		)
	})
	it('segmentCns: 30 min at 1.4 = 20%', () =>
		expect(segmentCns({ ppo2: 1.4, minutes: 30 })).toBeCloseTo(20, 12))
	it('segmentCns below 0.6 is 0', () =>
		expect(segmentCns({ ppo2: 0.5, minutes: 600 })).toBe(0))
	it('table is sorted', () => {
		for (let i = 1; i < CNS_TABLE.length; i++)
			expect(CNS_TABLE[i]![0]).toBeGreaterThan(CNS_TABLE[i - 1]![0])
	})
	it('rejects bad input', () => {
		expect(() => cnsLimitMinutes(NaN)).toThrow(RangeError)
		expect(() => segmentCns({ ppo2: 1.4, minutes: -1 })).toThrow(RangeError)
	})
})

describe('OTU (NOAA/Lambertsen power formula)', () => {
	// 30 × ((1.4 − 0.5)/0.5)^0.83.
	it('30 min at 1.4 = 48.86 OTU', () =>
		expect(segmentOtu({ ppo2: 1.4, minutes: 30 })).toBeCloseTo(48.8649, 4))
	it('is 0 at or below 0.5', () =>
		expect(segmentOtu({ ppo2: 0.5, minutes: 60 })).toBe(0))
})

describe('dailyExposure', () => {
	it('decays CNS with a 90-minute surface half-time', () => {
		expect(CNS_HALF_LIFE_MIN).toBe(90)
		const r = dailyExposure([
			{ type: 'dive', ppo2: 1.4, minutes: 30 },
			{ type: 'surface', minutes: 90 },
			{ type: 'dive', ppo2: 1.4, minutes: 30 },
		])
		expect(r.endCnsPercent).toBeCloseTo(30, 9)
		expect(r.peakCnsPercent).toBeCloseTo(30, 9)
		expect(r.totalOtu).toBeCloseTo(2 * 48.8649, 3)
		expect(r.perDive).toHaveLength(2)
	})
	it('an empty day is all zeros', () =>
		expect(dailyExposure([])).toEqual({
			peakCnsPercent: 0,
			endCnsPercent: 0,
			totalOtu: 0,
			perDive: [],
		}))
})

describe('ported: fill-station', () => {
	describe('cnsLimitMinutes', () => {
		it('matches the NOAA table at exact points', () => {
			expect(cnsLimitMinutes(1.4)).toBe(150)
			expect(cnsLimitMinutes(1.6)).toBe(45)
		})
		it('interpolates between table rows', () => {
			expect(cnsLimitMinutes(1.35)).toBeCloseTo(165, 0)
		})
		it('has no limit below 0.6', () => {
			expect(cnsLimitMinutes(0.5)).toBe(Infinity)
		})
	})

	describe('segmentCns / segmentOtu', () => {
		it('computes CNS percent from time and limit', () => {
			expect(segmentCns({ ppo2: 1.4, minutes: 100 })).toBeCloseTo(66.67, 1)
		})
		it('computes OTU from the REPEX power law', () => {
			expect(segmentOtu({ ppo2: 1.4, minutes: 100 })).toBeCloseTo(162.88, 1)
		})
		it('accrues no OTU at or below ppO2 0.5', () => {
			expect(segmentOtu({ ppo2: 0.5, minutes: 60 })).toBe(0)
		})
	})

	describe('dailyExposure', () => {
		it('sums a single dive', () => {
			const r = dailyExposure([{ type: 'dive', ppo2: 1.4, minutes: 75 }])
			expect(r.peakCnsPercent).toBeCloseTo(50, 1)
			expect(r.endCnsPercent).toBeCloseTo(50, 1)
			expect(r.perDive).toHaveLength(1)
		})
		it('decays CNS across a surface interval (90-min half-time)', () => {
			const r = dailyExposure([
				{ type: 'dive', ppo2: 1.4, minutes: 75 },
				{ type: 'surface', minutes: 90 },
				{ type: 'dive', ppo2: 1.4, minutes: 75 },
			])
			// after dive1: 50; after 90-min SI: 25; after dive2: 75
			expect(r.endCnsPercent).toBeCloseTo(75, 1)
			expect(r.peakCnsPercent).toBeCloseTo(75, 1)
			// OTU is additive (no surface decay)
			expect(r.totalOtu).toBeCloseTo(
				2 * segmentOtu({ ppo2: 1.4, minutes: 75 }),
				4,
			)
		})
	})
})
