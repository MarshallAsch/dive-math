// replaces fill-station linear Z (MIGRATION.md)
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { AIR, gas } from './gas'
import { ATM_BAR } from './pressure'
import {
	componentZ,
	idealEquivalentPressure,
	mixZ,
	realPressureForIdealEquivalent,
	REAL_GAS_MAX_BAR,
} from './real-gas'

const O2 = gas(1)
const HE = gas(0, 1)

describe('Z-factor (GasPlanner compressibility.spec.ts)', () => {
	it('air at 207 bar is 1.04017669', () =>
		expect(mixZ(AIR, 207)).toBeCloseTo(1.04017669, 8))
	it('oxygen at 207 bar is 0.95879556', () =>
		expect(mixZ(O2, 207)).toBeCloseTo(0.95879556, 8))
	it('helium at 207 bar is 1.09756199', () =>
		expect(mixZ(HE, 207)).toBeCloseTo(1.09756199, 8))
	it('trimix 18/45 at 207 bar is 1.05930748', () =>
		expect(mixZ(gas(0.18, 0.45), 207)).toBeCloseTo(1.05930748, 8))
	it('trimix 18/45 at 232 bar is 1.07288297', () =>
		expect(mixZ(gas(0.18, 0.45), 232)).toBeCloseTo(1.07288297, 8))
	it('componentZ matches pure-gas mixZ', () => {
		expect(componentZ('o2', 150)).toBe(mixZ(O2, 150))
		expect(componentZ('he', 150)).toBe(mixZ(HE, 150))
		expect(componentZ('n2', 150)).toBe(mixZ(gas(0), 150))
	})
	it('Z → 1 as P → 0 (property)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0, max: 1, noNaN: true }),
				fc.double({ min: 0, max: 1, noNaN: true }),
				(fo2, heShare) =>
					Math.abs(mixZ(gas(fo2, (1 - fo2) * heShare), 1e-6) - 1) < 1e-8,
			),
		)
	})
	it('rejects pressures outside 0–500 bar', () => {
		expect(REAL_GAS_MAX_BAR).toBe(500)
		expect(() => mixZ(AIR, 501)).toThrow(RangeError)
		expect(() => mixZ(AIR, -1)).toThrow(RangeError)
		expect(() => componentZ('o2', NaN)).toThrow(RangeError)
	})
})

describe('idealEquivalentPressure', () => {
	it('is exactly 1 atm at 1 atm', () =>
		expect(idealEquivalentPressure(AIR, ATM_BAR)).toBeCloseTo(ATM_BAR, 12))
	// GasPlanner normalVolume() references (normalised at 1 bar; ours at 1 atm → ±0.005).
	it('trimix 25/25 at 200 bar ≈ 192.054', () =>
		expect(idealEquivalentPressure(gas(0.25, 0.25), 200)).toBeCloseTo(
			192.054,
			2,
		))
	it('air at 50 bar ≈ 50.446', () =>
		expect(idealEquivalentPressure(AIR, 50)).toBeCloseTo(50.446, 2))
	it('helium at 100 bar ≈ 95.475', () =>
		expect(idealEquivalentPressure(HE, 100)).toBeCloseTo(95.475, 2))
})

describe('realPressureForIdealEquivalent', () => {
	it('inverts idealEquivalentPressure (property)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0, max: 1, noNaN: true }),
				fc.double({ min: 0, max: 1, noNaN: true }),
				fc.double({ min: 1, max: 400, noNaN: true }),
				(fo2, heShare, p) => {
					const g = gas(fo2, (1 - fo2) * heShare)
					const back = realPressureForIdealEquivalent(
						g,
						idealEquivalentPressure(g, p),
					)
					return Math.abs(back - p) < 1e-6
				},
			),
		)
	})
	it('throws when the answer exceeds the model range', () =>
		expect(() => realPressureForIdealEquivalent(HE, 490)).toThrow(RangeError))
})
