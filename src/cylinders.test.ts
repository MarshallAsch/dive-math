import { describe, expect, it } from 'vitest'
import {
	CYLINDERS_BY_ID,
	DIVE_CYLINDERS,
	freeGas,
	INDUSTRIAL_CYLINDERS,
	STORAGE_CYLINDERS,
	tankFactor,
} from './cylinders'
import { gas } from './gas'

describe('tables', () => {
	it('every row is valid and sourced', () => {
		for (const c of [
			...DIVE_CYLINDERS,
			...STORAGE_CYLINDERS,
			...INDUSTRIAL_CYLINDERS,
		]) {
			expect(c.volumeL).toBeGreaterThan(0)
			expect(c.ratedBar).toBeGreaterThan(0)
			expect(c.source.length).toBeGreaterThan(0)
		}
	})
	it('ids are unique', () => {
		const all = [
			...DIVE_CYLINDERS,
			...STORAGE_CYLINDERS,
			...INDUSTRIAL_CYLINDERS,
		]
		expect(new Set(all.map((c) => c.id)).size).toBe(all.length)
	})
	it('covers the common scuba sizes', () => {
		for (const id of [
			'AL40',
			'AL80',
			'AL100',
			'LP27',
			'LP50',
			'LP85',
			'LP95',
			'LP108',
			'LP120',
			'HP15',
			'HP23',
			'HP71',
			'HP80',
			'HP100',
			'HP117',
			'HP120',
			'HP133',
			'HP149',
		])
			expect(CYLINDERS_BY_ID[id]).toBeDefined()
	})
	// Luxfer: 3000 psi service; Faber HP: 3442 psi; Faber LP: 2640 psi (+10%).
	it('rated pressures come from psi exactly', () => {
		expect(CYLINDERS_BY_ID.AL80?.ratedBar).toBeCloseTo(206.8427, 4)
		expect(CYLINDERS_BY_ID.HP100?.ratedBar).toBeCloseTo(237.3175, 4)
		expect(CYLINDERS_BY_ID.LP85?.ratedBar).toBeCloseTo(182.0216, 4)
		expect(CYLINDERS_BY_ID.AL100?.ratedBar).toBeCloseTo(227.527, 3)
	})
})

describe('freeGas', () => {
	it('ideal is volume × gauge pressure', () =>
		expect(freeGas({ volumeL: 11.1, pressureBar: 200 })).toBe(2220))
	// GasPlanner tankVolume(): 10 L air @ 200 bar = 1928.651 L (1 bar normal);
	// ours normalises at 1 atm → 1928.624.
	it('real 10 L air @ 200 bar ≈ 1928.62 L', () =>
		expect(
			freeGas({ volumeL: 10, pressureBar: 200, useRealGas: true }),
		).toBeCloseTo(1928.6236, 3))
	it('real 10 L O₂ @ 200 bar ≈ 2088.07 L (O₂ compresses more)', () =>
		expect(
			freeGas({ volumeL: 10, pressureBar: 200, gas: gas(1), useRealGas: true }),
		).toBeCloseTo(2088.0664, 3))
	it('real AL80 holds ≈ 2205 L (≈ 77.9 cuft)', () =>
		expect(
			freeGas({ volumeL: 11.1, pressureBar: 206.8427184, useRealGas: true }),
		).toBeCloseTo(2204.95, 1))
	it('empty cylinder holds 0 free gas', () => {
		expect(freeGas({ volumeL: 10, pressureBar: 0 })).toBe(0)
		expect(
			freeGas({ volumeL: 10, pressureBar: 0, useRealGas: true }),
		).toBeCloseTo(0, 9)
	})
	it('rejects bad input', () => {
		expect(() => freeGas({ volumeL: 0, pressureBar: 200 })).toThrow(RangeError)
		expect(() => freeGas({ volumeL: 10, pressureBar: -1 })).toThrow(RangeError)
	})
})

describe('tankFactor', () => {
	// 11.1 × 100 / (28.3168466 × 14.5037738).
	it('AL80 is 2.70 cuft/100 psi', () =>
		expect(tankFactor(11.1)).toBeCloseTo(2.7027, 4))
	it('rejects non-positive volume', () =>
		expect(() => tankFactor(0)).toThrow(RangeError))
})

describe('ported from fill-station presets', () => {
	it('AL80 real-gas capacity is below ideal, but within 10%', () => {
		const al80 = DIVE_CYLINDERS.find((t) => t.id === 'AL80')
		if (!al80) throw new Error('AL80 missing')
		const ideal = freeGas({ volumeL: al80.volumeL, pressureBar: al80.ratedBar })
		const real = freeGas({
			volumeL: al80.volumeL,
			pressureBar: al80.ratedBar,
			useRealGas: true,
		})
		expect(real).toBeLessThan(ideal)
		expect(real).toBeGreaterThan(ideal * 0.9)
	})
	it('includes the sourced industrial T and K bottles', () => {
		expect(INDUSTRIAL_CYLINDERS.map((c) => c.id)).toEqual(
			expect.arrayContaining(['T', 'K']),
		)
		expect(INDUSTRIAL_CYLINDERS).toHaveLength(4)
	})
	// linear-Z value retired (MIGRATION.md)
})

describe('cylinder reference values', () => {
	it('keeps the Faber figures', () => {
		expect(CYLINDERS_BY_ID.AL80?.volumeL).toBe(11.1)
		expect(CYLINDERS_BY_ID.HP100?.volumeL).toBe(12.9)
		expect(CYLINDERS_BY_ID.LP95?.volumeL).toBe(15)
		expect(CYLINDERS_BY_ID.AL80?.ratedBar).toBeCloseTo(207, 0)
		expect(CYLINDERS_BY_ID.AL100?.ratedBar).toBeCloseTo(228, 0)
		expect(CYLINDERS_BY_ID.LP120?.ratedBar).toBeCloseTo(182, 0)
		expect(CYLINDERS_BY_ID.HP133?.ratedBar).toBeCloseTo(237, 0)
	})
	it('rounded tank factors', () => {
		expect(Math.round(tankFactor(11.1))).toBe(3)
		expect(Math.round(tankFactor(19))).toBe(5)
		expect(Math.round(tankFactor(CYLINDERS_BY_ID.HP100?.volumeL ?? 0))).toBe(3)
	})
})
