import { describe, expect, it } from 'vitest'
import {
	CNS_DAILY_TABLE,
	cnsLimitMinutes,
	cnsTotals,
	dailyExposure,
	segmentCns,
} from './oxygen'
import { ataAtDepth } from './pressure'

const hoyt = { limits: 'hoyt-2025' } as const

describe('NOAA 24-hour day limits', () => {
	// NOAA Diving Manual (1991), 24 h column (Hoyt 2025, Table 1).
	it.each([
		[0.6, 720],
		[1.0, 300],
		[1.1, 270],
		[1.2, 240],
		[1.3, 210],
		[1.4, 180],
		[1.5, 180],
		[1.6, 150],
	])('%s ata → %s min', (p, min) =>
		expect(cnsLimitMinutes(p, { daily: true })).toBe(min),
	)
	it('table is sorted and never increases', () => {
		for (let i = 1; i < CNS_DAILY_TABLE.length; i++) {
			expect(CNS_DAILY_TABLE[i]![0]).toBeGreaterThan(CNS_DAILY_TABLE[i - 1]![0])
			expect(CNS_DAILY_TABLE[i]![1]).toBeLessThanOrEqual(
				CNS_DAILY_TABLE[i - 1]![1],
			)
		}
	})
})

describe('Hoyt 2025 limits', () => {
	it.each([
		[1.3, 240],
		[1.2, 240],
		[1.1, 240],
		[1.0, 300],
		[0.5, Infinity],
		[1.4, 150],
		[1.6, 45],
	])('single %s ata → %s min', (p, min) =>
		expect(cnsLimitMinutes(p, { ...hoyt, phase: 'working' })).toBe(min),
	)
	it('daily: 240 at 1.3, NOAA daily above', () => {
		expect(
			cnsLimitMinutes(1.3, { ...hoyt, phase: 'resting', daily: true }),
		).toBe(240)
		expect(
			cnsLimitMinutes(1.4, { ...hoyt, phase: 'resting', daily: true }),
		).toBe(180)
	})
	it('the same limit applies to either phase', () =>
		expect(cnsLimitMinutes(1.25, { ...hoyt, phase: 'resting' })).toBe(
			cnsLimitMinutes(1.25, { ...hoyt, phase: 'working' }),
		))
	it('1.3 computed from a depth still gets the 240 min limit', () =>
		expect(cnsLimitMinutes(ataAtDepth(3), { ...hoyt, phase: 'resting' })).toBe(
			240,
		))
	it('requires a phase', () =>
		expect(() => cnsLimitMinutes(1.3, hoyt)).toThrow(/phase/))
	it('rejects unknown limit sets', () =>
		expect(() => cnsLimitMinutes(1.3, { limits: 'bogus' as never })).toThrow(
			RangeError,
		))
	it('segmentCns passes the options through', () =>
		expect(
			segmentCns({ ppo2: 1.3, minutes: 120, ...hoyt, phase: 'working' }),
		).toBeCloseTo(50, 12))
})

describe('cnsTotals', () => {
	it('Hoyt: 240 working + 240 resting at 1.3 is 100 % / 100 %', () => {
		const t = cnsTotals(
			[
				{ ppo2: 1.3, minutes: 240, phase: 'working' },
				{ ppo2: 1.3, minutes: 240, phase: 'resting' },
			],
			hoyt,
		)
		expect(t).toEqual({
			limits: 'hoyt-2025',
			cnsPercent: 100,
			working: 100,
			resting: 100,
		})
	})
	it('Hoyt: a segment above 1.3 charges its NOAA % to its phase', () => {
		const t = cnsTotals(
			[
				{ ppo2: 1.3, minutes: 120, phase: 'resting' },
				{ ppo2: 1.6, minutes: 9, phase: 'resting' },
			],
			hoyt,
		)
		expect(t.working).toBe(0)
		expect(t.resting).toBeCloseTo(50 + 20, 12)
		expect(t.cnsPercent).toBeCloseTo(70, 12)
	})
	it('NOAA: one clock, phase ignored', () =>
		expect(
			cnsTotals([
				{ ppo2: 1.3, minutes: 90, phase: 'working' },
				{ ppo2: 1.5, minutes: 60, phase: 'resting' },
			]),
		).toEqual({ limits: 'noaa-1991', cnsPercent: 100 }))
	it('phase defaults to working', () =>
		expect(cnsTotals([{ ppo2: 1.3, minutes: 240 }], hoyt).working).toBeCloseTo(
			100,
			12,
		))
})

describe('dailyExposure daily totals', () => {
	it('NOAA: 210 min at 1.3 is 100 % of the day', () =>
		expect(
			dailyExposure([{ type: 'dive', ppo2: 1.3, minutes: 210 }]).daily
				.cnsPercent,
		).toBeCloseTo(100, 12))
	it('does not decay across surface intervals', () => {
		const r = dailyExposure([
			{ type: 'dive', ppo2: 1.3, minutes: 105 },
			{ type: 'surface', minutes: 600 },
			{ type: 'dive', ppo2: 1.3, minutes: 105 },
		])
		expect(r.daily.cnsPercent).toBeCloseTo(100, 12)
		expect(r.endCnsPercent).toBeLessThan(r.daily.cnsPercent)
	})
	it('Hoyt: per-dive and daily phase split', () => {
		const r = dailyExposure(
			[
				{ type: 'dive', ppo2: 1.3, minutes: 120, phase: 'working' },
				{ type: 'dive', ppo2: 1.3, minutes: 120, phase: 'resting' },
				{ type: 'surface', minutes: 120 },
				{ type: 'dive', ppo2: 1.3, minutes: 120, phase: 'working' },
			],
			hoyt,
		)
		expect(r.daily).toEqual({
			limits: 'hoyt-2025',
			cnsPercent: 100,
			working: 100,
			resting: 50,
		})
		expect(r.perDive[1]).toMatchObject({ working: 0, resting: 50 })
		// The decaying clock stays on NOAA single-exposure limits.
		expect(r.perDive[0]!.cnsPercent).toBeCloseTo((120 / 180) * 100, 12)
	})
})
