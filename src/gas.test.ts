import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
	AIR,
	AIR_FN2,
	bestFhe,
	bestFo2,
	bestMix,
	ead,
	end,
	fn2,
	gas,
	mod,
	ppo2,
} from './gas'

const EAN32 = gas(0.32)
const TX1845 = gas(0.18, 0.45)
const TX2135 = gas(0.21, 0.35)

describe('gas()', () => {
	it('builds a frozen gas', () => {
		expect(gas(0.32)).toEqual({ fo2: 0.32, fhe: 0 })
		expect(Object.isFrozen(gas(0.32))).toBe(true)
	})
	it('rejects impossible mixes', () => {
		expect(() => gas(1.2)).toThrow(RangeError)
		expect(() => gas(0.5, 0.6)).toThrow(RangeError)
		expect(() => gas(NaN)).toThrow(RangeError)
	})
	// Air composition 20.9% O₂: NOAA Diving Manual; matches GasPlanner o2InAir.
	it('AIR is 20.9% O₂', () => {
		expect(AIR).toEqual({ fo2: 0.209, fhe: 0 })
		expect(AIR_FN2).toBeCloseTo(0.791, 12)
	})
	it('fn2 is the remainder', () => {
		expect(fn2(TX1845)).toBeCloseTo(0.37, 12)
		expect(fn2(gas(1))).toBe(0)
	})
})

describe('ppo2', () => {
	it('EAN32 at 30 m is 1.28', () =>
		expect(ppo2(EAN32, 30)).toBeCloseTo(1.28, 12))
	it('air at the surface is 0.209', () => expect(ppo2(AIR, 0)).toBe(0.209))
	it('rejects bad gas', () =>
		expect(() => ppo2({ fo2: -1, fhe: 0 }, 10)).toThrow(RangeError))
})

describe('mod', () => {
	// (1.4/0.32 − 1) × 10 = 33.75 m.
	it('EAN32 at 1.4 is 33.75 m', () =>
		expect(mod(EAN32, 1.4)).toBeCloseTo(33.75, 10))
	it('EAN32 at 1.6 is 40 m', () => expect(mod(EAN32, 1.6)).toBeCloseTo(40, 10))
	it('O₂ at 1.6 is 6 m', () => expect(mod(gas(1), 1.6)).toBeCloseTo(6, 10))
	it('fresh water is deeper', () =>
		expect(mod(EAN32, 1.4, { water: 'fresh' })).toBeCloseTo(34.7625, 10))
	// negative when not breathable even at the surface.
	it('is negative when maxPpo2 < fo2', () => expect(mod(gas(1), 0.5)).toBe(-5))
	it('rejects fo2 = 0 and maxPpo2 ≤ 0', () => {
		expect(() => mod(gas(0, 1), 1.4)).toThrow(RangeError)
		expect(() => mod(EAN32, 0)).toThrow(RangeError)
	})
	it('inverts ppo2 (property)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0.05, max: 1, noNaN: true }),
				fc.double({ min: 0, max: 200, noNaN: true }),
				(fo2, depth) => {
					const g = gas(fo2)
					return Math.abs(mod(g, ppo2(g, depth)) - depth) < 1e-9
				},
			),
		)
	})
})

describe('end', () => {
	// O₂-narcotic: 7 ata × (1 − 0.45) = 3.85 ata → 28.5 m.
	it('18/45 at 60 m is 28.5 m (O₂ narcotic)', () =>
		expect(end(TX1845, 60)).toBeCloseTo(28.5, 10))
	// N₂-only: 7 × 0.37 / 0.791 = 3.2743 ata → 22.74 m.
	it('18/45 at 60 m is 22.74 m (N₂ only)', () =>
		expect(end(TX1845, 60, { model: 'n2-only' })).toBeCloseTo(22.7434, 4))
	it('air END equals depth (O₂ narcotic)', () =>
		expect(end(AIR, 40)).toBeCloseTo(40, 10))
	// shallow helium → negative END unless floored.
	it('is negative shallow unless floorAtSurface', () => {
		expect(end(TX2135, 5)).toBeCloseTo(-0.25, 10)
		expect(end(TX2135, 5, { floorAtSurface: true })).toBe(0)
	})
	it('decreases as helium increases (property)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0, max: 0.4, noNaN: true }),
				fc.double({ min: 0, max: 0.4, noNaN: true }),
				(a, b) => {
					const [lo, hi] = a <= b ? [a, b] : [b, a]
					return end(gas(0.18, hi), 60) <= end(gas(0.18, lo), 60) + 1e-12
				},
			),
		)
	})
})

describe('ead', () => {
	// 4 ata × 0.68 / 0.791 = 3.4387 ata → 24.39 m.
	it('EAN32 at 30 m is 24.39 m', () =>
		expect(ead(EAN32, 30)).toBeCloseTo(24.3869, 4))
	it('equals end n2-only', () =>
		expect(ead(TX1845, 60)).toBe(end(TX1845, 60, { model: 'n2-only' })))
	it('air EAD equals depth', () => expect(ead(AIR, 30)).toBeCloseTo(30, 10))
})

describe('best mix', () => {
	it('bestFo2 at 60 m / 1.4 is 0.2', () =>
		expect(bestFo2(60, 1.4)).toBeCloseTo(0.2, 12))
	// Clamped to 1, matching fill-station.
	it('bestFo2 clamps to 1 when shallow', () => expect(bestFo2(3, 1.6)).toBe(1))
	it('bestFhe at 60 m for END 30 m is 3/7', () =>
		expect(bestFhe(60, 30)).toBeCloseTo(3 / 7, 12))
	it('bestFhe is 0 when END ≥ depth', () => expect(bestFhe(30, 40)).toBe(0))
	it('bestMix with END', () => {
		const m = bestMix({ depthM: 60, maxPpo2: 1.4, targetEndM: 30 })
		expect(m.fo2).toBeCloseTo(0.2, 12)
		expect(m.fhe).toBeCloseTo(0.428571, 6)
		expect(m.fn2).toBeCloseTo(0.371429, 6)
	})
	it('bestMix without END is nitrox', () => {
		const m = bestMix({ depthM: 30, maxPpo2: 1.4 })
		expect(m.fo2).toBeCloseTo(0.35, 12)
		expect(m.fhe).toBe(0)
		expect(m.fn2).toBeCloseTo(0.65, 12)
	})
	it('fractions stay in [0,1] and sum to 1 (property)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0, max: 150, noNaN: true }),
				fc.double({ min: 0.16, max: 1.6, noNaN: true }),
				fc.double({ min: 0, max: 60, noNaN: true }),
				(depthM, maxPpo2, targetEndM) => {
					const m = bestMix({ depthM, maxPpo2, targetEndM })
					const inRange = [m.fo2, m.fhe, m.fn2].every((f) => f >= 0 && f <= 1)
					return inRange && Math.abs(m.fo2 + m.fhe + m.fn2 - 1) < 1e-9
				},
			),
		)
	})
})

describe('ported: fill-station', () => {
	it('mod EAN32 at 1.4 salt', () =>
		expect(mod(gas(0.32), 1.4, { water: 'salt' })).toBeCloseTo(33.75, 2))
	it('mod EAN32 at 1.6 salt', () =>
		expect(mod(gas(0.32), 1.6, { water: 'salt' })).toBeCloseTo(40, 2))
	it('mod is deeper in fresh water than salt', () => {
		const salt = mod(gas(0.32), 1.4, { water: 'salt' })
		const fresh = mod(gas(0.32), 1.4, { water: 'fresh' })
		expect(fresh).toBeGreaterThan(salt)
	})
	it('end treats O2 as narcotic by default model', () => {
		// trimix 18/45 at 60 m salt: (60+10)*(1-0.45) - 10 = 28.5 m
		expect(
			end(gas(0.18, 0.45), 60, { water: 'salt', model: 'o2-narcotic' }),
		).toBeCloseTo(28.5, 2)
	})
	it('end n2-only is shallower than o2-narcotic for trimix', () => {
		const o2 = end(gas(0.18, 0.45), 60, { water: 'salt', model: 'o2-narcotic' })
		const n2 = end(gas(0.18, 0.45), 60, { water: 'salt', model: 'n2-only' })
		expect(n2).toBeLessThan(o2)
	})
	it('end returns the dive depth for air on the o2-narcotic model', () => {
		expect(
			end(gas(0.21, 0), 30, { water: 'salt', model: 'o2-narcotic' }),
		).toBeCloseTo(30, 6)
	})
	it('ead ~24.4 m for EAN32 at 30 m salt', () =>
		expect(ead(gas(0.32, 0), 30, { water: 'salt' })).toBeCloseTo(24.39, 2))
	it('ead for air is ~ the dive depth', () =>
		expect(ead(gas(0.21, 0), 30, { water: 'salt' })).toBeCloseTo(29.95, 1))
	it('richer nitrox gives a shallower EAD', () => {
		const lean = ead(gas(0.28, 0), 30, { water: 'salt' })
		const rich = ead(gas(0.36, 0), 30, { water: 'salt' })
		expect(rich).toBeLessThan(lean)
	})
	it('bestFo2 gives 0.35 for 30 m salt at ppO2 1.4', () =>
		expect(bestFo2(30, 1.4, { water: 'salt' })).toBeCloseTo(0.35, 4))
	it('bestFo2 clamps to 1.0 in shallow water', () =>
		expect(bestFo2(3, 1.4, { water: 'salt' })).toBe(1))
	it('bestFo2 fresh gives a richer mix than salt at the same depth', () => {
		const salt = bestFo2(30, 1.4, { water: 'salt' })
		const fresh = bestFo2(30, 1.4, { water: 'fresh' })
		expect(fresh).toBeGreaterThan(salt)
	})
	it('bestFhe caps END at 30 m for a 60 m dive (salt)', () =>
		expect(bestFhe(60, 30, { water: 'salt' })).toBeCloseTo(0.4286, 3))
	it('bestFhe returns 0 when the target END is at or beyond the depth', () =>
		expect(bestFhe(30, 30, { water: 'salt' })).toBe(0))
	it('bestMix returns fhe 0 when no END target is given', () => {
		const m = bestMix({ depthM: 30, maxPpo2: 1.4, water: 'salt' })
		expect(m.fhe).toBe(0)
		expect(m.fo2).toBeCloseTo(0.35, 4)
		expect(m.fn2).toBeCloseTo(0.65, 4)
	})
	it('bestMix fractions sum to 1', () => {
		const m = bestMix({
			depthM: 60,
			maxPpo2: 1.4,
			targetEndM: 30,
			water: 'salt',
		})
		expect(m.fo2 + m.fhe + m.fn2).toBeCloseTo(1, 6)
	})
})

describe('reference cases', () => {
	it('bestMix finds the richest mix for the ppO2 ceiling', () => {
		// 30 m = 4 ata; 1.4 / 4 = 35%
		expect(bestMix({ depthM: 30, maxPpo2: 1.4 }).fo2).toBeCloseTo(0.35, 6)
	})
	it('bestMix adds helium to hold the narcotic depth limit', () => {
		// 45 m = 5.5 ata, END limit 30 m = 4 ata -> He = 1 - 4/5.5
		const mix = bestMix({ depthM: 45, maxPpo2: 1.4, targetEndM: 30 })
		expect(mix.fo2).toBeCloseTo(0.254545, 5)
		expect(mix.fhe).toBeCloseTo(0.272727, 5)
		expect(mix.fn2).toBeCloseTo(0.472727, 5)
	})
	it('bestMix uses no helium when the END limit is at or below the planned depth', () => {
		expect(bestMix({ depthM: 30, maxPpo2: 1.4, targetEndM: 30 }).fhe).toBe(0)
		expect(bestMix({ depthM: 30, maxPpo2: 1.4, targetEndM: 40 }).fhe).toBe(0)
	})
	it('ppo2 multiplies the oxygen fraction by ambient pressure', () => {
		expect(ppo2(gas(0.32), 30)).toBeCloseTo(1.28, 6)
	})
	it('mod finds the depth where the mix hits the ppO2 ceiling', () => {
		expect(mod(gas(0.32), 1.4)).toBeCloseTo(33.75, 6)
	})
	it('end counts oxygen as narcotic, same as nitrogen', () => {
		// 45 m = 5.5 ata; 45% helium -> 5.5 x 0.55 = 3.025 ata -> 20.25 m
		expect(end(gas(0.21, 0.45), 45, { floorAtSurface: true })).toBeCloseTo(
			20.25,
			6,
		)
	})
	it('end never reports shallower than the surface', () => {
		// fo2 0.05 (not 0.21): 0.21 + 0.95 exceeds 1 and gas() rejects it; O2-narcotic END ignores fo2.
		expect(end(gas(0.05, 0.95), 10, { floorAtSurface: true })).toBe(0)
	})
})
