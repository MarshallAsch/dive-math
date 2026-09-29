import { AIR } from '../gas'
import {
	assertGas,
	assertNonNegative,
	assertPositive,
} from '../internal/validate'
import { ATM_BAR } from '../pressure'
import { componentZ } from '../real-gas'
import type { Gas } from '../types'

/** Gas added during a fill: pure helium, pure oxygen or the top-up gas. */
export type BlendComponent = 'he' | 'o2' | 'top'
/**
 * `top-up-unusable`: the top-up gas has no usable O₂/inert direction.
 * `drain-insufficient`: even a full drain can't reach the target.
 */
export type BlendInfeasibleReason = 'top-up-unusable' | 'drain-insufficient'

/** Inputs for {@link partialPressureBlend}. */
export interface BlendInput {
	/** Gauge pressure already in the cylinder, bar. */
	startBar: number
	startGas: Gas
	/** Gauge pressure to finish at, bar. */
	finalBar: number
	targetGas: Gas
	/** Default {@link AIR}. */
	topUpGas?: Gas
	/** Default `['he', 'o2', 'top']`. */
	order?: readonly BlendComponent[]
	/** Scale pure-gas additions by Z at the absolute final pressure. Default false. */
	useRealGas?: boolean
}

/** One fill step: gas added and the cumulative gauge pressure reached. */
export interface BlendStep {
	gas: BlendComponent
	addBar: number
	toBar: number
}

/** Fill plan from {@link partialPressureBlend}; pressures are gauge bar. */
export interface BlendResult {
	pHe: number
	pO2: number
	pTop: number
	addHeTo: number
	addO2To: number
	topTo: number
	steps: BlendStep[]
	feasible: boolean
	reason?: BlendInfeasibleReason
	/** Gauge pressure to bleed down to before adding gas (= startBar when no bleed). */
	bleedTo: number
	bleedBar: number
}

const EPS = 1e-6
const DEFAULT_ORDER: readonly BlendComponent[] = ['he', 'o2', 'top']

interface SolveCtx {
	pf: number
	start: Gas
	target: Gas
	top: Gas
	a11: number
	a12: number
	a21: number
	a22: number
	det: number
	useRealGas: boolean
}

interface Partials {
	pHe: number
	pO2: number
	pTop: number
}

// Added partial pressures (pure He, pure O₂, top-up) to reach the target at
// pf from pStart bar of the start mix: a 2×2 linear system in gauge bar.
function solvePartials(pStart: number, ctx: SolveCtx): Partials {
	const { pf, start, target, top, a11, a12, a21, a22, det } = ctx
	const rem = pf - pStart
	const bHe = target.fhe * pf - start.fhe * pStart - top.fhe * rem
	const bO2 = target.fo2 * pf - start.fo2 * pStart - top.fo2 * rem
	let pHe = (bHe * a22 - a12 * bO2) / det
	let pO2 = (a11 * bO2 - bHe * a21) / det
	if (ctx.useRealGas) {
		pHe *= componentZ('he', pf + ATM_BAR)
		pO2 *= componentZ('o2', pf + ATM_BAR)
	}
	return { pHe, pO2, pTop: pf - pStart - pHe - pO2 }
}

function buildResult(
	pi: number,
	effectiveStart: number,
	partials: Partials,
	order: readonly BlendComponent[],
	feasible: boolean,
	reason?: BlendInfeasibleReason,
): BlendResult {
	const { pHe, pO2, pTop } = partials
	const add: Record<BlendComponent, number> = { he: pHe, o2: pO2, top: pTop }
	let running = effectiveStart
	const steps = order.map((g) => {
		running += add[g]
		return { gas: g, addBar: add[g], toBar: running }
	})
	return {
		pHe,
		pO2,
		pTop,
		addHeTo: effectiveStart + pHe,
		addO2To: effectiveStart + pHe + pO2,
		topTo: effectiveStart + pHe + pO2 + pTop,
		steps,
		feasible,
		...(reason ? { reason } : {}),
		bleedTo: effectiveStart,
		bleedBar: Math.max(0, pi - effectiveStart),
	}
}

function assertOrder(order: readonly BlendComponent[]): void {
	const ok = order.length === 3 && DEFAULT_ORDER.every((c) => order.includes(c))
	if (!ok) {
		throw new RangeError(
			`order must be a permutation of he, o2, top (got ${order.join(',')})`,
		)
	}
}

/**
 * Partial-pressure blend: pure He, pure O₂, then a top-up gas, with an
 * analytic bleed-down when the start gas is in the way.
 * @example partialPressureBlend({ startBar: 0, startGas: AIR, finalBar: 200, targetGas: gas(0.18, 0.45) }).pHe // 90
 */
export function partialPressureBlend(input: BlendInput): BlendResult {
	const {
		startBar: pi,
		startGas: start,
		finalBar: pf,
		targetGas: target,
	} = input
	const top = input.topUpGas ?? AIR
	const order = input.order ?? DEFAULT_ORDER
	assertNonNegative('startBar', pi)
	assertPositive('finalBar', pf)
	assertGas(start, 'startGas')
	assertGas(target, 'targetGas')
	assertGas(top, 'topUpGas')
	assertOrder(order)

	const a11 = 1 - top.fhe
	const a12 = -top.fhe
	const a21 = -top.fo2
	const a22 = 1 - top.fo2
	const det = a11 * a22 - a12 * a21
	const zero = { pHe: 0, pO2: 0, pTop: 0 }

	if (Math.abs(det) < 1e-9) {
		return buildResult(pi, pi, zero, order, false, 'top-up-unusable')
	}

	const ctx: SolveCtx = {
		pf,
		start,
		target,
		top,
		a11,
		a12,
		a21,
		a22,
		det,
		useRealGas: input.useRealGas ?? false,
	}

	const primary = solvePartials(pi, ctx)
	if (primary.pHe >= -EPS && primary.pO2 >= -EPS && primary.pTop >= -EPS) {
		return buildResult(pi, pi, primary, order, true)
	}
	if (pi <= EPS) {
		return buildResult(pi, pi, primary, order, false, 'drain-insufficient')
	}

	// Each partial is affine in the start pressure: rebuild each line from
	// pStart = 0 and pStart = pi, then take the highest bleed target that
	// keeps all three partials ≥ 0.
	const at0 = solvePartials(0, ctx)
	const lines = (
		[
			[at0.pHe, primary.pHe],
			[at0.pO2, primary.pO2],
			[at0.pTop, primary.pTop],
		] as const
	).map(([v0, vPi]) => ({ base: v0, slope: (vPi - v0) / pi }))

	let lo = 0
	let hi = pi
	let constantInfeasible = false
	for (const { base, slope } of lines) {
		if (Math.abs(slope) < 1e-12) {
			if (base < -EPS) constantInfeasible = true
		} else {
			const cross = -base / slope
			if (slope > 0) lo = Math.max(lo, cross)
			else hi = Math.min(hi, cross)
		}
	}
	if (constantInfeasible || hi < lo - EPS || hi < 0) {
		return buildResult(pi, pi, primary, order, false, 'drain-insufficient')
	}
	const bleedTo = Math.max(0, Math.min(hi, pi))
	return buildResult(pi, bleedTo, solvePartials(bleedTo, ctx), order, true)
}
