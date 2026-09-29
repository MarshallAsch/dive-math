import { describe, expect, it } from 'vitest'
import {
	availableLitres,
	bailoutMinutes,
	minGasPressure,
	rockBottom,
} from './reserve'

describe('reserve', () => {
	// Stressed RMV 40; ascent 30/9 min at ata(15)=2.5 → 333.33 L; stop 40×1.5×3 = 180 L; ×2 divers.
	it('rockBottom', () =>
		expect(
			rockBottom({
				rmvLpm: 20,
				depthM: 30,
				ascentRateMpm: 9,
				stops: [{ depthM: 5, minutes: 3 }],
				stressFactor: 2,
				teamSize: 2,
			}),
		).toBeCloseTo(1026.6667, 4))
	it('rockBottom rejects a zero ascent rate', () =>
		expect(() =>
			rockBottom({
				rmvLpm: 20,
				depthM: 30,
				ascentRateMpm: 0,
				stops: [],
				stressFactor: 2,
				teamSize: 2,
			}),
		).toThrow(RangeError))
	it('rockBottom scales linearly with team size', () => {
		const base = {
			rmvLpm: 20,
			depthM: 30,
			ascentRateMpm: 9,
			stops: [{ depthM: 5, minutes: 3 }],
			stressFactor: 2,
			water: 'salt' as const,
		}
		expect(rockBottom({ ...base, teamSize: 2 })).toBeCloseTo(
			2 * rockBottom({ ...base, teamSize: 1 }),
			4,
		)
	})
	it('minGasPressure', () =>
		expect(minGasPressure({ minGasL: 1110, tankVolumeL: 11.1 })).toBeCloseTo(
			100,
			12,
		))
	it('minGasPressure converts minimum gas to tank pressure', () =>
		expect(minGasPressure({ minGasL: 1026.67, tankVolumeL: 12 })).toBeCloseTo(
			85.56,
			1,
		))
	// MIGRATION.md: a zero volume used to return Infinity.
	it('minGasPressure rejects a zero volume', () =>
		expect(() => minGasPressure({ minGasL: 1110, tankVolumeL: 0 })).toThrow(
			RangeError,
		))
	it('availableLitres is unrounded', () =>
		expect(availableLitres(11.1, 200.5)).toBeCloseTo(2225.55, 9))
	it('availableLitres is water capacity times fill pressure', () =>
		expect(Math.round(availableLitres(11.1, 207))).toBe(2298))
	it('availableLitres rejects bad input', () => {
		expect(() => availableLitres(0, 207)).toThrow(RangeError)
		expect(() => availableLitres(11.1, Number.NaN)).toThrow(RangeError)
	})
	// 2220 / (42.5 × 4).
	it('bailoutMinutes', () =>
		expect(bailoutMinutes(2220, 42.5, 30)).toBeCloseTo(13.0588, 4))
	it('bailoutMinutes divides available gas by consumption at depth', () =>
		// 2298 L, 42.5 L/min, 30 m (4 ata) → 13.5 min
		expect(bailoutMinutes(2298, 42.5, 30).toFixed(1)).toBe('13.5'))
	it('bailoutMinutes rejects bad input', () => {
		expect(() => bailoutMinutes(2298, 0, 30)).toThrow(RangeError)
		expect(() => bailoutMinutes(2298, 42.5, Number.NaN)).toThrow(RangeError)
	})
})
