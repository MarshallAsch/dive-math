/**
 * Plan reports: oxygen exposure, gas use and safety warnings.
 * @module
 */
import { HYPOXIC_PPO2, loopInertFractions } from '../ccr/loop'
import {
	densityAtDepth,
	HARD_MAX_DENSITY,
	RECOMMENDED_MAX_DENSITY,
} from '../density'
import { segmentCns, segmentOtu } from '../oxygen'
import { ataAtDepth } from '../pressure'
import type { Gas } from '../types'
import { ppo2Range, type PlannedSegment } from './ascent'
import { setpointAt, type Breathing } from './breathing'
import type { TissueOptions } from './tissues'

/** Something unsafe about a valid plan. `segmentIndex` points into `DivePlan.segments`. */
export type PlanWarning =
	| {
			readonly code:
				| 'hypoxic'
				| 'ppo2-high'
				| 'density-recommended'
				| 'density-hard'
				| 'ceiling-violated'
			readonly segmentIndex: number
	  }
	| { readonly code: 'no-breathable-gas'; readonly depthM: number }
	| { readonly code: 'deco-too-long' }

/** Limits used by {@link segmentWarnings}. */
export interface WarningLimits extends TissueOptions {
	maxBottomPpo2: number
	maxDecoPpo2: number
}

// Gas actually in the lungs at a depth (the loop gas on CCR).
function gasAt(b: Breathing, depthM: number, opts?: TissueOptions): Gas {
	if (b.kind === 'oc') return b.gas
	return loopInertFractions({
		setpoint: setpointAt(b.setpoint, depthM),
		diluent: b.diluent,
		depthM,
		...opts,
	})
}

/**
 * ppO₂ and density warnings for each segment.
 * @example segmentWarnings(plan.segments, { maxBottomPpo2: 1.4, maxDecoPpo2: 1.6 })
 */
export function segmentWarnings(
	segments: readonly PlannedSegment[],
	limits: WarningLimits,
): PlanWarning[] {
	const out: PlanWarning[] = []
	segments.forEach((s, segmentIndex) => {
		const [lo, hi] = ppo2Range(s, limits)
		const max =
			s.kind === 'ascent' || s.kind === 'stop'
				? limits.maxDecoPpo2
				: limits.maxBottomPpo2
		if (lo < HYPOXIC_PPO2 - 1e-9) out.push({ code: 'hypoxic', segmentIndex })
		if (hi > max + 1e-9) out.push({ code: 'ppo2-high', segmentIndex })
		const deep = Math.max(s.fromDepthM, s.toDepthM)
		const rho = densityAtDepth(gasAt(s.breathing, deep, limits), deep, limits)
		if (rho > HARD_MAX_DENSITY) out.push({ code: 'density-hard', segmentIndex })
		else if (rho > RECOMMENDED_MAX_DENSITY)
			out.push({ code: 'density-recommended', segmentIndex })
	})
	return out
}

/**
 * CNS % and OTU over the plan (each segment at its mean ppO₂).
 * @example oxygenTotals(plan.segments) // { cnsPercent: 8.2, otu: 31 }
 */
export function oxygenTotals(
	segments: readonly PlannedSegment[],
	opts?: TissueOptions,
): { cnsPercent: number; otu: number } {
	let cnsPercent = 0
	let otu = 0
	for (const s of segments) {
		const [lo, hi] = ppo2Range(s, opts)
		const ppo2 = (lo + hi) / 2
		cnsPercent += segmentCns({ ppo2, minutes: s.minutes })
		otu += segmentOtu({ ppo2, minutes: s.minutes })
	}
	return { cnsPercent, otu }
}

/** Gas-use inputs; `decoRmvLpm` applies to ascent and stop segments. */
export interface Consumption {
	rmvLpm: number
	decoRmvLpm?: number
	cylinders: readonly { gas: Gas; volumeL: number }[]
}

/** Open-circuit gas used per gas, surface litres (CCR segments use none). */
export interface GasUse {
	readonly gas: Gas
	readonly litres: number
	/** Pressure drop in the matching cylinder, when one is given. */
	readonly bar?: number
}

const sameGas = (a: Gas, b: Gas) =>
	Math.abs(a.fo2 - b.fo2) < 1e-9 && Math.abs(a.fhe - b.fhe) < 1e-9

/**
 * Surface litres of each open-circuit gas used over the segments.
 * @example gasUse(plan.segments, { rmvLpm: 20, cylinders: [{ gas: AIR, volumeL: 24 }] })
 */
export function gasUse(
	segments: readonly PlannedSegment[],
	consumption: Consumption,
	opts?: TissueOptions,
): GasUse[] {
	const totals: { gas: Gas; litres: number }[] = []
	for (const s of segments) {
		if (s.breathing.kind !== 'oc') continue
		const rmv =
			s.kind === 'ascent' || s.kind === 'stop'
				? (consumption.decoRmvLpm ?? consumption.rmvLpm)
				: consumption.rmvLpm
		const ata =
			(ataAtDepth(s.fromDepthM, opts) + ataAtDepth(s.toDepthM, opts)) / 2
		const litres = rmv * ata * s.minutes
		const g = s.breathing.gas
		const row = totals.find((r) => sameGas(r.gas, g))
		if (row) row.litres += litres
		else totals.push({ gas: g, litres })
	}
	return totals.map(({ gas, litres }) => {
		const cyl = consumption.cylinders.find((c) => sameGas(c.gas, gas))
		return cyl ? { gas, litres, bar: litres / cyl.volumeL } : { gas, litres }
	})
}
