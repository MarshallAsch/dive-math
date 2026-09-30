/**
 * Multi-level decompression planning (Bühlmann ZH-L16C with Baker GF).
 * @module
 */
import {
	assertGas,
	assertNonNegative,
	assertPositive,
} from '../internal/validate'
import { ataAtDepth } from '../pressure'
import type { Gas } from '../types'
import {
	ascend,
	type AscentRules,
	type PlannedSegment,
	type DecoStop,
} from './ascent'
import { assertBreathing, type Breathing } from './breathing'
import { assertGf, toleratedAmbient } from './limits'
import {
	gasUse,
	oxygenTotals,
	segmentWarnings,
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

/** A level of the bottom profile: time at depth after arriving there. */
export interface Level {
	readonly depthM: number
	readonly minutes: number
	readonly breathing: Breathing
}

/** Inputs to {@link planDive}. Defaults in brackets. */
export interface PlanInput extends TissueOptions {
	levels: readonly Level[]
	/** Open-circuit deco gases, switched at MOD (ignored on CCR). [] */
	decoGases?: readonly Gas[]
	gfLow: number
	gfHigh: number
	/** m/min. [20] */
	descentRate?: number
	/** m/min. [10] */
	ascentRate?: number
	/** m. [3] */
	stopInterval?: number
	/** m, a multiple of `stopInterval`. [3] */
	lastStopM?: number
	/** ata. [1.6] */
	maxDecoPpo2?: number
	/** ata. [1.4] */
	maxBottomPpo2?: number
	/** Minutes held at each OC gas switch. [0] */
	switchMinutes?: number
	/** 3 min at 5 m on no-decompression dives. [false] */
	safetyStop?: boolean
	/** End every stop on a whole minute of runtime. [true] */
	roundStops?: boolean
	/** Tissues from a previous dive's `surfaceInterval`. [surface air] */
	startTissues?: Tissues
	/** Enables {@link DivePlan.gasUse}. */
	consumption?: Consumption
}

/** A complete plan. */
export interface DivePlan {
	readonly segments: PlannedSegment[]
	readonly stops: DecoStop[]
	readonly runtimeMinutes: number
	readonly firstStopM: number | null
	readonly endTissues: Tissues
	readonly oxygen: { cnsPercent: number; otu: number }
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
}

/**
 * Validate inputs and apply defaults; throws RangeError.
 * @example resolvePlanInput({ levels, gfLow: 0.4, gfHigh: 0.85 }).ascentRate // 10
 */
export function resolvePlanInput(input: PlanInput): ResolvedPlanInput {
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
	}
	if (r.levels.length === 0) throw new RangeError('levels must not be empty')
	r.levels.forEach((l, i) => {
		assertNonNegative(`levels[${i}].depthM`, l.depthM)
		assertNonNegative(`levels[${i}].minutes`, l.minutes)
		assertBreathing(l.breathing, `levels[${i}].breathing`)
	})
	r.decoGases.forEach((g, i) => assertGas(g, `decoGases[${i}]`))
	assertGf('gfLow', r.gfLow)
	assertGf('gfHigh', r.gfHigh)
	if (r.gfLow > r.gfHigh)
		throw new RangeError(`gfLow (${r.gfLow}) must be <= gfHigh (${r.gfHigh})`)
	assertPositive('descentRate', r.descentRate)
	assertPositive('ascentRate', r.ascentRate)
	assertPositive('stopInterval', r.stopInterval)
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
	if (
		r.startTissues &&
		(r.startTissues.n2.length !== 16 || r.startTissues.he.length !== 16)
	) {
		throw new RangeError('startTissues must have 16 compartments')
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
	segments: PlannedSegment[]
	tissues: Tissues[]
	warnings: PlanWarning[]
} {
	const segments: PlannedSegment[] = []
	const tissues: Tissues[] = []
	const warnings: PlanWarning[] = []
	let t = r.startTissues ?? initialTissues(r)
	let depth = 0
	let rt = 0
	const add = (
		kind: PlannedSegment['kind'],
		to: number,
		minutes: number,
		breathing: Breathing,
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
		if (level.depthM > depth)
			add(
				'descent',
				level.depthM,
				(level.depthM - depth) / r.descentRate,
				level.breathing,
			)
		else if (level.depthM < depth)
			add(
				'ascent',
				level.depthM,
				(depth - level.depthM) / r.ascentRate,
				level.breathing,
			)
		if (level.minutes > 0)
			add('level', level.depthM, level.minutes, level.breathing)
	}
	return { segments, tissues, warnings }
}

/**
 * Assemble a plan from bottom and ascent parts plus reports.
 * @example finishPlan(r, { segments, stops, endTissues, firstStopM: null, warnings: [] }).runtimeMinutes
 */
export function finishPlan(
	r: ResolvedPlanInput,
	parts: {
		segments: PlannedSegment[]
		stops: DecoStop[]
		endTissues: Tissues
		firstStopM: number | null
		warnings: PlanWarning[]
	},
): DivePlan {
	const warnings = [...parts.warnings, ...segmentWarnings(parts.segments, r)]
	const last = parts.segments.at(-1)
	return {
		segments: parts.segments,
		stops: parts.stops,
		runtimeMinutes: last ? last.runtimeMinutes : 0,
		firstStopM: parts.firstStopM,
		endTissues: parts.endTissues,
		oxygen: oxygenTotals(parts.segments, r),
		...(r.consumption
			? { gasUse: gasUse(parts.segments, r.consumption, r) }
			: {}),
		warnings,
	}
}

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
		const segs: PlannedSegment[] = []
		let t = startState.tissues
		let rt = startState.runtimeMinutes
		const b = startState.breathing
		const step = (
			kind: PlannedSegment['kind'],
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
 * rules. @example timeToSurface(tissues, 30, { kind: 'oc', gas: AIR }, { gfLow: 0.4, gfHigh: 0.85 })
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
	return ascend({ tissues, depthM, runtimeMinutes: 0, breathing }, r)
		.runtimeMinutes
}
