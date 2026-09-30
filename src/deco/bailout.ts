/**
 * CCR bailout: the open-circuit ascent from the worst point of a CCR plan.
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
}

/**
 * Bail out to open circuit at the end of the deepest level and ascend on
 * `bailoutGases` (gas switches at MOD). GF and ascent rules come from the
 * plan input. @example bailoutPlan(ccrInput, { bailoutGases: [gas(0.21, 0.35), gas(0.5)], rmvLpm: 20 }).plan.runtimeMinutes
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
	const deepest = r.levels.reduce(
		(best, l, i) => (l.depthM > r.levels[best].depthM ? i : best),
		0,
	)
	const bottom = bottomSegments({
		...r,
		levels: r.levels.slice(0, deepest + 1),
	})
	const depthM = r.levels[deepest].depthM
	if (depthM <= 0)
		throw new RangeError('bailoutPlan needs a level below the surface')
	const p = ataAtDepth(depthM, r)
	const breathable = bailout.bailoutGases.filter(
		(g) => g.fo2 * p <= r.maxDecoPpo2 + 1e-9,
	)
	// Richest breathable gas; if none is breathable, the leanest (and warn).
	const byO2 = [...bailout.bailoutGases].sort((a, b) => a.fo2 - b.fo2)
	const startGas = breathable.length
		? breathable.reduce((a, b) => (b.fo2 > a.fo2 ? b : a))
		: byO2[0]
	const warnings: PlanWarning[] = [...bottom.warnings]

	const up = ascend(
		{
			tissues: bottom.tissues[bottom.tissues.length - 1],
			depthM,
			runtimeMinutes:
				bottom.segments[bottom.segments.length - 1].runtimeMinutes,
			breathing: { kind: 'oc', gas: startGas },
		},
		{ ...r, decoGases: bailout.bailoutGases },
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
	const gasRequired = gasUse(
		up.segments,
		{ rmvLpm: bailout.rmvLpm * stress, cylinders: [] },
		r,
	).map(({ gas, litres }) => ({ gas, litres }))
	return { plan, gasRequired }
}
