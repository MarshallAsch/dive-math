import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { AIR, gas } from '../gas'
import { ataAtDepth } from '../pressure'
import {
	diluentMod,
	diluentPpo2,
	effectivePpo2,
	HYPOXIC_PPO2,
	hypoxicFloor,
	isFlushSafe,
	loopFo2,
	loopInertFractions,
} from './loop'

const TX1845 = gas(0.18, 0.45)

describe('CCR loop', () => {
	it('holds the setpoint when ambient allows', () =>
		expect(effectivePpo2({ setpoint: 1.3, diluent: AIR, depthM: 30 })).toBe(
			1.3,
		))
	it('is capped at ambient when shallow (pure O₂ loop)', () =>
		expect(
			effectivePpo2({ setpoint: 1.3, diluent: AIR, depthM: 2 }),
		).toBeCloseTo(1.2, 12))
	// Air diluent ppO₂ at 60 m = 0.209 × 7 = 1.463 > setpoint 0.7.
	it('cannot go below the diluent ppO₂', () =>
		expect(
			effectivePpo2({ setpoint: 0.7, diluent: AIR, depthM: 60 }),
		).toBeCloseTo(1.463, 12))
	it('loopFo2 = 1.3 / 4 at 30 m', () =>
		expect(loopFo2({ setpoint: 1.3, diluent: AIR, depthM: 30 })).toBeCloseTo(
			0.325,
			12,
		))
	// (1 − 0.325) × 0.45 / 0.82.
	it('loopInertFractions keeps the diluent He:N₂ ratio', () => {
		const g = loopInertFractions({ setpoint: 1.3, diluent: TX1845, depthM: 30 })
		expect(g.fo2).toBeCloseTo(0.325, 12)
		expect(g.fhe).toBeCloseTo(0.370427, 6)
	})
	it('pure O₂ diluent leaves no inert gas', () =>
		expect(
			loopInertFractions({ setpoint: 1.3, diluent: gas(1), depthM: 3 }).fhe,
		).toBe(0))
	it('loop fractions stay valid (property)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0.4, max: 1.6, noNaN: true }),
				fc.double({ min: 0.05, max: 0.5, noNaN: true }),
				fc.double({ min: 0, max: 0.9, noNaN: true }),
				fc.double({ min: 0, max: 150, noNaN: true }),
				(setpoint, dFo2, heShare, depthM) => {
					const diluent = gas(dFo2, (1 - dFo2) * heShare)
					const g = loopInertFractions({ setpoint, diluent, depthM })
					const p = effectivePpo2({ setpoint, diluent, depthM })
					return (
						g.fo2 >= 0 &&
						g.fhe >= 0 &&
						g.fo2 + g.fhe <= 1 + 1e-9 &&
						p <= ataAtDepth(depthM) + 1e-12
					)
				},
			),
		)
	})
	it('diluentPpo2 and diluentMod', () => {
		expect(diluentPpo2(AIR, 30)).toBeCloseTo(0.836, 12)
		expect(diluentMod(AIR, 1.6)).toBeCloseTo(66.555, 3)
	})
	// Commonly cited minimum inspired ppO₂ (IANTD/TDI trimix standards).
	it('hypoxic floor of 10/70 at 0.16 is 6 m', () => {
		expect(HYPOXIC_PPO2).toBe(0.16)
		expect(hypoxicFloor(gas(0.1, 0.7))).toBeCloseTo(6, 9)
	})
	it('hypoxic floor of air is the surface', () =>
		expect(hypoxicFloor(AIR)).toBe(0))
	it('isFlushSafe checks both bounds', () => {
		expect(isFlushSafe({ diluent: AIR, depthM: 30, maxPpo2: 1.6 })).toBe(true)
		expect(isFlushSafe({ diluent: AIR, depthM: 70, maxPpo2: 1.6 })).toBe(false)
		expect(
			isFlushSafe({ diluent: gas(0.1, 0.7), depthM: 3, maxPpo2: 1.6 }),
		).toBe(false)
	})
	it('rejects bad input', () => {
		expect(() =>
			effectivePpo2({ setpoint: 0, diluent: AIR, depthM: 30 }),
		).toThrow(RangeError)
		expect(() => hypoxicFloor(gas(0, 1))).toThrow(RangeError)
	})
})
