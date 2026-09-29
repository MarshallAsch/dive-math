import { describe, expect, it } from 'vitest'
import { nitroxStickFlowRate, nitroxStickSupplyDraw } from './nitrox-stick'

describe('nitroxStickFlowRate', () => {
	// O₂ injection Q_O₂ = Q_air (F − 0.209) / (1 − F).
	it('EAN32 from 300 lpm air needs 48.97 lpm O₂', () =>
		expect(nitroxStickFlowRate({ targetFo2: 0.32, airFlow: 300 })).toBeCloseTo(
			48.9706,
			4,
		))
	it('is 0 at or below air', () =>
		expect(nitroxStickFlowRate({ targetFo2: 0.2, airFlow: 300 })).toBe(0))
	it('rejects targetFo2 of 1', () =>
		expect(() => nitroxStickFlowRate({ targetFo2: 1, airFlow: 300 })).toThrow(
			RangeError,
		))
})

describe('nitroxStickSupplyDraw', () => {
	it('EAN32 fill of an AL80 from 0 to 200 bar from a 50 L O₂ bank', () => {
		const r = nitroxStickSupplyDraw({
			targetFo2: 0.32,
			tankVolume: 11.1,
			startPressure: 0,
			finalPressure: 200,
			supplyVolume: 50,
		})
		// 2220 L added × (0.32 − 0.209)/(1 − 0.209)
		expect(r.o2SurfaceVolume).toBeCloseTo(311.5297, 4)
		expect(r.supplyPressureDrop).toBeCloseTo(6.2306, 4)
	})
	it('is zero at or below air', () =>
		expect(
			nitroxStickSupplyDraw({
				targetFo2: 0.209,
				tankVolume: 11.1,
				startPressure: 0,
				finalPressure: 200,
				supplyVolume: 50,
			}),
		).toEqual({ o2SurfaceVolume: 0, supplyPressureDrop: 0 }))
	it('rejects a non-positive supply volume', () =>
		expect(() =>
			nitroxStickSupplyDraw({
				targetFo2: 0.32,
				tankVolume: 11.1,
				startPressure: 0,
				finalPressure: 200,
				supplyVolume: 0,
			}),
		).toThrow(RangeError))
	it('scales drawdown with the fill pressure delta', () => {
		const args = {
			targetFo2: 0.32,
			tankVolume: 12,
			startPressure: 0,
			supplyVolume: 50,
		}
		const base = nitroxStickSupplyDraw({ ...args, finalPressure: 100 })
		const more = nitroxStickSupplyDraw({ ...args, finalPressure: 200 })
		expect(more.supplyPressureDrop).toBeCloseTo(2 * base.supplyPressureDrop, 4)
	})
})

// Ported from fill-station nitroxStick.test.ts.
describe('nitroxStickFlowRate (ported)', () => {
	it('computes O2 flow for EAN32 at a given air flow', () =>
		expect(nitroxStickFlowRate({ targetFo2: 0.32, airFlow: 100 })).toBeCloseTo(
			16.32,
			2,
		))
	it('computes O2 flow for EAN36', () =>
		expect(nitroxStickFlowRate({ targetFo2: 0.36, airFlow: 100 })).toBeCloseTo(
			23.59,
			2,
		))
	it('returns 0 when target is air or leaner', () => {
		expect(nitroxStickFlowRate({ targetFo2: 0.209, airFlow: 100 })).toBe(0)
		expect(nitroxStickFlowRate({ targetFo2: 0.18, airFlow: 100 })).toBe(0)
	})
	// MIGRATION.md
	it('throws instead of returning Infinity near pure O2', () =>
		expect(() => nitroxStickFlowRate({ targetFo2: 1, airFlow: 100 })).toThrow(
			RangeError,
		))
})

describe('nitroxStickSupplyDraw (ported)', () => {
	it('computes O2 surface volume and supply drawdown for a fill', () => {
		const r = nitroxStickSupplyDraw({
			targetFo2: 0.32,
			tankVolume: 12,
			startPressure: 0,
			finalPressure: 200,
			supplyVolume: 50,
		})
		expect(r.o2SurfaceVolume).toBeCloseTo(336.79, 1)
		expect(r.supplyPressureDrop).toBeCloseTo(6.74, 1)
	})
	it('returns zero draw when target is air', () => {
		const r = nitroxStickSupplyDraw({
			targetFo2: 0.209,
			tankVolume: 12,
			startPressure: 0,
			finalPressure: 200,
			supplyVolume: 50,
		})
		expect(r.o2SurfaceVolume).toBe(0)
		expect(r.supplyPressureDrop).toBe(0)
	})
	// MIGRATION.md
	it('throws instead of returning Infinity for a zero supply volume', () =>
		expect(() =>
			nitroxStickSupplyDraw({
				targetFo2: 0.32,
				tankVolume: 12,
				startPressure: 0,
				finalPressure: 200,
				supplyVolume: 0,
			}),
		).toThrow(RangeError))
})
