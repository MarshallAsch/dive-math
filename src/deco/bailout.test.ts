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
	it('bails out at the end of the deepest level', () => {
		const firstOc = b.plan.segments.findIndex((s) => s.breathing.kind === 'oc')
		expect(b.plan.segments[firstOc - 1]).toMatchObject({
			kind: 'level',
			toDepthM: 60,
		})
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
	it('the CCR plan itself is unchanged by planning a bailout', () =>
		expect(planDive(input).runtimeMinutes).toBe(planDive(input).runtimeMinutes))
	it('warns when no bailout gas is breathable at depth', () => {
		const r = bailoutPlan(input, {
			bailoutGases: [gas(0.8), gas(0.5)],
			rmvLpm: 20,
		})
		expect(r.plan.warnings).toContainEqual({
			code: 'no-breathable-gas',
			depthM: 60,
		})
	})
	it('starts on the richest bailout gas breathable at depth', () => {
		const r = bailoutPlan(input, {
			bailoutGases: [gas(0.18, 0.45), gas(0.21, 0.35), gas(0.5)],
			rmvLpm: 20,
		})
		const firstOc = r.plan.segments.find((s) => s.breathing.kind === 'oc')
		expect(firstOc?.breathing).toEqual({ kind: 'oc', gas: gas(0.21, 0.35) })
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
