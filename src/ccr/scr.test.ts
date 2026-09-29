import { describe, expect, it } from 'vitest'
import { passiveScrSupplyRate, scrLoopFo2 } from './scr'

describe('SCR steady-state loop O₂ (mass balance)', () => {
	// (Q·F − VO₂)/(Q − VO₂) = (15 × 0.5 − 1)/(15 − 1).
	it('CMF EAN50 at 15 L/min with 1 L/min VO₂ → 46.4%', () =>
		expect(
			scrLoopFo2({ supplyFo2: 0.5, supplyRateLpm: 15, vo2Lpm: 1 }),
		).toBeCloseTo(0.464286, 6))
	it('no metabolism means loop = supply', () =>
		expect(
			scrLoopFo2({ supplyFo2: 0.4, supplyRateLpm: 10, vo2Lpm: 0 }),
		).toBeCloseTo(0.4, 12))
	it('floors at 0 when the supply cannot cover VO₂', () =>
		expect(scrLoopFo2({ supplyFo2: 0.21, supplyRateLpm: 3, vo2Lpm: 1 })).toBe(
			0,
		))
	it('rejects supply ≤ VO₂', () =>
		expect(() =>
			scrLoopFo2({ supplyFo2: 0.5, supplyRateLpm: 1, vo2Lpm: 1 }),
		).toThrow(RangeError))
	// 20 L/min × 4 ata / 10.
	it('passive SCR 1:10 at 30 m with 20 L/min RMV adds 8 L/min', () =>
		expect(
			passiveScrSupplyRate({ rmvLpm: 20, bellowsRatio: 10, depthM: 30 }),
		).toBeCloseTo(8, 12))
})
