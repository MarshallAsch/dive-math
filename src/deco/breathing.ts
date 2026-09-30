/**
 * What the diver breathes on a segment: open circuit or a CCR loop.
 * @module
 */
import { effectivePpo2 } from '../ccr/loop'
import {
	assertGas,
	assertPositive,
	assertNonNegative,
} from '../internal/validate'
import { ataAtDepth, type DepthOptions } from '../pressure'
import type { Gas } from '../types'

/** Fixed setpoint (ata), or a low/high pair switched at a depth. */
export type Setpoint =
	| number
	| {
			readonly low: number
			readonly high: number
			readonly switchDepthM: number
	  }

/** Open-circuit gas or a CCR loop (diluent + setpoint). */
export type Breathing =
	| { readonly kind: 'oc'; readonly gas: Gas }
	| { readonly kind: 'ccr'; readonly diluent: Gas; readonly setpoint: Setpoint }

/** Validate a breathing mode; throws RangeError. */
export function assertBreathing(b: Breathing, name = 'breathing'): void {
	if (b.kind === 'oc') return assertGas(b.gas, `${name}.gas`)
	if (b.kind !== 'ccr') {
		throw new RangeError(`${name}.kind must be 'oc' or 'ccr'`)
	}
	assertGas(b.diluent, `${name}.diluent`)
	const sp = b.setpoint
	if (typeof sp === 'number') return assertPositive(`${name}.setpoint`, sp)
	assertPositive(`${name}.setpoint.low`, sp.low)
	assertPositive(`${name}.setpoint.high`, sp.high)
	assertNonNegative(`${name}.setpoint.switchDepthM`, sp.switchDepthM)
	if (sp.low > sp.high) {
		throw new RangeError(`${name}.setpoint.low must be <= setpoint.high`)
	}
}

/**
 * Setpoint in force at a depth: `high` at or below `switchDepthM`, `low`
 * shallower. @example setpointAt({ low: 0.7, high: 1.3, switchDepthM: 6 }, 3) // 0.7
 */
export function setpointAt(setpoint: Setpoint, depthM: number): number {
	if (typeof setpoint === 'number') return setpoint
	return depthM >= setpoint.switchDepthM ? setpoint.high : setpoint.low
}

/**
 * Inspired ppO₂ (ata) at a depth. OC: fO₂ × P. CCR: the setpoint, bounded
 * by ambient and diluent (see `effectivePpo2`).
 * @example breathingPpo2({ kind: 'oc', gas: gas(0.32) }, 30) // 1.28
 */
export function breathingPpo2(
	b: Breathing,
	depthM: number,
	opts?: DepthOptions,
): number {
	if (b.kind === 'oc') {
		return b.gas.fo2 * ataAtDepth(depthM, opts)
	}
	return effectivePpo2({
		setpoint: setpointAt(b.setpoint, depthM),
		diluent: b.diluent,
		depthM,
		...opts,
	})
}
