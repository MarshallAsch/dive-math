/**
 * CCR bailout: the open-circuit ascent from the worst bailout point among the
 * ends of a CCR plan's levels (largest bailout gas requirement).
 * @module
 */
import { assertGas, assertPositive } from '../internal/validate'
import { ataAtDepth } from '../pressure'
import type { Gas } from '../types'
import { ascend, type AscentResult, type SegmentDraft } from './ascent'
import {
	bottomSegments,
	finishPlan,
	resolvePlanInput,
	type DivePlan,
	type PlanInput,
	type ResolvedPlanInput,
} from './plan'
import { gasUse, type PlanWarning } from './report'
import type { Tissues } from './tissues'

/** Bailout inputs. `stressFactor` scales the RMV for the gas estimate. */
export interface BailoutInput {
	bailoutGases: readonly Gas[]
	rmvLpm: number
	/** [1] */
	stressFactor?: number
}

/** Bailout plan and the open-circuit gas it needs. */
export interface BailoutResult {
	readonly plan: DivePlan
	readonly gasRequired: readonly { gas: Gas; litres: number }[]
	/** Depth of the chosen (worst) bailout point, m. */
	readonly bailoutDepthM: number
	/** Runtime at the chosen bailout point, min. */
	readonly bailoutRuntimeMinutes: number
}

/**
 * Plan the bailout at the worst bailout point among the ends of the levels
 * (largest bailout gas requirement; tie: longest runtime): replay the bottom
 * to that level's end, then ascend on open circuit on `bailoutGases` (gas
 * switches at MOD). GF and ascent rules come from the plan input.
 * @example bailoutPlan(ccrInput, { bailoutGases: [gas(0.21, 0.35), gas(0.5)], rmvLpm: 20 }).plan.runtimeMinutes
 */
export function bailoutPlan(
	input: PlanInput,
	bailout: BailoutInput,
): BailoutResult {
	if (bailout.bailoutGases.length === 0)
		throw new RangeError('bailoutGases must not be empty')
	bailout.bailoutGases.forEach((g, i) => assertGas(g, `bailoutGases[${i}]`))
	assertPositive('rmvLpm', bailout.rmvLpm)
	const stress = bailout.stressFactor ?? 1
	assertPositive('stressFactor', stress)

	const r = resolvePlanInput(input)
	// Replay the bottom once; each candidate uses the prefix ending at its level.
	const bottom = bottomSegments(r)
	const total = (b: Candidate) =>
		b.gasRequired.reduce((s, g) => s + g.litres, 0)
	let worst: Candidate | undefined
	r.levels.forEach((level, i) => {
		if (level.depthM <= 0) return
		const b = bailAt(
			r,
			bottom,
			i,
			bailout.bailoutGases,
			bailout.rmvLpm * stress,
		)
		if (
			!worst ||
			total(b) > total(worst) ||
			(total(b) === total(worst) &&
				b.up.runtimeMinutes > worst.up.runtimeMinutes)
		)
			worst = b
	})
	if (!worst)
		throw new RangeError('bailoutPlan needs a level below the surface')
	// Reports only for the chosen candidate.
	const { up, bottomSegs, warnings, gasRequired, depthM } = worst
	const plan = finishPlan(r, {
		segments: [...bottomSegs, ...up.segments],
		stops: up.stops,
		endTissues: up.tissues,
		firstStopM: up.firstStopM,
		warnings,
	})
	return {
		plan,
		gasRequired,
		bailoutDepthM: depthM,
		bailoutRuntimeMinutes: worst.bailoutRuntimeMinutes,
	}
}

interface Candidate {
	up: AscentResult
	bottomSegs: SegmentDraft[]
	warnings: PlanWarning[]
	gasRequired: BailoutResult['gasRequired']
	depthM: number
	bailoutRuntimeMinutes: number
}

// Bail out at the end of level `index` and ascend on open circuit.
function bailAt(
	r: ResolvedPlanInput,
	bottom: ReturnType<typeof bottomSegments>,
	index: number,
	bailoutGases: readonly Gas[],
	rmvLpm: number,
): Candidate {
	// A level below the surface always ends at least one segment.
	const end = bottom.levelEnds[index] as number
	const bottomSegs = bottom.segments.slice(0, end)
	const depthM = r.levels[index].depthM
	const p = ataAtDepth(depthM, r)
	const breathable = bailoutGases.filter(
		(g) => g.fo2 * p <= r.maxDecoPpo2 + 1e-9,
	)
	// Richest breathable gas; if none is breathable, the leanest (and warn).
	const byO2 = [...bailoutGases].sort((a, b) => a.fo2 - b.fo2)
	const startGas = breathable.length
		? breathable.reduce((a, b) => (b.fo2 > a.fo2 ? b : a))
		: byO2[0]
	const warnings: PlanWarning[] = bottom.warnings.filter(
		// Bottom warnings are all segment warnings (ceiling-violated).
		(w) => (w as { segmentIndex: number }).segmentIndex < end,
	)
	const bailoutRuntimeMinutes = (bottomSegs[end - 1] as SegmentDraft)
		.runtimeMinutes

	const up = ascend(
		{
			tissues: bottom.tissues[end - 1] as Tissues,
			depthM,
			runtimeMinutes: bailoutRuntimeMinutes,
			breathing: { kind: 'oc', gas: startGas },
		},
		{ ...r, decoGases: bailoutGases },
	)
	// The start depth and ascent-reported depths may coincide; warn once each.
	const noGasDepths = new Set([
		...(breathable.length === 0 ? [depthM] : []),
		...up.noBreathableGasAt,
	])
	warnings.push(
		...[...noGasDepths].map((d) => ({
			code: 'no-breathable-gas' as const,
			depthM: d,
		})),
	)
	warnings.push(
		...[...new Set(up.noBreakGasAt)].map((d) => ({
			code: 'no-break-gas' as const,
			depthM: d,
		})),
	)
	if (up.truncated) warnings.push({ code: 'deco-too-long' })

	const gasRequired = gasUse(up.segments, { rmvLpm, cylinders: [] }, r).map(
		({ gas, litres }) => ({ gas, litres }),
	)
	return {
		up,
		bottomSegs,
		warnings,
		gasRequired,
		depthM,
		bailoutRuntimeMinutes,
	}
}
