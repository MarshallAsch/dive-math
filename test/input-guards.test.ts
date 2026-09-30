import { describe, expect, it } from 'vitest'
import * as dm from 'dive-math'

const AIR = dm.AIR
const bad = [NaN, Infinity, -Infinity]
const timingOk: dm.TimingArgs = {
	driveAirL: 500,
	riseBar: 100,
	receiverVolL: 11.1,
	maxFillRateBarPerMin: 10,
	driveSweptL: 1,
	maxCpm: 60,
	ratio: 40,
	supplyAbsBar: 100,
	driveStartBar: 1,
	driveEndBar: 5,
	compressorRateLpm: 100,
}

// Each case builds a call with one numeric argument replaced by `v`.
const cases: [string, (v: number) => unknown][] = [
	['ataAtDepth', (v) => dm.ataAtDepth(v)],
	['depthAtAta', (v) => dm.depthAtAta(v)],
	['surfacePressureAtAltitude', (v) => dm.surfacePressureAtAltitude(v)],
	['ppo2', (v) => dm.ppo2(AIR, v)],
	['mod', (v) => dm.mod(AIR, v)],
	['end', (v) => dm.end(AIR, v)],
	['ead', (v) => dm.ead(AIR, v)],
	['bestFo2', (v) => dm.bestFo2(30, v)],
	['bestFhe', (v) => dm.bestFhe(60, v)],
	['densityAtDepth', (v) => dm.densityAtDepth(AIR, v)],
	['mixZ', (v) => dm.mixZ(AIR, v)],
	['freeGas', (v) => dm.freeGas({ volumeL: 11.1, pressureBar: v })],
	['tankFactor', (v) => dm.tankFactor(v)],
	[
		'topUp',
		(v) => dm.topUp({ startBar: v, startGas: AIR, topGas: AIR, finalBar: 200 }),
	],
	[
		'partialPressureBlend',
		(v) =>
			dm.partialPressureBlend({
				startBar: 0,
				startGas: AIR,
				finalBar: v,
				targetGas: AIR,
			}),
	],
	[
		'nitroxStickFlowRate',
		(v) => dm.nitroxStickFlowRate({ targetFo2: 0.32, airFlow: v }),
	],
	[
		'cascade',
		(v) =>
			dm.cascade({
				banks: [{ volume: 50, pressure: v }],
				target: { volume: 11.1, startPressure: 0 },
			}),
	],
	[
		'booster',
		(v) =>
			dm.booster({
				ratio: 40,
				driveP: v,
				supplyVol: 50,
				supplyStart: 150,
				receiverVol: 11.1,
				receiverStart: 0,
				target: 200,
			}),
	],
	[
		'boosterTiming (driveSweptL)',
		(v) => dm.boosterTiming({ ...timingOk, driveSweptL: v }),
	],
	[
		'boosterTiming (supplyAbsBar)',
		(v) => dm.boosterTiming({ ...timingOk, supplyAbsBar: v }),
	],
	[
		'boosterFillProfile (steps)',
		(v) =>
			dm.boosterFillProfile(
				{
					ratio: 40,
					driveP: 8,
					supplyVol: 50,
					supplyStart: 150,
					receiverVol: 11.1,
					receiverStart: 0,
					target: 200,
				},
				v,
			),
	],
	['settledPressure', (v) => dm.settledPressure(230, v, 20)],
	['cnsLimitMinutes', (v) => dm.cnsLimitMinutes(v)],
	['segmentOtu', (v) => dm.segmentOtu({ ppo2: 1.4, minutes: v })],
	['sac', (v) => dm.sac(1800, v, 30)],
	[
		'rockBottom',
		(v) =>
			dm.rockBottom({
				rmvLpm: v,
				depthM: 30,
				ascentRateMpm: 9,
				stops: [],
				stressFactor: 2,
				teamSize: 2,
			}),
	],
	['bailoutMinutes', (v) => dm.bailoutMinutes(2220, v, 30)],
	[
		'turnPressures',
		(v) =>
			dm.turnPressures({
				capA: 11.1,
				capB: 12.9,
				fillABar: v,
				fillBBar: 200,
				reserveBar: 50,
			}),
	],
	[
		'classifyO2Cell',
		(v) => dm.classifyO2Cell({ brand: 'Aii', ambientMv: 11, o2Mv: v }),
	],
	[
		'effectivePpo2',
		(v) => dm.effectivePpo2({ setpoint: v, diluent: AIR, depthM: 30 }),
	],
	[
		'scrLoopFo2',
		(v) => dm.scrLoopFo2({ supplyFo2: 0.5, supplyRateLpm: v, vo2Lpm: 1 }),
	],
]

describe('NaN / Infinity never leak out', () => {
	for (const [name, call] of cases) {
		it.each(bad)(`${name}(%s) throws RangeError`, (v) =>
			expect(() => call(v)).toThrow(RangeError),
		)
	}
})
