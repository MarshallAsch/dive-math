/**
 * Cylinder reference tables, free-gas capacity and tank factor.
 * @module
 */
import { AIR } from './gas'
import {
	assertGas,
	assertNonNegative,
	assertPositive,
} from './internal/validate'
import { ATM_BAR } from './pressure'
import { idealEquivalentPressure } from './real-gas'
import type { Gas } from './types'
import { L_PER_CUFT, PSI_PER_BAR, psiToBar } from './units'

/** A cylinder reference-table row. */
export interface Cylinder {
	/** Stable identifier, e.g. `'AL80'`. */
	id: string
	name: string
	/** Water (internal) volume, litres. */
	volumeL: number
	/** Service / rated pressure, bar gauge. */
	ratedBar: number
	material: 'aluminum' | 'steel'
	source: string
}

const LUXFER = 'Luxfer scuba cylinder specifications (3000 psi service)'
const FABER_HP = 'Faber F-x Series HP exempt spec sheet (3442 psi)'
const FABER_LP = 'Faber DOT 3AA LP spec sheet (2640 psi, +10%)'
const WORTHINGTON = 'Worthington/PST X-series spec sheet (3442 psi)'
const EN_STEEL = 'EN 1964 steel, water volume by definition (232 bar)'

const AL_BAR = psiToBar(3000)
const AL100_BAR = psiToBar(3300)
const HP_BAR = psiToBar(3442)
const LP_BAR = psiToBar(2640)

const al = (
	id: string,
	name: string,
	volumeL: number,
	ratedBar = AL_BAR,
): Cylinder => ({
	id,
	name,
	volumeL,
	ratedBar,
	material: 'aluminum',
	source: LUXFER,
})
const steel = (
	id: string,
	name: string,
	volumeL: number,
	ratedBar: number,
	source: string,
): Cylinder => ({ id, name, volumeL, ratedBar, material: 'steel', source })

/** Scuba cylinders. */
export const DIVE_CYLINDERS: readonly Cylinder[] = Object.freeze([
	al('AL80', 'AL80 (S80)', 11.1),
	al('AL63', 'AL63 (S63)', 9.0),
	al('AL40', 'AL40', 5.7),
	al('AL30', 'AL30 (pony)', 4.3),
	al('AL19', 'AL19 (pony)', 2.9),
	al('AL100', 'AL100', 12.9, AL100_BAR),
	steel('HP15', 'HP15', 2, HP_BAR, FABER_HP),
	steel('HP23', 'HP23', 3, HP_BAR, FABER_HP),
	steel('HP71', 'HP71', 9.0, HP_BAR, FABER_HP),
	steel('HP80', 'HP80', 10.2, HP_BAR, FABER_HP),
	steel('HP100', 'HP100 (Faber)', 12.9, HP_BAR, FABER_HP),
	steel('HP117', 'HP117 (Faber)', 15.0, HP_BAR, FABER_HP),
	steel('HP120', 'HP120 (Faber)', 15.3, HP_BAR, FABER_HP),
	steel('HP133', 'HP133 (Faber)', 17.0, HP_BAR, FABER_HP),
	steel('HP149', 'HP149 (Faber)', 19.0, HP_BAR, FABER_HP),
	steel('HP119', 'HP119 (Worthington)', 15.0, HP_BAR, WORTHINGTON),
	steel('HP130', 'HP130 (Worthington)', 16.3, HP_BAR, WORTHINGTON),
	steel('LP27', 'LP27', 4, LP_BAR, FABER_LP),
	steel('LP50', 'LP50', 7.8, LP_BAR, FABER_LP),
	steel('LP85', 'LP85', 13, LP_BAR, FABER_LP),
	steel('LP95', 'LP95', 15, LP_BAR, FABER_LP),
	steel('LP108', 'LP108', 17.0, LP_BAR, FABER_LP),
	steel('LP120', 'LP120', 19, LP_BAR, FABER_LP),
	steel('S12', 'Steel 12 L', 12, 232, EN_STEEL),
	steel('S15', 'Steel 15 L', 15, 232, EN_STEEL),
	steel('S7', 'Steel 7 L (stage)', 7, 232, EN_STEEL),
	steel('S3', 'Steel 3 L (pony)', 3, 232, EN_STEEL),
])

const UN = 'UN/EN storage cylinders, water volume by definition'
/** Cascade / storage bank cylinders. */
export const STORAGE_CYLINDERS: readonly Cylinder[] = Object.freeze([
	steel('UN45-310', 'UN 45 L (310 bar)', 45, 310, UN),
	steel('UN50-300', 'UN 50 L (300 bar)', 50, 300, UN),
	steel('UN50-232', 'UN 50 L (232 bar)', 50, 232, UN),
])

const AIRGAS =
	'Airgas cylinder dimensions (ap003.pdf) and size chart (ap004.pdf)'
const LINDE = 'Linde / Messer Reine Gase 2021'
/** Industrial O₂/He supply bottles. */
export const INDUSTRIAL_CYLINDERS: readonly Cylinder[] = Object.freeze([
	steel('T', 'T cylinder (Airgas 300)', 49, 165, AIRGAS),
	steel('K', 'K cylinder (Airgas 200)', 43.8, 156, AIRGAS),
	steel('L50-200', 'Linde/Messer 50 L (200 bar)', 50, 200, LINDE),
	steel('L50-300', 'Linde/Messer 50 L (300 bar)', 50, 300, LINDE),
])

/** Every cylinder, keyed by id. */
export const CYLINDERS_BY_ID: Readonly<Record<string, Cylinder>> =
	Object.freeze(
		Object.fromEntries(
			[...DIVE_CYLINDERS, ...STORAGE_CYLINDERS, ...INDUSTRIAL_CYLINDERS].map(
				(c) => [c.id, c],
			),
		),
	)

/** Input for {@link freeGas}. */
export interface FreeGasInput {
	volumeL: number
	/** Gauge pressure, bar. */
	pressureBar: number
	/** Default {@link AIR}. Only used when `useRealGas`. */
	gas?: Gas
	/** Default false (ideal: volume × gauge pressure). */
	useRealGas?: boolean
}

/**
 * Free gas above 0 gauge, surface litres (bar·L).
 * @example freeGas({ volumeL: 11.1, pressureBar: 200 }) // 2220
 */
export function freeGas(input: FreeGasInput): number {
	const { volumeL, pressureBar, useRealGas = false } = input
	const g = input.gas ?? AIR
	assertPositive('volumeL', volumeL)
	assertNonNegative('pressureBar', pressureBar)
	assertGas(g)
	if (!useRealGas) return volumeL * pressureBar
	return volumeL * (idealEquivalentPressure(g, pressureBar + ATM_BAR) - ATM_BAR)
}

/**
 * Tank factor: cubic feet of free gas per 100 psi (ideal), unrounded.
 * @example tankFactor(11.1) // 2.70
 */
export function tankFactor(volumeL: number): number {
	assertPositive('volumeL', volumeL)
	return (volumeL * 100) / (L_PER_CUFT * PSI_PER_BAR)
}
