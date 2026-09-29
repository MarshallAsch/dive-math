import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { AIR, gas } from '../gas'
import { ATM_BAR } from '../pressure'
import { componentZ } from '../real-gas'
import type { Gas } from '../types'
import { partialPressureBlend, type BlendResult } from './partial-pressure'

// Achieved mix (ideal gas, gauge bar) — the same reconstruction fill-station uses.
const achieved = (r: BlendResult, start: Gas, top: Gas, pf: number) => ({
	fo2: (start.fo2 * r.bleedTo + r.pO2 + top.fo2 * r.pTop) / pf,
	fhe: (start.fhe * r.bleedTo + r.pHe + top.fhe * r.pTop) / pf,
})

describe('partialPressureBlend', () => {
	// He: 0.45 × 200 = 90; O₂: (36 − 0.209 × 110) / 0.791 = 16.4475.
	it('trimix 18/45 from empty with air top-up', () => {
		const r = partialPressureBlend({
			startBar: 0,
			startGas: AIR,
			finalBar: 200,
			targetGas: gas(0.18, 0.45),
		})
		expect(r.feasible).toBe(true)
		expect(r.pHe).toBeCloseTo(90, 10)
		expect(r.pO2).toBeCloseTo(16.4475, 4)
		expect(r.pTop).toBeCloseTo(93.5525, 4)
		expect(r.steps.map((s) => s.gas)).toEqual(['he', 'o2', 'top'])
		expect(r.steps.at(-1)?.toBar).toBeCloseTo(200, 10)
	})
	it('respects a custom order', () => {
		const r = partialPressureBlend({
			startBar: 0,
			startGas: AIR,
			finalBar: 200,
			targetGas: gas(0.32),
			order: ['o2', 'he', 'top'],
		})
		expect(r.steps.map((s) => s.gas)).toEqual(['o2', 'he', 'top'])
		expect(r.steps[0]?.toBar).toBeCloseTo(r.pO2, 10)
	})
	it('bleeds down when the start gas is too rich', () => {
		const start = gas(0.5)
		const r = partialPressureBlend({
			startBar: 150,
			startGas: start,
			finalBar: 200,
			targetGas: gas(0.32),
		})
		expect(r.feasible).toBe(true)
		expect(r.bleedTo).toBeLessThan(150)
		expect(r.bleedBar).toBeCloseTo(150 - r.bleedTo, 10)
		const got = achieved(r, start, AIR, 200)
		expect(got.fo2).toBeCloseTo(0.32, 6)
	})
	it('reports drain-insufficient when even empty cannot reach the target', () => {
		const r = partialPressureBlend({
			startBar: 0,
			startGas: AIR,
			finalBar: 200,
			targetGas: gas(0.15),
			topUpGas: AIR,
		})
		expect(r.feasible).toBe(false)
		expect(r.reason).toBe('drain-insufficient')
	})
	it('reports top-up-unusable for a pure-O₂ top-up', () => {
		const r = partialPressureBlend({
			startBar: 0,
			startGas: AIR,
			finalBar: 200,
			targetGas: gas(0.32),
			topUpGas: gas(1),
		})
		expect(r.feasible).toBe(false)
		expect(r.reason).toBe('top-up-unusable')
	})
	it('target equal to the start mix at the same pressure is a no-op', () => {
		const r = partialPressureBlend({
			startBar: 200,
			startGas: gas(0.32),
			finalBar: 200,
			targetGas: gas(0.32),
		})
		expect(r.feasible).toBe(true)
		expect(r.pHe).toBeCloseTo(0, 9)
		expect(r.pO2).toBeCloseTo(0, 9)
		expect(r.pTop).toBeCloseTo(0, 9)
		expect(r.bleedBar).toBe(0)
	})
	it('real gas scales pure additions by Z at absolute final pressure', () => {
		const input = {
			startBar: 0,
			startGas: AIR,
			finalBar: 200,
			targetGas: gas(0.18, 0.45),
		}
		const ideal = partialPressureBlend(input)
		const real = partialPressureBlend({ ...input, useRealGas: true })
		expect(real.pHe).toBeCloseTo(ideal.pHe * componentZ('he', 200 + ATM_BAR), 9)
		expect(real.pO2).toBeCloseTo(ideal.pO2 * componentZ('o2', 200 + ATM_BAR), 9)
		expect(real.pHe).toBeGreaterThan(ideal.pHe)
	})
	it('hits the target mix whenever feasible (property)', () => {
		const frac = fc.double({ min: 0, max: 1, noNaN: true })
		fc.assert(
			fc.property(
				fc.double({ min: 0.1, max: 0.5, noNaN: true }),
				frac,
				fc.double({ min: 0, max: 200, noNaN: true }),
				fc.double({ min: 0.1, max: 1, noNaN: true }),
				frac,
				(tFo2, tHeShare, startBar, sFo2, sHeShare) => {
					const target = gas(tFo2, (1 - tFo2) * tHeShare * 0.8)
					const start = gas(sFo2, (1 - sFo2) * sHeShare)
					const r = partialPressureBlend({
						startBar,
						startGas: start,
						finalBar: 220,
						targetGas: target,
					})
					if (!r.feasible) return true
					const got = achieved(r, start, AIR, 220)
					return (
						Math.abs(got.fo2 - target.fo2) < 1e-6 &&
						Math.abs(got.fhe - target.fhe) < 1e-6 &&
						r.pHe >= -1e-6 &&
						r.pO2 >= -1e-6 &&
						r.pTop >= -1e-6
					)
				},
			),
		)
	})
	it('rejects bad input', () => {
		const ok = {
			startBar: 0,
			startGas: AIR,
			finalBar: 200,
			targetGas: gas(0.32),
		}
		expect(() => partialPressureBlend({ ...ok, finalBar: 0 })).toThrow(
			RangeError,
		)
		expect(() => partialPressureBlend({ ...ok, startBar: NaN })).toThrow(
			RangeError,
		)
		expect(() =>
			partialPressureBlend({ ...ok, targetGas: { fo2: 0.9, fhe: 0.9 } }),
		).toThrow(/targetGas/)
		expect(() =>
			partialPressureBlend({ ...ok, order: ['he', 'he', 'top'] }),
		).toThrow(RangeError)
	})
})

describe('ported: fill-station', () => {
	const A = (o: {
		startBar: number
		startGas: Gas
		finalBar: number
		targetGas: Gas
	}) => partialPressureBlend(o)
	it('blends EAN32 from empty (nitrox, no helium)', () => {
		const r = A({
			startBar: 0,
			startGas: gas(0.209),
			finalBar: 200,
			targetGas: gas(0.32),
		})
		expect(r.feasible).toBe(true)
		expect(r.pHe).toBeCloseTo(0, 6)
		expect(r.pO2).toBeCloseTo(28.07, 1)
		expect(r.addO2To).toBeCloseTo(28.07, 1)
		expect(r.topTo).toBeCloseTo(200, 6)
		expect(r.bleedBar).toBe(0)
		expect(r.bleedTo).toBe(0)
	})
	it('blends trimix 18/45 from empty', () => {
		const r = A({
			startBar: 0,
			startGas: gas(0.209),
			finalBar: 200,
			targetGas: gas(0.18, 0.45),
		})
		expect(r.feasible).toBe(true)
		expect(r.pHe).toBeCloseTo(90, 6)
		expect(r.addHeTo).toBeCloseTo(90, 6)
		expect(r.pO2).toBeCloseTo(16.46, 1)
		expect(r.addO2To).toBeCloseTo(106.46, 1)
		expect(r.pTop).toBeCloseTo(93.54, 1)
		expect(r.bleedBar).toBe(0)
	})
	it('the three additions sum to the pressure delta', () => {
		const r = A({
			startBar: 50,
			startGas: gas(0.209),
			finalBar: 230,
			targetGas: gas(0.3, 0.2),
		})
		expect(r.pHe + r.pO2 + r.pTop).toBeCloseTo(230 - 50, 6)
		expect(r.bleedBar).toBe(0)
		expect(r.bleedTo).toBe(50)
	})
	it('bleeds down a slightly-rich nitrox start (EAN36 -> EAN32)', () => {
		const start = gas(0.36)
		const r = A({
			startBar: 150,
			startGas: start,
			finalBar: 200,
			targetGas: gas(0.32),
		})
		expect(r.feasible).toBe(true)
		expect(r.bleedBar).toBeGreaterThan(0)
		expect(r.bleedTo).toBeCloseTo(147.02, 1)
		expect(r.bleedBar).toBeCloseTo(2.98, 1)
		const mix = achieved(r, start, AIR, 200)
		expect(mix.fo2).toBeCloseTo(0.32, 4)
		expect(mix.fhe).toBeCloseTo(0, 4)
	})
	it('bleeds down a very rich start (near-full drain)', () => {
		const start = gas(0.5)
		const r = A({
			startBar: 150,
			startGas: start,
			finalBar: 200,
			targetGas: gas(0.21),
		})
		expect(r.feasible).toBe(true)
		expect(r.bleedBar).toBeGreaterThan(0)
		expect(r.bleedTo).toBeCloseTo(0.69, 1)
		expect(r.bleedBar).toBeCloseTo(149.31, 1)
		expect(achieved(r, start, AIR, 200).fo2).toBeCloseTo(0.21, 4)
	})
	it('bleeds down a helium-rich trimix start', () => {
		const start = gas(0.18, 0.45)
		const r = A({
			startBar: 180,
			startGas: start,
			finalBar: 200,
			targetGas: gas(0.18, 0.35),
		})
		expect(r.feasible).toBe(true)
		expect(r.bleedBar).toBeGreaterThan(0)
		const mix = achieved(r, start, AIR, 200)
		expect(mix.fo2).toBeCloseTo(0.18, 4)
		expect(mix.fhe).toBeCloseTo(0.35, 4)
	})
	it('stays infeasible when the target is leaner than the top-up gas', () => {
		const r = A({
			startBar: 150,
			startGas: gas(0.209),
			finalBar: 200,
			targetGas: gas(0.18),
		})
		expect(r.feasible).toBe(false)
		expect(r.reason).toBe('drain-insufficient')
		expect(r.bleedBar).toBe(0)
	})
	it('cannot bleed an empty start (still infeasible)', () => {
		const r = A({
			startBar: 0,
			startGas: gas(0.209),
			finalBar: 200,
			targetGas: gas(0.18),
		})
		expect(r.feasible).toBe(false)
		expect(r.bleedBar).toBe(0)
	})

	describe('real-gas opt-in', () => {
		const input = {
			startBar: 0,
			startGas: gas(0.209),
			finalBar: 200,
			targetGas: gas(0.32),
		}
		it('is unchanged when useRealGas is false or omitted', () => {
			expect(partialPressureBlend({ ...input, useRealGas: false })).toEqual(
				partialPressureBlend(input),
			)
		})
		it('O2 Z relation vs ideal for a nitrox blend', () => {
			const ideal = partialPressureBlend(input)
			const real = partialPressureBlend({ ...input, useRealGas: true })
			expect(real.pO2).toBeCloseTo(
				ideal.pO2 * componentZ('o2', 200 + ATM_BAR),
				9,
			)
			expect(real.pO2).toBeLessThan(ideal.pO2)
		})
		it('needs more helium pressure for a trimix blend (He Z > 1)', () => {
			const tmx = { ...input, targetGas: gas(0.18, 0.45) }
			expect(
				partialPressureBlend({ ...tmx, useRealGas: true }).pHe,
			).toBeGreaterThan(partialPressureBlend(tmx).pHe)
		})
	})

	describe('top-up gas + order', () => {
		const base = {
			startBar: 0,
			startGas: gas(0.209),
			finalBar: 200,
			targetGas: gas(0.32),
		}
		it('air top-up (default) matches the legacy O2/He/air result', () => {
			const r = partialPressureBlend(base)
			expect(r.pHe).toBeCloseTo(0, 6)
			expect(r.pTop).toBeGreaterThan(0)
			expect(r.steps[r.steps.length - 1]?.toBar).toBeCloseTo(200, 6)
		})
		it('produces one step per component in the chosen order', () => {
			const r = partialPressureBlend({ ...base, order: ['o2', 'he', 'top'] })
			expect(r.steps.map((s) => s.gas)).toEqual(['o2', 'he', 'top'])
			for (let i = 1; i < r.steps.length; i++) {
				expect(r.steps[i]?.toBar).toBeGreaterThanOrEqual(
					r.steps[i - 1]?.toBar ?? 0,
				)
			}
			expect(r.steps[r.steps.length - 1]?.toBar).toBeCloseTo(200, 6)
		})
		it('a richer top-up gas needs less added O2 for the same target', () => {
			const air = partialPressureBlend(base)
			const ean25 = partialPressureBlend({ ...base, topUpGas: gas(0.25) })
			expect(ean25.pO2).toBeLessThan(air.pO2)
			expect(ean25.feasible).toBe(true)
		})
		it('bleeds down when the start mix is too rich', () => {
			const r = partialPressureBlend({
				...base,
				startBar: 150,
				startGas: gas(0.5),
				targetGas: gas(0.21),
			})
			expect(r.feasible).toBe(true)
			expect(r.bleedBar).toBeGreaterThan(0)
		})
		it('flags an unsolvable pure-O2 top-up', () => {
			const r = partialPressureBlend({ ...base, topUpGas: gas(1) })
			expect(r.feasible).toBe(false)
			expect(r.reason).toBe('top-up-unusable')
		})
	})
})
