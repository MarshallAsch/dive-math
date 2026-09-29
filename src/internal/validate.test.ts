import { describe, expect, it } from 'vitest'
import {
	assertFinite,
	assertFraction,
	assertGas,
	assertNonNegative,
	assertPositive,
} from './validate'

describe('assertFinite', () => {
	it('accepts finite numbers', () => {
		expect(() => assertFinite('x', 0)).not.toThrow()
		expect(() => assertFinite('x', -3.5)).not.toThrow()
	})
	it.each([NaN, Infinity, -Infinity])('rejects %s with the name', (v) => {
		expect(() => assertFinite('depthM', v)).toThrow(RangeError)
		expect(() => assertFinite('depthM', v)).toThrow(/depthM/)
	})
})

describe('assertNonNegative', () => {
	it('accepts 0', () => expect(() => assertNonNegative('x', 0)).not.toThrow())
	it('rejects negatives', () =>
		expect(() => assertNonNegative('x', -0.0001)).toThrow(RangeError))
	it('rejects NaN', () =>
		expect(() => assertNonNegative('x', NaN)).toThrow(RangeError))
})

describe('assertPositive', () => {
	it('accepts tiny positives', () =>
		expect(() => assertPositive('x', 1e-12)).not.toThrow())
	it('rejects 0', () =>
		expect(() => assertPositive('x', 0)).toThrow(RangeError))
})

describe('assertFraction', () => {
	it('accepts 0 and 1', () => {
		expect(() => assertFraction('f', 0)).not.toThrow()
		expect(() => assertFraction('f', 1)).not.toThrow()
	})
	it('rejects values outside 0–1', () => {
		expect(() => assertFraction('f', -0.01)).toThrow(RangeError)
		expect(() => assertFraction('f', 1.01)).toThrow(RangeError)
	})
})

describe('assertGas', () => {
	it('accepts air and pure gases', () => {
		expect(() => assertGas({ fo2: 0.209, fhe: 0 })).not.toThrow()
		expect(() => assertGas({ fo2: 1, fhe: 0 })).not.toThrow()
		expect(() => assertGas({ fo2: 0, fhe: 1 })).not.toThrow()
	})
	// Review Focus #2: sums a hair over 1 (float noise) must pass. In IEEE-754
	// 0.21 + 0.79 is exactly 1, so use an explicit 1e-12 overshoot.
	it('accepts float sums a hair over 1', () => {
		const gas = { fo2: 0.21, fhe: 0.79 + 1e-12 }
		expect(gas.fo2 + gas.fhe).toBeGreaterThan(1)
		expect(() => assertGas(gas)).not.toThrow()
	})
	it('rejects sums beyond the epsilon', () => {
		expect(() => assertGas({ fo2: 0.21, fhe: 0.79 + 1e-6 })).toThrow(RangeError)
	})
	it('rejects fo2 + fhe > 1', () => {
		expect(() => assertGas({ fo2: 0.5, fhe: 0.6 }, 'targetGas')).toThrow(
			/targetGas/,
		)
	})
	it('rejects NaN fractions', () => {
		expect(() => assertGas({ fo2: NaN, fhe: 0 })).toThrow(RangeError)
	})
})
