import { assertFinite, assertNonNegative } from '../internal/validate'
import { ATM_BAR } from '../pressure'
import { KELVIN_OFFSET } from '../units'

function kelvin(name: string, c: number): number {
	assertFinite(name, c)
	const k = c + KELVIN_OFFSET
	if (k <= 0)
		throw new RangeError(`${name} must be above absolute zero (got ${c} °C)`)
	return k
}

/**
 * Gauge pressure a hot fill settles to once cooled (Gay-Lussac, fixed
 * volume, absolute pressures). @example settledPressure(230, 40, 20) // 215.25
 */
export function settledPressure(
	hotBar: number,
	fillTempC: number,
	settledTempC: number,
): number {
	assertNonNegative('hotBar', hotBar)
	return (
		((hotBar + ATM_BAR) * kelvin('settledTempC', settledTempC)) /
			kelvin('fillTempC', fillTempC) -
		ATM_BAR
	)
}

/** Hot fill pressure that settles to `coldBar`. @example hotTarget(200, 40, 20) // 213.71 */
export function hotTarget(
	coldBar: number,
	fillTempC: number,
	settledTempC: number,
): number {
	assertNonNegative('coldBar', coldBar)
	return (
		((coldBar + ATM_BAR) * kelvin('fillTempC', fillTempC)) /
			kelvin('settledTempC', settledTempC) -
		ATM_BAR
	)
}

function assertPct(pct: number): void {
	assertFinite('pct', pct)
	if (pct <= -100) throw new RangeError(`pct must be > -100 (got ${pct})`)
}

/** Flat overfill on gauge pressure. @example applyOverfill(200, 10) // 220 */
export function applyOverfill(coldBar: number, pct: number): number {
	assertFinite('coldBar', coldBar)
	assertPct(pct)
	return coldBar * (1 + pct / 100)
}

/** Inverse of {@link applyOverfill}. @example removeOverfill(220, 10) // 200 */
export function removeOverfill(hotBar: number, pct: number): number {
	assertFinite('hotBar', hotBar)
	assertPct(pct)
	return hotBar / (1 + pct / 100)
}

/** °C of temperature rise per bar/min of fill rate. Empirical fill-station heuristic, not a published value. */
export const HEAT_COEFF = 0.7

/** Gas temperature rise during a fill, °C (0 for non-positive rates). @example tempRise(20) // 14 */
export function tempRise(fillRateBarPerMin: number): number {
	assertFinite('fillRateBarPerMin', fillRateBarPerMin)
	return fillRateBarPerMin > 0 ? HEAT_COEFF * fillRateBarPerMin : 0
}

/** How a hot fill is compensated: none, flat overfill, or Gay-Lussac from temperatures. */
export type HotFillMode = 'off' | 'simple' | 'detailed'

/** Hot-fill compensation settings used by {@link effectiveHotFill}. */
export interface HotFillSettings {
	mode: HotFillMode
	overfillPct: number
	fillTempC: number
	settledTempC: number
}

/**
 * Hot fill pressure for a cold goal under the chosen mode.
 * @example effectiveHotFill(200, { mode: 'simple', overfillPct: 10, fillTempC: 40, settledTempC: 20 }) // 220
 */
export function effectiveHotFill(
	coldBar: number,
	settings: HotFillSettings,
): number {
	if (settings.mode === 'off') {
		assertFinite('coldBar', coldBar)
		return coldBar
	}
	if (settings.mode === 'simple')
		return applyOverfill(coldBar, settings.overfillPct)
	return hotTarget(coldBar, settings.fillTempC, settings.settledTempC)
}
