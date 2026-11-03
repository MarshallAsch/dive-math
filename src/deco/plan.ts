/**
 * Multi-level decompression planning (Bühlmann ZH-L16C with Baker GF).
 * @module
 */
import { resolveAirBreaks, type AirBreaks } from './air-breaks'
import {
	assertAtLeast,
	assertAtMost,
	assertGas,
	assertNonNegative,
	assertPositive,
} from '../internal/validate'
import {
	dailyExposure,
	type CnsLimits,
	type CnsTotals,
	type DayItem,
	type O2Phase,
} from '../oxygen'
import { ataAtDepth } from '../pressure'
import type { Gas } from '../types'
import {
	ascend,
	MAX_DECO_MINUTES,
	type AscentRules,
	type DecoStop,
	type PlannedSegment,
	type SegmentDraft,
} from './ascent'
import { assertBreathing, type Breathing } from './breathing'
import { assertGf, toleratedAmbient } from './limits'
import {
	gasUse,
	oxygenTotals,
	oxygenWarnings,
	segmentWarnings,
	withOxygen,
	type Consumption,
	type GasUse,
	type PlanWarning,
} from './report'
import {
	initialTissues,
	loadSegment,
	type TissueOptions,
	type Tissues,
} from './tissues'

// Library guards (no source): beyond any dive and they bound the planner's work.
/** Most `levels` a plan accepts. */
export const MAX_LEVELS = 1000
/** Deepest `Level.depthM` (and `timeToSurface` depth) accepted, m. */
export const MAX_DEPTH_M = 1000
/** Slowest `ascentRate` / `descentRate` accepted, m/min. */
export const MIN_RATE_M_PER_MIN = 0.1
/** Smallest `stopInterval` accepted, m. */
export const MIN_STOP_INTERVAL_M = 0.1

/** A level of the bottom profile: time at depth after arriving there. */
export interface Level {
	readonly depthM: number
	readonly minutes: number
	readonly breathing: Breathing
	/**
	 * Oxygen-exposure phase of this level and the travel into it. ['working']
	 */
	readonly phase?: O2Phase
}

/** Inputs to {@link planDive}. Defaults in brackets. */
export interface PlanInput extends TissueOptions {
	/** 1 to {@link MAX_LEVELS} levels, each at most {@link MAX_DEPTH_M} deep. */
	levels: readonly Level[]
	/** Open-circuit deco gases, switched at MOD (ignored on CCR). [] */
	decoGases?: readonly Gas[]
	gfLow: number
	gfHigh: number
	/** m/min, at least {@link MIN_RATE_M_PER_MIN}. [20] */
	descentRate?: number
	/** m/min, at least {@link MIN_RATE_M_PER_MIN}. [10] */
	ascentRate?: number
	/** m, at least {@link MIN_STOP_INTERVAL_M}. [3] */
	stopInterval?: number
	/** m, a multiple of `stopInterval`. [3] */
	lastStopM?: number
	/** ata. [1.6] */
	maxDecoPpo2?: number
	/** ata. [1.4] */
	maxBottomPpo2?: number
	/** Minutes held at each OC gas switch, at most MAX_DECO_MINUTES. [0] */
	switchMinutes?: number
	/** 3 min at 5 m on no-decompression dives. [false] */
	safetyStop?: boolean
	/** End every stop on a whole minute of runtime. [true] */
	roundStops?: boolean
	/** Tissues from a previous dive's `surfaceInterval`. [surface air] */
	startTissues?: Tissues
	/** Enables {@link DivePlan.gasUse}. */
	consumption?: Consumption
	/** CNS limit set. ['noaa-1991'] */
	oxygenLimits?: CnsLimits
	/** Air breaks during decompression. [none] */
	airBreaks?: AirBreaks
	/** Earlier dives and surface intervals the same day, for daily warnings. [] */
	dayExposure?: readonly DayItem[]
}

/**
 * A complete plan. When truncated (`deco-too-long`) the plan stops at the
 * depth where it was truncated; `runtimeMinutes` and `gasUse` cover only the
 * planned part.
 */
export interface DivePlan {
	readonly segments: PlannedSegment[]
	readonly stops: DecoStop[]
	readonly runtimeMinutes: number
	/**
	 * Depth where GF-low anchors (the first depth whose GF-low ceiling blocked
	 * the ascent); a stop may take zero time there once GF is interpolated.
	 * Null for no-decompression dives.
	 */
	readonly firstStopM: number | null
	readonly endTissues: Tissues
	readonly oxygen: CnsTotals & { readonly otu: number }
	readonly gasUse?: GasUse[]
	readonly warnings: PlanWarning[]
}

/** Resolved planning settings. */
export interface ResolvedPlanInput extends AscentRules {
	levels: readonly Level[]
	descentRate: number
	maxBottomPpo2: number
	safetyStop: boolean
	startTissues?: Tissues
	consumption?: Consumption
	oxygenLimits: CnsLimits
	dayExposure: readonly DayItem[]
}

/**
 * Validate inputs and apply defaults; throws RangeError.
 * @example resolvePlanInput({ levels, gfLow: 0.4, gfHigh: 0.85 }).ascentRate // 10
 */
export function resolvePlanInput(input: PlanInput): ResolvedPlanInput {
	// Common planner defaults (Shearwater ascent 10 m/min, 3 m stop grid,
	// deco ppO₂ 1.6 / bottom 1.4 ata).
	const r: ResolvedPlanInput = {
		...input,
		decoGases: input.decoGases ?? [],
		descentRate: input.descentRate ?? 20,
		ascentRate: input.ascentRate ?? 10,
		stopInterval: input.stopInterval ?? 3,
		lastStopM: input.lastStopM ?? 3,
		maxDecoPpo2: input.maxDecoPpo2 ?? 1.6,
		maxBottomPpo2: input.maxBottomPpo2 ?? 1.4,
		switchMinutes: input.switchMinutes ?? 0,
		safetyStop: input.safetyStop ?? false,
		roundStops: input.roundStops ?? true,
		oxygenLimits: input.oxygenLimits ?? 'noaa-1991',
		airBreaks: resolveAirBreaks(input.airBreaks),
		dayExposure: input.dayExposure ?? [],
	}
	if (r.levels.length === 0) throw new RangeError('levels must not be empty')
	if (r.levels.length > MAX_LEVELS)
		throw new RangeError(
			`levels must have at most ${MAX_LEVELS} entries (got ${r.levels.length})`,
		)
	r.levels.forEach((l, i) => {
		assertNonNegative(`levels[${i}].depthM`, l.depthM)
		assertAtMost(`levels[${i}].depthM`, l.depthM, MAX_DEPTH_M)
		assertNonNegative(`levels[${i}].minutes`, l.minutes)
		assertBreathing(l.breathing, `levels[${i}].breathing`)
		if (l.phase !== undefined && l.phase !== 'working' && l.phase !== 'resting')
			throw new RangeError(`levels[${i}].phase must be 'working' or 'resting'`)
	})
	if (r.oxygenLimits !== 'noaa-1991' && r.oxygenLimits !== 'hoyt-2025')
		throw new RangeError(`oxygenLimits must be 'noaa-1991' or 'hoyt-2025'`)
	dailyExposure(r.dayExposure)
	r.decoGases.forEach((g, i) => assertGas(g, `decoGases[${i}]`))
	assertGf('gfLow', r.gfLow)
	assertGf('gfHigh', r.gfHigh)
	if (r.gfLow > r.gfHigh)
		throw new RangeError(`gfLow (${r.gfLow}) must be <= gfHigh (${r.gfHigh})`)
	assertAtLeast('descentRate', r.descentRate, MIN_RATE_M_PER_MIN)
	assertAtLeast('ascentRate', r.ascentRate, MIN_RATE_M_PER_MIN)
	assertAtLeast('stopInterval', r.stopInterval, MIN_STOP_INTERVAL_M)
	assertPositive('lastStopM', r.lastStopM)
	const k = r.lastStopM / r.stopInterval
	if (Math.abs(k - Math.round(k)) > 1e-9) {
		throw new RangeError(
			`lastStopM (${r.lastStopM}) must be a multiple of stopInterval (${r.stopInterval})`,
		)
	}
	assertPositive('maxDecoPpo2', r.maxDecoPpo2)
	assertPositive('maxBottomPpo2', r.maxBottomPpo2)
	assertNonNegative('switchMinutes', r.switchMinutes)
	assertAtMost('switchMinutes', r.switchMinutes, MAX_DECO_MINUTES)
	if (
		r.startTissues &&
		(r.startTissues.n2.length !== 16 || r.startTissues.he.length !== 16)
	) {
		throw new RangeError('startTissues must have 16 compartments')
	}
	if (r.startTissues) {
		const { n2, he } = r.startTissues
		n2.forEach((v, i) => assertNonNegative(`startTissues.n2[${i}]`, v))
		he.forEach((v, i) => assertNonNegative(`startTissues.he[${i}]`, v))
	}
	if (r.consumption) {
		assertPositive('consumption.rmvLpm', r.consumption.rmvLpm)
		if (r.consumption.decoRmvLpm !== undefined)
			assertPositive('consumption.decoRmvLpm', r.consumption.decoRmvLpm)
		r.consumption.cylinders.forEach((c, i) => {
			assertGas(c.gas, `consumption.cylinders[${i}].gas`)
			assertPositive(`consumption.cylinders[${i}].volumeL`, c.volumeL)
		})
	}
	return r
}

/**
 * Bottom-profile segments and the tissue state after each.
 * @example bottomSegments(resolvePlanInput(input)).segments.length
 */
export function bottomSegments(r: ResolvedPlanInput): {
	segments: SegmentDraft[]
	tissues: Tissues[]
	warnings: PlanWarning[]
	/** `segments.length` after each level. */
	levelEnds: number[]
} {
	const segments: SegmentDraft[] = []
	const tissues: Tissues[] = []
	const warnings: PlanWarning[] = []
	const levelEnds: number[] = []
	let t = r.startTissues ?? initialTissues(r)
	let depth = 0
	let rt = 0
	const add = (
		kind: SegmentDraft['kind'],
		to: number,
		minutes: number,
		breathing: Breathing,
		phase: O2Phase,
	) => {
		t = loadSegment(
			t,
			{ fromDepthM: depth, toDepthM: to, minutes, breathing },
			r,
		)
		rt += minutes
		segments.push({
			kind,
			fromDepthM: depth,
			toDepthM: to,
			minutes,
			runtimeMinutes: rt,
			breathing,
			phase,
		})
		tissues.push(t)
		if (
			to < depth &&
			toleratedAmbient(t, r.gfHigh) > ataAtDepth(to, r) + 1e-12
		) {
			warnings.push({
				code: 'ceiling-violated',
				segmentIndex: segments.length - 1,
			})
		}
		depth = to
	}
	for (const level of r.levels) {
		const phase = level.phase ?? 'working'
		if (level.depthM > depth)
			add(
				'descent',
				level.depthM,
				(level.depthM - depth) / r.descentRate,
				level.breathing,
				phase,
			)
		else if (level.depthM < depth)
			add(
				'ascent',
				level.depthM,
				(depth - level.depthM) / r.ascentRate,
				level.breathing,
				phase,
			)
		if (level.minutes > 0)
			add('level', level.depthM, level.minutes, level.breathing, phase)
		levelEnds.push(segments.length)
	}
	return { segments, tissues, warnings, levelEnds }
}

/**
 * Assemble a plan from bottom and ascent parts plus reports.
 * @example finishPlan(r, { segments, stops, endTissues, firstStopM: null, warnings: [] }).runtimeMinutes
 */
export function finishPlan(
	r: ResolvedPlanInput,
	parts: {
		segments: SegmentDraft[]
		stops: DecoStop[]
		endTissues: Tissues
		firstStopM: number | null
		warnings: PlanWarning[]
	},
): DivePlan {
	const o2 = { ...r, limits: r.oxygenLimits }
	const warnings = [
		...parts.warnings,
		...segmentWarnings(parts.segments, r),
		...oxygenWarnings(parts.segments, { ...o2, dayExposure: r.dayExposure }),
	]
	const last = parts.segments.at(-1)
	const segments: PlannedSegment[] = withOxygen(parts.segments, o2)
	return {
		segments,
		stops: parts.stops,
		runtimeMinutes: last ? last.runtimeMinutes : 0,
		firstStopM: parts.firstStopM,
		endTissues: parts.endTissues,
		oxygen: oxygenTotals(parts.segments, o2),
		...(r.consumption
			? { gasUse: gasUse(parts.segments, r.consumption, r) }
			: {}),
		warnings,
	}
}

// Conventional recreational safety stop: 3 min at 5 m.
const SAFETY_STOP_M = 5
const SAFETY_STOP_MIN = 3

/**
 * Plan a multi-level dive: the bottom levels as given, then the ascent
 * with decompression stops.
 * @example planDive({ levels: [{ depthM: 30, minutes: 20, breathing: { kind: 'oc', gas: AIR } }], gfLow: 0.4, gfHigh: 0.85 }).runtimeMinutes
 */
export function planDive(input: PlanInput): DivePlan {
	const r = resolvePlanInput(input)
	const bottom = bottomSegments(r)
	const lastLevel = r.levels[r.levels.length - 1]
	const startState = {
		tissues: bottom.tissues.at(-1) ?? r.startTissues ?? initialTissues(r),
		depthM: lastLevel.depthM,
		runtimeMinutes: bottom.segments.at(-1)?.runtimeMinutes ?? 0,
		breathing: lastLevel.breathing,
	}
	let up = ascend(startState, r)
	if (
		r.safetyStop &&
		up.stops.length === 0 &&
		startState.depthM > SAFETY_STOP_M
	) {
		// Ascend to 5 m, hold 3 min, then surface; no deco was required.
		const segs: SegmentDraft[] = []
		let t = startState.tissues
		let rt = startState.runtimeMinutes
		const b = startState.breathing
		const step = (
			kind: SegmentDraft['kind'],
			from: number,
			to: number,
			minutes: number,
		) => {
			t = loadSegment(
				t,
				{ fromDepthM: from, toDepthM: to, minutes, breathing: b },
				r,
			)
			rt += minutes
			segs.push({
				kind,
				fromDepthM: from,
				toDepthM: to,
				minutes,
				runtimeMinutes: rt,
				breathing: b,
				phase: 'resting',
			})
		}
		step(
			'ascent',
			startState.depthM,
			SAFETY_STOP_M,
			(startState.depthM - SAFETY_STOP_M) / r.ascentRate,
		)
		step('stop', SAFETY_STOP_M, SAFETY_STOP_M, SAFETY_STOP_MIN)
		step('ascent', SAFETY_STOP_M, 0, SAFETY_STOP_M / r.ascentRate)
		up = {
			...up,
			segments: segs,
			stops: [
				{ depthM: SAFETY_STOP_M, minutes: SAFETY_STOP_MIN, breathing: b },
			],
			tissues: t,
			runtimeMinutes: rt,
		}
	}
	const warnings: PlanWarning[] = [
		...bottom.warnings,
		...[...new Set(up.noBreathableGasAt)].map((depthM) => ({
			code: 'no-breathable-gas' as const,
			depthM,
		})),
		...[...new Set(up.noBreakGasAt)].map((depthM) => ({
			code: 'no-break-gas' as const,
			depthM,
		})),
		...(up.truncated ? [{ code: 'deco-too-long' as const }] : []),
	]
	return finishPlan(r, {
		segments: [...bottom.segments, ...up.segments],
		stops: up.stops,
		endTissues: up.tissues,
		firstStopM: up.firstStopM,
		warnings,
	})
}

/**
 * Time to surface from a tissue state, minutes, using the plan's ascent
 * rules. Starts the runtime at 0, so with `roundStops` the whole-minute
 * boundaries (and the result, by < 1 min) can differ from a plan that reaches
 * this state at a non-integer runtime. Infinity when the required stops
 * exceed MAX_DECO_MINUTES.
 * @example timeToSurface(tissues, 30, { kind: 'oc', gas: AIR }, { gfLow: 0.4, gfHigh: 0.85 })
 */
export function timeToSurface(
	tissues: Tissues,
	depthM: number,
	breathing: Breathing,
	input: Omit<PlanInput, 'levels'>,
): number {
	const r = resolvePlanInput({
		...input,
		levels: [{ depthM, minutes: 0, breathing }],
	})
	const up = ascend({ tissues, depthM, runtimeMinutes: 0, breathing }, r)
	return up.truncated ? Infinity : up.runtimeMinutes
}
