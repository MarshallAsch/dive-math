import {
	assertFraction,
	assertNonNegative,
	assertPositive,
} from '../internal/validate'
import { ataAtDepth, type DepthOptions } from '../pressure'

/**
 * Steady-state SCR loop O₂ fraction from an O₂ mass balance:
 * F_loop = (Q·F_supply − VO₂) / (Q − VO₂), with Q the fresh-gas supply
 * and VO₂ the metabolic uptake (both surface L/min). Floored at 0.
 * Source: standard steady-state SCR mass balance (e.g. Nuckols et al., US Navy SCR analyses).
 * @example scrLoopFo2({ supplyFo2: 0.5, supplyRateLpm: 15, vo2Lpm: 1 }) // 0.464
 */
export function scrLoopFo2(input: {
	supplyFo2: number
	supplyRateLpm: number
	vo2Lpm: number
}): number {
	const { supplyFo2, supplyRateLpm, vo2Lpm } = input
	assertFraction('supplyFo2', supplyFo2)
	assertPositive('supplyRateLpm', supplyRateLpm)
	assertNonNegative('vo2Lpm', vo2Lpm)
	if (supplyRateLpm <= vo2Lpm) {
		throw new RangeError(
			`supplyRateLpm (${supplyRateLpm}) must exceed vo2Lpm (${vo2Lpm})`,
		)
	}
	return Math.max(
		0,
		(supplyRateLpm * supplyFo2 - vo2Lpm) / (supplyRateLpm - vo2Lpm),
	)
}

/**
 * Fresh-gas addition of a passive SCR, surface L/min: a fixed 1/ratio of
 * each breath is dumped at ambient pressure and replaced.
 * @example passiveScrSupplyRate({ rmvLpm: 20, bellowsRatio: 10, depthM: 30 }) // 8
 */
export function passiveScrSupplyRate(
	input: {
		rmvLpm: number
		bellowsRatio: number
		depthM: number
	} & DepthOptions,
): number {
	const { rmvLpm, bellowsRatio, depthM, ...opts } = input
	assertNonNegative('rmvLpm', rmvLpm)
	assertPositive('bellowsRatio', bellowsRatio)
	return (rmvLpm * ataAtDepth(depthM, opts)) / bellowsRatio
}
