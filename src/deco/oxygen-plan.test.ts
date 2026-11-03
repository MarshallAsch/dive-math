import { describe, expect, it } from 'vitest'
import { gas } from '../gas'
import { cnsTotals, segmentOtu } from '../oxygen'
import { ataAtDepth } from '../pressure'
import { bailoutPlan } from './bailout'
import { gfAt, toleratedAmbient } from './limits'
import { breathingPpo2, type Breathing } from './breathing'
import { planDive, timeToSurface, type PlanInput } from './plan'
import { replaySegments } from './profile'
import { segmentExposures } from './report'

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
	it('Hoyt: 241 min working at 1.3 raises cns-working', () => {
		const p = planDive({
			levels: [
				{
					depthM: 10,
					minutes: 241,
					breathing: { ...loop, diluent: gas(0.21) },
				},
			],
			gfLow: 0.4,
			gfHigh: 0.85,
			oxygenLimits: 'hoyt-2025',
		})
		expect(p.oxygen.working).toBeGreaterThan(100)
		expect(codes(p)).toContain('cns-working')
	})
	it('Hoyt: no warning when the NOAA guideline is met (280 min at 1.0)', () => {
		const p = planDive({
			levels: [
				{
					depthM: 10,
					minutes: 280,
					breathing: { ...loop, diluent: gas(0.21), setpoint: 1 },
				},
			],
			gfLow: 0.4,
			gfHigh: 0.85,
			oxygenLimits: 'hoyt-2025',
		})
		expect(p.oxygen.working).toBeGreaterThan(100)
		expect(p.oxygen.cnsPercent).toBeLessThan(100)
		expect(p.segments.at(-1)!.cnsPercent).toBeCloseTo(p.oxygen.cnsPercent, 9)
		expect(codes(p)).not.toContain('cns-working')
	})
	it('Hoyt: a long resting phase raises cns-resting', () => {
		const p = planDive({
			...ccr,
			oxygenLimits: 'hoyt-2025',
			levels: [
				...ccr.levels,
				{ depthM: 6, minutes: 250, breathing: loop, phase: 'resting' },
			],
		})
		expect(codes(p)).toContain('cns-resting')
		expect(codes(p)).not.toContain('cns-working')
	})
	it('segment cnsPercent is cnsTotals over the exposures so far', () => {
		const p = planDive({ ...oc, oxygenLimits: 'hoyt-2025' })
		const exposures = segmentExposures(p.segments)
		p.segments.forEach((s, i) =>
			expect(s.cnsPercent).toBeCloseTo(
				cnsTotals(exposures.slice(0, i + 1), { limits: 'hoyt-2025' })
					.cnsPercent,
				12,
			),
		)
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
		const i = p.segments.findIndex(
			(s) => s.kind === 'level' && s.toDepthM === 6,
		)
		expect(p.segments[i]!.phase).toBe('resting')
		// The travel into the level takes the level's phase.
		expect(p.segments[i - 1]).toMatchObject({
			kind: 'ascent',
			toDepthM: 6,
			phase: 'resting',
		})
		expect(p.segments[0]!.phase).toBe('working')
	})
	it('the deco ascent is resting; the bottom profile is working', () => {
		const p = planDive({
			...oc,
			levels: [...oc.levels, { depthM: 30, minutes: 5, breathing: tmx }],
		})
		const last = p.segments.map((s) => s.kind).lastIndexOf('level')
		p.segments.forEach((s, i) =>
			expect(s.phase).toBe(i <= last ? 'working' : 'resting'),
		)
		expect(p.segments[last - 1]).toMatchObject({ kind: 'ascent', toDepthM: 30 })
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
	it('otu-daily on either side of 850 OTU', () => {
		const planOtu = planDive(oc).oxygen.otu
		const perMin = segmentOtu({ ppo2: 1.5, minutes: 1 })
		const day = (otu: number) => [
			{ type: 'dive' as const, ppo2: 1.5, minutes: otu / perMin },
		]
		expect(
			codes(planDive({ ...oc, dayExposure: day(850 - planOtu - 0.01) })),
		).not.toContain('otu-daily')
		expect(
			codes(planDive({ ...oc, dayExposure: day(850 - planOtu + 0.01) })),
		).toContain('otu-daily')
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

// Largest overshoot of the GF ceiling (bar) at any resting ascent arrival.
function ceilingExcess(input: PlanInput): number {
	const p = planDive(input)
	const tissues = replaySegments(p.segments)
	let worst = -Infinity
	p.segments.forEach((s, i) => {
		if (s.kind !== 'ascent' || s.phase !== 'resting') return
		const gf = gfAt(s.toDepthM, p.firstStopM, input.gfLow, input.gfHigh)
		worst = Math.max(
			worst,
			toleratedAmbient(tissues[i]!, gf) - ataAtDepth(s.toDepthM),
		)
	})
	return worst
}
// Reviewer-found profiles where a rounded stop arrived above the ceiling.
const trimix45: PlanInput = {
	levels: [
		{
			depthM: 45,
			minutes: 30,
			breathing: { kind: 'oc', gas: gas(0.21, 0.35) },
		},
	],
	decoGases: [gas(0.5), gas(1)],
	gfLow: 0.2,
	gfHigh: 0.85,
}
const trimix90: PlanInput = {
	levels: [
		{ depthM: 90, minutes: 20, breathing: { kind: 'oc', gas: gas(0.1, 0.7) } },
	],
	decoGases: [gas(0.21, 0.35), gas(0.5), gas(1)],
	gfLow: 0.2,
	gfHigh: 0.85,
}
const ceilingProfiles: [string, PlanInput][] = [
	['60/40 tx18/45', oc],
	['45/30 tx21/35', trimix45],
	['90/20 tx10/70', trimix90],
]

describe('air breaks in plans', () => {
	it('defaults leave this plan unchanged (15.7 min on O₂ at 6 m < 20)', () => {
		const a = planDive(oc)
		const b = planDive({ ...oc, airBreaks: { oc: {} } })
		expect(b.runtimeMinutes).toBe(a.runtimeMinutes)
		expect(b.segments.some((s) => s.airBreak)).toBe(false)
	})
	it('a 1.3 trigger carries the clock into 3 m and adds two breaks', () => {
		const p = planDive({ ...oc, airBreaks: { oc: { triggerPpo2: 1.3 } } })
		expect(p.runtimeMinutes).toBeCloseTo(142.3, 9)
		const breaks = p.segments.filter((s) => s.airBreak)
		expect(breaks.map((s) => [s.toDepthM, s.minutes])).toEqual([
			[3, 5],
			[3, 5],
		])
		// Back gas: the leanest breathable carried gas.
		for (const s of breaks) expect(s.breathing).toEqual(tmx)
		expect(p.stops.at(-1)).toMatchObject({ depthM: 3, breakMinutes: 10 })
	})
	it('tissues replay exactly through break segments', () => {
		const p = planDive({ ...oc, airBreaks: { oc: { onMinutes: 4 } } })
		const replay = replaySegments(p.segments).at(-1)!
		p.endTissues.n2.forEach((v, i) => expect(replay.n2[i]).toBeCloseTo(v, 9))
		p.endTissues.he.forEach((v, i) => expect(replay.he[i]).toBeCloseTo(v, 9))
	})
	it('a stop may end mid-break; the break continues through the ascent', () => {
		const p = planDive({ ...oc, airBreaks: { oc: { onMinutes: 4 } } })
		expect(p.runtimeMinutes).toBeCloseTo(151.3, 9)
		const i = p.segments.findIndex((s) => s.kind === 'ascent' && s.airBreak)
		expect(
			p.segments
				.slice(i - 1, i + 3)
				.map((s) => [
					s.kind,
					s.toDepthM,
					+s.minutes.toFixed(4),
					s.airBreak ?? false,
				]),
		).toEqual([
			['stop', 6, 3.7, true],
			['ascent', 3, 0.3, true],
			['stop', 3, 1, true],
			['stop', 3, 29.7, false],
		])
	})
	it('no-break-gas when every carried gas is at or above the trigger', () => {
		const p = planDive({
			levels: [
				{ depthM: 30, minutes: 60, breathing: { kind: 'oc', gas: gas(0.4) } },
			],
			decoGases: [gas(1)],
			gfLow: 0.3,
			gfHigh: 0.7,
			airBreaks: { oc: { onMinutes: 2, triggerPpo2: 0.5 } },
		})
		expect(p.warnings.filter((w) => w.code === 'no-break-gas')).toEqual([
			{ code: 'no-break-gas', depthM: 9 },
			{ code: 'no-break-gas', depthM: 6 },
			{ code: 'no-break-gas', depthM: 3 },
		])
		expect(p.segments.some((s) => s.airBreak)).toBe(false)
	})
	it('CCR: 5 min at 0.7 every 60 min of deco', () => {
		const p = planDive({ ...ccr, airBreaks: { ccr: {} } })
		expect(p.runtimeMinutes).toBeCloseTo(248.3, 9)
		const breaks = p.segments.filter((s) => s.airBreak)
		expect(breaks.map((s) => [s.toDepthM, s.minutes])).toEqual([
			[15, 5],
			[6, 5],
			[3, 5],
		])
		for (const s of breaks)
			expect(s.breathing).toEqual({ ...loop, setpoint: 0.7 })
	})
	it('OC breaks are ignored on a CCR plan (and vice versa)', () => {
		expect(planDive({ ...ccr, airBreaks: { oc: {} } }).runtimeMinutes).toBe(
			planDive(ccr).runtimeMinutes,
		)
		expect(planDive({ ...oc, airBreaks: { ccr: {} } }).runtimeMinutes).toBe(
			planDive(oc).runtimeMinutes,
		)
	})
	it('timeToSurface honours air breaks', () => {
		const p = planDive(oc)
		const bottom = p.segments.findIndex((s) => s.kind === 'level')
		const t = replaySegments(p.segments.slice(0, bottom + 1)).at(-1)!
		const rules = { decoGases: oc.decoGases, gfLow: 0.4, gfHigh: 0.85 }
		expect(
			timeToSurface(t, 60, tmx, {
				...rules,
				airBreaks: { oc: { onMinutes: 4 } },
			}),
		).toBeGreaterThan(timeToSurface(t, 60, tmx, rules))
	})
	it('bailout takes OC breaks on the bailout gases', () => {
		const input: PlanInput = { ...ccr, airBreaks: { oc: { onMinutes: 4 } } }
		const b = bailoutPlan(input, {
			bailoutGases: [gas(0.1, 0.7), gas(0.5), gas(1)],
			rmvLpm: 20,
		})
		const breaks = b.plan.segments.filter((s) => s.airBreak)
		expect(breaks.length).toBeGreaterThan(0)
		for (const s of breaks) expect(s.breathing.kind).toBe('oc')
	})
	it('stays within the GF ceiling at every stop arrival', () => {
		for (const [name, base] of ceilingProfiles)
			for (const roundStops of [true, false])
				for (const onMinutes of [2, 5, 12])
					for (const breakMinutes of [1, 2.5, 5])
						for (const triggerPpo2 of [0.9, 1.3, 1.5]) {
							const input = {
								...base,
								roundStops,
								airBreaks: { oc: { onMinutes, breakMinutes, triggerPpo2 } },
							}
							expect(
								ceilingExcess(input),
								JSON.stringify([name, input.airBreaks, roundStops]),
							).toBeLessThanOrEqual(1e-9)
						}
	})
	it('re-checks rounded stops: 45 m / 30 min on 21/35, 2/2.5 breaks', () =>
		expect(
			ceilingExcess({
				...trimix45,
				airBreaks: { oc: { onMinutes: 2, breakMinutes: 2.5 } },
			}),
		).toBeLessThanOrEqual(1e-9))
	it('re-checks rounded stops: 90 m / 20 min on 10/70, 2/1 breaks at 0.9', () =>
		expect(
			ceilingExcess({
				...trimix90,
				airBreaks: { oc: { onMinutes: 2, breakMinutes: 1, triggerPpo2: 0.9 } },
			}),
		).toBeLessThanOrEqual(1e-9))
	it('a gas-switch hold mid-break uses the break gas re-selected there', () => {
		// The break started at 12 m on 8/80; at 9 m 8/80 is hypoxic, so the
		// switch hold onto EAN80 must continue the break on EAN50.
		const triggerPpo2 = 1
		const p = planDive({
			levels: [
				{
					depthM: 70,
					minutes: 25,
					breathing: { kind: 'oc', gas: gas(0.08, 0.8) },
				},
			],
			decoGases: [gas(0.5), gas(0.8)],
			gfLow: 0.3,
			gfHigh: 0.8,
			switchMinutes: 1,
			airBreaks: { oc: { onMinutes: 1, breakMinutes: 8, triggerPpo2 } },
		})
		const hold = p.segments.findIndex(
			(s) => s.kind === 'ascent' && s.toDepthM === 9 && s.airBreak,
		)
		expect(hold).toBeGreaterThan(0)
		expect(p.segments[hold + 1]).toMatchObject({
			kind: 'stop',
			airBreak: true,
			breathing: { kind: 'oc', gas: gas(0.5) },
		})
		for (const s of p.segments.filter((x) => x.airBreak && x.kind === 'stop')) {
			const ppo2 = breathingPpo2(s.breathing, s.toDepthM)
			expect(ppo2).toBeGreaterThanOrEqual(0.16)
			expect(ppo2).toBeLessThan(triggerPpo2)
		}
	})
	it('breaks only happen during the deco ascent', () => {
		const ndl = planDive({
			levels: [
				{ depthM: 6, minutes: 60, breathing: { kind: 'oc', gas: gas(1) } },
			],
			gfLow: 0.4,
			gfHigh: 0.85,
			airBreaks: { oc: { onMinutes: 5 } },
		})
		expect(ndl.segments.some((s) => s.airBreak)).toBe(false)
		const p = planDive({ ...oc, airBreaks: { oc: { onMinutes: 4 } } })
		for (const s of p.segments.filter((x) => x.airBreak))
			expect(s.phase).toBe('resting')
	})
	it('gas use charges break minutes to the break gas', () => {
		const consumption = { rmvLpm: 20, cylinders: [] }
		const litres = (p: ReturnType<typeof planDive>) =>
			p.gasUse!.find((g) => g.gas.fo2 === 0.18)!.litres
		const a = planDive({ ...oc, consumption })
		const b = planDive({
			...oc,
			consumption,
			airBreaks: { oc: { triggerPpo2: 1.3 } },
		})
		// Two 5 min breaks at 3 m (1.3 ata) at 20 L/min: +260 L of back gas.
		expect(litres(b) - litres(a)).toBeCloseTo(260, 6)
	})
	it('CCR low/high setpoint: no breaks on the low setpoint', () => {
		const p = planDive({
			...ccr,
			levels: [
				{
					...ccr.levels[0]!,
					breathing: {
						...loop,
						setpoint: { low: 0.7, high: 1.3, switchDepthM: 6 },
					},
				},
			],
			airBreaks: { ccr: { onMinutes: 10 } },
		})
		const stops = p.segments.filter((s) => s.airBreak && s.kind === 'stop')
		expect(stops.length).toBeGreaterThan(0)
		for (const s of stops) expect(s.toDepthM).toBeGreaterThanOrEqual(6)
	})
	it('bailout warns when the bailout gases leave no break gas', () => {
		// 10/70 is hypoxic at 3 m and O₂ is above the 0.5 trigger there.
		const b = bailoutPlan(
			{ ...ccr, airBreaks: { oc: { onMinutes: 2, triggerPpo2: 0.5 } } },
			{ bailoutGases: [gas(0.1, 0.7), gas(1)], rmvLpm: 20 },
		)
		expect(b.plan.warnings).toContainEqual({ code: 'no-break-gas', depthM: 3 })
	})
})
