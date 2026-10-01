import { describe, expect, it } from 'vitest'
import { AIR, gas } from '../gas'
import {
	assertBreathing,
	breathingPpo2,
	setpointAt,
	type Breathing,
} from './breathing'

const ccr = (
	setpoint: Extract<Breathing, { kind: 'ccr' }>['setpoint'],
): Breathing => ({ kind: 'ccr', diluent: gas(0.18, 0.45), setpoint })

describe('setpointAt', () => {
	const sp = { low: 0.7, high: 1.3, switchDepthM: 6 }
	it('fixed', () => expect(setpointAt(1.2, 40)).toBe(1.2))
	it('high at and below the switch depth', () => {
		expect(setpointAt(sp, 6)).toBe(1.3)
		expect(setpointAt(sp, 30)).toBe(1.3)
	})
	it('low shallower', () => expect(setpointAt(sp, 5.9)).toBe(0.7))
})

describe('breathingPpo2', () => {
	it('open circuit is fO2 × P', () =>
		expect(breathingPpo2({ kind: 'oc', gas: gas(0.32) }, 30)).toBeCloseTo(
			1.28,
			12,
		))
	it('CCR holds the setpoint', () =>
		expect(breathingPpo2(ccr(1.3), 30)).toBeCloseTo(1.3, 12))
	it('CCR is capped at ambient when shallow', () =>
		expect(breathingPpo2(ccr(1.3), 2)).toBeCloseTo(1.2, 12))
	it('CCR cannot drop below the diluent ppO2', () =>
		expect(
			breathingPpo2({ kind: 'ccr', diluent: AIR, setpoint: 0.7 }, 60),
		).toBeCloseTo(1.463, 12))
})

describe('assertBreathing', () => {
	it('accepts valid modes', () => {
		expect(() => assertBreathing({ kind: 'oc', gas: AIR })).not.toThrow()
		expect(() =>
			assertBreathing(ccr({ low: 0.7, high: 1.3, switchDepthM: 6 })),
		).not.toThrow()
	})
	it('rejects bad input', () => {
		expect(() =>
			assertBreathing({ kind: 'oc', gas: { fo2: 2, fhe: 0 } }),
		).toThrow(RangeError)
		expect(() => assertBreathing(ccr(0))).toThrow(RangeError)
		expect(() =>
			assertBreathing(ccr({ low: 1.3, high: 0.7, switchDepthM: 6 })),
		).toThrow(/low/)
		expect(() =>
			assertBreathing(ccr({ low: 0.7, high: 1.3, switchDepthM: -1 })),
		).toThrow(RangeError)
		expect(() =>
			assertBreathing({ kind: 'scr' } as unknown as Breathing),
		).toThrow(/kind/)
	})
})
