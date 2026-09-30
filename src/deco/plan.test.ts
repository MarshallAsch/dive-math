import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import reference from '../../test/fixtures/reference/schedules.json'
import { AIR, gas } from '../gas'
import { nextStopDepth } from './ascent'
import type { Breathing } from './breathing'
import { planDive, timeToSurface, type PlanInput } from './plan'
import { replaySegments } from './profile'
import { surfaceInterval } from './tissues'

const oc = (fo2: number, fhe = 0): Breathing => ({
	kind: 'oc',
	gas: gas(fo2, fhe),
})
const AIR_OC: Breathing = { kind: 'oc', gas: AIR }

describe('nextStopDepth', () => {
	it('walks the 3 m grid down to the last stop', () => {
		expect(nextStopDepth(12, 3, 3)).toBe(9)
		expect(nextStopDepth(3, 3, 3)).toBe(0)
		expect(nextStopDepth(40, 3, 3)).toBe(39)
		expect(nextStopDepth(9, 3, 6)).toBe(6)
		expect(nextStopDepth(6, 3, 6)).toBe(0)
	})
})

// Clean-room reference planner (scripts/deco-reference/reference.py), same
// conventions, whole-second stops.
describe('matches the clean-room reference', () => {
	for (const c of reference.cases) {
		it(c.name, () => {
			const p = planDive({
				levels: [
					{
						depthM: c.depthM,
						minutes: c.bottomMinutes,
						breathing: oc(c.bottom[0], c.bottom[1]),
					},
				],
				decoGases: c.decoGases.map(([o, h]) => gas(o, h)),
				gfLow: c.gfLow,
				gfHigh: c.gfHigh,
				roundStops: false,
			})
			expect(p.firstStopM).toBe(c.firstStopM)
			expect(
				p.stops.map((s) => [s.depthM, Math.round(s.minutes * 60)]),
			).toEqual(c.stops)
			expect(p.runtimeMinutes).toBeCloseTo(c.runtimeMinutes, 4)
		})
	}
})

// Baker, "Clearing Up The Confusion About Deep Stops", Fig. 3: 13/50 to 90 m,
// 20 min runtime at the bottom, EAN36/EAN50/EAN80, GF 20/75, 10 m/min ascent.
// Published stops (depth, runtime leaving): below. Water vapour 0.0493 (Baker's
// Fortran value), 20 m/min descent (not stated), whole-minute stops.
describe("Baker's Deep Stops Fig. 3", () => {
	const published = [
		[54, 24],
		[51, 25],
		[48, 26],
		[45, 27],
		[42, 28],
		[39, 30],
		[36, 33],
		[33, 34],
		[30, 36],
		[27, 38],
		[24, 40],
		[21, 44],
		[18, 47],
		[15, 53],
		[12, 61],
		[9, 71],
		[6, 87],
		[3, 119],
	]
	const p = planDive({
		levels: [{ depthM: 90, minutes: 15.5, breathing: oc(0.13, 0.5) }],
		decoGases: [gas(0.36), gas(0.5), gas(0.8)],
		gfLow: 0.2,
		gfHigh: 0.75,
		waterVapour: 0.0493,
	})
	const stops = p.segments
		.filter((s) => s.kind === 'stop')
		.map((s) => [s.fromDepthM, s.runtimeMinutes])
	it('first stop is 54 m', () => expect(p.firstStopM).toBe(54))
	it('every stop is within 1 min of the published runtime', () => {
		expect(stops.map(([d]) => d)).toEqual(published.map(([d]) => d))
		stops.forEach(([, rt], i) =>
			expect(Math.abs(rt - published[i][1])).toBeLessThanOrEqual(1),
		)
	})
	it('surfaces at 120 ± 1 min', () =>
		expect(Math.abs(p.runtimeMinutes - 120)).toBeLessThanOrEqual(1))
	it('switches to each deco gas', () => {
		const gases = new Set(
			p.stops.map((s) => (s.breathing.kind === 'oc' ? s.breathing.gas.fo2 : 0)),
		)
		expect([...gases]).toEqual([0.13, 0.36, 0.5, 0.8])
	})
})

describe('planDive', () => {
	it('selects O2 exactly at its 1.6 MOD, not when the surface is 1.01325 ata', () => {
		const lvl = [{ depthM: 30, minutes: 30, breathing: AIR_OC }]
		const o2From = (surfacePressure?: number) =>
			planDive({
				levels: lvl,
				decoGases: [gas(1)],
				gfLow: 0.4,
				gfHigh: 0.85,
				surfacePressure,
			}).segments.find(
				(s) => s.breathing.kind === 'oc' && s.breathing.gas.fo2 === 1,
			)?.fromDepthM
		expect(o2From()).toBe(6)
		expect(o2From(1.01325)).toBe(3)
	})
	const base: PlanInput = {
		levels: [{ depthM: 30, minutes: 20, breathing: AIR_OC }],
		gfLow: 0.4,
		gfHigh: 0.85,
	}
	it('a no-deco dive has no stops and surfaces directly', () => {
		const p = planDive({
			...base,
			levels: [{ depthM: 18, minutes: 30, breathing: AIR_OC }],
		})
		expect(p.stops).toEqual([])
		expect(p.firstStopM).toBeNull()
		expect(p.runtimeMinutes).toBeCloseTo(0.9 + 30 + 1.8, 9)
	})
	it('adds an opt-in safety stop to no-deco dives', () => {
		const p = planDive({
			...base,
			levels: [{ depthM: 18, minutes: 30, breathing: AIR_OC }],
			safetyStop: true,
		})
		expect(p.stops).toEqual([{ depthM: 5, minutes: 3, breathing: AIR_OC }])
	})
	it('whole-minute stops end on whole minutes of runtime', () => {
		const p = planDive({
			...base,
			levels: [{ depthM: 40, minutes: 25, breathing: AIR_OC }],
		})
		for (const s of p.segments.filter((x) => x.kind === 'stop'))
			expect(s.runtimeMinutes % 1).toBeCloseTo(0, 9)
	})
	it('multi-level: time at each level, transitions at the rates', () => {
		const p = planDive({
			...base,
			levels: [
				{ depthM: 30, minutes: 10, breathing: AIR_OC },
				{ depthM: 20, minutes: 15, breathing: AIR_OC },
			],
		})
		expect(
			p.segments.slice(0, 4).map((s) => [s.kind, s.toDepthM, s.minutes]),
		).toEqual([
			['descent', 30, 1.5],
			['level', 30, 10],
			['ascent', 20, 1],
			['level', 20, 15],
		])
	})
	it('a repeat dive needs more deco than the first', () => {
		const first = planDive({
			...base,
			levels: [{ depthM: 40, minutes: 20, breathing: AIR_OC }],
		})
		const again = planDive({
			...base,
			levels: [{ depthM: 40, minutes: 20, breathing: AIR_OC }],
			startTissues: surfaceInterval(first.endTissues, 60),
		})
		expect(again.runtimeMinutes).toBeGreaterThan(first.runtimeMinutes)
	})
	it('higher GF never lengthens deco (property)', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 20, max: 60 }),
				fc.integer({ min: 10, max: 40 }),
				fc.double({ min: 0.2, max: 0.9, noNaN: true }),
				(depthM, minutes, g) => {
					const lvl = [{ depthM, minutes, breathing: AIR_OC }]
					const lo = planDive({
						levels: lvl,
						gfLow: g,
						gfHigh: g,
						roundStops: false,
					})
					const hi = planDive({
						levels: lvl,
						gfLow: Math.min(1, g + 0.1),
						gfHigh: Math.min(1, g + 0.1),
						roundStops: false,
					})
					return hi.runtimeMinutes <= lo.runtimeMinutes + 1e-9
				},
			),
			{ numRuns: 40 },
		)
	})
	it('reports oxygen exposure and gas use', () => {
		const p = planDive({
			...base,
			consumption: { rmvLpm: 20, cylinders: [{ gas: AIR, volumeL: 24 }] },
		})
		expect(p.oxygen.cnsPercent).toBeGreaterThan(0)
		expect(p.oxygen.otu).toBeGreaterThan(0)
		expect(p.gasUse?.[0].gas).toEqual(AIR)
		expect(p.gasUse?.[0].bar).toBeCloseTo((p.gasUse?.[0].litres ?? 0) / 24, 9)
	})
	it('CCR stays on the loop; deco gases are ignored', () => {
		const loop: Breathing = {
			kind: 'ccr',
			diluent: gas(0.18, 0.45),
			setpoint: { low: 0.7, high: 1.3, switchDepthM: 6 },
		}
		const p = planDive({
			levels: [{ depthM: 60, minutes: 25, breathing: loop }],
			decoGases: [gas(0.5)],
			gfLow: 0.3,
			gfHigh: 0.8,
		})
		expect(p.segments.every((s) => s.breathing.kind === 'ccr')).toBe(true)
		expect(p.stops.length).toBeGreaterThan(0)
	})
})

describe('warnings', () => {
	it('hypoxic travel gas and high density', () => {
		const p = planDive({
			levels: [{ depthM: 90, minutes: 15, breathing: oc(0.13, 0.5) }],
			decoGases: [gas(0.5)],
			gfLow: 0.3,
			gfHigh: 0.8,
		})
		expect(p.warnings).toContainEqual({ code: 'hypoxic', segmentIndex: 0 })
		expect(p.warnings.some((w) => w.code === 'density-hard')).toBe(true)
	})
	it('ppO2 above the bottom limit', () => {
		const p = planDive({
			levels: [{ depthM: 40, minutes: 10, breathing: oc(0.32) }],
			gfLow: 0.4,
			gfHigh: 0.85,
		})
		expect(p.warnings).toContainEqual({ code: 'ppo2-high', segmentIndex: 1 })
	})
	it('no breathable gas at a stop', () => {
		const p = planDive({
			levels: [{ depthM: 90, minutes: 20, breathing: oc(0.1, 0.7) }],
			gfLow: 0.3,
			gfHigh: 0.8,
		})
		expect(p.warnings.some((w) => w.code === 'no-breathable-gas')).toBe(true)
	})
	it('ascending through the ceiling between levels', () => {
		const p = planDive({
			levels: [
				{ depthM: 50, minutes: 40, breathing: AIR_OC },
				{ depthM: 3, minutes: 1, breathing: AIR_OC },
			],
			gfLow: 0.3,
			gfHigh: 0.8,
		})
		expect(p.warnings).toContainEqual({
			code: 'ceiling-violated',
			segmentIndex: 2,
		})
	})
	it('deco longer than 24 h is truncated', () => {
		const p = planDive({
			levels: [{ depthM: 120, minutes: 600, breathing: oc(0.1, 0.7) }],
			gfLow: 0.1,
			gfHigh: 0.1,
		})
		expect(p.warnings).toContainEqual({ code: 'deco-too-long' })
	})
	// The 3 m stop here needs ~1199 min: past the last power-of-two probe
	// (65536 s ≈ 1092 min) but within MAX_DECO_MINUTES, so it must be planned.
	it('plans a single stop between 1092 and 1440 min without truncating', () => {
		const p = planDive({
			levels: [{ depthM: 9, minutes: 1200, breathing: AIR_OC }],
			gfLow: 0.2,
			gfHigh: 0.2,
		})
		expect(p.warnings).not.toContainEqual({ code: 'deco-too-long' })
		expect(Math.max(...p.stops.map((s) => s.minutes))).toBeGreaterThan(1092)
		expect(p.segments.at(-1)?.toDepthM).toBe(0)
	})
})

describe('input validation', () => {
	const ok: PlanInput = {
		levels: [{ depthM: 30, minutes: 20, breathing: AIR_OC }],
		gfLow: 0.4,
		gfHigh: 0.85,
	}
	it.each([
		['empty levels', { ...ok, levels: [] }],
		['gfLow > gfHigh', { ...ok, gfLow: 0.9, gfHigh: 0.5 }],
		['gf 0', { ...ok, gfLow: 0 }],
		['lastStopM not on the grid', { ...ok, lastStopM: 4 }],
		[
			'negative depth',
			{ ...ok, levels: [{ depthM: -1, minutes: 1, breathing: AIR_OC }] },
		],
		[
			'NaN minutes',
			{ ...ok, levels: [{ depthM: 10, minutes: NaN, breathing: AIR_OC }] },
		],
		['bad deco gas', { ...ok, decoGases: [{ fo2: 1.2, fhe: 0 }] }],
		['zero ascent rate', { ...ok, ascentRate: 0 }],
		[
			'bad cylinder',
			{
				...ok,
				consumption: { rmvLpm: 20, cylinders: [{ gas: AIR, volumeL: 0 }] },
			},
		],
		['short startTissues', { ...ok, startTissues: { n2: [1], he: [0] } }],
	])('%s throws RangeError', (_n, input) =>
		expect(() => planDive(input as PlanInput)).toThrow(RangeError),
	)
})

describe('timeToSurface', () => {
	it('equals the ascent part of the plan', () => {
		const p = planDive({
			levels: [{ depthM: 40, minutes: 25, breathing: AIR_OC }],
			gfLow: 0.4,
			gfHigh: 0.85,
			roundStops: false,
		})
		const bottomTissues = replaySegments(p.segments.slice(0, 2)).at(-1)!
		const rules = { gfLow: 0.4, gfHigh: 0.85, roundStops: false }
		expect(timeToSurface(bottomTissues, 40, AIR_OC, rules)).toBeCloseTo(
			p.runtimeMinutes - p.segments[1].runtimeMinutes,
			9,
		)
		expect(timeToSurface(p.endTissues, 0, AIR_OC, rules)).toBe(0)
	})
	it('is Infinity when the required stops exceed MAX_DECO_MINUTES', () => {
		const p = planDive({
			levels: [{ depthM: 30, minutes: 60, breathing: oc(0.05, 0.9) }],
			gfLow: 0.05,
			gfHigh: 0.05,
		})
		const bottom = replaySegments(p.segments.slice(0, 2)).at(-1)!
		expect(
			timeToSurface(bottom, 30, oc(0.05, 0.9), { gfLow: 0.05, gfHigh: 0.05 }),
		).toBe(Infinity)
	})
})

describe('reports and limits (coverage of edge branches)', () => {
	it('a plan that never leaves the surface is empty', () => {
		const p = planDive({
			levels: [{ depthM: 0, minutes: 0, breathing: AIR_OC }],
			gfLow: 0.4,
			gfHigh: 0.85,
		})
		expect(p).toMatchObject({
			segments: [],
			stops: [],
			runtimeMinutes: 0,
			firstStopM: null,
		})
	})
	const lvl = [{ depthM: 40, minutes: 20, breathing: AIR_OC }]
	it('uses decoRmvLpm on the ascent and omits bar without a matching cylinder', () => {
		const a = planDive({
			levels: lvl,
			gfLow: 0.4,
			gfHigh: 0.85,
			consumption: { rmvLpm: 20, cylinders: [] },
		})
		const b = planDive({
			levels: lvl,
			gfLow: 0.4,
			gfHigh: 0.85,
			consumption: { rmvLpm: 20, decoRmvLpm: 15, cylinders: [] },
		})
		expect(b.gasUse?.[0].litres).toBeLessThan(a.gasUse?.[0].litres ?? 0)
		expect(a.gasUse?.[0]).not.toHaveProperty('bar')
		expect(() =>
			planDive({
				levels: lvl,
				gfLow: 0.4,
				gfHigh: 0.85,
				consumption: { rmvLpm: 20, decoRmvLpm: 0, cylinders: [] },
			}),
		).toThrow(RangeError)
	})
	// Breathing 5/90 at 3 m, the inspired inert pressure is above what GF 5 %
	// tolerates at the surface, so the last stop can never clear.
	it('truncates when a stop can never clear', () => {
		const p = planDive({
			levels: [{ depthM: 30, minutes: 60, breathing: oc(0.05, 0.9) }],
			gfLow: 0.05,
			gfHigh: 0.05,
		})
		expect(p.warnings).toContainEqual({ code: 'deco-too-long' })
	})
})
