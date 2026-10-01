import { describe, expect, it } from 'vitest'
import { gas } from '../gas'
import { bailoutPlan } from './bailout'
import type { Breathing } from './breathing'
import { planDive, type PlanInput } from './plan'

const loop: Breathing = {
	kind: 'ccr',
	diluent: gas(0.18, 0.45),
	setpoint: { low: 0.7, high: 1.3, switchDepthM: 6 },
}
const input: PlanInput = {
	levels: [
		{ depthM: 45, minutes: 10, breathing: loop },
		{ depthM: 60, minutes: 20, breathing: loop },
		{ depthM: 40, minutes: 10, breathing: loop },
	],
	gfLow: 0.3,
	gfHigh: 0.8,
}
const bailoutGases = [gas(0.18, 0.45), gas(0.5), gas(1)]

describe('bailoutPlan', () => {
	const b = bailoutPlan(input, { bailoutGases, rmvLpm: 20, stressFactor: 1.5 })
	// Every level end is a candidate; for this profile the 60 m end still needs
	// the most bailout gas (~3830 L vs ~3520 L at the 40 m end, which has the
	// longer runtime, and ~650 L at the 45 m end).
	it('bails out at the worst level end (here the 60 m level)', () => {
		const firstOc = b.plan.segments.findIndex((s) => s.breathing.kind === 'oc')
		expect(b.plan.segments[firstOc - 1]).toMatchObject({
			kind: 'level',
			toDepthM: 60,
		})
		expect(b.bailoutDepthM).toBe(60)
		expect(b.bailoutRuntimeMinutes).toBe(
			b.plan.segments[firstOc - 1].runtimeMinutes,
		)
		const total = (r: typeof b) =>
			r.gasRequired.reduce((s, g) => s + g.litres, 0)
		const at45 = bailoutPlan(
			{ ...input, levels: input.levels.slice(0, 1) },
			{ bailoutGases, rmvLpm: 20, stressFactor: 1.5 },
		)
		expect(at45.bailoutDepthM).toBe(45)
		expect(total(at45)).toBeLessThan(total(b))
		expect(
			b.plan.segments.slice(firstOc).every((s) => s.breathing.kind === 'oc'),
		).toBe(true)
	})
	it('switches bailout gases at MOD', () => {
		const used = new Set(
			b.plan.stops.map((s) =>
				s.breathing.kind === 'oc' ? s.breathing.gas.fo2 : 0,
			),
		)
		expect(used.has(0.5)).toBe(true)
		expect(used.has(1)).toBe(true)
	})
	it('sums bailout gas at RMV × stress', () => {
		const plain = bailoutPlan(input, { bailoutGases, rmvLpm: 20 })
		const total = (r: typeof b) =>
			r.gasRequired.reduce((s, g) => s + g.litres, 0)
		expect(total(b)).toBeCloseTo(total(plain) * 1.5, 6)
		expect(b.gasRequired.map((g) => g.gas.fo2)).toEqual([0.18, 0.5, 1])
	})
	it('the CCR plan itself is unchanged by planning a bailout', () => {
		const before = planDive(input)
		const snapshot = structuredClone(input)
		bailoutPlan(input, { bailoutGases, rmvLpm: 20 })
		expect(planDive(input)).toEqual(before)
		expect(input).toEqual(snapshot)
	})
	it('warns when no bailout gas is breathable at depth', () => {
		const r = bailoutPlan(input, {
			bailoutGases: [gas(0.8), gas(0.5)],
			rmvLpm: 20,
		})
		// Neither gas is breathable at any level end; warn once at the chosen one.
		expect(r.plan.warnings).toContainEqual({
			code: 'no-breathable-gas',
			depthM: r.bailoutDepthM,
		})
		expect(
			r.plan.warnings.filter(
				(w) => w.code === 'no-breathable-gas' && w.depthM === r.bailoutDepthM,
			),
		).toHaveLength(1)
	})
	it('starts on the richest bailout gas breathable at depth', () => {
		const r = bailoutPlan(input, {
			bailoutGases: [gas(0.18, 0.45), gas(0.21, 0.35), gas(0.5)],
			rmvLpm: 20,
		})
		const firstOc = r.plan.segments.find((s) => s.breathing.kind === 'oc')
		expect(firstOc?.breathing).toEqual({ kind: 'oc', gas: gas(0.21, 0.35) })
	})
	// A short deep level then a long shallower one: bailing out at the end of
	// the 30 m level carries far more gas than bailing out at 50 m.
	it('picks the level end needing the most bailout gas, not the deepest', () => {
		const multi: PlanInput = {
			levels: [
				{ depthM: 50, minutes: 5, breathing: { ...loop, setpoint: 1.3 } },
				{ depthM: 30, minutes: 60, breathing: { ...loop, setpoint: 1.3 } },
			],
			gfLow: 0.3,
			gfHigh: 0.8,
		}
		const gases = [gas(0.21, 0.35), gas(0.5), gas(1)]
		const total = (r: ReturnType<typeof bailoutPlan>) =>
			r.gasRequired.reduce((s, g) => s + g.litres, 0)
		const worst = bailoutPlan(multi, { bailoutGases: gases, rmvLpm: 20 })
		const at50 = bailoutPlan(
			{ ...multi, levels: multi.levels.slice(0, 1) },
			{ bailoutGases: gases, rmvLpm: 20 },
		)
		expect(worst.bailoutDepthM).toBe(30)
		expect(worst.bailoutRuntimeMinutes).toBeCloseTo(2.5 + 5 + 2 + 60, 9)
		expect(at50.bailoutDepthM).toBe(50)
		expect(total(worst)).toBeGreaterThan(total(at50) * 1.5)
	})
	it('rejects bad input', () => {
		expect(() =>
			bailoutPlan(
				{ ...input, levels: [{ depthM: 0, minutes: 5, breathing: loop }] },
				{ bailoutGases, rmvLpm: 20 },
			),
		).toThrow(/below the surface/)
		expect(() => bailoutPlan(input, { bailoutGases: [], rmvLpm: 20 })).toThrow(
			RangeError,
		)
		expect(() => bailoutPlan(input, { bailoutGases, rmvLpm: 0 })).toThrow(
			RangeError,
		)
		expect(() =>
			bailoutPlan(input, { bailoutGases, rmvLpm: 20, stressFactor: -1 }),
		).toThrow(RangeError)
		expect(() =>
			bailoutPlan(input, { bailoutGases: [{ fo2: 2, fhe: 0 }], rmvLpm: 20 }),
		).toThrow(RangeError)
	})
})
