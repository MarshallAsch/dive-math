/**
 * Breathing-gas density.
 * @module
 */
import { fn2 } from './gas'
import { assertGas, assertPositive } from './internal/validate'
import { ataAtDepth, depthAtAta, type DepthOptions } from './pressure'
import type { Gas } from './types'

/** O₂ density at 0 °C, 1 atm, g/L. Source: CRC Handbook of Chemistry and Physics. */
export const O2_DENSITY = 1.42897
/** N₂ density at 0 °C, 1 atm, g/L. Source: CRC Handbook of Chemistry and Physics. */
export const N2_DENSITY = 1.2506
/** He density at 0 °C, 1 atm, g/L. Source: CRC Handbook of Chemistry and Physics. */
export const HE_DENSITY = 0.17846
/** Recommended maximum, g/L. Source: Anthony & Mitchell, Rebreathers and Scientific Diving (2016). */
export const RECOMMENDED_MAX_DENSITY = 5.2
/** Hard maximum, g/L. Source: Anthony & Mitchell (2016). */
export const HARD_MAX_DENSITY = 6.3

/** Density at the surface, g/L. @example surfaceDensity(AIR) // 1.288 */
export function surfaceDensity(g: Gas): number {
	assertGas(g)
	return g.fo2 * O2_DENSITY + fn2(g) * N2_DENSITY + g.fhe * HE_DENSITY
}

/** Density at depth, g/L. @example densityAtDepth(AIR, 30) // 5.15 */
export function densityAtDepth(
	g: Gas,
	depthM: number,
	opts?: DepthOptions,
): number {
	return surfaceDensity(g) * ataAtDepth(depthM, opts)
}

/** Depth at which a gas reaches a density, m. @example depthForDensity(AIR, 5.2) // 30.38 */
export function depthForDensity(
	g: Gas,
	densityGpl: number,
	opts?: DepthOptions,
): number {
	assertPositive('densityGpl', densityGpl)
	return depthAtAta(densityGpl / surfaceDensity(g), opts)
}
