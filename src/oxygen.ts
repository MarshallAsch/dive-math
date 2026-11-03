/**
 * Oxygen toxicity: CNS clock and pulmonary OTU. CNS limits come from the
 * NOAA 1991 table (default) or the Hoyt 2025 revised guideline at 1.3 ata.
 * Above 1.6 ata NOAA publishes no limit; `cnsLimitMinutes` clamps to the
 * 1.6 row, which understates exposure — do not plan above 1.6.
 * @module
 */
import { assertNonNegative } from './internal/validate'

type Row = readonly [number, number]
const freezeRows = (rows: readonly Row[]): readonly Row[] =>
	Object.freeze(rows.map((row) => Object.freeze(row)))

// Source: NOAA Diving Manual (1991), oxygen partial pressure and exposure time limits.
/** NOAA single-exposure CNS limits: ppO₂ (ata) → max minutes. */
export const CNS_TABLE: readonly (readonly [number, number])[] = freezeRows([
	[0.6, 720],
	[0.7, 570],
	[0.8, 450],
	[0.9, 360],
	[1.0, 300],
	[1.1, 240],
	[1.2, 210],
	[1.3, 180],
	[1.4, 150],
	[1.5, 120],
	[1.6, 45],
])

// Source: NOAA Diving Manual (1991), 24-hour day column (Hoyt 2025, Table 1).
/** NOAA 24-hour day CNS limits: ppO₂ (ata) → max minutes per day. */
export const CNS_DAILY_TABLE: readonly (readonly [number, number])[] =
	freezeRows([
		[0.6, 720],
		[0.7, 570],
		[0.8, 450],
		[0.9, 360],
		[1.0, 300],
		[1.1, 270],
		[1.2, 240],
		[1.3, 210],
		[1.4, 180],
		[1.5, 180],
		[1.6, 150],
	])

/** ppO₂ (ata) at or below which no OTU accrue. */
export const OTU_THRESHOLD_PPO2 = 0.5
/** Exponent of the OTU power formula. */
export const OTU_EXPONENT = 0.83
/** CNS clock surface half-time, minutes. */
export const CNS_HALF_LIFE_MIN = 90

// Source: Hoyt et al., Diving Hyperb Med 2025;55(3):262–270, statements 2, 4, 6.
/** Highest ppO₂ (ata) the Hoyt 2025 revised limit covers. */
export const HOYT_PPO2 = 1.3
/** Hoyt 2025 budget per phase (working, resting), minutes, per dive and per 24 h. */
export const HOYT_PHASE_MINUTES = 240
// Float tolerance so a 1.3 computed from a depth still counts as 1.3 (well
// below any meaningful ata).
const PPO2_EPS = 1e-9

// Source: Hamilton RW, MTS Journal 23(4), 1989, Fig. 1 (REPEX; Hamilton,
// Kenyon, Peterson, Butler, Beers 1988).
/** REPEX allowable cumulative OTU by mission day (days 1–14). */
export const REPEX_TABLE: readonly (readonly [number, number])[] = freezeRows([
	[1, 850],
	[2, 1400],
	[3, 1860],
	[4, 2100],
	[5, 2300],
	[6, 2520],
	[7, 2660],
	[8, 2800],
	[9, 2970],
	[10, 3100],
	[11, 3300],
	[12, 3600],
	[13, 3900],
	[14, 4200],
])
/** REPEX daily OTU allowance for days 15–30. */
export const REPEX_DAILY_AFTER_14 = 300
/** Longest mission REPEX covers, days. */
export const REPEX_MAX_DAYS = 30

/** CNS limit set: NOAA 1991 (default) or the Hoyt 2025 revised 1.3 ata guideline. */
export type CnsLimits = 'noaa-1991' | 'hoyt-2025'
/** Dive phase for the Hoyt 2025 budgets: working (bottom) or resting (deco). */
export type O2Phase = 'working' | 'resting'

/** Options for {@link cnsLimitMinutes}. `phase` is required for `hoyt-2025`. */
export interface CnsLimitOptions {
	/** ['noaa-1991'] */
	limits?: CnsLimits
	/** Dive phase the exposure belongs to; required for `hoyt-2025`, ignored by NOAA. */
	phase?: O2Phase
	/** Use the 24-hour day limits. [false] */
	daily?: boolean
}

function interpolate(table: readonly Row[], ppo2: number): number {
	const first = table[0] as Row
	const last = table[table.length - 1] as Row
	if (ppo2 < first[0]) return Infinity
	if (ppo2 >= last[0]) return last[1]
	for (let i = 0; i < table.length - 1; i++) {
		const [p0, l0] = table[i] as Row
		const [p1, l1] = table[i + 1] as Row
		if (ppo2 >= p0 && ppo2 <= p1)
			return l0 + ((ppo2 - p0) / (p1 - p0)) * (l1 - l0)
	}
	/* v8 ignore next */
	return last[1]
}

function assertLimits(limits: CnsLimits | undefined): CnsLimits {
	const l = limits ?? 'noaa-1991'
	if (l !== 'noaa-1991' && l !== 'hoyt-2025')
		throw new RangeError(`limits must be 'noaa-1991' or 'hoyt-2025'`)
	return l
}

function assertPhase(phase: O2Phase | undefined): O2Phase {
	if (phase !== 'working' && phase !== 'resting')
		throw new RangeError(`phase must be 'working' or 'resting' for hoyt-2025`)
	return phase
}

/**
 * CNS limit, minutes. Hoyt 2025: from 0.6 to 1.3 ata, 240 min per phase (the
 * 1.3 guideline applied below 1.3); above 1.3 the NOAA limit, unchanged.
 * Below 0.6 ata there is no limit (`Infinity`) under either set.
 * A Hoyt limit alone does not decide a dive: see {@link cnsTotals}.
 * @example cnsLimitMinutes(1.4) // 150
 * @example cnsLimitMinutes(1.3, { limits: 'hoyt-2025', phase: 'working' }) // 240
 */
export function cnsLimitMinutes(ppo2: number, opts?: CnsLimitOptions): number {
	assertNonNegative('ppo2', ppo2)
	const limits = assertLimits(opts?.limits)
	const noaa = interpolate(opts?.daily ? CNS_DAILY_TABLE : CNS_TABLE, ppo2)
	if (limits === 'noaa-1991') return noaa
	assertPhase(opts?.phase)
	if (!Number.isFinite(noaa)) return noaa
	return ppo2 <= HOYT_PPO2 + PPO2_EPS ? HOYT_PHASE_MINUTES : noaa
}

/** CNS clock percent for one segment. @example segmentCns({ ppo2: 1.4, minutes: 30 }) // 20 */
export function segmentCns(
	input: { ppo2: number; minutes: number } & CnsLimitOptions,
): number {
	assertNonNegative('ppo2', input.ppo2)
	assertNonNegative('minutes', input.minutes)
	const limit = cnsLimitMinutes(input.ppo2, input)
	if (!Number.isFinite(limit)) return 0
	return (input.minutes / limit) * 100
}

/** Pulmonary OTU for one segment. @example segmentOtu({ ppo2: 1.4, minutes: 30 }) // ≈48.86 */
export function segmentOtu(input: { ppo2: number; minutes: number }): number {
	assertNonNegative('ppo2', input.ppo2)
	assertNonNegative('minutes', input.minutes)
	if (input.ppo2 <= OTU_THRESHOLD_PPO2) return 0
	return (
		input.minutes *
		Math.pow(
			(input.ppo2 - OTU_THRESHOLD_PPO2) / OTU_THRESHOLD_PPO2,
			OTU_EXPONENT,
		)
	)
}

/**
 * CNS percent under a limit set.
 *
 * Hoyt 2025: exposures above 1.3 ata run one shared NOAA clock, whatever
 * their phase (the paper proposes no change above 1.3), and that shared
 * percent is added to both `working` and `resting`. Exposures from 0.6 to
 * 1.3 ata are charged to their own phase's 240 min budget. A dive is within
 * limits if it meets either guideline, so `cnsPercent` is the NOAA percent
 * or max(working, resting), whichever is lower.
 */
export interface CnsTotals {
	readonly limits: CnsLimits
	/** NOAA: the single clock. Hoyt: min(NOAA percent, max(working, resting)). */
	readonly cnsPercent: number
	/** Hoyt only: percent of the working budget, plus the shared clock above 1.3 ata. */
	readonly working?: number
	/** Hoyt only: percent of the resting budget, plus the shared clock above 1.3 ata. */
	readonly resting?: number
}

/** One constant-ppO₂ exposure. `phase` defaults to `'working'`. */
export interface Exposure {
	ppo2: number
	minutes: number
	phase?: O2Phase
}

/**
 * CNS totals over exposures (no decay). `daily` uses the NOAA 24-hour
 * column for every NOAA lookup; the Hoyt budgets stay 240 min per phase.
 * See {@link CnsTotals} for the Hoyt 2025 rule.
 * @example cnsTotals([{ ppo2: 1.3, minutes: 240, phase: 'working' }], { limits: 'hoyt-2025' }).working // 100
 */
export function cnsTotals(
	exposures: readonly Exposure[],
	opts?: { limits?: CnsLimits; daily?: boolean },
): CnsTotals {
	const limits = assertLimits(opts?.limits)
	const daily = opts?.daily ?? false
	let noaa = 0
	let shared = 0
	let working = 0
	let resting = 0
	for (const e of exposures) {
		const cns = segmentCns({ ppo2: e.ppo2, minutes: e.minutes, daily })
		noaa += cns
		if (limits === 'noaa-1991') continue
		const phase = assertPhase(e.phase ?? 'working')
		if (e.ppo2 > HOYT_PPO2 + PPO2_EPS) {
			shared += cns
			continue
		}
		const own = segmentCns({ ...e, limits, phase, daily })
		if (phase === 'working') working += own
		else resting += own
	}
	if (limits === 'noaa-1991') return { limits, cnsPercent: noaa }
	working += shared
	resting += shared
	return {
		limits,
		cnsPercent: Math.min(noaa, Math.max(working, resting)),
		working,
		resting,
	}
}

/** One entry of a diving day: a dive segment or a surface interval. */
export type DayItem =
	| { type: 'dive'; ppo2: number; minutes: number; phase?: O2Phase }
	| { type: 'surface'; minutes: number }

/** Result of `dailyExposure`. */
export interface DayResult {
	/** Decaying clock (NOAA single-exposure limits, 90 min half-time). */
	peakCnsPercent: number
	endCnsPercent: number
	totalOtu: number
	/** All dive items against the 24-hour limits, no decay. */
	daily: CnsTotals
	perDive: {
		cnsPercent: number
		otu: number
		working?: number
		resting?: number
	}[]
}

/**
 * Items are assumed to fall in one 24-hour window from the first dive.
 * @example dailyExposure([{ type: 'dive', ppo2: 1.4, minutes: 30 }]).endCnsPercent // 20
 */
export function dailyExposure(
	items: readonly DayItem[],
	opts?: { limits?: CnsLimits },
): DayResult {
	const limits = assertLimits(opts?.limits)
	let running = 0
	let peak = 0
	let totalOtu = 0
	const perDive: DayResult['perDive'] = []
	const dives: Exposure[] = []

	for (const item of items) {
		if (item.type === 'surface') {
			assertNonNegative('minutes', item.minutes)
			running *= Math.pow(0.5, item.minutes / CNS_HALF_LIFE_MIN)
			continue
		}
		const cns = segmentCns({ ppo2: item.ppo2, minutes: item.minutes })
		const otu = segmentOtu({ ppo2: item.ppo2, minutes: item.minutes })
		running += cns
		totalOtu += otu
		peak = Math.max(peak, running)
		dives.push(item)
		if (limits === 'noaa-1991') perDive.push({ cnsPercent: cns, otu })
		else {
			const t = cnsTotals([item], { limits })
			perDive.push({
				cnsPercent: cns,
				otu,
				working: t.working,
				resting: t.resting,
			})
		}
	}

	return {
		peakCnsPercent: peak,
		endCnsPercent: running,
		totalOtu,
		daily: cnsTotals(dives, { limits, daily: true }),
		perDive,
	}
}

/** REPEX allowance for a mission of `day` days, cumulative OTU. @example repexAllowance(3) // 1860 */
export function repexAllowance(day: number): number {
	if (!Number.isInteger(day) || day < 1 || day > REPEX_MAX_DAYS)
		throw new RangeError(
			`day must be an integer 1–${REPEX_MAX_DAYS} (got ${day})`,
		)
	if (day <= REPEX_TABLE.length) return (REPEX_TABLE[day - 1] as Row)[1]
	const last = REPEX_TABLE[REPEX_TABLE.length - 1] as Row
	return last[1] + REPEX_DAILY_AFTER_14 * (day - last[0])
}

/** Result of {@link repex}. */
export interface RepexResult {
	readonly days: readonly {
		readonly day: number
		readonly cumulativeOtu: number
		readonly allowedOtu: number
		readonly exceeded: boolean
	}[]
	readonly exceeded: boolean
}

/**
 * Check a multi-day mission against REPEX. `dailyOtu[i]` is day i + 1.
 * @example repex([600, 900]).exceeded // true (1500 > 1400)
 */
export function repex(dailyOtu: readonly number[]): RepexResult {
	if (dailyOtu.length < 1 || dailyOtu.length > REPEX_MAX_DAYS)
		throw new RangeError(
			`dailyOtu must have 1–${REPEX_MAX_DAYS} days (got ${dailyOtu.length})`,
		)
	let cumulativeOtu = 0
	const days = dailyOtu.map((otu, i) => {
		assertNonNegative(`dailyOtu[${i}]`, otu)
		cumulativeOtu += otu
		const allowedOtu = repexAllowance(i + 1)
		return {
			day: i + 1,
			cumulativeOtu,
			allowedOtu,
			exceeded: cumulativeOtu > allowedOtu + 1e-9,
		}
	})
	return { days, exceeded: days.some((d) => d.exceeded) }
}
