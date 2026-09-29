/**
 * Real-gas compressibility (Z-factor) for O₂/N₂/He mixes.
 *
 * Virial fit per component, Z(P) = 1 + a·P + b·P² + c·P³ (P in bar
 * absolute), mixed linearly by mole fraction. Coefficients from
 * atdotde/realblender as used by Subsurface and GasPlanner scuba-physics
 * (MIT © 2018 JirkaPok — see THIRD_PARTY_NOTICES.md). Valid 0–500 bar
 * absolute. The source does not state its reference temperature; treat
 * results as room-temperature approximations.
 * @module
 */
import { fn2 } from './gas'
import { assertGas, assertNonNegative } from './internal/validate'
import { ATM_BAR } from './pressure'
import type { Gas } from './types'

/** A gas component with a virial fit. */
export type GasComponent = 'o2' | 'n2' | 'he'

/** Virial coefficients [a, b, c] per component. Source: realblender via GasPlanner. */
export const VIRIAL_COEFFICIENTS: Readonly<
	Record<GasComponent, readonly [number, number, number]>
> = Object.freeze({
	o2: [-7.18092073703e-4, 2.81852572808e-6, -1.50290620492e-9],
	n2: [-2.19260353292e-4, 2.92844845532e-6, -2.07613482075e-9],
	he: [4.87320026468e-4, -8.83632921053e-8, 5.33304543646e-11],
})

/** Upper bound of the fit, bar absolute. */
export const REAL_GAS_MAX_BAR = 500

function assertPressure(pressureAbs: number): void {
	assertNonNegative('pressureAbs', pressureAbs)
	if (pressureAbs > REAL_GAS_MAX_BAR) {
		throw new RangeError(
			`pressureAbs must be <= ${REAL_GAS_MAX_BAR} bar (got ${pressureAbs})`,
		)
	}
}

function virial(
	p: number,
	[a, b, c]: readonly [number, number, number],
): number {
	return p * (a + p * (b + p * c))
}

/** Z of a pure component. @example componentZ('he', 207) // 1.0976 */
export function componentZ(
	component: GasComponent,
	pressureAbs: number,
): number {
	assertPressure(pressureAbs)
	return 1 + virial(pressureAbs, VIRIAL_COEFFICIENTS[component])
}

/** Z of a mix. @example mixZ(AIR, 207) // 1.0402 */
export function mixZ(g: Gas, pressureAbs: number): number {
	assertGas(g)
	assertPressure(pressureAbs)
	return (
		1 +
		g.fo2 * virial(pressureAbs, VIRIAL_COEFFICIENTS.o2) +
		g.fhe * virial(pressureAbs, VIRIAL_COEFFICIENTS.he) +
		fn2(g) * virial(pressureAbs, VIRIAL_COEFFICIENTS.n2)
	)
}

/**
 * Pressure an ideal gas would need to hold the same moles, bar absolute.
 * Normalised so 1 atm → 1 atm. @example idealEquivalentPressure(AIR, 201.01325) // 193.88
 */
export function idealEquivalentPressure(g: Gas, pressureAbs: number): number {
	return (pressureAbs * mixZ(g, ATM_BAR)) / mixZ(g, pressureAbs)
}

/**
 * Real pressure holding the same moles as an ideal gas at `idealAbs`.
 * Fixed-point iteration; throws if the answer leaves the model range.
 * @example realPressureForIdealEquivalent(AIR, 193.88) // 201.01
 */
export function realPressureForIdealEquivalent(
	g: Gas,
	idealAbs: number,
): number {
	assertNonNegative('idealAbs', idealAbs)
	const zRef = mixZ(g, ATM_BAR)
	let p = idealAbs
	for (let i = 0; i < 200; i++) {
		const next = (idealAbs * mixZ(g, p)) / zRef
		if (Math.abs(next - p) < 1e-10) return next
		p = next
	}
	/* v8 ignore next */
	throw new RangeError('realPressureForIdealEquivalent did not converge')
}
