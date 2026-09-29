import { assertGas, assertNonNegative } from '../internal/validate'
import { ATM_BAR } from '../pressure'
import { mixZ } from '../real-gas'
import type { Gas } from '../types'

/** Inputs for {@link topUp}. */
export interface TopUpInput {
	/** Gauge pressure already in the cylinder, bar. */
	startBar: number
	startGas: Gas
	topGas: Gas
	/** Gauge pressure to fill to, bar. */
	finalBar: number
	/** Default false. */
	useRealGas?: boolean
}

/** Outcome of {@link topUp}. */
export interface TopUpResult {
	/** Resulting gauge pressure: `finalBar`, or `startBar` if nothing was added. */
	finalBar: number
	addedBar: number
	gas: Gas
	noTopUp: boolean
}

/**
 * Resulting mix after topping up. Mole-weighted blend of start and top-up
 * gas using absolute pressures; real gas solves by fixed-point iteration.
 * @example topUp({ startBar: 100, startGas: gas(0.32), topGas: AIR, finalBar: 200 }).gas.fo2 // 0.2648
 */
export function topUp(input: TopUpInput): TopUpResult {
	const { startBar, startGas, topGas, finalBar } = input
	assertNonNegative('startBar', startBar)
	assertNonNegative('finalBar', finalBar)
	assertGas(startGas, 'startGas')
	assertGas(topGas, 'topGas')

	if (finalBar <= startBar) {
		return { finalBar: startBar, addedBar: 0, gas: startGas, noTopUp: true }
	}

	const startAbs = startBar + ATM_BAR
	const finalAbs = finalBar + ATM_BAR
	const blend = (r: number): Gas => ({
		fo2: r * startGas.fo2 + (1 - r) * topGas.fo2,
		fhe: r * startGas.fhe + (1 - r) * topGas.fhe,
	})

	let mix = blend(startAbs / finalAbs)
	if (input.useRealGas) {
		const zStart = mixZ(startGas, startAbs)
		for (let i = 0; i < 10; i++) {
			const zFinal = mixZ(mix, finalAbs)
			mix = blend(startAbs / zStart / (finalAbs / zFinal))
		}
	}
	return { finalBar, addedBar: finalBar - startBar, gas: mix, noTopUp: false }
}
