import { assertNonNegative, assertPositive } from '../internal/validate'

/** Single cylinder or a matched double set. */
export type CylinderConfig = 'single' | 'double'

/**
 * Doubles/matched-pair configuration: same fill pressure, capacity doubles. Effective capacity
 * is what feeds every calculation below — tank factor, matching ratio, displayed figures.
 * @example effectiveCapacity(11.1, 'double') // 22.2
 */
export function effectiveCapacity(
	volumeL: number,
	config: CylinderConfig,
): number {
	assertPositive('volumeL', volumeL)
	return volumeL * (config === 'double' ? 2 : 1)
}

// Tank factor is the water capacity itself, in L/bar terms — NOT capacity divided by service
// pressure. available_L = capacity_L × pressure_bar (used everywhere else) means
// capacity_L already IS the liters-per-bar figure.
/**
 * Bar-in-B per bar-in-A for an equal volume.
 * @example matchRatio(11.1, 12.9) // 0.860
 */
export function matchRatio(capA: number, capB: number): number {
	assertPositive('capA', capA)
	assertPositive('capB', capB)
	return capA / capB
}

/** Inputs for {@link turnPressures}: capacities (L), fill pressures and shared reserve (bar). */
export interface TurnPressureInput {
	capA: number
	capB: number
	fillABar: number
	fillBBar: number
	reserveBar: number
}

/** Turn pressures (bar) for each cylinder under thirds and halves rules, and which side limits. */
export interface TurnPressures {
	thirdsA: number
	thirdsB: number
	halvesA: number
	halvesB: number
	limitingSide: 'A' | 'B'
}

// Thirds/halves use ACTUAL fill pressure, not rated maximum — a tank filled below its rating has
// less usable gas than the rated figure would suggest. BOTH thirds and halves are team limits,
// not independent per tank: whichever cylinder holds LESS actual usable volume (capacity ×
// actual fill, not capacity alone) sets a shared ceiling. The larger-volume side shows a lower
// pressure figure for the identical cubic-foot total — matching pressure readings between
// mismatched tanks is unsafe, since the bigger tank's diver has consumed more actual gas by that
// point, and in a shared-air emergency the smaller tank won't have enough volume left to cover
// both divers if pressures (rather than volumes) were matched instead.
/**
 * Thirds and halves turn pressures for a two-diver team.
 * @example turnPressures({ capA: 11.1, capB: 12.9, fillABar: 200, fillBBar: 200, reserveBar: 50 }).thirdsB // 57.36
 */
export function turnPressures({
	capA,
	capB,
	fillABar,
	fillBBar,
	reserveBar,
}: TurnPressureInput): TurnPressures {
	assertPositive('capA', capA)
	assertPositive('capB', capB)
	assertNonNegative('fillABar', fillABar)
	assertNonNegative('fillBBar', fillBBar)
	assertNonNegative('reserveBar', reserveBar)
	const volumeA = capA * fillABar
	const volumeB = capB * fillBBar
	const limitingIsA = volumeA <= volumeB
	const limitingCap = limitingIsA ? capA : capB
	const limitingVolume = limitingIsA ? volumeA : volumeB
	const limitingReserveVolume = limitingCap * reserveBar

	// No reserve subtraction on thirds — the third itself is the margin.
	const sharedThirdVolumeL = limitingVolume / 3
	const sharedHalfVolumeL = (limitingVolume - limitingReserveVolume) / 2

	return {
		thirdsA: sharedThirdVolumeL / capA,
		thirdsB: sharedThirdVolumeL / capB,
		halvesA: sharedHalfVolumeL / capA,
		halvesB: sharedHalfVolumeL / capB,
		limitingSide: limitingIsA ? 'A' : 'B',
	}
}
