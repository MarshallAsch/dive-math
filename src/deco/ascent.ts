/**
 * The decompression ascent: Baker-anchored gradient factors on a stop grid,
 * with open-circuit gas switches at MOD.
 * @module
 */
import { HYPOXIC_PPO2 } from '../ccr/loop'
import type { O2Phase } from '../oxygen'
import { ataAtDepth } from '../pressure'
import type { Gas } from '../types'
import {
	arriveClock,
	CLOCK_START,
	runClock,
	travelClock,
	type BreakContext,
	type ResolvedAirBreaks,
} from './air-breaks'
import { breathingPpo2, type Breathing } from './breathing'
import { gfAt, toleratedAmbient } from './limits'
import {
	atConstantDepth,
	duringDepthChange,
	type TissueOptions,
	type Tissues,
} from './tissues'

/** A planned piece of the dive before oxygen totals; `runtimeMinutes` is the runtime at its end. */
export interface SegmentDraft {
	readonly kind: 'descent' | 'level' | 'ascent' | 'stop'
	readonly fromDepthM: number
	readonly toDepthM: number
	readonly minutes: number
	readonly runtimeMinutes: number
	readonly breathing: Breathing
	/** Oxygen-exposure phase: working (bottom) or resting (deco). */
	readonly phase: O2Phase
	/** An air break, or travel flown on the break breathing. */
	readonly airBreak?: true
}

/** One planned piece of the dive, with cumulative oxygen exposure at its end. */
export interface PlannedSegment extends SegmentDraft {
	/** Cumulative CNS % (Hoyt: the larger phase). */
	readonly cnsPercent: number
	/** Cumulative OTU. */
	readonly otu: number
}

/** A decompression (or gas-switch / safety) stop. */
export interface DecoStop {
	readonly depthM: number
	readonly minutes: number
	readonly breathing: Breathing
	/** Air-break minutes within this stop. */
	readonly breakMinutes?: number
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
	/** Air breaks during the ascent. [none] */
	airBreaks?: ResolvedAirBreaks
}

/** Result of {@link ascend}. */
export interface AscentResult {
	segments: SegmentDraft[]
	stops: DecoStop[]
	tissues: Tissues
	runtimeMinutes: number
	firstStopM: number | null
	noBreathableGasAt: number[]
	/** Depths where a break was due but no break gas was available. */
	noBreakGasAt: number[]
	truncated: boolean
}

/** Longest total stop time planned before giving up, min (24 h: beyond any practical schedule; bounds the search). */
export const MAX_DECO_MINUTES = 24 * 60
// Float tolerance for depth-grid and ppO₂ comparisons (well below any meaningful m or ata).
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
	const segments: SegmentDraft[] = []
	const stops: DecoStop[] = []
	const noBreathableGasAt: number[] = []
	const noBreakGasAt: number[] = []
	let { tissues: t, depthM: d, runtimeMinutes: rt, breathing } = start
	let first: number | null = null
	let decoMinutes = 0
	let truncated = false
	const ab = rules.airBreaks
	let clock = CLOCK_START
	// Break-gas candidates: the gas the ascent started on plus the deco gases.
	const carried =
		start.breathing.kind === 'oc'
			? [start.breathing.gas, ...rules.decoGases]
			: []
	const ctx = (): BreakContext => ({
		depthM: d,
		normal: breathing,
		gases: carried,
		opts: rules,
	})

	const push = (
		kind: SegmentDraft['kind'],
		from: number,
		to: number,
		minutes: number,
		b: Breathing = breathing,
		airBreak = false,
	) => {
		rt += minutes
		segments.push({
			kind,
			fromDepthM: from,
			toDepthM: to,
			minutes,
			runtimeMinutes: rt,
			breathing: b,
			phase: 'resting',
			...(airBreak ? { airBreak: true as const } : {}),
		})
	}
	const hold = (minutes: number) => {
		const run = runClock(ab, clock, minutes, ctx())
		let breakMinutes = 0
		for (const p of run.pieces) {
			t = atConstantDepth(t, d, p.minutes, p.breathing, rules)
			push('stop', d, d, p.minutes, p.breathing, p.airBreak)
			if (p.airBreak) breakMinutes += p.minutes
		}
		clock = run.clock
		if (run.noBreakGas) noBreakGasAt.push(d)
		stops.push({
			depthM: d,
			minutes,
			breathing,
			...(breakMinutes > 0 ? { breakMinutes } : {}),
		})
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
		// Re-select the break breathing on arrival, before any gas-switch hold.
		const arrived = arriveClock(ab, clock, ctx())
		clock = arrived.clock
		if (arrived.noBreakGas) noBreakGasAt.push(d)
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
			let s = t
			let c = clock
			if (waitMin > 0) {
				const run = runClock(ab, c, waitMin, ctx())
				for (const p of run.pieces)
					s = atConstantDepth(s, d, p.minutes, p.breathing, rules)
				c = run.clock
			}
			const tr = travelClock(ab, c, travel, ctx())
			s = duringDepthChange(s, d, n, travel, tr.breathing, rules)
			const gf = gfAt(n, first, rules.gfLow, rules.gfHigh)
			return toleratedAmbient(s, gf) <= ataAtDepth(n, rules) + 1e-12
		}
		if (!clearAfter(0)) {
			// A stop is required here. Anchor GF-low at the first stop, then
			// find the smallest whole number of seconds that clears the next one.
			if (first === null) first = d
			let waitSec = 0
			if (!clearAfter(0)) {
				// Double the wait up to MAX_DECO_MINUTES (tested last, clamped);
				// truncate only if even that does not clear.
				const maxSec = MAX_DECO_MINUTES * 60
				let lo = 0
				let hi = 1
				while (!clearAfter(hi / 60)) {
					if (hi >= maxSec) {
						truncated = true
						break
					}
					lo = hi
					hi = Math.min(hi * 2, maxSec)
				}
				if (truncated) break
				while (hi - lo > 1) {
					const mid = Math.floor((lo + hi) / 2)
					if (clearAfter(mid / 60)) hi = mid
					else lo = mid
				}
				waitSec = hi
			}
			let wait = waitSec / 60
			if (rules.roundStops) {
				wait = Math.ceil(rt + wait - EPS) - rt
				// With air breaks clearing is not monotonic in the wait (padding
				// can start a break and the travel is then flown on the break gas),
				// so re-check the rounded wait and extend it by whole minutes.
				// Without breaks this never iterates.
				while (!clearAfter(wait)) {
					if (wait >= MAX_DECO_MINUTES) {
						truncated = true
						break
					}
					wait += 1
				}
				if (truncated) break
			}
			if (wait > EPS) hold(wait)
			if (decoMinutes > MAX_DECO_MINUTES) {
				truncated = true
				break
			}
		}
		const tr = travelClock(ab, clock, travel, ctx())
		t = duringDepthChange(t, d, n, travel, tr.breathing, rules)
		push('ascent', d, n, travel, tr.breathing, tr.airBreak)
		clock = tr.clock
		d = n
	}
	return {
		segments,
		stops,
		tissues: t,
		runtimeMinutes: rt,
		firstStopM: first,
		noBreathableGasAt,
		noBreakGasAt,
		truncated,
	}
}

/**
 * Minimum and maximum inspired ppO₂ over a segment's end depths.
 * @example ppo2Range(segment) // [0.21, 1.05]
 */
export function ppo2Range(
	s: SegmentDraft,
	opts?: TissueOptions,
): [number, number] {
	const a = breathingPpo2(s.breathing, s.fromDepthM, opts)
	const b = breathingPpo2(s.breathing, s.toDepthM, opts)
	return [Math.min(a, b), Math.max(a, b)]
}
