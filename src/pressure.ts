/**
 * Depth ↔ pressure. Depth math uses a 1 ata surface (dive-table convention)
 * unless `surfacePressure` is given; fill math uses {@link ATM_BAR}.
 * @module
 */
import {
	assertFinite,
	assertNonNegative,
	assertPositive,
} from './internal/validate'
import type { Water } from './types'

export type { Water } from './types'

/**
 * Metres of water per bar. Salt: 10 m (33 fsw per atm, dive-table
 * convention). Fresh: 10.3 m (34 ffw vs 33 fsw per atm → 10 × 34/33).
 */
export const METERS_PER_BAR: Readonly<Record<Water, number>> = Object.freeze({
	salt: 10,
	fresh: 10.3,
})

/** Surface pressure for depth math, ata (dive-table convention, 1 ata ≈ 1 bar). */
export const SURFACE_ATA = 1

/** Standard atmosphere, bar. Source: ISO 2533 / ICAO (101 325 Pa). */
export const ATM_BAR = 1.01325

/** Options shared by every depth-based function. */
export interface DepthOptions {
	/** Water type. Default `'salt'`. */
	water?: Water
	/** Surface pressure, ata. Default {@link SURFACE_ATA}. See `surfaceAtaAtAltitude`. */
	surfacePressure?: number
}

/** Metres per bar for a water type. @example metersPerBar('fresh') // 10.3 */
export function metersPerBar(water: Water = 'salt'): number {
	const m = METERS_PER_BAR[water]
	if (m === undefined) {
		throw new RangeError(
			`water must be 'salt' or 'fresh' (got ${String(water)})`,
		)
	}
	return m
}

/** Resolved surface pressure, ata. @example surfacePressure({ surfacePressure: 0.8 }) // 0.8 */
export function surfacePressure(opts?: DepthOptions): number {
	const s = opts?.surfacePressure ?? SURFACE_ATA
	assertPositive('surfacePressure', s)
	return s
}

/** Absolute pressure at depth, ata. @example ataAtDepth(30) // 4 */
export function ataAtDepth(depthM: number, opts?: DepthOptions): number {
	assertNonNegative('depthM', depthM)
	return surfacePressure(opts) + depthM / metersPerBar(opts?.water)
}

/**
 * Depth for an absolute pressure, metres. Negative when `ata` is below the
 * surface pressure. @example depthAtAta(4) // 30
 */
export function depthAtAta(ata: number, opts?: DepthOptions): number {
	assertFinite('ata', ata)
	return (ata - surfacePressure(opts)) * metersPerBar(opts?.water)
}

/** Gauge → absolute, bar. @example gaugeToAbs(200) // 201.01325 */
export function gaugeToAbs(gaugeBar: number): number {
	assertFinite('gaugeBar', gaugeBar)
	return gaugeBar + ATM_BAR
}

/** Absolute → gauge, bar. @example absToGauge(201.01325) // 200 */
export function absToGauge(absBar: number): number {
	assertFinite('absBar', absBar)
	return absBar - ATM_BAR
}
