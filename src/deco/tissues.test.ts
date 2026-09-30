import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { AIR, gas } from '../gas'
import type { Breathing } from './breathing'
import { replaySegments } from './profile'
import {
	atConstantDepth,
	duringDepthChange,
	initialTissues,
	inspiredInert,
	loadSegment,
	surfaceInterval,
} from './tissues'

const oc = (fo2: number, fhe = 0): Breathing => ({
	kind: 'oc',
	gas: gas(fo2, fhe),
})
const EAN32 = oc(0.32)

// DecoTengu "Decompression Model" worked example (compartment 1, EAN32,
// 1 bar surface, 10 m/bar): https://wrobell.dcmod.org/decotengu/model.html
describe('DecoTengu worked example', () => {
	it('matches the published tissue pressures', () => {
		let t = initialTissues()
		expect(t.n2[0]).toBeCloseTo(0.74065446, 8)
		t = duringDepthChange(t, 0, 30, 1.5, EAN32)
		expect(t.n2[0]).toBeCloseTo(0.919397, 6)
		t = atConstantDepth(t, 30, 20, EAN32)
		expect(t.n2[0]).toBeCloseTo(2.56749, 5)
		t = duringDepthChange(t, 30, 10, 2, EAN32)
		expect(t.n2[0]).toBeCloseTo(2.42184, 5)
	})
})

describe('initialTissues', () => {
	it('saturates at (P_surf − P_H2O) × 0.7902', () => {
		const t = initialTissues({ surfacePressure: 0.8 })
		expect(
			t.n2.every((v) => Math.abs(v - (0.8 - 0.0627) * 0.7902) < 1e-12),
		).toBe(true)
		expect(t.he.every((v) => v === 0)).toBe(true)
		expect(Object.isFrozen(t.n2)).toBe(true)
	})
	it('honours waterVapour and rejects out-of-range values', () => {
		expect(initialTissues({ waterVapour: 0.0493 }).n2[0]).toBeCloseTo(
			(1 - 0.0493) * 0.7902,
			12,
		)
		expect(() => initialTissues({ waterVapour: 0.2 })).toThrow(RangeError)
		expect(() => initialTissues({ waterVapour: -0.01 })).toThrow(RangeError)
	})
})

describe('loading', () => {
	it('zero minutes changes nothing', () => {
		const t = initialTissues()
		expect(atConstantDepth(t, 30, 0, AIR_OC)).toBe(t)
	})
	it('approaches the inspired pressure at constant depth', () => {
		const t = atConstantDepth(initialTissues(), 30, 30000, AIR_OC)
		const pi = inspiredInert(AIR_OC, 30)
		expect(t.n2[15]).toBeCloseTo(pi.n2, 6)
	})
	it('splitting a segment gives the same result (property)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0, max: 100, noNaN: true }),
				fc.double({ min: 0, max: 100, noNaN: true }),
				fc.double({ min: 0.1, max: 30, noNaN: true }),
				fc.double({ min: 0.05, max: 0.95, noNaN: true }),
				fc.boolean(),
				(from, to, minutes, split, useCcr) => {
					const b: Breathing = useCcr
						? {
								kind: 'ccr',
								diluent: gas(0.18, 0.45),
								setpoint:
									split > 0.5 ? 1.2 : { low: 0.7, high: 1.3, switchDepthM: 20 },
							}
						: oc(0.18, 0.45)
					const mid = from + (to - from) * split
					const whole = loadSegment(initialTissues(), {
						fromDepthM: from,
						toDepthM: to,
						minutes,
						breathing: b,
					})
					const parts = replaySegments([
						{
							fromDepthM: from,
							toDepthM: mid,
							minutes: minutes * split,
							breathing: b,
						},
						{
							fromDepthM: mid,
							toDepthM: to,
							minutes: minutes * (1 - split),
							breathing: b,
						},
					]).at(-1)
					return (
						whole.n2.every(
							(v, i) => Math.abs(v - (parts?.n2[i] ?? NaN)) < 1e-9,
						) &&
						whole.he.every((v, i) => Math.abs(v - (parts?.he[i] ?? NaN)) < 1e-9)
					)
				},
			),
		)
	})
	it('rejects bad segments', () => {
		expect(() => atConstantDepth(initialTissues(), -1, 5, AIR_OC)).toThrow(
			RangeError,
		)
		expect(() => atConstantDepth(initialTissues(), 10, NaN, AIR_OC)).toThrow(
			RangeError,
		)
	})
})

const AIR_OC: Breathing = { kind: 'oc', gas: AIR }

describe('CCR inspired inert gas', () => {
	const dil = gas(0.18, 0.45)
	it('is P − P_H2O − setpoint, split by the diluent He:N2 ratio', () => {
		const pi = inspiredInert({ kind: 'ccr', diluent: dil, setpoint: 1.3 }, 30)
		const inert = 4 - 0.0627 - 1.3
		expect(pi.he).toBeCloseTo((inert * 0.45) / 0.82, 12)
		expect(pi.n2).toBeCloseTo((inert * 0.37) / 0.82, 12)
	})
	it('is zero when the loop is pure O2 (shallow)', () =>
		expect(
			inspiredInert({ kind: 'ccr', diluent: dil, setpoint: 1.3 }, 2),
		).toEqual({ n2: 0, he: 0 }))
	it('is zero for a pure O2 diluent', () =>
		expect(
			inspiredInert({ kind: 'ccr', diluent: gas(1), setpoint: 1.3 }, 3),
		).toEqual({ n2: 0, he: 0 }))
})

describe('surfaceInterval', () => {
	it('moves tissues back towards surface saturation', () => {
		const loaded = atConstantDepth(initialTissues(), 40, 30, AIR_OC)
		const rested = surfaceInterval(loaded, 120)
		const sat = initialTissues().n2[0]
		expect(Math.abs(rested.n2[0] - sat)).toBeLessThan(
			Math.abs(loaded.n2[0] - sat),
		)
		expect(surfaceInterval(loaded, 100000).n2[15]).toBeCloseTo(sat, 9)
	})
})
