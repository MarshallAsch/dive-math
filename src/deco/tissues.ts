/**
 * Tissue inert-gas loading: Haldane at constant depth, Schreiner for linear
 * depth changes (exact, no time-stepping).
 * @module
 */
import { fn2 } from '../gas'
import { assertNonNegative } from '../internal/validate'
import {
	ataAtDepth,
	depthAtAta,
	surfacePressure,
	type DepthOptions,
} from '../pressure'
import {
	assertBreathing,
	breathingPpo2,
	setpointAt,
	type Breathing,
} from './breathing'
import { AIR_N2_SATURATION, WATER_VAPOUR_BUHLMANN, ZHL16C } from './zhl16'

/** Dissolved inert-gas pressure per compartment (bar), ZH-L16C order. */
export interface Tissues {
	readonly n2: readonly number[]
	readonly he: readonly number[]
}

/** Depth options plus the alveolar water-vapour pressure. */
export interface TissueOptions extends DepthOptions {
	/** bar; default {@link WATER_VAPOUR_BUHLMANN}. */
	waterVapour?: number
}

/** A linear depth segment breathed on one breathing mode. */
export interface Segment {
	readonly fromDepthM: number
	readonly toDepthM: number
	readonly minutes: number
	readonly breathing: Breathing
}

/** Resolved alveolar water-vapour pressure, bar (validated). @example waterVapourOf({ waterVapour: 0.0493 }) // 0.0493 */
export function waterVapourOf(opts?: TissueOptions): number {
	const wv = opts?.waterVapour ?? WATER_VAPOUR_BUHLMANN
	assertNonNegative('waterVapour', wv)
	if (wv >= 0.1)
		throw new RangeError(`waterVapour must be < 0.1 bar (got ${wv})`)
	return wv
}

const freeze = (n2: number[], he: number[]): Tissues =>
	Object.freeze({ n2: Object.freeze(n2), he: Object.freeze(he) })

/**
 * Tissues saturated with surface air: (P_surf − P_H₂O) × 0.7902 N₂, no He.
 * @example initialTissues().n2[0] // 0.7407
 */
export function initialTissues(opts?: TissueOptions): Tissues {
	const pn2 = (surfacePressure(opts) - waterVapourOf(opts)) * AIR_N2_SATURATION
	return freeze(Array(16).fill(pn2), Array(16).fill(0))
}

/** Inspired (alveolar) inert partial pressures at a depth, bar. @example inspiredInert({ kind: 'oc', gas: AIR }, 30).n2 // ≈ 3.114 */
export function inspiredInert(
	b: Breathing,
	depthM: number,
	opts?: TissueOptions,
): { n2: number; he: number } {
	const p = ataAtDepth(depthM, opts)
	const wv = waterVapourOf(opts)
	if (b.kind === 'oc') {
		return { n2: (p - wv) * fn2(b.gas), he: (p - wv) * b.gas.fhe }
	}
	// CCR: everything in the loop that is not O₂ or water vapour is diluent
	// inert gas, split in the diluent's He:N₂ ratio.
	const inert = Math.max(0, p - wv - breathingPpo2(b, depthM, opts))
	const dilInert = 1 - b.diluent.fo2
	if (dilInert <= 0) return { n2: 0, he: 0 }
	const heShare = b.diluent.fhe / dilInert
	return { n2: inert * (1 - heShare), he: inert * heShare }
}

// Depths inside (from, to) where a CCR loop's inert pressure changes slope:
// ambient = setpoint, ambient = setpoint + P_H₂O, setpoint = diluent ppO₂,
// and the low/high setpoint switch depth.
function ccrBreakpoints(seg: Segment, opts?: TissueOptions): number[] {
	const b = seg.breathing
	if (b.kind !== 'ccr') return []
	const wv = waterVapourOf(opts)
	const lo = Math.min(seg.fromDepthM, seg.toDepthM)
	const hi = Math.max(seg.fromDepthM, seg.toDepthM)
	const sps =
		typeof b.setpoint === 'number'
			? [b.setpoint]
			: [b.setpoint.low, b.setpoint.high]
	const depths: number[] = []
	for (const sp of sps) {
		depths.push(depthAtAta(sp, opts), depthAtAta(sp + wv, opts))
		if (b.diluent.fo2 > 0) depths.push(depthAtAta(sp / b.diluent.fo2, opts))
	}
	if (typeof b.setpoint !== 'number') depths.push(b.setpoint.switchDepthM)
	return depths.filter((d) => d > lo && d < hi)
}

// Split a segment at CCR breakpoints so every piece is linear in pressure.
function pieces(seg: Segment, opts?: TissueOptions): Segment[] {
	const cuts = ccrBreakpoints(seg, opts)
	if (cuts.length === 0) return [seg]
	const dir = seg.toDepthM >= seg.fromDepthM ? 1 : -1
	const ordered = [...new Set(cuts)].sort((a, b) => (a - b) * dir)
	const span = seg.toDepthM - seg.fromDepthM
	const out: Segment[] = []
	let from = seg.fromDepthM
	for (const to of [...ordered, seg.toDepthM]) {
		out.push({
			...seg,
			fromDepthM: from,
			toDepthM: to,
			minutes: (seg.minutes * (to - from)) / span,
		})
		from = to
	}
	return out
}

// Schreiner: P(t) = Pi0 + R(t − 1/k) − (Pi0 − P0 − R/k)e^(−kt); R = 0 → Haldane.
function schreiner(
	p0: number,
	pi0: number,
	rate: number,
	t: number,
	halfTime: number,
): number {
	const k = Math.LN2 / halfTime
	return pi0 + rate * (t - 1 / k) - (pi0 - p0 - rate / k) * Math.exp(-k * t)
}

// Inspired pressure at a depth for the piece's setpoint (CCR pieces never
// straddle the switch depth, so sample the setpoint at the piece midpoint).
function inspiredForPiece(
	piece: Segment,
	depthM: number,
	opts?: TissueOptions,
) {
	const b = piece.breathing
	if (b.kind === 'ccr' && typeof b.setpoint !== 'number') {
		const mid = (piece.fromDepthM + piece.toDepthM) / 2
		const fixed: Breathing = { ...b, setpoint: setpointAt(b.setpoint, mid) }
		return inspiredInert(fixed, depthM, opts)
	}
	return inspiredInert(b, depthM, opts)
}

/**
 * Load tissues over one linear segment (exact Schreiner; Haldane when the
 * depth is constant). @example loadSegment(initialTissues(), { fromDepthM: 0, toDepthM: 30, minutes: 1.5, breathing: { kind: 'oc', gas: gas(0.32) } }).n2[0] // 0.919
 */
export function loadSegment(
	tissues: Tissues,
	seg: Segment,
	opts?: TissueOptions,
): Tissues {
	assertNonNegative('fromDepthM', seg.fromDepthM)
	assertNonNegative('toDepthM', seg.toDepthM)
	assertNonNegative('minutes', seg.minutes)
	assertBreathing(seg.breathing)
	if (seg.minutes === 0) return tissues
	let n2 = [...tissues.n2]
	let he = [...tissues.he]
	for (const piece of pieces(seg, opts)) {
		const start = inspiredForPiece(piece, piece.fromDepthM, opts)
		const end = inspiredForPiece(piece, piece.toDepthM, opts)
		const rN2 = (end.n2 - start.n2) / piece.minutes
		const rHe = (end.he - start.he) / piece.minutes
		n2 = n2.map((p, i) =>
			schreiner(p, start.n2, rN2, piece.minutes, ZHL16C[i].n2HalfTime),
		)
		he = he.map((p, i) =>
			schreiner(p, start.he, rHe, piece.minutes, ZHL16C[i].heHalfTime),
		)
	}
	return freeze(n2, he)
}

/** Haldane loading at a constant depth. @example atConstantDepth(initialTissues(), 30, 20, { kind: 'oc', gas: AIR }).n2[0] // ≈ 2.9 */
export function atConstantDepth(
	tissues: Tissues,
	depthM: number,
	minutes: number,
	breathing: Breathing,
	opts?: TissueOptions,
): Tissues {
	return loadSegment(
		tissues,
		{ fromDepthM: depthM, toDepthM: depthM, minutes, breathing },
		opts,
	)
}

/** Schreiner loading for a linear depth change. @example duringDepthChange(initialTissues(), 0, 30, 1.5, { kind: 'oc', gas: gas(0.32) }).n2[0] // 0.919 */
export function duringDepthChange(
	tissues: Tissues,
	fromDepthM: number,
	toDepthM: number,
	minutes: number,
	breathing: Breathing,
	opts?: TissueOptions,
): Tissues {
	return loadSegment(
		tissues,
		{ fromDepthM, toDepthM, minutes, breathing },
		opts,
	)
}

const SURFACE_AIR: Breathing = Object.freeze({
	kind: 'oc',
	gas: Object.freeze({ fo2: 1 - AIR_N2_SATURATION, fhe: 0 }),
})

/**
 * Off-gas at the surface on air for a surface interval; feed the result to
 * a repeat dive's `startTissues`. @example surfaceInterval(tissues, 60)
 */
export function surfaceInterval(
	tissues: Tissues,
	minutes: number,
	opts?: TissueOptions,
): Tissues {
	return atConstantDepth(tissues, 0, minutes, SURFACE_AIR, opts)
}
