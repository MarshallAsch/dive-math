import { assertNonNegative, assertPositive } from '../internal/validate'
import { ataAtDepth, type DepthOptions } from '../pressure'

/** A decompression or safety stop: depth and duration. */
export interface Stop {
	depthM: number
	minutes: number
}

/**
 * Rock-bottom / minimum gas: stressed RMV for the ascent (at half depth)
 * plus stops, for the whole team, surface litres.
 * @example rockBottom({ rmvLpm: 20, depthM: 30, ascentRateMpm: 9, stops: [{ depthM: 5, minutes: 3 }], stressFactor: 2, teamSize: 2 }) // 1026.7
 */
export function rockBottom(
	input: {
		rmvLpm: number
		depthM: number
		ascentRateMpm: number
		stops: readonly Stop[]
		stressFactor: number
		teamSize: number
	} & DepthOptions,
): number {
	const {
		rmvLpm,
		depthM,
		ascentRateMpm,
		stops,
		stressFactor,
		teamSize,
		...opts
	} = input
	assertNonNegative('rmvLpm', rmvLpm)
	assertNonNegative('depthM', depthM)
	assertPositive('ascentRateMpm', ascentRateMpm)
	assertPositive('stressFactor', stressFactor)
	assertPositive('teamSize', teamSize)
	const stressed = rmvLpm * stressFactor
	const ascentGas =
		stressed * ataAtDepth(depthM / 2, opts) * (depthM / ascentRateMpm)
	const stopGas = stops.reduce((sum, s, i) => {
		assertNonNegative(`stops[${i}].minutes`, s.minutes)
		return sum + stressed * ataAtDepth(s.depthM, opts) * s.minutes
	}, 0)
	return (ascentGas + stopGas) * teamSize
}

/** Gauge pressure holding `minGasL`, bar. @example minGasPressure({ minGasL: 1110, tankVolumeL: 11.1 }) // 100 */
export function minGasPressure(input: {
	minGasL: number
	tankVolumeL: number
}): number {
	assertNonNegative('minGasL', input.minGasL)
	assertPositive('tankVolumeL', input.tankVolumeL)
	return input.minGasL / input.tankVolumeL
}

/** Gas in a cylinder, surface litres (ideal, unrounded). @example availableLitres(11.1, 200) // 2220 */
export function availableLitres(volumeL: number, pressureBar: number): number {
	assertPositive('volumeL', volumeL)
	assertNonNegative('pressureBar', pressureBar)
	return volumeL * pressureBar
}

/**
 * Minutes of bailout gas at a fixed average depth. Direct-ascent estimate —
 * not stop-inclusive, not decompression planning.
 * @example bailoutMinutes(2220, 42.5, 30) // 13.06
 */
export function bailoutMinutes(
	availableL: number,
	rmvLpm: number,
	avgDepthM: number,
	opts?: DepthOptions,
): number {
	assertNonNegative('availableL', availableL)
	assertPositive('rmvLpm', rmvLpm)
	return availableL / (rmvLpm * ataAtDepth(avgDepthM, opts))
}
