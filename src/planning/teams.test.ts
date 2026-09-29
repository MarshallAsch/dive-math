import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { effectiveCapacity, matchRatio, turnPressures } from './teams'

describe('teams', () => {
	it('doubles have twice the capacity', () =>
		expect(effectiveCapacity(11.1, 'double')).toBe(22.2))
	it('singles are unchanged', () =>
		expect(effectiveCapacity(11.1, 'single')).toBe(11.1))
	it('matchRatio is bar in B per bar in A', () =>
		expect(matchRatio(11.1, 12.9)).toBeCloseTo(0.86047, 5))
	it('matchRatio of a double against a single is 2', () =>
		expect(matchRatio(22.2, 11.1)).toBeCloseTo(2, 6))
	it('matchRatio reports 1 for equal capacities', () =>
		expect(matchRatio(12.9, 12.9)).toBeCloseTo(1, 6))
	// A: 11.1 × 200 = 2220 L (limiting); B: 12.9 × 200 = 2580 L.
	it('turnPressures uses the smaller gas volume', () => {
		const t = turnPressures({
			capA: 11.1,
			capB: 12.9,
			fillABar: 200,
			fillBBar: 200,
			reserveBar: 50,
		})
		expect(t.limitingSide).toBe('A')
		expect(t.thirdsA).toBeCloseTo(66.6667, 4)
		expect(t.thirdsB).toBeCloseTo(57.3643, 4)
		expect(t.halvesA).toBeCloseTo(75, 9)
		expect(t.halvesB).toBeCloseTo(64.5349, 4)
	})
	it('both sides turn on the same gas volume (property)', () => {
		const cap = fc.double({ min: 3, max: 30, noNaN: true })
		const fill = fc.double({ min: 50, max: 300, noNaN: true })
		fc.assert(
			fc.property(cap, cap, fill, fill, (capA, capB, fillABar, fillBBar) => {
				const t = turnPressures({
					capA,
					capB,
					fillABar,
					fillBBar,
					reserveBar: 30,
				})
				return Math.abs(t.thirdsA * capA - t.thirdsB * capB) < 1e-6
			}),
		)
	})
	it('rejects bad input', () => {
		expect(() =>
			turnPressures({
				capA: 0,
				capB: 12.9,
				fillABar: 200,
				fillBBar: 200,
				reserveBar: 50,
			}),
		).toThrow(RangeError)
		expect(() => matchRatio(11.1, 0)).toThrow(RangeError)
	})

	// Additional reference cases
	const evenPair = {
		capA: 11.1,
		capB: 11.1,
		fillABar: 207,
		fillBBar: 207,
		reserveBar: 34.5,
	}
	it('splits an even pair into equal thirds', () => {
		const t = turnPressures(evenPair)
		expect(t.thirdsA).toBeCloseTo(69, 6)
		expect(t.thirdsB).toBeCloseTo(69, 6)
	})
	it('subtracts the reserve for halves but not for thirds', () =>
		expect(turnPressures(evenPair).halvesA).toBeCloseTo((207 - 34.5) / 2, 6))
	it('lets the smaller actual volume set a shared ceiling', () => {
		// B holds less gas, so both divers turn on B's third, expressed as each cylinder's own drop.
		const t = turnPressures({
			capA: 22.2,
			capB: 11.1,
			fillABar: 207,
			fillBBar: 207,
			reserveBar: 0,
		})
		expect(t.limitingSide).toBe('B')
		const sharedThirdL = (11.1 * 207) / 3
		expect(t.thirdsA).toBeCloseTo(sharedThirdL / 22.2, 6)
		expect(t.thirdsB).toBeCloseTo(sharedThirdL / 11.1, 6)
		// The bigger cylinder shows the LOWER pressure figure for the identical volume.
		expect(t.thirdsA).toBeLessThan(t.thirdsB)
	})
	it('uses actual fill, not rated pressure', () => {
		const partial = turnPressures({ ...evenPair, fillABar: 100, fillBBar: 100 })
		expect(partial.thirdsA).toBeLessThan(turnPressures(evenPair).thirdsA)
	})
})
