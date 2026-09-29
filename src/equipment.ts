/** Reference equipment data: boosters and common mixes. @module */
import { AIR, gas } from './gas'
import type { Gas } from './types'

/** Air-driven gas booster preset. */
export interface BoosterPreset {
	readonly name: string
	readonly ratio: number
	readonly twoStage: boolean
	// Air-drive piston swept volume per cycle (geometric, litres) and max cycle
	// rate (cycles/min); 0 = unknown. These are pressure-INDEPENDENT, so the
	// calculator derives the actual drive-air per cycle at the (ramping) drive
	// pressure: free L/cycle = driveSweptL × drive-pressure-abs/atm. The calculator
	// seeds them into editable fields. Two-stage flag from the model designation.
	readonly driveSweptL: number
	readonly maxCpm: number
}

// Air-driven gas boosters. The ratio is the nominal pressure (area) ratio,
// inferred from each model's designation (the model number is the ratio — the
// standard naming convention). Sources: Haskel AG-series product pages
// (haskel.com / fluidprocesscontrol.com); USUN dive boosters (diverightinscuba.com/usun).
// The USUN GBT/SBT 15/40 are TWO-STAGE (1st stage 15:1, output stage 40:1);
// our single-ratio model approximates them by the 40:1 output stage, so the
// drive-gas estimate for those is rough. Other brands/models: use Custom.
//
// driveSweptL is the air-drive swept volume PER STROKE (one gas delivery),
// geometric (π/4·bore²·stroke) so it's drive-pressure-independent; the drive air
// per stroke is derived at the running drive pressure. Total drive air over a
// fill is thermodynamic (≈ receiver/supply pressure ratio) and does NOT depend on
// swept volume — the swept volume only sets the cycle (stroke) rate. Double-acting
// ("D", GBT, SBT) deliver on both strokes, so each stroke has the SAME per-stroke
// swept as the single-acting equivalent (same bore); the "D" just buys a higher
// max stroke rate (maxCpm), not a different per-stroke draw or cycle rate.
// • USUN: drive bores XB/GB 100/160 mm, GBT 160 mm, SBT 125 mm, all 120 mm stroke
//   (u-sun.cn, made-in-china, DRIS); ~60 strokes/min single, ~120 double-acting.
// • Haskel AG: ALL six share one 5.75 in (146 mm) air-drive head (OM-3F manual,
//   Nuvair specs) with ~3.6 in stroke (derived, ±10%) → 1.535 L swept, ~60 cpm.
//   The ratio is set by the gas piston, not the drive, so the swept volume is
//   identical across AG-30…AG-152 (AG-62/102/152 are tandem two-stage gas
//   barrels on the same drive).
/** Built-in gas booster presets (Haskel AG, USUN); see the source notes above for how each is modelled. */
export const BOOSTERS: readonly BoosterPreset[] = Object.freeze(
	(
		[
			// Shared 5.75 in × 3.6 in drive head → π/4·146²·91.6 ≈ 1.535 L per stroke.
			{
				name: 'Haskel AG-30',
				ratio: 30,
				twoStage: false,
				driveSweptL: 1.535,
				maxCpm: 60,
			},
			{
				name: 'Haskel AG-50',
				ratio: 50,
				twoStage: false,
				driveSweptL: 1.535,
				maxCpm: 60,
			},
			{
				name: 'Haskel AG-62',
				ratio: 62,
				twoStage: false,
				driveSweptL: 1.535,
				maxCpm: 60,
			},
			{
				name: 'Haskel AG-75',
				ratio: 75,
				twoStage: false,
				driveSweptL: 1.535,
				maxCpm: 60,
			},
			{
				name: 'Haskel AG-102',
				ratio: 102,
				twoStage: false,
				driveSweptL: 1.535,
				maxCpm: 60,
			},
			{
				name: 'Haskel AG-152',
				ratio: 152,
				twoStage: false,
				driveSweptL: 1.535,
				maxCpm: 60,
			},
			// XB30/XBD30 share the 100 mm × 120 mm drive (0.942 L/stroke); XBD30 is
			// double-acting → ~2× the max stroke rate.
			{
				name: 'USUN XB30',
				ratio: 30,
				twoStage: false,
				driveSweptL: 0.942,
				maxCpm: 60,
			},
			{
				name: 'USUN XBD30 (double-acting)',
				ratio: 30,
				twoStage: false,
				driveSweptL: 0.942,
				maxCpm: 120,
			},
			// GB40/GBD40 share the 160 mm × 120 mm drive (2.412 L/stroke); GBD40 double-acting.
			{
				name: 'USUN GB40',
				ratio: 40,
				twoStage: false,
				driveSweptL: 2.412,
				maxCpm: 60,
			},
			{
				name: 'USUN GBD40 (double-acting)',
				ratio: 40,
				twoStage: false,
				driveSweptL: 2.412,
				maxCpm: 120,
			},
			{
				name: 'USUN GB40-OL-F (O₂)',
				ratio: 40,
				twoStage: false,
				driveSweptL: 2.412,
				maxCpm: 60,
			},
			// GBT 15/40 double-acting, 160 mm → 2.412 L/stroke.
			{
				name: 'USUN GBT 15/40 (2-stage)',
				ratio: 40,
				twoStage: true,
				driveSweptL: 2.412,
				maxCpm: 120,
			},
			// SBT 15/40 double-acting, 125 mm → 1.473 L/stroke.
			{
				name: 'USUN SBT 15/40 (2-stage)',
				ratio: 40,
				twoStage: true,
				driveSweptL: 1.473,
				maxCpm: 120,
			},
		] satisfies BoosterPreset[]
	).map((row) => Object.freeze(row)),
)

/** Named gas mix preset. */
export interface MixPreset {
	readonly name: string
	readonly gas: Gas
}

/** Common dive mixes. Air uses {@link AIR} (20.9%). */
export const COMMON_MIXES: readonly MixPreset[] = Object.freeze(
	(
		[
			{ name: 'Air', gas: AIR },
			{ name: 'EAN28', gas: gas(0.28) },
			{ name: 'EAN32', gas: gas(0.32) },
			{ name: 'EAN36', gas: gas(0.36) },
			{ name: 'EAN40', gas: gas(0.4) },
			{ name: 'EAN50', gas: gas(0.5) },
			{ name: 'EAN80', gas: gas(0.8) },
			{ name: 'Oxygen', gas: gas(1) },
			{ name: 'Trimix 21/35', gas: gas(0.21, 0.35) },
			{ name: 'Trimix 18/45', gas: gas(0.18, 0.45) },
			{ name: 'Trimix 15/55', gas: gas(0.15, 0.55) },
			{ name: 'Trimix 12/60', gas: gas(0.12, 0.6) },
			{ name: 'Trimix 10/70', gas: gas(0.1, 0.7) },
			{ name: 'Helitrox 35/25', gas: gas(0.35, 0.25) },
		] satisfies MixPreset[]
	).map((row) => Object.freeze(row)),
)
