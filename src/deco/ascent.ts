/**
 * The decompression ascent: Baker-anchored gradient factors on a stop grid,
 * with open-circuit gas switches at MOD.
 * @module
 */
import { HYPOXIC_PPO2 } from '../ccr/loop'
import { ataAtDepth } from '../pressure'
import type { Gas } from '../types'
import { breathingPpo2, type Breathing } from './breathing'
import { gfAt, toleratedAmbient } from './limits'
import {
	atConstantDepth,
	duringDepthChange,
	type TissueOptions,
	type Tissues,
} from './tissues'

/** One planned piece of the dive; `runtimeMinutes` is the runtime at its end. */
export interface PlannedSegment {
	readonly kind: 'descent' | 'level' | 'ascent' | 'stop'
	readonly fromDepthM: number
	readonly toDepthM: number
	readonly minutes: number
	readonly runtimeMinutes: number
	readonly breathing: Breathing
}

/** A decompression (or gas-switch / safety) stop. */
export interface DecoStop {
	readonly depthM: number
	readonly minutes: number
	readonly breathing: Breathing
}

/** Rules for the ascent. All depths m, rates m/min, times min. */
export interface AscentRules extends TissueOptions {
	gfLow: number
	gfHigh: number
	ascentRate: number
	stopInterval: number
	lastStopM: number
	maxDecoPpo2: number
	switchMinutes: number
	/** End every stop on a whole minute of runtime (Baker's convention). */
	roundStops: boolean
	/** Open-circuit gases available on the ascent (ignored on CCR). */
	decoGases: readonly Gas[]
}

/** Result of {@link ascend}. */
export interface AscentResult {
	segments: PlannedSegment[]
	stops: DecoStop[]
	tissues: Tissues
	runtimeMinutes: number
	firstStopM: number | null
	noBreathableGasAt: number[]
	truncated: boolean
}

/** Longest total stop time planned before giving up, min. */
export const MAX_DECO_MINUTES = 24 * 60
const EPS = 1e-9

/** Next depth on the stop grid above `d`, m; 0 after the last stop. @example nextStopDepth(12, 3, 3) // 9 */
export function nextStopDepth(d: number, step: number, last: number): number {
	if (d <= last + EPS) return 0
	const onGrid = Math.floor(d / step + EPS) * step
	if (Math.abs(onGrid - d) > EPS) return Math.max(onGrid, last)
	return d - step >= last - EPS ? d - step : last
}

// Richest open-circuit gas whose ppO₂ at the depth is within the limit.
function richestGas(
	gases: readonly Gas[],
	depthM: number,
	maxPpo2: number,
	opts?: TissueOptions,
): Gas | undefined {
	const p = ataAtDepth(depthM, opts)
	let best: Gas | undefined
	for (const g of gases) {
		if (g.fo2 * p > maxPpo2 + EPS) continue
		if (!best || g.fo2 > best.fo2) best = g
	}
	return best
}

/**
 * Ascend from a state to the surface, stopping on the stop grid until the
 * GF ceiling at the next stop is clear. GF-low is anchored at the first stop.
 * @example ascend({ tissues, depthM: 30, runtimeMinutes: 20, breathing: { kind: 'oc', gas: AIR } }, rules).runtimeMinutes
 */
export function ascend(
	start: {
		tissues: Tissues
		depthM: number
		runtimeMinutes: number
		breathing: Breathing
	},
	rules: AscentRules,
): AscentResult {
	const segments: PlannedSegment[] = []
	const stops: DecoStop[] = []
	const noBreathableGasAt: number[] = []
	let { tissues: t, depthM: d, runtimeMinutes: rt, breathing } = start
	let first: number | null = null
	let decoMinutes = 0
	let truncated = false

	const push = (
		kind: PlannedSegment['kind'],
		from: number,
		to: number,
		minutes: number,
	) => {
		rt += minutes
		segments.push({
			kind,
			fromDepthM: from,
			toDepthM: to,
			minutes,
			runtimeMinutes: rt,
			breathing,
		})
	}
	const hold = (minutes: number) => {
		t = atConstantDepth(t, d, minutes, breathing, rules)
		push('stop', d, d, minutes)
		stops.push({ depthM: d, minutes, breathing })
		decoMinutes += minutes
	}

	// Within the no-decompression limit (a direct ascent is clear at
	// GF-high), surface without stops; GF-low only places the first stop of
	// a decompression dive.
	const direct = duringDepthChange(
		t,
		d,
		0,
		d / rules.ascentRate,
		breathing,
		rules,
	)
	if (
		d > EPS &&
		toleratedAmbient(direct, rules.gfHigh) <= ataAtDepth(0, rules) + 1e-12
	) {
		t = direct
		push('ascent', d, 0, d / rules.ascentRate)
		d = 0
	}

	while (d > EPS) {
		if (breathing.kind === 'oc') {
			const current = breathing.gas
			const best = richestGas(
				[current, ...rules.decoGases],
				d,
				rules.maxDecoPpo2,
				rules,
			)
			const p = ataAtDepth(d, rules)
			const breathable = [current, ...rules.decoGases].some(
				(g) =>
					g.fo2 * p >= HYPOXIC_PPO2 - EPS &&
					g.fo2 * p <= rules.maxDecoPpo2 + EPS,
			)
			if (!breathable) noBreathableGasAt.push(d)
			if (best && best.fo2 > current.fo2 + EPS) {
				breathing = { kind: 'oc', gas: best }
				if (rules.switchMinutes > 0) hold(rules.switchMinutes)
			}
		}
		const n = nextStopDepth(d, rules.stopInterval, rules.lastStopM)
		const travel = (d - n) / rules.ascentRate
		const clearAfter = (waitMin: number): boolean => {
			let s = waitMin > 0 ? atConstantDepth(t, d, waitMin, breathing, rules) : t
			s = duringDepthChange(s, d, n, travel, breathing, rules)
			const gf = gfAt(n, first, rules.gfLow, rules.gfHigh)
			return toleratedAmbient(s, gf) <= ataAtDepth(n, rules) + 1e-12
		}
		if (!clearAfter(0)) {
			// A stop is required here. Anchor GF-low at the first stop, then
			// find the smallest whole number of seconds that clears the next one.
			if (first === null) first = d
			let waitSec = 0
			if (!clearAfter(0)) {
				let lo = 0
				let hi = 1
				while (!clearAfter(hi / 60)) {
					lo = hi
					hi *= 2
					if (hi / 60 > MAX_DECO_MINUTES) break
				}
				if (hi / 60 > MAX_DECO_MINUTES) {
					truncated = true
					break
				}
				while (hi - lo > 1) {
					const mid = Math.floor((lo + hi) / 2)
					if (clearAfter(mid / 60)) hi = mid
					else lo = mid
				}
				waitSec = hi
			}
			let wait = waitSec / 60
			if (rules.roundStops) wait = Math.ceil(rt + wait - EPS) - rt
			if (wait > EPS) hold(wait)
			if (decoMinutes > MAX_DECO_MINUTES) {
				truncated = true
				break
			}
		}
		t = duringDepthChange(t, d, n, travel, breathing, rules)
		push('ascent', d, n, travel)
		d = n
	}
	return {
		segments,
		stops,
		tissues: t,
		runtimeMinutes: rt,
		firstStopM: first,
		noBreathableGasAt,
		truncated,
	}
}

/**
 * Minimum and maximum inspired ppO₂ over a segment's end depths.
 * @example ppo2Range(segment) // [0.21, 1.05]
 */
export function ppo2Range(
	s: PlannedSegment,
	opts?: TissueOptions,
): [number, number] {
	const a = breathingPpo2(s.breathing, s.fromDepthM, opts)
	const b = breathingPpo2(s.breathing, s.toDepthM, opts)
	return [Math.min(a, b), Math.max(a, b)]
}
