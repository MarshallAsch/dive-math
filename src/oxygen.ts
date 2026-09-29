/**
 * Oxygen toxicity: CNS clock (NOAA single-exposure limits) and pulmonary OTU.
 * Above 1.6 ata NOAA publishes no limit; `cnsLimitMinutes` clamps to 45 min,
 * which understates exposure — do not plan above 1.6.
 * @module
 */
import { assertNonNegative } from './internal/validate'

// Source: NOAA Diving Manual, oxygen partial pressure and exposure time limits.
/** NOAA single-exposure CNS limits: ppO₂ (ata) → max minutes. */
export const CNS_TABLE: readonly (readonly [number, number])[] = Object.freeze([
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
] as const)

/** ppO₂ (ata) at or below which no OTU accrue. */
export const OTU_THRESHOLD_PPO2 = 0.5
/** Exponent of the OTU power formula. */
export const OTU_EXPONENT = 0.83
/** CNS clock surface half-time, minutes. */
export const CNS_HALF_LIFE_MIN = 90

/** CNS limit, minutes. @example cnsLimitMinutes(1.4) // 150 */
export function cnsLimitMinutes(ppo2: number): number {
	assertNonNegative('ppo2', ppo2)
	if (ppo2 < (CNS_TABLE[0] as readonly [number, number])[0]) return Infinity
	const last = CNS_TABLE[CNS_TABLE.length - 1] as readonly [number, number]
	if (ppo2 >= last[0]) return last[1]
	for (let i = 0; i < CNS_TABLE.length - 1; i++) {
		const [p0, l0] = CNS_TABLE[i] as readonly [number, number]
		const [p1, l1] = CNS_TABLE[i + 1] as readonly [number, number]
		if (ppo2 >= p0 && ppo2 <= p1) {
			const t = (ppo2 - p0) / (p1 - p0)
			return l0 + t * (l1 - l0)
		}
	}
	/* v8 ignore next */
	return last[1]
}

/** CNS clock percent for one segment. @example segmentCns({ ppo2: 1.4, minutes: 30 }) // 20 */
export function segmentCns(input: { ppo2: number; minutes: number }): number {
	assertNonNegative('ppo2', input.ppo2)
	assertNonNegative('minutes', input.minutes)
	const limit = cnsLimitMinutes(input.ppo2)
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

/** One entry of a diving day: a dive segment or a surface interval. */
export type DayItem =
	| { type: 'dive'; ppo2: number; minutes: number }
	| { type: 'surface'; minutes: number }

/** Result of `dailyExposure`. */
export interface DayResult {
	peakCnsPercent: number
	endCnsPercent: number
	totalOtu: number
	perDive: { cnsPercent: number; otu: number }[]
}

/** @example dailyExposure([{ type: 'dive', ppo2: 1.4, minutes: 30 }]).endCnsPercent // 20 */
export function dailyExposure(items: readonly DayItem[]): DayResult {
	let running = 0
	let peak = 0
	let totalOtu = 0
	const perDive: { cnsPercent: number; otu: number }[] = []

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
		perDive.push({ cnsPercent: cns, otu })
	}

	return { peakCnsPercent: peak, endCnsPercent: running, totalOtu, perDive }
}
