import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { AIR, gas } from '../gas'
import { ATM_BAR } from '../pressure'
import { mixZ } from '../real-gas'
import { topUp } from './top-up'

const EAN32 = gas(0.32)

describe('topUp', () => {
	// (101.01325 × 0.32 + 100 × 0.209) / 201.01325 (absolute-pressure mole balance).
	it('EAN32 at 100 bar topped with air to 200 bar → 26.48% O₂', () => {
		const r = topUp({
			startBar: 100,
			startGas: EAN32,
			topGas: AIR,
			finalBar: 200,
		})
		expect(r.gas.fo2).toBeCloseTo(0.26478, 5)
		expect(r.gas.fhe).toBe(0)
		expect(r.addedBar).toBe(100)
		expect(r.noTopUp).toBe(false)
	})
	// Review Focus #4.
	it('no top-up when finalBar ≤ startBar', () => {
		const r = topUp({
			startBar: 200,
			startGas: EAN32,
			topGas: AIR,
			finalBar: 200,
		})
		expect(r).toEqual({ finalBar: 200, addedBar: 0, gas: EAN32, noTopUp: true })
	})
	it('same gas in and out is unchanged', () => {
		const r = topUp({
			startBar: 50,
			startGas: EAN32,
			topGas: EAN32,
			finalBar: 200,
		})
		expect(r.gas.fo2).toBeCloseTo(0.32, 12)
	})
	it('real gas conserves O₂ and He moles', () => {
		const start = gas(0.18, 0.45)
		const top = gas(1)
		const r = topUp({
			startBar: 150,
			startGas: start,
			topGas: top,
			finalBar: 220,
			useRealGas: true,
		})
		const sAbs = 150 + ATM_BAR
		const fAbs = 220 + ATM_BAR
		const nStart = sAbs / mixZ(start, sAbs)
		const nFinal = fAbs / mixZ(r.gas, fAbs)
		const nAdded = nFinal - nStart
		expect(nFinal * r.gas.fhe).toBeCloseTo(nStart * start.fhe, 6)
		expect(nFinal * r.gas.fo2).toBeCloseTo(
			nStart * start.fo2 + nAdded * top.fo2,
			6,
		)
	})
	it('fractions stay in [0,1] (property)', () => {
		const frac = fc.double({ min: 0, max: 1, noNaN: true })
		fc.assert(
			fc.property(
				frac,
				frac,
				frac,
				frac,
				fc.double({ min: 0, max: 250, noNaN: true }),
				fc.double({ min: 0, max: 50, noNaN: true }),
				fc.boolean(),
				(a, b, c, d, startBar, extra, real) => {
					const r = topUp({
						startBar,
						finalBar: startBar + extra,
						useRealGas: real,
						startGas: gas(a, (1 - a) * b),
						topGas: gas(c, (1 - c) * d),
					})
					return (
						r.gas.fo2 >= -1e-12 &&
						r.gas.fhe >= -1e-12 &&
						r.gas.fo2 + r.gas.fhe <= 1 + 1e-9
					)
				},
			),
		)
	})
	it('rejects bad input', () => {
		expect(() =>
			topUp({ startBar: -1, startGas: AIR, topGas: AIR, finalBar: 200 }),
		).toThrow(RangeError)
		expect(() =>
			topUp({ startBar: 0, startGas: AIR, topGas: AIR, finalBar: NaN }),
		).toThrow(RangeError)
		expect(() =>
			topUp({
				startBar: 0,
				startGas: { fo2: 2, fhe: 0 },
				topGas: AIR,
				finalBar: 200,
			}),
		).toThrow(/startGas/)
	})

	// Ported from fill-station gasMixing.test.ts.
	describe('ported cases', () => {
		it('tops air up to a fill pressure with EAN32 (ideal)', () => {
			const r = topUp({
				startBar: 13.79,
				startGas: gas(0.21),
				topGas: gas(0.32),
				finalBar: 206.84,
				useRealGas: false,
			})
			expect(r.noTopUp).toBe(false)
			expect(r.gas.fo2).toBeCloseTo(0.31, 2)
			expect(r.gas.fhe).toBeCloseTo(0, 6)
			expect(r.finalBar).toBe(206.84)
			expect(r.addedBar).toBeCloseTo(206.84 - 13.79, 6)
		})
		it('an empty start yields almost exactly the top-up mix', () => {
			const r = topUp({
				startBar: 0,
				startGas: gas(0.21),
				topGas: gas(0.32),
				finalBar: 206.84,
				useRealGas: false,
			})
			expect(r.gas.fo2).toBeCloseTo(0.32, 2)
			expect(r.gas.fhe).toBeCloseTo(0, 6)
		})
		it('final at or below start adds nothing and returns the start mix', () => {
			const r = topUp({
				startBar: 206.84,
				startGas: gas(0.21),
				topGas: gas(0.32),
				finalBar: 100,
				useRealGas: false,
			})
			expect(r.noTopUp).toBe(true)
			expect(r.addedBar).toBe(0)
			expect(r.gas.fo2).toBe(0.21)
			expect(r.gas.fhe).toBe(0)
			expect(r.finalBar).toBe(206.84)
		})
		it('final equal to start also adds nothing', () => {
			const r = topUp({
				startBar: 150,
				startGas: gas(0.21),
				topGas: gas(1),
				finalBar: 150,
				useRealGas: false,
			})
			expect(r.noTopUp).toBe(true)
			expect(r.addedBar).toBe(0)
			expect(r.gas.fo2).toBe(0.21)
		})
		it('real-gas shifts the O₂ fraction slightly below ideal when topping with O₂', () => {
			const base = {
				startBar: 100,
				startGas: gas(0.21),
				topGas: gas(1),
				finalBar: 200,
			}
			const ideal = topUp({ ...base, useRealGas: false })
			const real = topUp({ ...base, useRealGas: true })
			expect(ideal.gas.fo2).toBeCloseTo(0.6, 2)
			expect(real.gas.fo2).toBeCloseTo(0.6, 2)
			// The realblender virial fit has O₂ less compressible than N₂ at these
			// pressures (fill-station's linear model had the opposite order).
			expect(real.gas.fo2).toBeLessThan(ideal.gas.fo2)
		})
		it('preserves helium through a trimix top-up', () => {
			const r = topUp({
				startBar: 0,
				startGas: gas(0.21),
				topGas: gas(0.18, 0.45),
				finalBar: 200,
				useRealGas: false,
			})
			expect(r.gas.fhe).toBeCloseTo(0.45, 2)
			expect(r.gas.fo2).toBeCloseTo(0.18, 2)
		})
	})
})
