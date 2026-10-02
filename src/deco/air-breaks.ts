/**
 * Air breaks during decompression: the high-ppO₂ on-clock and the choice of
 * break gas. Pure helpers driven by the ascent.
 * @module
 */
import { HYPOXIC_PPO2 } from '../ccr/loop'
import { assertPositive } from '../internal/validate'
import { ataAtDepth, type DepthOptions } from '../pressure'
import type { Gas } from '../types'
import { breathingPpo2, setpointAt, type Breathing } from './breathing'

/**
 * Air-break settings. A mode with no key takes no breaks; `{ oc: {} }` turns
 * on open-circuit breaks with the defaults (in brackets).
 */
export interface AirBreaks {
	oc?: {
		/** High-ppO₂ minutes before a break. [20] */
		onMinutes?: number
		/** [5] */
		breakMinutes?: number
		/** Inspired ppO₂ (ata) at or above which the clock runs. [1.4] */
		triggerPpo2?: number
	}
	ccr?: {
		/** [60] */
		onMinutes?: number
		/** [5] */
		breakMinutes?: number
		/** Setpoint (ata) at or above which the clock runs. [1.3] */
		triggerSetpoint?: number
		/** Loop setpoint during a break, ata. [0.7] */
		breakSetpoint?: number
	}
}

/** {@link AirBreaks} with defaults applied. */
export interface ResolvedAirBreaks {
	readonly oc?: {
		readonly onMinutes: number
		readonly breakMinutes: number
		readonly triggerPpo2: number
	}
	readonly ccr?: {
		readonly onMinutes: number
		readonly breakMinutes: number
		readonly triggerSetpoint: number
		readonly breakSetpoint: number
	}
}

// OC 20/5: the common technical-diving O₂ break. CCR 60/5: US Navy MK 16
// practice cited in Hoyt et al., Diving Hyperb Med 2025;55(3):262–270.
const OC_DEFAULTS = { onMinutes: 20, breakMinutes: 5, triggerPpo2: 1.4 }
const CCR_DEFAULTS = {
	onMinutes: 60,
	breakMinutes: 5,
	triggerSetpoint: 1.3,
	breakSetpoint: 0.7,
}
// Float tolerance on minutes and ppO₂ comparisons.
const EPS = 1e-9

/**
 * Apply defaults and validate; throws RangeError.
 * @example resolveAirBreaks({ oc: {} })?.oc?.onMinutes // 20
 */
export function resolveAirBreaks(
	input?: AirBreaks,
): ResolvedAirBreaks | undefined {
	if (!input) return undefined
	const out: {
		oc?: ResolvedAirBreaks['oc']
		ccr?: ResolvedAirBreaks['ccr']
	} = {}
	if (input.oc) {
		const oc = { ...OC_DEFAULTS, ...input.oc }
		assertPositive('airBreaks.oc.onMinutes', oc.onMinutes)
		assertPositive('airBreaks.oc.breakMinutes', oc.breakMinutes)
		assertPositive('airBreaks.oc.triggerPpo2', oc.triggerPpo2)
		out.oc = Object.freeze(oc)
	}
	if (input.ccr) {
		const ccr = { ...CCR_DEFAULTS, ...input.ccr }
		assertPositive('airBreaks.ccr.onMinutes', ccr.onMinutes)
		assertPositive('airBreaks.ccr.breakMinutes', ccr.breakMinutes)
		assertPositive('airBreaks.ccr.triggerSetpoint', ccr.triggerSetpoint)
		assertPositive('airBreaks.ccr.breakSetpoint', ccr.breakSetpoint)
		if (ccr.breakSetpoint >= ccr.triggerSetpoint)
			throw new RangeError(
				`airBreaks.ccr.breakSetpoint (${ccr.breakSetpoint}) must be < triggerSetpoint (${ccr.triggerSetpoint})`,
			)
		out.ccr = Object.freeze(ccr)
	}
	return Object.freeze(out)
}

/** Air-break clock state carried through the ascent. */
export interface BreakClock {
	/** High-ppO₂ minutes since the last break. */
	readonly onMinutes: number
	/** Continuous minutes below the trigger. */
	readonly belowMinutes: number
	/** Minutes left in the current break (0: not on a break). */
	readonly breakLeft: number
	/** What the diver breathes on the current break. */
	readonly breakBreathing: Breathing | null
}

/** A fresh clock. */
export const CLOCK_START: BreakClock = Object.freeze({
	onMinutes: 0,
	belowMinutes: 0,
	breakLeft: 0,
	breakBreathing: null,
})

/** Where the clock is being run. */
export interface BreakContext {
	readonly depthM: number
	/** What the diver breathes when not on a break. */
	readonly normal: Breathing
	/** Open-circuit gases the diver carries (break-gas candidates). */
	readonly gases: readonly Gas[]
	readonly opts?: DepthOptions
}

/** A constant-depth piece of a stop. */
export interface BreakPiece {
	readonly minutes: number
	readonly breathing: Breathing
	readonly airBreak: boolean
}

type OcRule = NonNullable<ResolvedAirBreaks['oc']>
type CcrRule = NonNullable<ResolvedAirBreaks['ccr']>

function ruleFor(
	rules: ResolvedAirBreaks | undefined,
	normal: Breathing,
): OcRule | CcrRule | undefined {
	return normal.kind === 'oc' ? rules?.oc : rules?.ccr
}

function isOn(rule: OcRule | CcrRule, ctx: BreakContext): boolean {
	const n = ctx.normal
	if (n.kind === 'oc')
		return (
			breathingPpo2(n, ctx.depthM, ctx.opts) >=
			(rule as OcRule).triggerPpo2 - EPS
		)
	return (
		setpointAt(n.setpoint, ctx.depthM) >=
		(rule as CcrRule).triggerSetpoint - EPS
	)
}

/**
 * Break breathing at the context depth: OC, the leanest carried gas that is
 * breathable and below the trigger; CCR, the loop at the break setpoint.
 * Null when no OC gas qualifies.
 * @example breakBreathingAt(resolveAirBreaks({ oc: {} }), { depthM: 6, normal: { kind: 'oc', gas: gas(1) }, gases: [gas(1), AIR] }) // { kind: 'oc', gas: AIR }
 */
export function breakBreathingAt(
	rules: ResolvedAirBreaks | undefined,
	ctx: BreakContext,
): Breathing | null {
	const rule = ruleFor(rules, ctx.normal)
	if (!rule) return null
	const n = ctx.normal
	if (n.kind === 'ccr')
		return {
			kind: 'ccr',
			diluent: n.diluent,
			setpoint: (rule as CcrRule).breakSetpoint,
		}
	const p = ataAtDepth(ctx.depthM, ctx.opts)
	let best: Gas | undefined
	for (const g of ctx.gases) {
		const ppo2 = g.fo2 * p
		if (ppo2 < HYPOXIC_PPO2 - EPS) continue
		if (ppo2 >= (rule as OcRule).triggerPpo2 - EPS) continue
		if (!best || g.fo2 < best.fo2) best = g
	}
	return best ? { kind: 'oc', gas: best } : null
}

/**
 * Run the clock for `minutes` at a constant depth. A break starts only when
 * the clock is full and time remains; a break may be left unfinished
 * (`clock.breakLeft > 0`). `noBreakGas`: a break was due but no break gas
 * exists, so the diver stayed on the normal gas.
 * @example runClock(rules, CLOCK_START, 30, ctx).pieces.length // 3 (20 on, 5 break, 5 on)
 */
export function runClock(
	rules: ResolvedAirBreaks | undefined,
	clock: BreakClock,
	minutes: number,
	ctx: BreakContext,
): { pieces: BreakPiece[]; clock: BreakClock; noBreakGas: boolean } {
	const rule = ruleFor(rules, ctx.normal)
	if (!rule)
		return {
			pieces: [{ minutes, breathing: ctx.normal, airBreak: false }],
			clock,
			noBreakGas: false,
		}
	const pieces: BreakPiece[] = []
	const add = (m: number, breathing: Breathing, airBreak: boolean) => {
		const last = pieces.at(-1)
		if (last && last.breathing === breathing && last.airBreak === airBreak)
			pieces[pieces.length - 1] = { ...last, minutes: last.minutes + m }
		else pieces.push({ minutes: m, breathing, airBreak })
	}
	let c = clock
	let left = minutes
	let noBreakGas = false
	while (left > EPS) {
		if (c.breakLeft > EPS && c.breakBreathing) {
			const m = Math.min(left, c.breakLeft)
			add(m, c.breakBreathing, true)
			left -= m
			c =
				c.breakLeft - m > EPS
					? { ...c, breakLeft: c.breakLeft - m }
					: CLOCK_START
			continue
		}
		if (isOn(rule, ctx)) {
			if (c.onMinutes >= rule.onMinutes - EPS) {
				const b = breakBreathingAt(rules, ctx)
				if (b) {
					c = {
						...c,
						belowMinutes: 0,
						breakLeft: rule.breakMinutes,
						breakBreathing: b,
					}
					continue
				}
				noBreakGas = true
				add(left, ctx.normal, false)
				c = { ...c, onMinutes: c.onMinutes + left, belowMinutes: 0 }
				left = 0
				continue
			}
			const m = Math.min(left, rule.onMinutes - c.onMinutes)
			add(m, ctx.normal, false)
			c = { ...c, onMinutes: c.onMinutes + m, belowMinutes: 0 }
			left -= m
			continue
		}
		add(left, ctx.normal, false)
		const below = c.belowMinutes + left
		c = {
			...c,
			belowMinutes: below,
			onMinutes: below >= rule.breakMinutes - EPS ? 0 : c.onMinutes,
		}
		left = 0
	}
	return { pieces, clock: c, noBreakGas }
}

/**
 * Advance the clock over a travel segment leaving the context depth. Mid-break
 * travel is flown on the break breathing; a break that runs out in transit
 * ends on arrival.
 * @example travelClock(rules, clock, 0.3, ctx).airBreak // true when mid-break
 */
export function travelClock(
	rules: ResolvedAirBreaks | undefined,
	clock: BreakClock,
	minutes: number,
	ctx: BreakContext,
): { breathing: Breathing; airBreak: boolean; clock: BreakClock } {
	const rule = ruleFor(rules, ctx.normal)
	if (!rule) return { breathing: ctx.normal, airBreak: false, clock }
	if (clock.breakLeft > EPS && clock.breakBreathing) {
		const left = clock.breakLeft - minutes
		return {
			breathing: clock.breakBreathing,
			airBreak: true,
			clock: left > EPS ? { ...clock, breakLeft: left } : CLOCK_START,
		}
	}
	if (isOn(rule, ctx))
		return {
			breathing: ctx.normal,
			airBreak: false,
			clock: {
				...clock,
				onMinutes: clock.onMinutes + minutes,
				belowMinutes: 0,
			},
		}
	const below = clock.belowMinutes + minutes
	return {
		breathing: ctx.normal,
		airBreak: false,
		clock: {
			...clock,
			belowMinutes: below,
			onMinutes: below >= rule.breakMinutes - EPS ? 0 : clock.onMinutes,
		},
	}
}

/**
 * On arriving at a new depth mid-break, re-select the break breathing; if
 * none qualifies the break ends early without resetting the clock.
 * @example arriveClock(rules, clock, ctx).noBreakGas // false
 */
export function arriveClock(
	rules: ResolvedAirBreaks | undefined,
	clock: BreakClock,
	ctx: BreakContext,
): { clock: BreakClock; noBreakGas: boolean } {
	if (clock.breakLeft <= EPS) return { clock, noBreakGas: false }
	const b = breakBreathingAt(rules, ctx)
	if (b) return { clock: { ...clock, breakBreathing: b }, noBreakGas: false }
	return {
		clock: { ...clock, breakLeft: 0, breakBreathing: null },
		noBreakGas: true,
	}
}
