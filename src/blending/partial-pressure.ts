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
	/**
	 * Solve the mole balance with real-gas compressibility and report the
	 * gauge readings a blender sees at each step. Default false.
	 */
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
	/** Final amount: gauge bar (ideal) or ideal-equivalent absolute bar (real). */
	pf: number
	start: Gas
	target: Gas
	top: Gas
	a11: number
	a12: number
	a21: number
	a22: number
	det: number
}

interface Partials {
	pHe: number
	pO2: number
	pTop: number
}

// Added amounts (pure He, pure O₂, top-up) to reach the target at pf from
// pStart of the start mix: a 2×2 linear system. Ideal mode works in gauge
// bar; real mode works in ideal-equivalent absolute bar (moles per litre).
function solvePartials(pStart: number, ctx: SolveCtx): Partials {
	const { pf, start, target, top, a11, a12, a21, a22, det } = ctx
	const rem = pf - pStart
	const bHe = target.fhe * pf - start.fhe * pStart - top.fhe * rem
	const bO2 = target.fo2 * pf - start.fo2 * pStart - top.fo2 * rem
	const pHe = (bHe * a22 - a12 * bO2) / det
	const pO2 = (a11 * bO2 - bHe * a21) / det
	return { pHe, pO2, pTop: pf - pStart - pHe - pO2 }
}

// Real mode: replay the mole additions in fill order and convert the tank
// contents after each step back to a gauge reading. Returns the gauge
// increments per component, so buildResult's running sum is what the
// blender reads on the gauge.
function toGaugeIncrements(
	nStart: number,
	start: Gas,
	moles: Partials,
	top: Gas,
	order: readonly BlendComponent[],
): Partials {
	const add: Record<BlendComponent, [number, Gas]> = {
		he: [moles.pHe, { fo2: 0, fhe: 1 }],
		o2: [moles.pO2, { fo2: 1, fhe: 0 }],
		top: [moles.pTop, top],
	}
	let o2 = start.fo2 * nStart
	let he = start.fhe * nStart
	let all = nStart
	let gauge = realPressureForIdealEquivalent(start, nStart) - ATM_BAR
	const inc: Record<BlendComponent, number> = { he: 0, o2: 0, top: 0 }
	for (const c of order) {
		const [n, g] = add[c]
		o2 += g.fo2 * n
		he += g.fhe * n
		all += n
		const mix = {
			fo2: Math.min(1, Math.max(0, o2 / all)),
			fhe: Math.min(1, Math.max(0, he / all)),
		}
		const next = realPressureForIdealEquivalent(mix, all) - ATM_BAR
		inc[c] = next - gauge
		gauge = next
	}
	return { pHe: inc.he, pO2: inc.o2, pTop: inc.top }
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
 *
 * With `useRealGas`, the system is solved in moles (ideal-equivalent
 * absolute bar, see {@link idealEquivalentPressure}) and replayed in
 * `order`; `steps[].toBar` is the gauge reading after each addition and
 * `pHe`/`pO2`/`pTop` are the gauge increments. All pressures are gauge bar
 * in every case; an infeasible result reports the ideal-gas solution from
 * the unbled start, so its (possibly negative) partials show the shortfall.
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

	const useRealGas = input.useRealGas ?? false
	// Working units: gauge bar (ideal) or ideal-equivalent absolute bar,
	// i.e. moles per container litre scaled so an ideal gas reads P_abs.
	const amountOf = (g: Gas, gauge: number): number =>
		useRealGas ? idealEquivalentPressure(g, gauge + ATM_BAR) : gauge
	const ctx: SolveCtx = {
		pf: amountOf(target, pf),
		start,
		target,
		top,
		a11,
		a12,
		a21,
		a22,
		det,
	}
	const sPi = amountOf(start, pi)
	const sEmpty = amountOf(start, 0)
	const finish = (
		sStart: number,
		bleedTo: number,
		partials: Partials,
	): BlendResult => {
		const shown = useRealGas
			? toGaugeIncrements(sStart, start, partials, top, order)
			: partials
		return buildResult(pi, bleedTo, shown, order, true)
	}
	// No real fill exists to replay, so an infeasible result reports the
	// ideal-gas solution from the unbled start — gauge bar, like everything else.
	const infeasible = (): BlendResult =>
		buildResult(
			pi,
			pi,
			useRealGas ? solvePartials(pi, { ...ctx, pf }) : primary,
			order,
			false,
			'drain-insufficient',
		)

	const primary = solvePartials(sPi, ctx)
	if (primary.pHe >= -EPS && primary.pO2 >= -EPS && primary.pTop >= -EPS) {
		return finish(sPi, pi, primary)
	}
	if (pi <= EPS) return infeasible()

	// Each partial is affine in the start amount: rebuild each line from the
	// empty tank and the actual start, then take the highest bleed target
	// that keeps all three partials ≥ 0.
	const at0 = solvePartials(sEmpty, ctx)
	const span = sPi - sEmpty
	const lines = (
		[
			[at0.pHe, primary.pHe],
			[at0.pO2, primary.pO2],
			[at0.pTop, primary.pTop],
		] as const
	).map(([v0, vPi]) => ({ base: v0, slope: (vPi - v0) / span }))

	let lo = sEmpty
	let hi = sPi
	let constantInfeasible = false
	for (const { base, slope } of lines) {
		if (Math.abs(slope) < 1e-12) {
			if (base < -EPS) constantInfeasible = true
		} else {
			const cross = sEmpty - base / slope
			if (slope > 0) lo = Math.max(lo, cross)
			else hi = Math.min(hi, cross)
		}
	}
	if (constantInfeasible || hi < lo - EPS || hi < sEmpty) return infeasible()
	const sBleed = Math.max(sEmpty, Math.min(hi, sPi))
	const bleedTo = useRealGas
		? Math.max(0, realPressureForIdealEquivalent(start, sBleed) - ATM_BAR)
		: sBleed
	return finish(sBleed, bleedTo, solvePartials(sBleed, ctx))
}
