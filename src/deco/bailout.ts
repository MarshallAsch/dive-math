/**
 * CCR bailout: the open-circuit ascent from the worst bailout point among the
 * ends of a CCR plan's levels (largest bailout gas requirement).
 * @module
 */
import { assertGas, assertPositive } from '../internal/validate'
import { ataAtDepth } from '../pressure'
import type { Gas } from '../types'
import { ascend } from './ascent'
import {
	bottomSegments,
	finishPlan,
	resolvePlanInput,
	type DivePlan,
	type PlanInput,
	type ResolvedPlanInput,
} from './plan'
import { gasUse, type PlanWarning } from './report'

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
	const total = (b: BailoutResult) =>
		b.gasRequired.reduce((s, g) => s + g.litres, 0)
	let worst: BailoutResult | undefined
	r.levels.forEach((level, i) => {
		if (level.depthM <= 0) return
		const b = bailAt(r, i, bailout.bailoutGases, bailout.rmvLpm * stress)
		if (
			!worst ||
			total(b) > total(worst) ||
			(total(b) === total(worst) &&
				b.plan.runtimeMinutes > worst.plan.runtimeMinutes)
		)
			worst = b
	})
	if (!worst)
		throw new RangeError('bailoutPlan needs a level below the surface')
	return worst
}

// Bail out at the end of level `index` and ascend on open circuit.
function bailAt(
	r: ResolvedPlanInput,
	index: number,
	bailoutGases: readonly Gas[],
	rmvLpm: number,
): BailoutResult {
	const bottom = bottomSegments({
		...r,
		levels: r.levels.slice(0, index + 1),
	})
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
	const warnings: PlanWarning[] = [...bottom.warnings]
	const bailoutRuntimeMinutes =
		bottom.segments[bottom.segments.length - 1].runtimeMinutes

	const up = ascend(
		{
			tissues: bottom.tissues[bottom.tissues.length - 1],
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
	if (up.truncated) warnings.push({ code: 'deco-too-long' })

	const plan = finishPlan(r, {
		segments: [...bottom.segments, ...up.segments],
		stops: up.stops,
		endTissues: up.tissues,
		firstStopM: up.firstStopM,
		warnings,
	})
	const gasRequired = gasUse(up.segments, { rmvLpm, cylinders: [] }, r).map(
		({ gas, litres }) => ({ gas, litres }),
	)
	return { plan, gasRequired, bailoutDepthM: depthM, bailoutRuntimeMinutes }
}
