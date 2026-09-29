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

/**
 * Usable pressure (bar) per cylinder under the thirds and halves rules, and
 * which side limits. Each value is the pressure the diver may breathe from
 * that cylinder before turning, NOT the gauge reading to turn at (the turn
 * reading is the fill pressure minus this value).
 */
export interface TurnPressures {
	/** Usable bar from A under thirds: limitingVolume / 3 / capA. */
	thirdsA: number
	/** Usable bar from B under thirds: limitingVolume / 3 / capB. */
	thirdsB: number
	/** Usable bar from A under halves: (limitingVolume − limitingCap·reserve) / 2 / capA, clamped at 0. */
	halvesA: number
	/** Usable bar from B under halves: (limitingVolume − limitingCap·reserve) / 2 / capB, clamped at 0. */
	halvesB: number
	/** Cylinder holding less gas (capacity × fill); it sets the shared volume. */
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
 * Thirds and halves for a two-diver team, as usable pressure per cylinder:
 * the bar each diver may breathe from their own cylinder before turning (not
 * the gauge reading to turn at). The cylinder with the smaller gas volume
 * sets a shared volume: thirds = limitingVolume / 3 / cap, halves =
 * (limitingVolume − limitingCap · reserveBar) / 2 / cap, clamped at 0 when the
 * reserve exceeds the limiting fill.
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
	const sharedHalfVolumeL = Math.max(
		0,
		(limitingVolume - limitingReserveVolume) / 2,
	)

	return {
		thirdsA: sharedThirdVolumeL / capA,
		thirdsB: sharedThirdVolumeL / capB,
		halvesA: sharedHalfVolumeL / capA,
		halvesB: sharedHalfVolumeL / capB,
		limitingSide: limitingIsA ? 'A' : 'B',
	}
}
