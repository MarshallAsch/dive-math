/**
 * Replay a sequence of linear segments through the tissue model.
 * @module
 */
import {
	initialTissues,
	loadSegment,
	type Segment,
	type TissueOptions,
	type Tissues,
} from './tissues'

/**
 * Tissue state after each segment, in order. Starts from `startTissues`
 * (default: saturated with surface air).
 * @example replaySegments([{ fromDepthM: 0, toDepthM: 30, minutes: 1.5, breathing: { kind: 'oc', gas: AIR } }]).length // 1
 */
export function replaySegments(
	segments: readonly Segment[],
	startTissues?: Tissues,
	opts?: TissueOptions,
): Tissues[] {
	let t = startTissues ?? initialTissues(opts)
	return segments.map((s) => (t = loadSegment(t, s, opts)))
}
