/**
 * Bühlmann ZH-L16C compartment coefficients (bar, minutes).
 *
 * Source: Bühlmann, Völlm & Nussberger, *Tauchmedizin* (Springer, 2002),
 * Tabelle 26 "Die Koeffizienten ZH-L16 für N₂" — scan:
 * https://www.nigelhewitt.co.uk/stuff/aab.jpg — and the ZH-L16 helium set,
 * cross-checked against Baker, *Understanding M-values* (1998), Tables 2–3:
 * https://www.shearwater.com/wp-content/uploads/2019/05/understanding_m-values.pdf
 *
 * Compartment 1 is Bühlmann's "1b" (5.0 min N₂ / 1.88 min He), as used by
 * dive computers; the 4.0 min compartment "1" is not used.
 *
 * The b column is shared by ZH-L16A, B and C; only the N₂ a-values differ.
 * For reference (Tabelle 26), cpt 1b…16:
 *   ZH-L16A a: 1.1696 1.0000 0.8618 0.7562 0.6667 0.5933 0.5282 0.4701
 *              0.4187 0.3798 0.3497 0.3223 0.2971 0.2737 0.2523 0.2327
 *   ZH-L16B a: 1.1696 1.0000 0.8618 0.7562 0.6667 0.5600 0.4947 0.4500
 *              0.4187 0.3798 0.3497 0.3223 0.2850 0.2737 0.2523 0.2327
 * Only ZH-L16C (for dive computers) is exported.
 * @module
 */

/** One tissue compartment: half-times (min) and Bühlmann a (bar) / b coefficients. */
export interface Compartment {
	readonly n2HalfTime: number
	readonly n2A: number
	readonly n2B: number
	readonly heHalfTime: number
	readonly heA: number
	readonly heB: number
}

const row = (
	n2HalfTime: number,
	n2A: number,
	n2B: number,
	heHalfTime: number,
	heA: number,
	heB: number,
): Compartment => Object.freeze({ n2HalfTime, n2A, n2B, heHalfTime, heA, heB })

/** ZH-L16C, 16 compartments, bar/minute units. */
export const ZHL16C: readonly Compartment[] = Object.freeze([
	row(5.0, 1.1696, 0.5578, 1.88, 1.6189, 0.477),
	row(8.0, 1.0, 0.6514, 3.02, 1.383, 0.5747),
	row(12.5, 0.8618, 0.7222, 4.72, 1.1919, 0.6527),
	row(18.5, 0.7562, 0.7825, 6.99, 1.0458, 0.7223),
	row(27.0, 0.62, 0.8126, 10.21, 0.922, 0.7582),
	row(38.3, 0.5043, 0.8434, 14.48, 0.8205, 0.7957),
	row(54.3, 0.441, 0.8693, 20.53, 0.7305, 0.8279),
	row(77.0, 0.4, 0.891, 29.11, 0.6502, 0.8553),
	row(109.0, 0.375, 0.9092, 41.2, 0.595, 0.8757),
	row(146.0, 0.35, 0.9222, 55.19, 0.5545, 0.8903),
	row(187.0, 0.3295, 0.9319, 70.69, 0.5333, 0.8997),
	row(239.0, 0.3065, 0.9403, 90.34, 0.5189, 0.9073),
	row(305.0, 0.2835, 0.9477, 115.29, 0.5181, 0.9122),
	row(390.0, 0.261, 0.9544, 147.42, 0.5176, 0.9171),
	row(498.0, 0.248, 0.9602, 188.24, 0.5172, 0.9217),
	row(635.0, 0.2327, 0.9653, 240.03, 0.5119, 0.9267),
])

/** Alveolar water vapour, bar — Bühlmann (RQ = 1, 47 mmHg at 37 °C). Default. */
export const WATER_VAPOUR_BUHLMANN = 0.0627
/** Alveolar water vapour, bar — Schreiner (RQ = 0.8); Baker's published examples use it. */
export const WATER_VAPOUR_SCHREINER = 0.0493
/** N₂ (+ argon) fraction of surface air for tissue saturation. Source: Bühlmann; DecoTengu. */
export const AIR_N2_SATURATION = 0.7902
