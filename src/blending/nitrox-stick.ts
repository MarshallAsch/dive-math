import { AIR } from '../gas'
import {
	assertFraction,
	assertNonNegative,
	assertPositive,
} from '../internal/validate'

function assertTarget(targetFo2: number): void {
	assertFraction('targetFo2', targetFo2)
	if (targetFo2 >= 1)
		throw new RangeError('targetFo2 must be < 1 for a nitrox stick')
}

/**
 * O₂ injection rate for continuous blending, same units as `airFlow`.
 * @example nitroxStickFlowRate({ targetFo2: 0.32, airFlow: 300 }) // 48.97
 */
export function nitroxStickFlowRate(input: {
	targetFo2: number
	airFlow: number
}): number {
	const { targetFo2, airFlow } = input
	assertTarget(targetFo2)
	assertNonNegative('airFlow', airFlow)
	if (targetFo2 <= AIR.fo2) return 0
	return (airFlow * (targetFo2 - AIR.fo2)) / (1 - targetFo2)
}

/** O₂ drawn from the supply during a nitrox-stick fill. */
export interface SupplyDraw {
	/** O₂ drawn, surface litres. */
	o2SurfaceVolume: number
	/** Pressure drop in the O₂ supply, bar. */
	supplyPressureDrop: number
}

/**
 * O₂ drawn from the supply for a nitrox-stick fill (ideal gas, gauge).
 * @throws {RangeError} If `finalPressure` is below `startPressure`.
 * @example nitroxStickSupplyDraw({ targetFo2: 0.32, tankVolume: 11.1, startPressure: 0, finalPressure: 200, supplyVolume: 50 }).o2SurfaceVolume // 311.5
 */
export function nitroxStickSupplyDraw(input: {
	targetFo2: number
	tankVolume: number
	startPressure: number
	finalPressure: number
	supplyVolume: number
}): SupplyDraw {
	const { targetFo2, tankVolume, startPressure, finalPressure, supplyVolume } =
		input
	assertTarget(targetFo2)
	assertPositive('tankVolume', tankVolume)
	assertNonNegative('startPressure', startPressure)
	assertNonNegative('finalPressure', finalPressure)
	assertPositive('supplyVolume', supplyVolume)
	if (finalPressure < startPressure) {
		throw new RangeError(
			`finalPressure (${finalPressure}) must be >= startPressure (${startPressure})`,
		)
	}
	if (targetFo2 <= AIR.fo2) return { o2SurfaceVolume: 0, supplyPressureDrop: 0 }
	const added = tankVolume * (finalPressure - startPressure)
	const o2SurfaceVolume = (added * (targetFo2 - AIR.fo2)) / (1 - AIR.fo2)
	return { o2SurfaceVolume, supplyPressureDrop: o2SurfaceVolume / supplyVolume }
}
