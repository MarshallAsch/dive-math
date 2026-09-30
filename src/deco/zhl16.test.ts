import { describe, expect, it } from 'vitest'
import {
	AIR_N2_SATURATION,
	WATER_VAPOUR_BUHLMANN,
	WATER_VAPOUR_SCHREINER,
	ZHL16C,
} from './zhl16'

describe('ZH-L16C table', () => {
	it('has 16 frozen compartments with increasing half-times', () => {
		expect(ZHL16C).toHaveLength(16)
		expect(Object.isFrozen(ZHL16C)).toBe(true)
		for (let i = 1; i < 16; i++) {
			expect(ZHL16C[i].n2HalfTime).toBeGreaterThan(ZHL16C[i - 1].n2HalfTime)
			expect(ZHL16C[i].heHalfTime).toBeGreaterThan(ZHL16C[i - 1].heHalfTime)
			expect(Object.isFrozen(ZHL16C[i])).toBe(true)
		}
	})
	// Tauchmedizin (2002) Tabelle 26: cpt 4 (18.5 min) b = 0.7825, cpt 5 (27 min) b = 0.8126.
	it('uses the published b for compartments 4 and 5', () => {
		expect(ZHL16C[3]).toMatchObject({
			n2HalfTime: 18.5,
			n2A: 0.7562,
			n2B: 0.7825,
		})
		expect(ZHL16C[4]).toMatchObject({ n2HalfTime: 27, n2A: 0.62, n2B: 0.8126 })
	})
	// Tabelle 26 row 1b and row 16.
	it('starts at compartment 1b and ends at 635 min', () => {
		expect(ZHL16C[0]).toMatchObject({
			n2HalfTime: 5,
			n2A: 1.1696,
			n2B: 0.5578,
			heHalfTime: 1.88,
		})
		expect(ZHL16C[15]).toMatchObject({
			n2HalfTime: 635,
			n2A: 0.2327,
			n2B: 0.9653,
			heHalfTime: 240.03,
		})
	})
	// Baker, Understanding M-values, Table 2: N2 slope ΔM = 1/b.
	it('matches Baker slopes for compartments 4 and 5', () => {
		expect(1 / ZHL16C[3].n2B).toBeCloseTo(1.278, 3)
		expect(1 / ZHL16C[4].n2B).toBeCloseTo(1.2306, 4)
	})
	it('constants', () => {
		expect(WATER_VAPOUR_BUHLMANN).toBe(0.0627)
		expect(WATER_VAPOUR_SCHREINER).toBe(0.0493)
		expect(AIR_N2_SATURATION).toBe(0.7902)
	})
})
