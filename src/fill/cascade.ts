import { AIR } from '../gas'
import {
	assertGas,
	assertNonNegative,
	assertPositive,
} from '../internal/validate'
import { ATM_BAR } from '../pressure'
import {
	idealEquivalentPressure,
	realPressureForIdealEquivalent,
} from '../real-gas'
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

	// Amount of gas per litre of cylinder: ideal-equivalent absolute bar, so
	// V·n(P) is conserved (moles). Ideal gas: n = P_abs.
	const real = input.useRealGas ?? false
	const nOf = (abs: number) => (real ? idealEquivalentPressure(g, abs) : abs)
	const pOf = (n: number) => (real ? realPressureForIdealEquivalent(g, n) : n)
	const vt = target.volume
	let targetAbs = target.startPressure + ATM_BAR
	let targetN = nOf(targetAbs)
	const desiredAbs =
		desiredPressure !== undefined ? desiredPressure + ATM_BAR : null
	const desiredN = desiredAbs !== null ? nOf(desiredAbs) : null
	const residual = banks.map((b) => b.pressure)
	const order = banks
		.map((_, i) => i)
		.sort((a, b) => banks[a].pressure - banks[b].pressure)

	for (const i of order) {
		if (desiredAbs !== null && targetAbs >= desiredAbs - 1e-9) break
		const bank = banks[i]
		const bankAbs = bank.pressure + ATM_BAR
		if (bankAbs <= targetAbs) continue
		const vb = bank.volume
		const bankN = nOf(bankAbs)
		// Equilibrium: Σ V·n(P_eq) = Σ V·n(P_i).
		const eqN = (targetN * vt + bankN * vb) / (vt + vb)
		if (desiredAbs !== null && desiredN !== null && eqN > desiredN) {
			// Stop at the desired pressure: the bank gives up exactly the moles
			// the target gains.
			residual[i] = pOf(bankN - ((desiredN - targetN) * vt) / vb) - ATM_BAR
			targetAbs = desiredAbs
			break
		}
		targetN = eqN
		targetAbs = pOf(eqN)
		residual[i] = targetAbs - ATM_BAR
	}

	const finalPressure = targetAbs - ATM_BAR
	return {
		finalPressure,
		banks: residual.map((r) => ({ residualPressure: r })),
		reachedDesired:
			desiredPressure !== undefined && finalPressure >= desiredPressure - 1e-9,
	}
}
