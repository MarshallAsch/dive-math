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
import {
	cnsRunningTotals,
	cnsTotals,
	dailyExposure,
	repexAllowance,
	segmentOtu,
	type CnsLimits,
	type CnsTotals,
	type DayItem,
	type Exposure,
} from '../oxygen'
import { ataAtDepth } from '../pressure'
import type { Gas } from '../types'
import { ppo2Range, type PlannedSegment, type SegmentDraft } from './ascent'
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
	| {
			readonly code: 'no-breathable-gas' | 'no-break-gas'
			readonly depthM: number
	  }
	/**
	 * Oxygen limits exceeded: `cns-single` (NOAA), `cns-working` /
	 * `cns-resting` (Hoyt 2025 phase budgets), `cns-daily` (24 h limits with
	 * `dayExposure`), `otu-daily` (REPEX day 1, 850 OTU).
	 */
	| {
			readonly code:
				'cns-single' | 'cns-working' | 'cns-resting' | 'cns-daily' | 'otu-daily'
	  }
	/**
	 * Stops exceed MAX_DECO_MINUTES: the plan stops at the depth where it was
	 * truncated; `runtimeMinutes` and `gasUse` cover only the planned part.
	 */
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
	segments: readonly SegmentDraft[],
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

/** Oxygen-report options. */
export interface OxygenOptions extends TissueOptions {
	/** ['noaa-1991'] */
	limits?: CnsLimits
}

/**
 * Each segment as a constant-ppO₂ exposure at its mean ppO₂.
 * @example segmentExposures(plan.segments)[0] // { ppo2: 0.81, minutes: 1.5, phase: 'working' }
 */
export function segmentExposures(
	segments: readonly SegmentDraft[],
	opts?: TissueOptions,
): Exposure[] {
	return segments.map((s) => {
		const [lo, hi] = ppo2Range(s, opts)
		return { ppo2: (lo + hi) / 2, minutes: s.minutes, phase: s.phase }
	})
}

/**
 * Segments with cumulative CNS % and OTU at each segment's end. CNS is
 * {@link cnsTotals} over the exposures up to and including the segment.
 * @example withOxygen(drafts).at(-1)?.cnsPercent
 */
export function withOxygen(
	segments: readonly SegmentDraft[],
	opts?: OxygenOptions,
): PlannedSegment[] {
	const exposures = segmentExposures(segments, opts)
	const cns = cnsRunningTotals(exposures, { limits: opts?.limits })
	let otu = 0
	return segments.map((s, i) => {
		otu += segmentOtu(exposures[i] as Exposure)
		const { cnsPercent } = cns[i] as CnsTotals
		return { ...s, cnsPercent, otu }
	})
}

/**
 * CNS and OTU over the plan (each segment at its mean ppO₂).
 * @example oxygenTotals(plan.segments) // { limits: 'noaa-1991', cnsPercent: 8.2, otu: 31 }
 */
export function oxygenTotals(
	segments: readonly SegmentDraft[],
	opts?: OxygenOptions,
): CnsTotals & { readonly otu: number } {
	const exposures = segmentExposures(segments, opts)
	const otu = exposures.reduce((sum, e) => sum + segmentOtu(e), 0)
	return { ...cnsTotals(exposures, { limits: opts?.limits }), otu }
}

/**
 * Oxygen-limit warnings for a plan, including earlier dives the same day.
 * @example oxygenWarnings(plan.segments, { limits: 'hoyt-2025' }) // []
 */
export function oxygenWarnings(
	segments: readonly SegmentDraft[],
	opts?: OxygenOptions & { dayExposure?: readonly DayItem[] },
): PlanWarning[] {
	const limits = opts?.limits ?? 'noaa-1991'
	const over = (pct: number | undefined) => (pct ?? 0) > 100 + 1e-9
	const out: PlanWarning[] = []
	const totals = oxygenTotals(segments, opts)
	if (limits === 'noaa-1991') {
		if (over(totals.cnsPercent)) out.push({ code: 'cns-single' })
	} else if (over(totals.cnsPercent)) {
		// Hoyt: within limits if either guideline is met; name the phase(s) over.
		if (over(totals.working)) out.push({ code: 'cns-working' })
		if (over(totals.resting)) out.push({ code: 'cns-resting' })
	}
	const earlier = opts?.dayExposure ?? []
	const earlierDives: Exposure[] = earlier.flatMap((item) =>
		item.type === 'dive' ? [item] : [],
	)
	const daily = cnsTotals(
		[...earlierDives, ...segmentExposures(segments, opts)],
		{ limits, daily: true },
	)
	if (over(daily.cnsPercent)) out.push({ code: 'cns-daily' })
	if (dailyExposure(earlier).totalOtu + totals.otu > repexAllowance(1) + 1e-9)
		out.push({ code: 'otu-daily' })
	return out
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
	segments: readonly SegmentDraft[],
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
