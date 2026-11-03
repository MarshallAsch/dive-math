import { describe, expect, it } from 'vitest'
import {
	CNS_DAILY_TABLE,
	REPEX_TABLE,
	cnsLimitMinutes,
	cnsTotals,
	dailyExposure,
	repex,
	repexAllowance,
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
		[1.0, 240],
		[0.6, 240],
		[0.5, Infinity],
		[1.4, 150],
		[1.6, 45],
	])('single %s ata → %s min', (p, min) =>
		expect(cnsLimitMinutes(p, { ...hoyt, phase: 'working' })).toBe(min),
	)
	it('daily: 240 at and below 1.3, NOAA daily above', () => {
		expect(
			cnsLimitMinutes(1.3, { ...hoyt, phase: 'resting', daily: true }),
		).toBe(240)
		expect(
			cnsLimitMinutes(1.0, { ...hoyt, phase: 'resting', daily: true }),
		).toBe(240)
		expect(
			cnsLimitMinutes(0.55, { ...hoyt, phase: 'resting', daily: true }),
		).toBe(Infinity)
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

	it('Hoyt: above 1.3 one shared NOAA clock counts toward both phases', () => {
		const t = cnsTotals(
			[
				{ ppo2: 1.3, minutes: 120, phase: 'resting' },
				{ ppo2: 1.6, minutes: 9, phase: 'resting' },
			],
			hoyt,
		)
		expect(t.working).toBeCloseTo(20, 12)
		expect(t.resting).toBeCloseTo(50 + 20, 12)
		expect(t.cnsPercent).toBeCloseTo(70, 12)
	})
	it('Hoyt: no change above 1.3 (150 + 150 min at 1.4 is 200 %, as NOAA)', () => {
		const exposures = [
			{ ppo2: 1.4, minutes: 150, phase: 'working' },
			{ ppo2: 1.4, minutes: 150, phase: 'resting' },
		] as const
		const t = cnsTotals(exposures, hoyt)
		expect(t.cnsPercent).toBeCloseTo(200, 12)
		expect(t.working).toBeCloseTo(200, 12)
		expect(t.resting).toBeCloseTo(200, 12)
		expect(t.cnsPercent).toBeCloseTo(cnsTotals(exposures).cnsPercent, 12)
	})
	it('Hoyt: the 1.3 guideline applied below 1.3 (300 + 300 min at 1.0 is 125 %)', () => {
		const t = cnsTotals(
			[
				{ ppo2: 1.0, minutes: 300, phase: 'working' },
				{ ppo2: 1.0, minutes: 300, phase: 'resting' },
			],
			hoyt,
		)
		expect(t.working).toBeCloseTo(125, 12)
		expect(t.resting).toBeCloseTo(125, 12)
		expect(t.cnsPercent).toBeCloseTo(125, 12)
	})
	it('Hoyt: within limits if either guideline is met (280 min at 1.0 is NOAA 93.3 %)', () => {
		const t = cnsTotals([{ ppo2: 1.0, minutes: 280, phase: 'working' }], hoyt)
		expect(t.working).toBeCloseTo((280 / 240) * 100, 12)
		expect(t.cnsPercent).toBeCloseTo((280 / 300) * 100, 12)
	})
	it('Hoyt: below 0.6 ata accrues nothing', () =>
		expect(
			cnsTotals([{ ppo2: 0.5, minutes: 600, phase: 'resting' }], hoyt),
		).toEqual({ limits: 'hoyt-2025', cnsPercent: 0, working: 0, resting: 0 }))
	it('Hoyt: rejects an unknown phase and limit set', () => {
		expect(() =>
			cnsTotals([{ ppo2: 1.4, minutes: 10, phase: 'x' as never }], hoyt),
		).toThrow(/phase/)
		expect(() => cnsTotals([], { limits: 'x' as never })).toThrow(RangeError)
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
	it('rejects an unknown limit set, even for an empty day', () =>
		expect(() => dailyExposure([], { limits: 'x' as never })).toThrow(/limits/))
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

describe('REPEX', () => {
	// Hamilton 1989, Fig. 1.
	it('matches the published table for days 1–14', () => {
		const published = [
			850, 1400, 1860, 2100, 2300, 2520, 2660, 2800, 2970, 3100, 3300, 3600,
			3900, 4200,
		]
		expect(REPEX_TABLE.map((r) => r[1])).toEqual(published)
		published.forEach((otu, i) => expect(repexAllowance(i + 1)).toBe(otu))
	})
	it('adds 300 per day after day 14', () => {
		expect(repexAllowance(20)).toBe(6000)
		expect(repexAllowance(30)).toBe(9000)
	})
	it('flags cumulative exceedance per day', () => {
		const r = repex([800, 700, 300])
		expect(r.days.map((d) => d.exceeded)).toEqual([false, true, false])
		expect(r.days[1]).toMatchObject({ cumulativeOtu: 1500, allowedOtu: 1400 })
		expect(r.exceeded).toBe(true)
	})
	it('exactly at the limit is not exceeded', () =>
		expect(repex([850]).exceeded).toBe(false))
	it('rejects bad input', () => {
		expect(() => repex([])).toThrow(RangeError)
		expect(() => repex(Array(31).fill(100))).toThrow(RangeError)
		expect(() => repex([-1])).toThrow(RangeError)
		expect(() => repexAllowance(0)).toThrow(RangeError)
		expect(() => repexAllowance(1.5)).toThrow(RangeError)
	})
})
