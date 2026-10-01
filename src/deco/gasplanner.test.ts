import { describe, expect, it } from 'vitest'
import profiles from '../../scripts/gasplanner/profiles.json'
import fixture from '../../test/fixtures/gasplanner/tissues.json'
import { toleratedAmbient } from './limits'
import { initialTissues, loadSegment, type Tissues } from './tissues'

// GasPlanner (MIT) run as a black box — see scripts/gasplanner/generate.mjs.
// Tissue loading does not use b, so it must match to 1e-9. Tolerated
// pressure uses b; GasPlanner has typos in N₂ b for compartments 4 and 5
// (index 3, 4), so steps controlled by them are compared to 1e-3.
const opts = {
	surfacePressure: profiles.surfacePressure,
	waterVapour: profiles.waterVapour,
}
const depth = (bar: number) => (bar - profiles.surfacePressure) * 10

describe('GasPlanner tissue oracle', () => {
	it('starts from the same saturation', () =>
		expect(initialTissues(opts).n2[0]).toBeCloseTo(profiles.initialN2, 8))
	for (const p of fixture.profiles) {
		it(p.name, () => {
			const segs = profiles.profiles.find((x) => x.name === p.name)!.segments
			let t: Tissues = initialTissues(opts)
			segs.forEach((s, i) => {
				t = loadSegment(
					t,
					{
						fromDepthM: depth(s.fromBar),
						toDepthM: depth(s.toBar),
						minutes: s.minutes,
						breathing: { kind: 'oc', gas: { fo2: s.fo2, fhe: s.fhe } },
					},
					opts,
				)
				const want = p.steps[i]!
				t.n2.forEach((v, k) => expect(v).toBeCloseTo(want.n2[k]!, 9))
				t.he.forEach((v, k) => expect(v).toBeCloseTo(want.he[k]!, 9))
				for (const tol of want.tolerated) {
					const digits = tol.compartment === 3 || tol.compartment === 4 ? 3 : 9
					expect(toleratedAmbient(t, tol.gf)).toBeCloseTo(tol.bar, digits)
				}
			})
		})
	}
})
