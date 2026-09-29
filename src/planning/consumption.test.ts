import { describe, expect, it } from 'vitest'
import {
	ccrO2Rate,
	gasRequirement,
	litresConsumed,
	rmv,
	sac,
	sacPressureRate,
} from './consumption'

describe('consumption', () => {
	// 100 bar / 25 min / 2.5 ata.
	it('sacPressureRate 200→100 bar in 25 min at 15 m = 1.6 bar/min', () =>
		expect(
			sacPressureRate({ startP: 200, endP: 100, minutes: 25, avgDepthM: 15 }),
		).toBeCloseTo(1.6, 12))
	it('rmv with a 12 L cylinder = 19.2 L/min', () =>
		expect(
			rmv({
				startP: 200,
				endP: 100,
				minutes: 25,
				avgDepthM: 15,
				tankVolumeL: 12,
			}),
		).toBeCloseTo(19.2, 12))
	it('litresConsumed 200→50 bar from 11.1 L = 1665 L', () =>
		expect(litresConsumed(200, 50, 11.1)).toBeCloseTo(1665, 9))
	it('litresConsumed with no drop is 0', () =>
		expect(litresConsumed(100, 100, 11.1)).toBe(0))
	it('litresConsumed rejects a pressure rise', () =>
		expect(() => litresConsumed(50, 100, 11.1)).toThrow(RangeError))
	it('sac 1800 L over 30 min at 20 m = 20 L/min', () =>
		expect(sac(1800, 20, 30)).toBeCloseTo(20, 12))
	it('sac rejects zero minutes', () =>
		expect(() => sac(1800, 20, 0)).toThrow(RangeError))
	it('ccrO2Rate 90 L in 60 min = 1.5 L/min', () =>
		expect(ccrO2Rate(90, 60)).toBe(1.5))
	it('gasRequirement 20 L/min at 20 m for 30 min = 1800 L', () =>
		expect(
			gasRequirement({ rmvLpm: 20, avgDepthM: 20, minutes: 30 }),
		).toBeCloseTo(1800, 9))
	it('sac inverts gasRequirement', () =>
		expect(
			sac(gasRequirement({ rmvLpm: 17, avgDepthM: 33, minutes: 41 }), 33, 41),
		).toBeCloseTo(17, 9))

	// Ported from fill-station gasPlanning.test.ts
	it('derives SAC and RMV from a logged dive', () => {
		const args = {
			startP: 200,
			endP: 100,
			minutes: 20,
			avgDepthM: 20,
			water: 'salt' as const,
		}
		expect(sacPressureRate(args)).toBeCloseTo(1.6667, 3)
		expect(rmv({ ...args, tankVolumeL: 12 })).toBeCloseTo(20, 2)
	})
	it('gasRequirement scales with depth ata and time', () =>
		expect(
			gasRequirement({ rmvLpm: 20, avgDepthM: 20, minutes: 20, water: 'salt' }),
		).toBeCloseTo(1200, 1))

	// Additional reference cases
	it('litresConsumed multiplies the pressure drop by water capacity', () =>
		expect(Math.round(litresConsumed(207, 55, 11.1))).toBe(1687))
	it('litresConsumed rejects a rise but returns 0 for no change', () => {
		expect(() => litresConsumed(55, 207, 11.1)).toThrow(RangeError)
		expect(litresConsumed(207, 207, 11.1)).toBe(0)
	})
	it('litresConsumed rejects non-finite input', () =>
		expect(() => litresConsumed(Number.NaN, 55, 11.1)).toThrow(RangeError))
	it('sac divides by duration and ambient pressure', () =>
		// 1687 L over 61 min at 35 m (4.5 ata)
		expect(sac(1687, 35, 61).toFixed(1)).toBe('6.1'))
	it('sac treats the surface as 1 ata', () =>
		expect(sac(600, 0, 60)).toBeCloseTo(10, 6))
	it('sac rejects bad input', () => {
		expect(() => sac(1687, Number.NaN, 61)).toThrow(RangeError)
		expect(() => sac(1687, 35, 0)).toThrow(RangeError)
	})
	it('ccrO2Rate is metabolic uptake, depth plays no part', () =>
		expect(ccrO2Rate(48, 60).toFixed(2)).toBe('0.80'))
	it('ccrO2Rate rejects zero duration', () =>
		expect(() => ccrO2Rate(48, 0)).toThrow(RangeError))
})
