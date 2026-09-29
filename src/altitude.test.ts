import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
	altitudeForSurfacePressure,
	surfaceAtaAtAltitude,
	surfacePressureAtAltitude,
	theoreticalOceanDepth,
} from './altitude'
import { ataAtDepth } from './pressure'

describe('surfacePressureAtAltitude', () => {
	// ICAO Standard Atmosphere (Doc 7488/3): 1013.25 hPa at MSL.
	it('is 1.01325 bar at sea level', () =>
		expect(surfacePressureAtAltitude(0)).toBeCloseTo(1.01325, 10))
	// ICAO Standard Atmosphere table: 898.76 hPa at 1000 m.
	it('is ≈ 0.8988 bar at 1000 m', () =>
		expect(surfacePressureAtAltitude(1000)).toBeCloseTo(0.8988, 3))
	// ICAO Standard Atmosphere table: 701.12 hPa at 3000 m.
	it('is ≈ 0.7011 bar at 3000 m', () =>
		expect(surfacePressureAtAltitude(3000)).toBeCloseTo(0.7011, 3))
	it('rejects altitudes outside the troposphere model', () => {
		expect(() => surfacePressureAtAltitude(11000)).toThrow(RangeError)
		expect(() => surfacePressureAtAltitude(-600)).toThrow(RangeError)
		expect(() => surfacePressureAtAltitude(NaN)).toThrow(RangeError)
	})
	it('inverts (property)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -500, max: 10999, noNaN: true }),
				(h) =>
					Math.abs(
						altitudeForSurfacePressure(surfacePressureAtAltitude(h)) - h,
					) < 1e-6,
			),
		)
	})
	it('rejects non-positive pressures in the inverse', () =>
		expect(() => altitudeForSurfacePressure(0)).toThrow(RangeError))
})

describe('surfaceAtaAtAltitude', () => {
	it('is 1 at sea level (matches SURFACE_ATA)', () =>
		expect(surfaceAtaAtAltitude(0)).toBeCloseTo(1, 12))
	it('is ≈ 0.887 at 1000 m', () =>
		expect(surfaceAtaAtAltitude(1000)).toBeCloseTo(0.887, 3))
	it('plugs into ataAtDepth', () =>
		expect(
			ataAtDepth(10, { surfacePressure: surfaceAtaAtAltitude(1000) }),
		).toBeCloseTo(1.887, 3))
})

describe('theoreticalOceanDepth (Cross correction)', () => {
	it('is unchanged at sea level', () =>
		expect(theoreticalOceanDepth(30, 0)).toBeCloseTo(30, 10))
	// 30 × 1.01325 / 0.89875 = 33.82 m.
	it('deepens a 30 m dive at 1000 m to ≈ 33.8 m', () =>
		expect(theoreticalOceanDepth(30, 1000)).toBeCloseTo(33.82, 2))
	it('rejects negative depth', () =>
		expect(() => theoreticalOceanDepth(-1, 0)).toThrow(RangeError))
})
