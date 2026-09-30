/**
 * Bühlmann limits with Baker gradient factors: tolerated ambient pressure,
 * ceiling, GF interpolation and no-decompression limit.
 * @module
 */
import { assertFinite, assertNonNegative } from '../internal/validate'
import { ataAtDepth, depthAtAta, surfacePressure } from '../pressure'
import type { Breathing } from './breathing'
import { atConstantDepth, type TissueOptions, type Tissues } from './tissues'
import { ZHL16C } from './zhl16'

/** Throw unless 0 < gf ≤ 1. @example assertGf('gfLow', 0.3) // ok; assertGf('gfLow', 0) throws */
export function assertGf(name: string, gf: number): void {
	assertFinite(name, gf)
	if (gf <= 0 || gf > 1)
		throw new RangeError(`${name} must be in (0, 1] (got ${gf})`)
}

/**
 * Lowest ambient pressure the tissues tolerate at a gradient factor, bar:
 * max over compartments of (P − GF·a)/(GF/b − GF + 1), with a and b
 * weighted by the dissolved He and N₂ pressures (Baker; Bühlmann).
 * @example toleratedAmbient(initialTissues(), 1) // < 1 (no deco obligation)
 */
export function toleratedAmbient(tissues: Tissues, gf: number): number {
	assertGf('gf', gf)
	let worst = 0
	for (let i = 0; i < ZHL16C.length; i++) {
		const c = ZHL16C[i]
		const pn2 = tissues.n2[i]
		const phe = tissues.he[i]
		const p = pn2 + phe
		// No dissolved gas: this compartment tolerates any ambient pressure.
		if (p === 0) continue
		const a = (c.n2A * pn2 + c.heA * phe) / p
		const b = (c.n2B * pn2 + c.heB * phe) / p
		worst = Math.max(worst, (p - gf * a) / (gf / b - gf + 1))
	}
	return worst
}

/** Ceiling depth at a gradient factor, m (0 when surfacing is allowed). @example ceiling(tissues, 0.3) // 8.1 */
export function ceiling(
	tissues: Tissues,
	gf: number,
	opts?: TissueOptions,
): number {
	return Math.max(0, depthAtAta(toleratedAmbient(tissues, gf), opts))
}

/**
 * Baker GF at a depth: GF-low at the first stop, linear to GF-high at the
 * surface; GF-low before a first stop exists (`firstStopM` null).
 * @example gfAt(9, 18, 0.3, 0.8) // 0.55
 */
export function gfAt(
	depthM: number,
	firstStopM: number | null,
	gfLow: number,
	gfHigh: number,
): number {
	assertNonNegative('depthM', depthM)
	if (firstStopM === null) return gfLow
	if (firstStopM <= 0) return gfHigh
	const d = Math.min(depthM, firstStopM)
	return gfHigh - ((gfHigh - gfLow) * d) / firstStopM
}

/** Cap on {@link ndl}, minutes (the 3-digit display limit of common dive computers). */
export const NDL_MAX_MINUTES = 999

/**
 * No-decompression limit: minutes left at the current depth on the current
 * breathing before the GF-high ceiling rises above the surface (ascent time
 * not included; capped at {@link NDL_MAX_MINUTES}; 0 when already in deco).
 * @example ndl(initialTissues(), 30, { kind: 'oc', gas: AIR }, { gfHigh: 1 }) // ≈ 16.28
 */
export function ndl(
	tissues: Tissues,
	depthM: number,
	breathing: Breathing,
	opts: TissueOptions & { gfHigh: number },
): number {
	assertGf('gfHigh', opts.gfHigh)
	const surf = surfacePressure(opts)
	ataAtDepth(depthM, opts)
	const clear = (t: Tissues) => toleratedAmbient(t, opts.gfHigh) <= surf
	if (!clear(tissues)) return 0
	const at = (m: number) => atConstantDepth(tissues, depthM, m, breathing, opts)
	if (clear(at(NDL_MAX_MINUTES))) return NDL_MAX_MINUTES
	let lo = 0
	let hi = NDL_MAX_MINUTES
	while (hi - lo > 1 / 600) {
		const mid = (lo + hi) / 2
		if (clear(at(mid))) lo = mid
		else hi = mid
	}
	return lo
}
