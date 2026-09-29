/**
 * Breathing-gas math: ppO₂, MOD, END/EAD and best mix.
 * @module
 */
import {
	assertGas,
	assertNonNegative,
	assertPositive,
} from './internal/validate'
import {
	ataAtDepth,
	depthAtAta,
	surfacePressure,
	type DepthOptions,
} from './pressure'
import type { Gas } from './types'

export type { Gas } from './types'

/** Air: 20.9% O₂, remainder N₂ (argon lumped in). Source: NOAA Diving Manual. */
export const AIR: Gas = Object.freeze({ fo2: 0.209, fhe: 0 })
/** N₂ fraction of {@link AIR}. */
export const AIR_FN2 = 1 - AIR.fo2

/** Build a validated, frozen gas. @example gas(0.18, 0.45) // trimix 18/45 */
export function gas(fo2: number, fhe = 0): Gas {
	const g = { fo2, fhe }
	assertGas(g)
	return Object.freeze(g)
}

/** Nitrogen fraction. @example fn2(gas(0.32)) // 0.68 */
export function fn2(g: Gas): number {
	assertGas(g)
	return Math.max(0, 1 - g.fo2 - g.fhe)
}

/** Oxygen partial pressure at depth, ata. @example ppo2(gas(0.32), 30) // 1.28 */
export function ppo2(g: Gas, depthM: number, opts?: DepthOptions): number {
	assertGas(g)
	return g.fo2 * ataAtDepth(depthM, opts)
}

/**
 * Maximum operating depth, m. Negative when `maxPpo2 < fo2` (not breathable
 * even at the surface). @example mod(gas(0.32), 1.4) // 33.75
 */
export function mod(g: Gas, maxPpo2: number, opts?: DepthOptions): number {
	assertGas(g)
	assertPositive('gas.fo2', g.fo2)
	assertPositive('maxPpo2', maxPpo2)
	return depthAtAta(maxPpo2 / g.fo2, opts)
}

/** Which gases count as narcotic for END. */
export type EndModel = 'o2-narcotic' | 'n2-only'

/** Options for {@link end}. */
export interface EndOptions extends DepthOptions {
	/** Default `'o2-narcotic'` (O₂ and N₂ narcotic, He not). */
	model?: EndModel
	/** Clamp the result at 0 m instead of returning a negative depth. Default false. */
	floorAtSurface?: boolean
}

/** Equivalent narcotic depth, m. @example end(gas(0.18, 0.45), 60) // 28.5 */
export function end(g: Gas, depthM: number, opts: EndOptions = {}): number {
	assertGas(g)
	const ata = ataAtDepth(depthM, opts)
	const narcoticAta =
		opts.model === 'n2-only' ? (ata * fn2(g)) / AIR_FN2 : ata * (1 - g.fhe)
	const resolved = opts.floorAtSurface
		? Math.max(surfacePressure(opts), narcoticAta)
		: narcoticAta
	return depthAtAta(resolved, opts)
}

/** Equivalent air depth, m (END with N₂ only). @example ead(gas(0.32), 30) // 24.39 */
export function ead(
	g: Gas,
	depthM: number,
	opts: DepthOptions & { floorAtSurface?: boolean } = {},
): number {
	return end(g, depthM, { ...opts, model: 'n2-only' })
}

/** Richest O₂ fraction for a depth and ppO₂ limit, clamped to 1. @example bestFo2(60, 1.4) // 0.2 */
export function bestFo2(
	depthM: number,
	maxPpo2: number,
	opts?: DepthOptions,
): number {
	assertPositive('maxPpo2', maxPpo2)
	return Math.min(1, maxPpo2 / ataAtDepth(depthM, opts))
}

/**
 * Least helium fraction that keeps END (O₂ narcotic) at or below the target.
 * @example bestFhe(60, 30) // 0.4286
 */
export function bestFhe(
	depthM: number,
	targetEndM: number,
	opts?: DepthOptions,
): number {
	assertNonNegative('targetEndM', targetEndM)
	return Math.max(
		0,
		1 - ataAtDepth(targetEndM, opts) / ataAtDepth(depthM, opts),
	)
}

/** Input for {@link bestMix}. */
export interface BestMixInput extends DepthOptions {
	depthM: number
	maxPpo2: number
	/** Omit for nitrox (no helium). */
	targetEndM?: number
}

/**
 * Best mix for a depth. Helium is capped so fractions never exceed 1.
 * @example bestMix({ depthM: 60, maxPpo2: 1.4, targetEndM: 30 }) // { fo2: 0.2, fhe: 0.4286, fn2: 0.3714 }
 */
export function bestMix(input: BestMixInput): Gas & { fn2: number } {
	const { depthM, maxPpo2, targetEndM, ...opts } = input
	const fo2 = bestFo2(depthM, maxPpo2, opts)
	const fhe =
		targetEndM === undefined
			? 0
			: Math.min(1 - fo2, bestFhe(depthM, targetEndM, opts))
	return { fo2, fhe, fn2: Math.max(0, 1 - fo2 - fhe) }
}
