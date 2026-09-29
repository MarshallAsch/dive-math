import type { Gas } from '../types'

/** Tolerance on fo2 + fhe ≤ 1 so a sum a hair over 1 from float error still passes. */
export const FRACTION_EPSILON = 1e-9

export function assertFinite(name: string, value: number): void {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new RangeError(`${name} must be a finite number (got ${value})`)
	}
}

export function assertNonNegative(name: string, value: number): void {
	assertFinite(name, value)
	if (value < 0) throw new RangeError(`${name} must be >= 0 (got ${value})`)
}

export function assertPositive(name: string, value: number): void {
	assertFinite(name, value)
	if (value <= 0) throw new RangeError(`${name} must be > 0 (got ${value})`)
}

export function assertFraction(name: string, value: number): void {
	assertFinite(name, value)
	if (value < 0 || value > 1 + FRACTION_EPSILON) {
		throw new RangeError(`${name} must be between 0 and 1 (got ${value})`)
	}
}

export function assertGas(gas: Gas, name = 'gas'): void {
	assertFraction(`${name}.fo2`, gas.fo2)
	assertFraction(`${name}.fhe`, gas.fhe)
	const sum = gas.fo2 + gas.fhe
	if (sum > 1 + FRACTION_EPSILON) {
		throw new RangeError(`${name}.fo2 + ${name}.fhe must be <= 1 (got ${sum})`)
	}
}
