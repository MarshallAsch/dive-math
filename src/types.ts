/** A breathing gas as mole fractions (0–1). Nitrogen is the remainder. */
export interface Gas {
	/** Oxygen fraction, 0–1. */
	readonly fo2: number
	/** Helium fraction, 0–1. */
	readonly fhe: number
}

/** Water type for depth ↔ pressure conversion. */
export type Water = 'salt' | 'fresh'
