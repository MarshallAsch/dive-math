import { describe, expect, it } from 'vitest'
import { gas } from '../gas'
import type { Breathing } from './breathing'
import { planDive, type PlanInput } from './plan'

const tmx: Breathing = { kind: 'oc', gas: gas(0.18, 0.45) }
// 60 m / 40 min on 18/45 with EAN50 and O₂, GF 40/85: 15.7 min on O₂ at 6 m
// (1.6 ata) and 27.7 min at 3 m (1.3 ata). Runtime 134.3 min.
const oc: PlanInput = {
	levels: [{ depthM: 60, minutes: 40, breathing: tmx }],
	decoGases: [gas(0.5), gas(1)],
	gfLow: 0.4,
	gfHigh: 0.85,
}
const loop: Breathing = { kind: 'ccr', diluent: gas(0.1, 0.7), setpoint: 1.3 }
// 80 m / 40 min CCR at 1.3: runtime 241.3 min, NOAA CNS 133.6 %.
const ccr: PlanInput = {
	levels: [{ depthM: 80, minutes: 40, breathing: loop }],
	gfLow: 0.4,
	gfHigh: 0.85,
}
const codes = (p: { warnings: readonly { code: string }[] }) =>
	p.warnings.map((w) => w.code)

describe('oxygen limits in plans', () => {
	it('NOAA by default', () => {
		const p = planDive(ccr)
		expect(p.oxygen.limits).toBe('noaa-1991')
		expect(p.oxygen.cnsPercent).toBeCloseTo(133.578, 3)
		expect(p.oxygen.working).toBeUndefined()
		expect(codes(p)).toEqual(
			expect.arrayContaining(['cns-single', 'cns-daily']),
		)
	})
	it('Hoyt 2025: working and resting budgets', () => {
		const p = planDive({ ...ccr, oxygenLimits: 'hoyt-2025' })
		expect(p.oxygen.working).toBeCloseTo(18.333, 3)
		expect(p.oxygen.resting).toBeCloseTo(82.208, 3)
		expect(p.oxygen.cnsPercent).toBe(p.oxygen.resting)
		expect(codes(p)).not.toContain('cns-single')
		expect(codes(p)).not.toContain('cns-daily')
	})
	it('Hoyt: a long working phase raises cns-working only', () => {
		const p = planDive({
			levels: [
				{
					depthM: 10,
					minutes: 250,
					breathing: { ...loop, diluent: gas(0.21) },
				},
			],
			gfLow: 0.4,
			gfHigh: 0.85,
			oxygenLimits: 'hoyt-2025',
		})
		expect(codes(p)).toContain('cns-working')
		expect(codes(p)).not.toContain('cns-resting')
	})
	it('a level can be marked resting', () => {
		const p = planDive({
			...ccr,
			oxygenLimits: 'hoyt-2025',
			levels: [
				...ccr.levels,
				{ depthM: 6, minutes: 30, breathing: loop, phase: 'resting' },
			],
		})
		const level = p.segments.find((s) => s.kind === 'level' && s.toDepthM === 6)
		expect(level?.phase).toBe('resting')
		expect(p.segments[0]!.phase).toBe('working')
	})
	it('dayExposure adds earlier dives to the daily checks', () => {
		const alone = planDive(oc)
		expect(codes(alone)).not.toContain('cns-daily')
		const p = planDive({
			...oc,
			dayExposure: [
				{ type: 'dive', ppo2: 1.3, minutes: 150 },
				{ type: 'surface', minutes: 120 },
			],
		})
		expect(codes(p)).toContain('cns-daily')
	})
	it('otu-daily past 850 OTU for the day', () => {
		const p = planDive({
			...oc,
			dayExposure: [{ type: 'dive', ppo2: 1.4, minutes: 450 }],
		})
		expect(codes(p)).toContain('otu-daily')
		expect(codes(planDive(oc))).not.toContain('otu-daily')
	})
	it('per-segment exposure is cumulative and ends at the plan totals', () => {
		const p = planDive({ ...ccr, oxygenLimits: 'hoyt-2025' })
		for (let i = 1; i < p.segments.length; i++) {
			expect(p.segments[i]!.cnsPercent).toBeGreaterThanOrEqual(
				p.segments[i - 1]!.cnsPercent,
			)
			expect(p.segments[i]!.otu).toBeGreaterThanOrEqual(p.segments[i - 1]!.otu)
		}
		expect(p.segments.at(-1)!.cnsPercent).toBeCloseTo(p.oxygen.cnsPercent, 9)
		expect(p.segments.at(-1)!.otu).toBeCloseTo(p.oxygen.otu, 9)
	})
	it('rejects bad oxygen inputs', () => {
		expect(() => planDive({ ...oc, oxygenLimits: 'x' as never })).toThrow(
			/oxygenLimits/,
		)
		expect(() =>
			planDive({ ...oc, levels: [{ ...oc.levels[0]!, phase: 'x' as never }] }),
		).toThrow(/phase/)
		expect(() =>
			planDive({ ...oc, dayExposure: [{ type: 'surface', minutes: -1 }] }),
		).toThrow(RangeError)
	})
})
