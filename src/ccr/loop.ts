import { mod, ppo2 } from '../gas'
import { assertGas, assertPositive } from '../internal/validate'
import { ataAtDepth, depthAtAta, type DepthOptions } from '../pressure'
import type { Gas } from '../types'

/** Minimum inspired ppO₂, ata. Source: commonly cited floor in IANTD/TDI trimix standards (some agencies use 0.18). */
export const HYPOXIC_PPO2 = 0.16

/** Inputs describing a CCR loop at a given depth. */
export interface LoopInput extends DepthOptions {
	/** Setpoint, ata. */
	setpoint: number
	diluent: Gas
	depthM: number
}

/** Diluent ppO₂ at depth, ata. @example diluentPpo2(AIR, 30) // 0.836 */
export function diluentPpo2(
	diluent: Gas,
	depthM: number,
	opts?: DepthOptions,
): number {
	return ppo2(diluent, depthM, opts)
}

/**
 * Loop ppO₂ a CCR can actually hold: the setpoint, but never above ambient
 * (pure O₂) and never below the diluent's ppO₂.
 * @example effectivePpo2({ setpoint: 1.3, diluent: AIR, depthM: 2 }) // 1.2
 */
export function effectivePpo2(input: LoopInput): number {
	const { setpoint, diluent, depthM, ...opts } = input
	assertPositive('setpoint', setpoint)
	assertGas(diluent, 'diluent')
	const ambient = ataAtDepth(depthM, opts)
	return Math.min(
		ambient,
		Math.max(setpoint, diluentPpo2(diluent, depthM, opts)),
	)
}

/** Loop O₂ fraction. @example loopFo2({ setpoint: 1.3, diluent: AIR, depthM: 30 }) // 0.325 */
export function loopFo2(input: LoopInput): number {
	return effectivePpo2(input) / ataAtDepth(input.depthM, input)
}

/**
 * Loop gas: O₂ from the setpoint, inert remainder split in the diluent's
 * He:N₂ ratio. Feed this to deco for CCR segments.
 * @example loopInertFractions({ setpoint: 1.3, diluent: gas(0.18, 0.45), depthM: 30 }) // { fo2: 0.325, fhe: 0.3704 }
 */
export function loopInertFractions(input: LoopInput): Gas {
	const fo2 = loopFo2(input)
	const dilInert = 1 - input.diluent.fo2
	const fhe = dilInert > 0 ? ((1 - fo2) * input.diluent.fhe) / dilInert : 0
	return { fo2, fhe }
}

/** Diluent MOD, m. @example diluentMod(AIR, 1.6) // 66.56 */
export function diluentMod(
	diluent: Gas,
	maxPpo2: number,
	opts?: DepthOptions,
): number {
	return mod(diluent, maxPpo2, opts)
}

/**
 * Shallowest depth where the diluent is breathable (0 if breathable at the
 * surface), m. @example hypoxicFloor(gas(0.1, 0.7)) // 6
 */
export function hypoxicFloor(
	diluent: Gas,
	minPpo2 = HYPOXIC_PPO2,
	opts?: DepthOptions,
): number {
	assertGas(diluent, 'diluent')
	assertPositive('diluent.fo2', diluent.fo2)
	assertPositive('minPpo2', minPpo2)
	return Math.max(0, depthAtAta(minPpo2 / diluent.fo2, opts))
}

/**
 * Whether a diluent flush at this depth stays within [minPpo2, maxPpo2].
 * @example isFlushSafe({ diluent: AIR, depthM: 30, maxPpo2: 1.6 }) // true
 */
export function isFlushSafe(
	input: {
		diluent: Gas
		depthM: number
		maxPpo2: number
		minPpo2?: number
	} & DepthOptions,
): boolean {
	const { diluent, depthM, maxPpo2, minPpo2 = HYPOXIC_PPO2, ...opts } = input
	assertPositive('maxPpo2', maxPpo2)
	assertPositive('minPpo2', minPpo2)
	const p = diluentPpo2(diluent, depthM, opts)
	return p >= minPpo2 && p <= maxPpo2
}
