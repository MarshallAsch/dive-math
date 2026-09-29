import { assertNonNegative } from '../internal/validate'

/** Galvanic or optical O₂ sensor brand. */
export type O2Brand = 'Aii' | 'AST' | 'Greenflash'
/** Serviceability verdict for one cell. */
export type O2Status = 'PASS' | 'QUALIFIED_PENDING' | 'FAIL'
/** Machine-readable reason behind a cell verdict. */
export type O2CellReason =
	| 'below-absolute-floor'
	| 'above-ambient-ceiling'
	| 'high-deviation'
	| 'within-spec'
	| 'low-deviation'
	| 'ratio-collapse'

/** Result of classifying one O₂ cell. */
export interface O2CellVerdict {
	status: O2Status
	reason: O2CellReason
	/** Deviation from theoretical 100% O₂ mV, percent. Null when not computed. */
	deviationPercent: number | null
	ambientFlag?: 'low' | 'critical'
}

// O2 sensor serviceability classification — implemented per the maintainer's
// classification rules. Theoretical 100% O2 mV = ambient mV × 4.78. Factory
// tolerance is ±2.5% of theoretical, asymmetric: high-side deviation is never "qualified" (it
// reads as calibration/contamination, not aging), low-side has a QUALIFIED_PENDING band between
// -2.5% and -5% before a hard FAIL below that.

/** Supported O₂ sensor brands. */
export const O2_SENSOR_BRANDS: readonly O2Brand[] = ['Aii', 'AST', 'Greenflash']

// Ambient acceptable range per brand. Greenflash is a solid-state optical sensor — no
// current-limiting failure mode, doesn't output below ~40% O2, and the ambient/ratio test
// described here doesn't apply to it the way it does to galvanic Aii/AST cells.
/** Acceptable ambient mV range [floor, ceiling] per brand; null when the ratio test does not apply. */
export const O2_AMBIENT_RANGE: Record<
	O2Brand,
	readonly [number, number] | null
> = {
	Aii: [10, 14],
	AST: [9, 14],
	Greenflash: null,
}

/**
 * 8 mV is an absolute hard floor, independent of manufacturer spec — nothing below it is
 * accepted regardless of what the ratio math would otherwise say. Not arbitrary: the source
 * file itself cites ~8 mV ambient as an end-of-life dropout signature, so this floor reflects
 * a known failure pattern, not a guess.
 */
export const ABSOLUTE_AMBIENT_FLOOR_MV = 8

/** A healthy galvanic cell reads roughly 4.78× its air millivolts in pure oxygen. */
export const THEORETICAL_RATIO = 4.78

/**
 * Classify an O₂ cell from its ambient-air and pure-O₂ millivolt readings.
 *
 * Ambient handling:
 * - Manufacturer spec (10-14 Aii, 9-14 AST) is a hard UPPER limit — above ceiling is an
 *   automatic FAIL.
 * - Below the manufacturer floor is NOT an automatic fail — it's a caution flag on the ambient
 *   reading itself (ambientFlag: "low"), while the PASS/QUALIFIED/FAIL verdict still comes from
 *   the ratio-to-100%-O2 math, same as any other reading.
 * - 8 mV is an absolute floor regardless of the ratio.
 *
 * @returns The verdict, or null when the ratio test does not apply (Greenflash).
 * @throws {RangeError} If either reading is negative or not finite.
 * @example classifyO2Cell({ brand: 'Aii', ambientMv: 11, o2Mv: 52.58 })?.status // 'PASS'
 */
export function classifyO2Cell(input: {
	brand: O2Brand
	ambientMv: number
	o2Mv: number
}): O2CellVerdict | null {
	const { brand, ambientMv: ambientMV, o2Mv: o2MV } = input
	assertNonNegative('ambientMv', ambientMV)
	assertNonNegative('o2Mv', o2MV)
	const range = O2_AMBIENT_RANGE[brand]
	if (!range) return null // ratio test doesn't apply
	const [floor, ceiling] = range

	if (ambientMV < ABSOLUTE_AMBIENT_FLOOR_MV) {
		return {
			status: 'FAIL',
			reason: 'below-absolute-floor',
			deviationPercent: null,
			ambientFlag: 'critical',
		}
	}
	// The spec's classify() only checks a lower ambient floor. The manufacturer range ("between 10
	// and 14 mV") also specifies a ceiling — added here as an explicit FAIL condition, since it wasn't in the pseudocode but is
	// clearly intended.
	if (ambientMV > ceiling) {
		return {
			status: 'FAIL',
			reason: 'above-ambient-ceiling',
			deviationPercent: null,
		}
	}

	const belowMfrFloor = ambientMV < floor
	const theoretical = ambientMV * THEORETICAL_RATIO
	const deviation = ((o2MV - theoretical) / theoretical) * 100

	let result: O2CellVerdict
	if (deviation > 2.5) {
		result = {
			status: 'FAIL',
			reason: 'high-deviation',
			deviationPercent: deviation,
		}
	} else if (deviation >= -2.5) {
		result = {
			status: 'PASS',
			reason: 'within-spec',
			deviationPercent: deviation,
		}
	} else if (deviation >= -5.0) {
		result = {
			status: 'QUALIFIED_PENDING',
			reason: 'low-deviation',
			deviationPercent: deviation,
		}
	} else {
		result = {
			status: 'FAIL',
			reason: 'ratio-collapse',
			deviationPercent: deviation,
		}
	}

	return belowMfrFloor ? { ...result, ambientFlag: 'low' } : result
}
