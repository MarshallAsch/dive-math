// Replay a Shearwater dive through dive-math/deco and compare, sample by
// sample, with what the computer logged (test tooling, not published).
import {
	ascend,
	ceiling,
	initialTissues,
	loadSegment,
	ndl,
	resolvePlanInput,
	type Breathing,
	type Tissues,
} from '../../src/deco'
import type { ShearwaterDive, ShearwaterSample } from './parse'

/** Acceptance bounds (spec §5). */
export const TOLERANCE = {
	firstStopDepthM: 3,
	firstStopMin: 1,
	ttsMin: 2,
	ndlMin: 2,
} as const

export interface SampleComparison {
	timeSec: number
	logged: Pick<
		ShearwaterSample,
		'firstStopDepthM' | 'firstStopMin' | 'ttsMin' | 'ndlMin'
	>
	ours: {
		firstStopDepthM: number
		firstStopMin: number
		ttsMin: number
		ndlMin: number
	}
	withinTolerance: boolean
}

function breathingOf(s: ShearwaterSample): Breathing {
	const g = { fo2: s.fo2, fhe: s.fhe }
	if (s.circuitMode === '1' || s.circuitMode === '')
		return { kind: 'oc', gas: g }
	return { kind: 'ccr', diluent: g, setpoint: s.ppo2 }
}

/** Compare every sample; `oc` samples in deco use the logged gas only (no switches). */
export function replayShearwater(dive: ShearwaterDive): SampleComparison[] {
	const { gfLow, gfHigh } = dive.summary
	const surfacePressure = dive.summary.startSurfaceMbar / 1000
	const opts = { surfacePressure }
	const rules = resolvePlanInput({
		levels: [
			{ depthM: 0, minutes: 0, breathing: breathingOf(dive.samples[0]) },
		],
		gfLow,
		gfHigh,
		...opts,
	})
	let t: Tissues = initialTissues(opts)
	const out: SampleComparison[] = []
	for (let i = 1; i < dive.samples.length; i++) {
		const a = dive.samples[i - 1]
		const b = dive.samples[i]
		const breathing = breathingOf(a)
		t = loadSegment(
			t,
			{
				fromDepthM: Math.max(0, a.depthM),
				toDepthM: Math.max(0, b.depthM),
				minutes: (b.timeSec - a.timeSec) / 60,
				breathing,
			},
			opts,
		)
		const depthM = Math.max(0, b.depthM)
		const inDeco = ceiling(t, gfHigh, opts) > 0
		const up = ascend(
			{ tissues: t, depthM, runtimeMinutes: 0, breathing: breathingOf(b) },
			{ ...rules, decoGases: [], roundStops: true },
		)
		const ours = {
			firstStopDepthM: up.stops[0]?.depthM ?? 0,
			firstStopMin: Math.round(up.stops[0]?.minutes ?? 0),
			ttsMin: Math.ceil(up.runtimeMinutes),
			ndlMin: inDeco
				? 0
				: Math.min(
						99,
						Math.floor(ndl(t, depthM, breathingOf(b), { gfHigh, ...opts })),
					),
		}
		const logged = {
			firstStopDepthM: b.firstStopDepthM,
			firstStopMin: b.firstStopMin,
			ttsMin: b.ttsMin,
			ndlMin: b.ndlMin,
		}
		const ndlOk =
			logged.ndlMin >= 99 && ours.ndlMin >= 99
				? true
				: Math.abs(ours.ndlMin - logged.ndlMin) <= TOLERANCE.ndlMin
		const withinTolerance =
			Math.abs(ours.firstStopDepthM - logged.firstStopDepthM) <=
				TOLERANCE.firstStopDepthM &&
			Math.abs(ours.firstStopMin - logged.firstStopMin) <=
				TOLERANCE.firstStopMin &&
			Math.abs(ours.ttsMin - logged.ttsMin) <= TOLERANCE.ttsMin &&
			ndlOk
		out.push({ timeSec: b.timeSec, logged, ours, withinTolerance })
	}
	return out
}
