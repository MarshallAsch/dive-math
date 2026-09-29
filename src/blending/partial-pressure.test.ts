import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { AIR, gas } from '../gas'
import { ATM_BAR } from '../pressure'
import { idealEquivalentPressure } from '../real-gas'
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
		it('real and ideal plans differ for a trimix blend', () => {
			const tmx = { ...input, targetGas: gas(0.18, 0.45) }
			const ideal = partialPressureBlend(tmx)
			const real = partialPressureBlend({ ...tmx, useRealGas: true })
			expect(Math.abs(real.pHe - ideal.pHe)).toBeGreaterThan(0.1)
			expect(real.topTo).toBeCloseTo(200, 6)
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

// Independent real-gas fill simulator: for each step, find the moles x of
// the added gas such that the tank (mixed) reads the step's gauge target,
// i.e. x = idealEquivalentPressure(mix(x), toBar + ATM) − molesBefore.
// Moles are in ideal-equivalent bar (per container litre).
const simulateReal = (r: BlendResult, start: Gas, top: Gas) => {
	const total = idealEquivalentPressure(start, r.bleedTo + ATM_BAR)
	const n = { o2: start.fo2 * total, he: start.fhe * total, all: total }
	const src: Record<string, Gas> = { he: gas(0, 1), o2: gas(1), top }
	for (const step of r.steps) {
		const g = src[step.gas]!
		const pAbs = step.toBar + ATM_BAR
		let x = 0
		for (let i = 0; i < 500; i++) {
			const all = n.all + x
			const mix = {
				fo2: Math.max(0, (n.o2 + g.fo2 * x) / all),
				fhe: Math.max(0, (n.he + g.fhe * x) / all),
			}
			const next = idealEquivalentPressure(mix, pAbs) - n.all
			if (Math.abs(next - x) < 1e-12) break
			x = next
		}
		n.o2 += g.fo2 * x
		n.he += g.fhe * x
		n.all += x
	}
	return { fo2: n.o2 / n.all, fhe: n.he / n.all }
}

describe('partialPressureBlend real gas (simulated fill)', () => {
	const cases: [string, Gas, number, Gas, number][] = [
		['18/45 @200 from empty', AIR, 0, gas(0.18, 0.45), 200],
		['21/35 @232 from empty', AIR, 0, gas(0.21, 0.35), 232],
		['10/70 @232 from empty', AIR, 0, gas(0.1, 0.7), 232],
		['EAN32 @200 from empty', AIR, 0, gas(0.32), 200],
		[
			'21/35 @232 over 50 bar of 18/45',
			gas(0.18, 0.45),
			50,
			gas(0.21, 0.35),
			232,
		],
	]
	for (const [name, start, startBar, target, finalBar] of cases) {
		it(`reproduces the target: ${name}`, () => {
			const r = partialPressureBlend({
				startBar,
				startGas: start,
				finalBar,
				targetGas: target,
				useRealGas: true,
			})
			expect(r.feasible).toBe(true)
			expect(r.topTo).toBeCloseTo(finalBar, 6)
			const got = simulateReal(r, start, AIR)
			expect(Math.abs(got.fo2 - target.fo2)).toBeLessThan(1e-6)
			expect(Math.abs(got.fhe - target.fhe)).toBeLessThan(1e-6)
		})
	}
	it('reproduces the target with a custom order', () => {
		const target = gas(0.18, 0.45)
		const r = partialPressureBlend({
			startBar: 0,
			startGas: AIR,
			finalBar: 200,
			targetGas: target,
			order: ['o2', 'he', 'top'],
			useRealGas: true,
		})
		const got = simulateReal(r, AIR, AIR)
		expect(Math.abs(got.fo2 - target.fo2)).toBeLessThan(1e-6)
		expect(Math.abs(got.fhe - target.fhe)).toBeLessThan(1e-6)
	})
	it('bleeds down a rich start and then reproduces the target', () => {
		const start = gas(0.5)
		const target = gas(0.32)
		const r = partialPressureBlend({
			startBar: 150,
			startGas: start,
			finalBar: 200,
			targetGas: target,
			useRealGas: true,
		})
		expect(r.feasible).toBe(true)
		expect(r.bleedTo).toBeLessThan(150)
		expect(r.bleedBar).toBeCloseTo(150 - r.bleedTo, 10)
		expect(r.pO2).toBeCloseTo(0, 6)
		const got = simulateReal(r, start, AIR)
		expect(Math.abs(got.fo2 - target.fo2)).toBeLessThan(1e-6)
		expect(Math.abs(got.fhe - target.fhe)).toBeLessThan(1e-6)
	})
	it('reports drain-insufficient when even empty cannot reach the target', () => {
		const r = partialPressureBlend({
			startBar: 150,
			startGas: AIR,
			finalBar: 200,
			targetGas: gas(0.15),
			useRealGas: true,
		})
		expect(r.feasible).toBe(false)
		expect(r.reason).toBe('drain-insufficient')
		expect(r.bleedTo).toBe(150)
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
						useRealGas: true,
					})
					if (!r.feasible) return true
					const got = simulateReal(r, start, AIR)
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
})
