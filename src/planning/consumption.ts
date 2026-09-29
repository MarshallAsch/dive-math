import { assertNonNegative, assertPositive } from '../internal/validate'
import { ataAtDepth, type DepthOptions } from '../pressure'

/** A pressure-drop log for consumption rates. */
export type PressureLog = {
	startP: number
	endP: number
	minutes: number
	avgDepthM: number
} & DepthOptions

/**
 * Surface consumption as pressure per minute (bar/min or psi/min — same
 * unit as the inputs). @example sacPressureRate({ startP: 200, endP: 100, minutes: 25, avgDepthM: 15 }) // 1.6
 */
export function sacPressureRate(input: PressureLog): number {
	const { startP, endP, minutes, avgDepthM, ...opts } = input
	assertNonNegative('startP', startP)
	assertNonNegative('endP', endP)
	assertPositive('minutes', minutes)
	if (endP > startP)
		throw new RangeError(`endP (${endP}) must be <= startP (${startP})`)
	return (startP - endP) / minutes / ataAtDepth(avgDepthM, opts)
}

/** Respiratory minute volume at the surface, L/min. @example rmv({ startP: 200, endP: 100, minutes: 25, avgDepthM: 15, tankVolumeL: 12 }) // 19.2 */
export function rmv(input: PressureLog & { tankVolumeL: number }): number {
	const { tankVolumeL, ...log } = input
	assertPositive('tankVolumeL', tankVolumeL)
	return sacPressureRate(log) * tankVolumeL
}

/** Litres drawn from a cylinder (ideal). @example litresConsumed(200, 50, 11.1) // 1665 */
export function litresConsumed(
	startBar: number,
	endBar: number,
	volumeL: number,
): number {
	assertNonNegative('startBar', startBar)
	assertNonNegative('endBar', endBar)
	assertPositive('volumeL', volumeL)
	if (endBar > startBar)
		throw new RangeError(`endBar (${endBar}) must be <= startBar (${startBar})`)
	return volumeL * (startBar - endBar)
}

/** Surface consumption from litres used, L/min. @example sac(1800, 20, 30) // 20 */
export function sac(
	totalLitres: number,
	avgDepthM: number,
	minutes: number,
	opts?: DepthOptions,
): number {
	assertNonNegative('totalLitres', totalLitres)
	assertPositive('minutes', minutes)
	return totalLitres / (minutes * ataAtDepth(avgDepthM, opts))
}

/** CCR metabolic O₂ rate, L/min (depth-independent). @example ccrO2Rate(90, 60) // 1.5 */
export function ccrO2Rate(o2Litres: number, minutes: number): number {
	assertNonNegative('o2Litres', o2Litres)
	assertPositive('minutes', minutes)
	return o2Litres / minutes
}

/** Gas needed for a segment, surface litres. @example gasRequirement({ rmvLpm: 20, avgDepthM: 20, minutes: 30 }) // 1800 */
export function gasRequirement(
	input: { rmvLpm: number; avgDepthM: number; minutes: number } & DepthOptions,
): number {
	const { rmvLpm, avgDepthM, minutes, ...opts } = input
	assertNonNegative('rmvLpm', rmvLpm)
	assertNonNegative('minutes', minutes)
	return rmvLpm * ataAtDepth(avgDepthM, opts) * minutes
}
