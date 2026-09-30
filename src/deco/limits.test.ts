import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { AIR, gas } from '../gas'
import type { Breathing } from './breathing'
import { ceiling, gfAt, ndl, NDL_MAX_MINUTES, toleratedAmbient } from './limits'
import { atConstantDepth, duringDepthChange, initialTissues } from './tissues'
import { ZHL16C } from './zhl16'

const AIR_OC: Breathing = { kind: 'oc', gas: AIR }
const loaded = atConstantDepth(
	duringDepthChange(initialTissues(), 0, 30, 1.5, {
		kind: 'oc',
		gas: gas(0.32),
	}),
	30,
	20,
	{ kind: 'oc', gas: gas(0.32) },
)

describe('toleratedAmbient', () => {
	// DecoTengu worked example, compartment 1 after 20 min at 30 m on EAN32:
	// (P − 0.3·a)/(0.3/b + 0.7) = 1.790727 bar.
	it('matches the Baker formula for compartment 1', () => {
		const c = ZHL16C[0]
		const p = loaded.n2[0]
		expect((p - 0.3 * c.n2A) / (0.3 / c.n2B + 0.7)).toBeCloseTo(1.790727, 6)
		expect(toleratedAmbient(loaded, 0.3)).toBeGreaterThanOrEqual(
			1.790727 - 1e-6,
		)
	})
	it('is below the surface for saturated surface tissues', () =>
		expect(toleratedAmbient(initialTissues(), 1)).toBeLessThan(1))
	it('never gets deeper as GF rises (property)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0.1, max: 1, noNaN: true }),
				fc.double({ min: 0.1, max: 1, noNaN: true }),
				(a, b) => {
					const [lo, hi] = a <= b ? [a, b] : [b, a]
					return (
						toleratedAmbient(loaded, hi) <= toleratedAmbient(loaded, lo) + 1e-12
					)
				},
			),
		)
	})
	it('rejects GF outside (0, 1]', () => {
		expect(() => toleratedAmbient(loaded, 0)).toThrow(RangeError)
		expect(() => toleratedAmbient(loaded, 1.1)).toThrow(RangeError)
	})
})

describe('ceiling', () => {
	it('is 0 m when surfacing is allowed', () =>
		expect(ceiling(initialTissues(), 0.3)).toBe(0))
	it('is deeper at a lower GF', () =>
		expect(ceiling(loaded, 0.3)).toBeGreaterThan(ceiling(loaded, 0.85)))
	it('is (tolerated − surface) × 10 m', () =>
		expect(ceiling(loaded, 0.3)).toBeCloseTo(
			(toleratedAmbient(loaded, 0.3) - 1) * 10,
			12,
		))
})

describe('gfAt', () => {
	it('is GF-low before a first stop exists', () =>
		expect(gfAt(30, null, 0.3, 0.8)).toBe(0.3))
	it('is GF-low at the first stop and GF-high at the surface', () => {
		expect(gfAt(18, 18, 0.3, 0.8)).toBeCloseTo(0.3, 12)
		expect(gfAt(0, 18, 0.3, 0.8)).toBeCloseTo(0.8, 12)
		expect(gfAt(9, 18, 0.3, 0.8)).toBeCloseTo(0.55, 12)
	})
	it('clamps below the first stop and handles a surface first stop', () => {
		expect(gfAt(30, 18, 0.3, 0.8)).toBeCloseTo(0.3, 12)
		expect(gfAt(0, 0, 0.3, 0.8)).toBe(0.8)
	})
})

describe('ndl', () => {
	const at = (d: number) =>
		duringDepthChange(initialTissues(), 0, d, d / 20, AIR_OC)
	// dive-math conventions (1 ata surface, 10 m/bar), cross-checked against the clean-room reference.
	it('air at 30 m, GF 100 ≈ 15.5 min', () =>
		expect(ndl(at(30), 30, AIR_OC, { gfHigh: 1 })).toBeCloseTo(15.54, 1))
	it('air at 40 m, GF 100 ≈ 7.8 min', () =>
		expect(ndl(at(40), 40, AIR_OC, { gfHigh: 1 })).toBeCloseTo(7.76, 1))
	it('is capped when shallow', () =>
		expect(ndl(at(6), 6, AIR_OC, { gfHigh: 1 })).toBe(NDL_MAX_MINUTES))
	it('is 0 when already in deco', () =>
		expect(ndl(loaded, 30, AIR_OC, { gfHigh: 0.85 })).toBe(0))
	it('shrinks with lower GF', () =>
		expect(ndl(at(30), 30, AIR_OC, { gfHigh: 0.7 })).toBeLessThan(
			ndl(at(30), 30, AIR_OC, { gfHigh: 1 }),
		))
})
