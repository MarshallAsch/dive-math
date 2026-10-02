import { describe, expect, it } from 'vitest'
import { AIR, gas } from '../gas'
import {
	arriveClock,
	breakBreathingAt,
	CLOCK_START,
	resolveAirBreaks,
	runClock,
	travelClock,
	type BreakContext,
} from './air-breaks'
import type { Breathing } from './breathing'

const O2: Breathing = { kind: 'oc', gas: gas(1) }
const rules = resolveAirBreaks({ oc: {}, ccr: {} })
const at6: BreakContext = { depthM: 6, normal: O2, gases: [gas(1), AIR] }
const at3: BreakContext = { ...at6, depthM: 3 }

describe('resolveAirBreaks', () => {
	it('is undefined when not configured', () =>
		expect(resolveAirBreaks()).toBeUndefined())
	it('applies the defaults', () =>
		expect(resolveAirBreaks({ oc: {}, ccr: {} })).toEqual({
			oc: { onMinutes: 20, breakMinutes: 5, triggerPpo2: 1.4 },
			ccr: {
				onMinutes: 60,
				breakMinutes: 5,
				triggerSetpoint: 1.3,
				breakSetpoint: 0.7,
			},
		}))
	it('keeps modes independent', () =>
		expect(resolveAirBreaks({ oc: { onMinutes: 12 } })).toEqual({
			oc: { onMinutes: 12, breakMinutes: 5, triggerPpo2: 1.4 },
		}))
	it('rejects bad settings', () => {
		expect(() => resolveAirBreaks({ oc: { onMinutes: 0 } })).toThrow(
			/onMinutes/,
		)
		expect(() => resolveAirBreaks({ oc: { breakMinutes: -1 } })).toThrow(
			/breakMinutes/,
		)
		expect(() => resolveAirBreaks({ oc: { triggerPpo2: NaN } })).toThrow(
			/triggerPpo2/,
		)
		expect(() => resolveAirBreaks({ ccr: { breakSetpoint: 1.3 } })).toThrow(
			/breakSetpoint/,
		)
	})
})

describe('breakBreathingAt', () => {
	it('OC: leanest breathable gas below the trigger', () =>
		expect(
			breakBreathingAt(rules, { ...at6, gases: [gas(1), gas(0.5), AIR] }),
		).toEqual({ kind: 'oc', gas: AIR }))
	it('OC: skips gases that are hypoxic at the depth', () =>
		expect(
			breakBreathingAt(rules, {
				...at6,
				depthM: 3,
				gases: [gas(1), gas(0.1, 0.7), gas(0.5)],
			}),
		).toEqual({ kind: 'oc', gas: gas(0.5) }))
	it('OC: null when every gas is at or above the trigger', () =>
		expect(breakBreathingAt(rules, { ...at6, gases: [gas(1)] })).toBeNull())
	it('CCR: the loop at the break setpoint', () =>
		expect(
			breakBreathingAt(rules, {
				depthM: 6,
				normal: { kind: 'ccr', diluent: AIR, setpoint: 1.3 },
				gases: [],
			}),
		).toEqual({ kind: 'ccr', diluent: AIR, setpoint: 0.7 }))
	it('null when the mode has no rule', () =>
		expect(breakBreathingAt(resolveAirBreaks({ ccr: {} }), at6)).toBeNull())
})

describe('runClock', () => {
	it('no rule: one piece on the normal gas, clock untouched', () =>
		expect(runClock(undefined, CLOCK_START, 30, at6)).toEqual({
			pieces: [{ minutes: 30, breathing: O2, airBreak: false }],
			clock: CLOCK_START,
			noBreakGas: false,
		}))
	it('20 on, 5 break, 5 on', () => {
		const r = runClock(rules, CLOCK_START, 30, at6)
		expect(r.pieces).toEqual([
			{ minutes: 20, breathing: O2, airBreak: false },
			{ minutes: 5, breathing: { kind: 'oc', gas: AIR }, airBreak: true },
			{ minutes: 5, breathing: O2, airBreak: false },
		])
		expect(r.clock).toMatchObject({ onMinutes: 5, breakLeft: 0 })
	})
	it('does not start a break when the time runs out with the clock full', () => {
		const r = runClock(rules, CLOCK_START, 20, at6)
		expect(r.pieces).toHaveLength(1)
		expect(r.clock.onMinutes).toBe(20)
	})
	it('a break can be left unfinished and resumed', () => {
		const a = runClock(rules, CLOCK_START, 22, at6)
		expect(a.clock).toMatchObject({ breakLeft: 3 })
		const b = runClock(rules, a.clock, 10, at6)
		expect(b.pieces.map((p) => [p.minutes, p.airBreak])).toEqual([
			[3, true],
			[7, false],
		])
		expect(b.clock).toMatchObject({ onMinutes: 7, breakLeft: 0 })
	})
	it('pauses below the trigger and resets after breakMinutes below it', () => {
		// O₂ at 3 m is 1.3 ata, below the 1.4 trigger.
		const full = { ...CLOCK_START, onMinutes: 15 }
		expect(runClock(rules, full, 4, at3).clock).toMatchObject({
			onMinutes: 15,
			belowMinutes: 4,
		})
		expect(runClock(rules, full, 5, at3).clock).toMatchObject({
			onMinutes: 0,
		})
	})
	it('going back above the trigger clears the below-trigger stretch', () => {
		const c = { ...CLOCK_START, onMinutes: 10, belowMinutes: 4 }
		expect(runClock(rules, c, 1, at6).clock).toMatchObject({
			onMinutes: 11,
			belowMinutes: 0,
		})
	})
	it('no break gas: stays on the normal gas and says so', () => {
		const r = runClock(rules, CLOCK_START, 30, { ...at6, gases: [gas(1)] })
		expect(r.pieces).toEqual([{ minutes: 30, breathing: O2, airBreak: false }])
		expect(r.noBreakGas).toBe(true)
		expect(r.clock.onMinutes).toBe(30)
	})
	it('CCR: 60 on, 5 at the break setpoint', () => {
		const loop: Breathing = { kind: 'ccr', diluent: AIR, setpoint: 1.3 }
		const r = runClock(rules, CLOCK_START, 70, {
			depthM: 6,
			normal: loop,
			gases: [],
		})
		expect(r.pieces.map((p) => [p.minutes, p.airBreak])).toEqual([
			[60, false],
			[5, true],
			[5, false],
		])
		expect(r.pieces[1]!.breathing).toEqual({ ...loop, setpoint: 0.7 })
	})
})

describe('travelClock and arriveClock', () => {
	const mid = runClock(rules, CLOCK_START, 22, at6).clock
	it('mid-break travel is flown on the break gas', () => {
		const t = travelClock(rules, mid, 0.3, at6)
		expect(t).toMatchObject({
			breathing: { kind: 'oc', gas: AIR },
			airBreak: true,
		})
		expect(t.clock.breakLeft).toBeCloseTo(2.7, 12)
	})
	it('a break that runs out in transit ends on arrival', () =>
		expect(travelClock(rules, mid, 3, at6).clock).toEqual(CLOCK_START))
	it('travel above the trigger runs the clock', () =>
		expect(travelClock(rules, CLOCK_START, 0.3, at6).clock.onMinutes).toBe(0.3))
	it('travel below the trigger counts toward a reset', () =>
		expect(
			travelClock(rules, { ...CLOCK_START, onMinutes: 9 }, 0.3, at3).clock,
		).toMatchObject({ onMinutes: 9, belowMinutes: 0.3 }))
	it('no rule: travel on the normal gas', () =>
		expect(travelClock(undefined, mid, 0.3, at6)).toEqual({
			breathing: O2,
			airBreak: false,
			clock: mid,
		}))
	it('arriving re-selects the break gas', () =>
		expect(
			arriveClock(rules, mid, { ...at3, gases: [gas(1), gas(0.5)] }).clock
				.breakBreathing,
		).toEqual({ kind: 'oc', gas: gas(0.5) }))
	it('arriving with no break gas ends the break without a reset', () => {
		// O₂ at 3 m (1.3) is below the trigger, so carry only a hypoxic mix.
		const a = arriveClock(rules, mid, { ...at3, gases: [gas(0.1, 0.7)] })
		expect(a.noBreakGas).toBe(true)
		expect(a.clock).toMatchObject({ breakLeft: 0, onMinutes: mid.onMinutes })
	})
	it('arriving off a break changes nothing', () =>
		expect(arriveClock(rules, CLOCK_START, at3)).toEqual({
			clock: CLOCK_START,
			noBreakGas: false,
		}))
})
