/**
 * Altitude diving. ICAO standard atmosphere (troposphere, −500…11 000 m).
 * @module
 */
import {
	assertFinite,
	assertNonNegative,
	assertPositive,
} from './internal/validate'
import { ATM_BAR } from './pressure'

// ICAO Doc 7488/3: T0 = 288.15 K, lapse rate L = 0.0065 K/m, exponent
// g0·M/(R·L) = 5.25588.
const T0 = 288.15
const LAPSE = 0.0065
const EXPONENT = 5.25588
const MIN_ALT = -500
const MAX_ALT = 11000

/** Barometric pressure at altitude, bar. @example surfacePressureAtAltitude(1000) // 0.8988 */
export function surfacePressureAtAltitude(altitudeM: number): number {
	assertFinite('altitudeM', altitudeM)
	if (altitudeM < MIN_ALT || altitudeM >= MAX_ALT) {
		throw new RangeError(
			`altitudeM must be in [${MIN_ALT}, ${MAX_ALT}) (got ${altitudeM})`,
		)
	}
	return ATM_BAR * Math.pow(1 - (LAPSE * altitudeM) / T0, EXPONENT)
}

/** Altitude for a barometric pressure, m. @example altitudeForSurfacePressure(0.8988) // ≈ 1000 */
export function altitudeForSurfacePressure(pressureBar: number): number {
	assertPositive('pressureBar', pressureBar)
	return (T0 / LAPSE) * (1 - Math.pow(pressureBar / ATM_BAR, 1 / EXPONENT))
}

/**
 * Surface pressure relative to sea level (1.0 at 0 m), for the
 * `surfacePressure` depth option. @example surfaceAtaAtAltitude(1000) // 0.887
 */
export function surfaceAtaAtAltitude(altitudeM: number): number {
	return surfacePressureAtAltitude(altitudeM) / ATM_BAR
}

/**
 * Cross correction: the sea-level depth with the same pressure ratio, for
 * using sea-level tables at altitude. @example theoreticalOceanDepth(30, 1000) // 33.82
 */
export function theoreticalOceanDepth(
	depthM: number,
	altitudeM: number,
): number {
	assertNonNegative('depthM', depthM)
	return (depthM * ATM_BAR) / surfacePressureAtAltitude(altitudeM)
}
