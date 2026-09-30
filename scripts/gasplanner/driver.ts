// Runs GasPlanner's MIT tissue model (black box) over profiles.json and
// prints tissue pressures and tolerated ambient pressures as JSON.
// Bundled and executed by generate.mjs inside a temporary GasPlanner clone.
import {
	LoadSegment,
	Tissues,
} from './projects/scuba-physics/src/lib/algorithm/Tissues'
import { Gas } from './projects/scuba-physics/src/lib/gases/Gases'
import profiles from './profiles.json'

const out = profiles.profiles.map((p) => {
	const tissues = Tissues.createLoaded(
		Array.from({ length: 16 }, () => ({ pN2: profiles.initialN2, pHe: 0 })),
	)
	const steps = p.segments.map((s) => {
		const seconds = s.minutes * 60
		const speed = (s.toBar - s.fromBar) / seconds
		tissues.load(
			new LoadSegment(s.fromBar, seconds, speed),
			new Gas(s.fo2, s.fhe),
		)
		const cs = tissues.compartments
		const tolerated = profiles.gradients.map((gf) => {
			const each = cs.map((c) => c.ceiling(gf))
			const max = Math.max(...each)
			return { gf, bar: max, compartment: each.indexOf(max) }
		})
		return { n2: cs.map((c) => c.pN2), he: cs.map((c) => c.pHe), tolerated }
	})
	return { name: p.name, steps }
})
console.log(
	JSON.stringify(
		{
			source: 'GasPlanner a8c0eb02dd09bfab242ab76c6c27966bc415ff64',
			profiles: out,
		},
		null,
		1,
	),
)
