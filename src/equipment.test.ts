import { describe, expect, it } from 'vitest'
import { BOOSTERS, COMMON_MIXES } from './equipment'

describe('equipment', () => {
	it('boosters have positive ratios', () => {
		expect(BOOSTERS.length).toBeGreaterThan(0)
		for (const b of BOOSTERS) expect(b.ratio).toBeGreaterThan(0)
	})
	it('air preset is 20.9% (reconciled from fill-station 0.21)', () =>
		expect(COMMON_MIXES.find((m) => m.name === 'Air')?.gas.fo2).toBe(0.209))
	it('mixes are valid gases', () => {
		for (const m of COMMON_MIXES)
			expect(m.gas.fo2 + m.gas.fhe).toBeLessThanOrEqual(1)
	})
	it('mix fractions are in range; includes EAN80 and O2', () => {
		for (const m of COMMON_MIXES) {
			expect(m.gas.fo2).toBeGreaterThan(0)
			expect(m.gas.fo2).toBeLessThanOrEqual(1)
			expect(m.gas.fhe).toBeGreaterThanOrEqual(0)
		}
		expect(COMMON_MIXES.some((m) => m.gas.fo2 === 0.8 && m.gas.fhe === 0)).toBe(
			true,
		)
		expect(COMMON_MIXES.some((m) => m.gas.fo2 === 1 && m.gas.fhe === 0)).toBe(
			true,
		)
	})
	it('includes Haskel AG-30 at ratio 30 and USUN boosters', () => {
		expect(
			BOOSTERS.some((b) => b.name.includes('AG-30') && b.ratio === 30),
		).toBe(true)
		expect(BOOSTERS.some((b) => b.name.includes('USUN'))).toBe(true)
	})
	it('carries swept-volume data and flags two-stage models', () => {
		for (const b of BOOSTERS) {
			expect(b.name.length).toBeGreaterThan(0)
			expect(b.driveSweptL).toBeGreaterThan(0)
			expect(b.maxCpm).toBeGreaterThan(0)
		}
		expect(BOOSTERS.some((b) => b.twoStage)).toBe(true)
	})
	it('uses one shared air-drive head for all Haskel AG models', () => {
		const haskel = BOOSTERS.filter((b) => b.name.includes('Haskel'))
		expect(haskel.length).toBe(6)
		for (const b of haskel) expect(b.driveSweptL).toBe(haskel[0]?.driveSweptL)
	})
})
