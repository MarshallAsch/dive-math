import { AIR } from '../gas'
import {
	assertGas,
	assertNonNegative,
	assertPositive,
} from '../internal/validate'
import { ATM_BAR } from '../pressure'
import { mixZ } from '../real-gas'
import type { Gas } from '../types'

/** A supply bank cylinder (or bank group) used in a cascade fill. */
export interface BankCylinder {
	/** Water volume, L. */
	volume: number
	/** Gauge pressure, bar. */
	pressure: number
}

/** Inputs for {@link cascade}. */
export interface CascadeInput {
	banks: readonly BankCylinder[]
	target: { volume: number; startPressure: number }
	/** Stop once the target reaches this gauge pressure. Omit to equalise fully. */
	desiredPressure?: number
	/** Bank gas. Default {@link AIR}. Used only when `useRealGas`. */
	gas?: Gas
	useRealGas?: boolean
}

/** Outcome of {@link cascade}: final target pressure and bank residuals in input order. */
export interface CascadeResult {
	finalPressure: number
	banks: { residualPressure: number }[]
	reachedDesired: boolean
}

/**
 * Cascade fill: connect banks lowest-pressure first, equalising each into the
 * target, stopping at `desiredPressure`.
 * @example cascade({ banks: [{ volume: 50, pressure: 300 }], target: { volume: 11.1, startPressure: 0 } }).finalPressure // 245.5
 */
export function cascade(input: CascadeInput): CascadeResult {
	const { banks, target, desiredPressure } = input
	const g = input.gas ?? AIR
	assertPositive('target.volume', target.volume)
	assertNonNegative('target.startPressure', target.startPressure)
	if (desiredPressure !== undefined)
		assertNonNegative('desiredPressure', desiredPressure)
	assertGas(g)
	banks.forEach((b, i) => {
		assertPositive(`banks[${i}].volume`, b.volume)
		assertNonNegative(`banks[${i}].pressure`, b.pressure)
	})

	const z = (abs: number) => (input.useRealGas ? mixZ(g, abs) : 1)
	const vt = target.volume
	let targetAbs = target.startPressure + ATM_BAR
	const desiredAbs =
		desiredPressure !== undefined ? desiredPressure + ATM_BAR : null
	const residual = banks.map((b) => b.pressure)
	const order = banks
		.map((_, i) => i)
		.sort((a, b) => banks[a].pressure - banks[b].pressure)

	for (const i of order) {
		if (desiredAbs !== null && targetAbs >= desiredAbs - 1e-9) break
		const bank = banks[i]
		const bankAbs = bank.pressure + ATM_BAR
		if (bankAbs <= targetAbs) continue
		const wt = vt / z(targetAbs)
		const wb = bank.volume / z(bankAbs)
		const eqAbs = (targetAbs * wt + bankAbs * wb) / (wt + wb)
		if (desiredAbs !== null && eqAbs > desiredAbs) {
			residual[i] = bankAbs - ((desiredAbs - targetAbs) * wt) / wb - ATM_BAR
			targetAbs = desiredAbs
			break
		}
		targetAbs = eqAbs
		residual[i] = eqAbs - ATM_BAR
	}

	const finalPressure = targetAbs - ATM_BAR
	return {
		finalPressure,
		banks: residual.map((r) => ({ residualPressure: r })),
		reachedDesired:
			desiredPressure !== undefined && finalPressure >= desiredPressure - 1e-9,
	}
}
