import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ATM_BAR } from '../pressure'
import { cascade } from './cascade'

describe('cascade', () => {
	// One 50 L bank at 300 bar into an empty 11.1 L cylinder:
	// eqAbs = (1.01325×11.1 + 301.01325×50)/61.1.
	it('equalises a single bank', () => {
		const r = cascade({
			banks: [{ volume: 50, pressure: 300 }],
			target: { volume: 11.1, startPressure: 0 },
		})
		const eq = (ATM_BAR * 11.1 + (300 + ATM_BAR) * 50) / 61.1 - ATM_BAR
		expect(r.finalPressure).toBeCloseTo(eq, 9)
		expect(r.banks[0]?.residualPressure).toBeCloseTo(eq, 9)
	})
	it('uses the lowest bank first and stops at the desired pressure', () => {
		const r = cascade({
			banks: [
				{ volume: 50, pressure: 300 },
				{ volume: 50, pressure: 150 },
			],
			target: { volume: 11.1, startPressure: 0 },
			desiredPressure: 200,
		})
		expect(r.reachedDesired).toBe(true)
		expect(r.finalPressure).toBeCloseTo(200, 9)
		expect(r.banks[1]?.residualPressure).toBeLessThan(150)
		expect(r.banks[0]?.residualPressure).toBeLessThan(300)
	})
	it('no banks → unchanged', () => {
		const r = cascade({
			banks: [],
			target: { volume: 11.1, startPressure: 50 },
		})
		expect(r).toEqual({ finalPressure: 50, banks: [], reachedDesired: false })
	})
	it('banks below the target are untouched', () => {
		const r = cascade({
			banks: [{ volume: 50, pressure: 40 }],
			target: { volume: 11.1, startPressure: 50 },
		})
		expect(r.finalPressure).toBeCloseTo(50, 12)
		expect(r.banks[0]?.residualPressure).toBe(40)
	})
	it('conserves gas (ideal, property)', () => {
		const bank = fc.record({
			volume: fc.double({ min: 5, max: 80, noNaN: true }),
			pressure: fc.double({ min: 0, max: 300, noNaN: true }),
		})
		fc.assert(
			fc.property(
				fc.array(bank, { maxLength: 4 }),
				fc.double({ min: 0, max: 200, noNaN: true }),
				(banks, start) => {
					const vt = 11.1
					const r = cascade({
						banks,
						target: { volume: vt, startPressure: start },
					})
					const before = banks.reduce(
						(s, b) => s + b.volume * b.pressure,
						vt * start,
					)
					const after = r.banks.reduce(
						(s, b, i) => s + banks[i]!.volume * b.residualPressure,
						vt * r.finalPressure,
					)
					return Math.abs(before - after) < 1e-6 * Math.max(1, before)
				},
			),
		)
	})
	it('rejects bad input', () => {
		expect(() =>
			cascade({
				banks: [{ volume: 0, pressure: 300 }],
				target: { volume: 11.1, startPressure: 0 },
			}),
		).toThrow(RangeError)
		expect(() =>
			cascade({ banks: [], target: { volume: 11.1, startPressure: NaN } }),
		).toThrow(RangeError)
	})
})

describe('cascade (ported)', () => {
	it('equalizes target against a single bank', () => {
		const r = cascade({
			banks: [{ volume: 50, pressure: 200 }],
			target: { volume: 10, startPressure: 0 },
		})
		expect(r.finalPressure).toBeCloseTo(166.68, 1)
		expect(r.banks[0]?.residualPressure).toBeCloseTo(166.68, 1)
	})

	it('uses lowest-pressure banks first', () => {
		const r = cascade({
			banks: [
				{ volume: 50, pressure: 200 },
				{ volume: 50, pressure: 100 },
			],
			target: { volume: 10, startPressure: 0 },
		})
		// low bank (100) used before high bank (200); two stages add more gas than the 200 bank alone
		expect(r.finalPressure).toBeGreaterThan(166.68)
		// residuals are reported in original input order
		expect(r.banks[0]!.residualPressure).toBeGreaterThan(
			r.banks[1]!.residualPressure,
		)
	})

	it('skips banks at or below the target pressure', () => {
		const r = cascade({
			banks: [{ volume: 50, pressure: 50 }],
			target: { volume: 10, startPressure: 100 },
		})
		expect(r.finalPressure).toBe(100)
		expect(r.banks[0]?.residualPressure).toBe(50)
	})

	it('conserves gas (absolute P*V) across the system', () => {
		const banks = [
			{ volume: 50, pressure: 200 },
			{ volume: 40, pressure: 150 },
		]
		const target = { volume: 12, startPressure: 30 }
		const before =
			banks.reduce((s, b) => s + (b.pressure + ATM_BAR) * b.volume, 0) +
			(target.startPressure + ATM_BAR) * target.volume
		const r = cascade({ banks, target })
		const after =
			r.banks.reduce(
				(s, b, i) => s + (b.residualPressure + ATM_BAR) * banks[i]!.volume,
				0,
			) +
			(r.finalPressure + ATM_BAR) * target.volume
		expect(after).toBeCloseTo(before, 4)
	})

	it('reports whether the desired pressure is reached', () => {
		const reached = cascade({
			banks: [{ volume: 200, pressure: 230 }],
			target: { volume: 10, startPressure: 0 },
			desiredPressure: 200,
		})
		expect(reached.reachedDesired).toBe(true)
		const notReached = cascade({
			banks: [{ volume: 5, pressure: 230 }],
			target: { volume: 10, startPressure: 0 },
			desiredPressure: 200,
		})
		expect(notReached.reachedDesired).toBe(false)
	})

	it('stops at the desired pressure instead of overshooting', () => {
		const r = cascade({
			banks: [
				{ volume: 50, pressure: 300 },
				{ volume: 50, pressure: 300 },
			],
			target: { volume: 10, startPressure: 0 },
			desiredPressure: 200,
		})
		expect(r.finalPressure).toBeCloseTo(200, 6)
		expect(r.reachedDesired).toBe(true)
	})

	it('leaves banks untouched once the desired pressure is reached', () => {
		const r = cascade({
			banks: [
				{ volume: 200, pressure: 300 },
				{ volume: 200, pressure: 300 },
			],
			target: { volume: 10, startPressure: 0 },
			desiredPressure: 200,
		})
		// The first bank alone covers the fill, so the second is never opened.
		expect(r.banks[1]?.residualPressure).toBe(300)
	})

	it('conserves gas when a bank is only partly drawn', () => {
		const banks = [{ volume: 50, pressure: 300 }]
		const target = { volume: 10, startPressure: 0 }
		const before = (300 + ATM_BAR) * 50 + ATM_BAR * 10
		const r = cascade({ banks, target, desiredPressure: 200 })
		const after =
			(r.banks[0]!.residualPressure + ATM_BAR) * 50 +
			(r.finalPressure + ATM_BAR) * 10
		expect(r.finalPressure).toBeCloseTo(200, 6)
		expect(after).toBeCloseTo(before, 4)
	})

	it('still equalizes fully when it cannot reach the desired pressure', () => {
		const r = cascade({
			banks: [{ volume: 50, pressure: 200 }],
			target: { volume: 10, startPressure: 0 },
			desiredPressure: 300,
		})
		expect(r.finalPressure).toBeCloseTo(166.68, 1)
		expect(r.reachedDesired).toBe(false)
	})

	it('handles an empty bank list', () => {
		const r = cascade({
			banks: [],
			target: { volume: 10, startPressure: 50 },
			desiredPressure: 200,
		})
		expect(r.finalPressure).toBe(50)
		expect(r.banks).toEqual([])
		expect(r.reachedDesired).toBe(false)
	})
})

describe('cascade real-gas opt-in', () => {
	const input = {
		banks: [{ volume: 50, pressure: 200 }],
		target: { volume: 10, startPressure: 0 },
	}
	it('is unchanged when useRealGas is false or omitted', () => {
		expect(cascade({ ...input, useRealGas: false })).toEqual(cascade(input))
	})
	it('returns a finite, close result with real-gas weighting', () => {
		const ideal = cascade(input)
		const real = cascade({ ...input, useRealGas: true })
		expect(Number.isFinite(real.finalPressure)).toBe(true)
		expect(Math.abs(real.finalPressure - ideal.finalPressure)).toBeLessThan(10)
	})
})
