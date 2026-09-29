import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
	densityAtDepth,
	depthForDensity,
	HARD_MAX_DENSITY,
	RECOMMENDED_MAX_DENSITY,
	surfaceDensity,
} from './density'
import { AIR, gas } from './gas'

describe('density', () => {
	// 0.209 × 1.42897 + 0.791 × 1.2506 (CRC Handbook densities at STP).
	it('air at the surface is 1.2879 g/L', () =>
		expect(surfaceDensity(AIR)).toBeCloseTo(1.28788, 5))
	it('air at 30 m is 5.1515 g/L', () =>
		expect(densityAtDepth(AIR, 30)).toBeCloseTo(5.15152, 5))
	it('18/45 at 60 m is 5.6017 g/L', () =>
		expect(densityAtDepth(gas(0.18, 0.45), 60)).toBeCloseTo(5.60171, 5))
	it('air hits 5.2 g/L at 30.38 m', () =>
		expect(depthForDensity(AIR, 5.2)).toBeCloseTo(30.3765, 4))
	// Anthony & Mitchell (2016) gas density limits.
	it('limits', () => {
		expect(RECOMMENDED_MAX_DENSITY).toBe(5.2)
		expect(HARD_MAX_DENSITY).toBe(6.3)
	})
	it('rejects non-positive density', () =>
		expect(() => depthForDensity(AIR, 0)).toThrow(RangeError))
	it('round trips (property)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0.05, max: 1, noNaN: true }),
				fc.double({ min: 0, max: 0.9, noNaN: true }),
				fc.double({ min: 0, max: 150, noNaN: true }),
				(fo2, heShare, depth) => {
					const g = gas(fo2, (1 - fo2) * heShare)
					return (
						Math.abs(depthForDensity(g, densityAtDepth(g, depth)) - depth) <
						1e-9
					)
				},
			),
		)
	})
})

describe('ported: fill-station', () => {
	it('air surface density is ~1.29 g/L', () => {
		expect(surfaceDensity(gas(0.21, 0))).toBeCloseTo(1.288, 2)
	})
	it('EAN32 at 30 m salt reaches the ~5.2 g/L recommended limit', () => {
		const d = densityAtDepth(gas(0.32, 0), 30, { water: 'salt' })
		expect(d).toBeCloseTo(5.23, 1)
		expect(d).toBeGreaterThan(RECOMMENDED_MAX_DENSITY - 0.1)
	})
	it('trimix is less dense than nitrox at the same depth', () => {
		const nitrox = densityAtDepth(gas(0.32, 0), 30, { water: 'salt' })
		const trimix = densityAtDepth(gas(0.18, 0.45), 30, { water: 'salt' })
		expect(trimix).toBeLessThan(nitrox)
	})
	it('depthForDensity inverts densityAtDepth', () => {
		const depth = depthForDensity(gas(0.32, 0), 5.2, { water: 'salt' })
		expect(densityAtDepth(gas(0.32, 0), depth, { water: 'salt' })).toBeCloseTo(
			5.2,
			4,
		)
	})
})
