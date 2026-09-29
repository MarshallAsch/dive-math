import { describe, expect, it } from 'vitest'
import {
	ABSOLUTE_AMBIENT_FLOOR_MV,
	classifyO2Cell,
	THEORETICAL_RATIO,
} from './o2-cells'
import type { O2Brand } from './o2-cells'

const aii = (ambientMv: number, o2Mv: number) =>
	classifyO2Cell({ brand: 'Aii', ambientMv, o2Mv })
const cell = (brand: O2Brand, ambientMv: number, o2Mv: number) =>
	classifyO2Cell({ brand, ambientMv, o2Mv })

// A healthy Aii cell reading 12 mV in air should read 12 × 4.78 = 57.36 mV in pure O2.
const AMBIENT = 12
const THEORETICAL = AMBIENT * 4.78

describe('classifyO2Cell', () => {
	it('constants', () => {
		expect(THEORETICAL_RATIO).toBe(4.78)
		expect(ABSOLUTE_AMBIENT_FLOOR_MV).toBe(8)
	})
	it('exact theoretical ratio passes', () =>
		expect(aii(11, 52.58)).toEqual({
			status: 'PASS',
			reason: 'within-spec',
			deviationPercent: expect.closeTo(0, 9),
		}))
	// (50 − 52.58)/52.58 = −4.91%.
	it('−4.9% is qualified pending', () => {
		const v = aii(11, 50)
		expect(v?.status).toBe('QUALIFIED_PENDING')
		expect(v?.reason).toBe('low-deviation')
		expect(v?.deviationPercent).toBeCloseTo(-4.9068, 4)
	})
	it('−6.8% is a ratio collapse', () =>
		expect(aii(11, 49)?.reason).toBe('ratio-collapse'))
	it('+3% fails high', () =>
		expect(aii(11, 54.2)?.reason).toBe('high-deviation'))
	it('ambient below 8 mV is critical', () =>
		expect(aii(7, 33)).toEqual({
			status: 'FAIL',
			reason: 'below-absolute-floor',
			deviationPercent: null,
			ambientFlag: 'critical',
		}))
	it('ambient above the brand ceiling fails', () =>
		expect(aii(15, 71.7)).toEqual({
			status: 'FAIL',
			reason: 'above-ambient-ceiling',
			deviationPercent: null,
		}))
	it('ambient below the brand floor is flagged low but still graded', () => {
		const v = aii(9.5, 45.41)
		expect(v?.status).toBe('PASS')
		expect(v?.ambientFlag).toBe('low')
	})
	it('Greenflash is not applicable', () =>
		expect(
			classifyO2Cell({ brand: 'Greenflash', ambientMv: 11, o2Mv: 52 }),
		).toBeNull())
	it('rejects NaN', () => expect(() => aii(NaN, 50)).toThrow(RangeError))
	it('rejects NaN o2Mv', () => expect(() => aii(12, NaN)).toThrow(RangeError))

	it('passes a cell on the theoretical ratio', () => {
		const v = aii(AMBIENT, THEORETICAL)
		expect(v?.status).toBe('PASS')
		expect(v?.ambientFlag).toBeUndefined()
	})

	it('passes anywhere inside ±2.5%', () => {
		expect(aii(AMBIENT, THEORETICAL * 1.02)?.status).toBe('PASS')
		expect(aii(AMBIENT, THEORETICAL * 0.98)?.status).toBe('PASS')
	})

	it('fails high-side deviation as contamination, not aging', () => {
		const v = aii(AMBIENT, THEORETICAL * 1.05)
		expect(v?.status).toBe('FAIL')
		expect(v?.reason).toBe('high-deviation')
	})

	it('qualifies a low-side shortfall between -2.5% and -5%', () => {
		const v = aii(AMBIENT, THEORETICAL * 0.965)
		expect(v?.status).toBe('QUALIFIED_PENDING')
		expect(v?.reason).toBe('low-deviation')
	})

	it('fails a ratio collapse below -5%', () => {
		const v = aii(AMBIENT, THEORETICAL * 0.94)
		expect(v?.status).toBe('FAIL')
		expect(v?.reason).toBe('ratio-collapse')
	})

	it('never accepts an ambient below the absolute 8 mV floor', () => {
		const v = aii(7.9, 7.9 * 4.78)
		expect(v?.status).toBe('FAIL')
		expect(v?.ambientFlag).toBe('critical')
	})

	it('fails an ambient above the brand ceiling', () => {
		expect(aii(15, 15 * 4.78)?.status).toBe('FAIL')
		expect(cell('AST', 14.1, 14.1 * 4.78)?.status).toBe('FAIL')
	})

	it('flags — but does not fail — an ambient below the manufacturer floor', () => {
		const v = aii(9, 9 * 4.78)
		expect(v?.status).toBe('PASS')
		expect(v?.ambientFlag).toBe('low')
	})

	it('applies each brand its own floor', () => {
		// 9 mV is below Aii's floor of 10 but inside AST's range of 9-14.
		expect(aii(9, 9 * 4.78)?.ambientFlag).toBe('low')
		expect(cell('AST', 9, 9 * 4.78)?.ambientFlag).toBeUndefined()
	})

	it('exempts Greenflash — solid-state, the ratio test does not apply', () => {
		expect(cell('Greenflash', 12, 57.36)).toBeNull()
	})

	describe('boundary cases — deviation bands', () => {
		// The -2.5% and -5.0% boundaries are not exactly representable in IEEE-754 floating point:
		// theoretical * 0.975 yields -2.500000000000008 and theoretical * 0.950 yields
		// -5.000000000000013, both rounding toward the less strict condition. These cases pin the
		// exact boundary location — a flipped >= to > or a changed threshold would be caught.
		// All cases use Aii with ambient 12 mV (theoretical 57.36 mV).

		it('pins +2.5% boundary: 58.7883 mV passes at +2.49%', () => {
			expect(aii(12, 58.7883)?.status).toBe('PASS')
		})

		it('pins +2.5% boundary: 58.7997 mV fails at +2.51%', () => {
			expect(aii(12, 58.7997)?.status).toBe('FAIL')
		})

		it('pins -2.5% boundary: 55.9317 mV passes at -2.49%', () => {
			expect(aii(12, 55.9317)?.status).toBe('PASS')
		})

		it('pins -2.5% boundary: 55.9203 mV qualifies at -2.51%', () => {
			expect(aii(12, 55.9203)?.status).toBe('QUALIFIED_PENDING')
		})

		it('pins -5.0% boundary: 54.4977 mV qualifies at -4.99%', () => {
			expect(aii(12, 54.4977)?.status).toBe('QUALIFIED_PENDING')
		})

		it('pins -5.0% boundary: 54.4863 mV fails at -5.01%', () => {
			expect(aii(12, 54.4863)?.status).toBe('FAIL')
		})
	})

	describe('boundary cases — ambient range', () => {
		it('accepts exactly 8 mV ambient (absolute floor, not < 8)', () => {
			const v = aii(8, 38.24)
			expect(v?.status).toBe('PASS')
			expect(v?.ambientFlag).toBe('low') // 8 is below Aii's mfr floor of 10
		})

		it('accepts exactly 14 mV ambient (Aii ceiling, not > ceiling)', () => {
			const v = aii(14, 66.92)
			expect(v?.status).toBe('PASS')
			expect(v?.ambientFlag).toBeUndefined() // 14 is not below the floor of 10
		})
	})
})
