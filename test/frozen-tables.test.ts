import { describe, expect, it } from 'vitest'
import * as dm from 'dive-math'

// Shared reference data must be immutable all the way down: a consumer
// mutating a row would silently change every other caller's results.
const tables: [string, readonly unknown[]][] = [
	['DIVE_CYLINDERS', dm.DIVE_CYLINDERS],
	['STORAGE_CYLINDERS', dm.STORAGE_CYLINDERS],
	['INDUSTRIAL_CYLINDERS', dm.INDUSTRIAL_CYLINDERS],
	['CYLINDERS_BY_ID values', Object.values(dm.CYLINDERS_BY_ID)],
	['BOOSTERS', dm.BOOSTERS],
	['COMMON_MIXES', dm.COMMON_MIXES],
	['COMMON_MIXES gases', dm.COMMON_MIXES.map((m) => m.gas)],
	['CNS_TABLE', dm.CNS_TABLE],
	['VIRIAL_COEFFICIENTS', Object.values(dm.VIRIAL_COEFFICIENTS)],
	['O2_SENSOR_BRANDS', [dm.O2_SENSOR_BRANDS]],
	[
		'O2_AMBIENT_RANGE',
		Object.values(dm.O2_AMBIENT_RANGE).filter((r) => r !== null),
	],
]

describe('reference tables are deeply frozen', () => {
	for (const [name, rows] of tables) {
		it(`${name} rows are frozen`, () => {
			expect(rows.length).toBeGreaterThan(0)
			for (const row of rows) expect(Object.isFrozen(row)).toBe(true)
		})
	}
	it('the table containers themselves are frozen', () => {
		for (const t of [
			dm.DIVE_CYLINDERS,
			dm.STORAGE_CYLINDERS,
			dm.INDUSTRIAL_CYLINDERS,
			dm.CYLINDERS_BY_ID,
			dm.BOOSTERS,
			dm.COMMON_MIXES,
			dm.CNS_TABLE,
			dm.VIRIAL_COEFFICIENTS,
			dm.O2_SENSOR_BRANDS,
			dm.O2_AMBIENT_RANGE,
		])
			expect(Object.isFrozen(t)).toBe(true)
	})
	it('writing to a row throws in strict mode', () => {
		const row = dm.DIVE_CYLINDERS[0] as { volumeL: number }
		expect(() => {
			row.volumeL = 1
		}).toThrow(TypeError)
	})
})
