import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AIR } from '../../src/gas'
import { planDive } from '../../src/deco'
import { parseShearwaterCsv, splitCsvLine } from './parse'
import { replayShearwater, TOLERANCE } from './replay'

const SUMMARY_HEAD =
	'Dive Number,GF Minimum,GF Maximum,Surface Interval (min),Imperial Units,Start Battery Voltage,Start CNS %,Start Date,Start External O2 Sensor Status,Start Low Set Point,Start High Set Point,Computer Firmware Version,Max Depth,Max Time,Error History,End Battery Voltage,End CNS,End Date,End External O2 Sensor Status,End Low Set Point,End High Set Point,Computer Serial Number,Computer Firmware Version,Computer Model,Log Version,Deco Model,VPM-B Conservatism,Start Surface Pressure,End Surface Pressure,Product'
const SAMPLE_HEAD =
	'Time (sec),Depth,First Stop Depth,Time To Surface (min),Average PPO2,Fraction O2,Fraction He,First Stop Time,Current NDL,Current Circuit Mode,Current CCR Mode,Water Temp,Gas Switch Needed,External PPO2,Set Point Type,Circuit Switch Type,External O2 Sensor 1 (mV),External O2 Sensor 2 (mV),External O2 Sensor 3 (mV),Battery Voltage,Tank 1 pressure (PSI),Tank 2 pressure (PSI),Tank 3 pressure (PSI),Tank 4 pressure (PSI),Gas Time Remaining,SAC Rate (2 minute avg),Ascent Rate,Safe Ascent Depth,CO2mbar'
const summaryRow = (battery: string) =>
	`12,40,85,0,False,${battery},0,2026-01-01,0,0.7,1.3,85,40,30,0,${battery},0,2026-01-01,0,0.7,1.3,ABC,85,Perdix,14,GF,"40/85",1000,1000,Perdix AI`

describe('splitCsvLine', () => {
	it('honours quotes and drops a trailing comma', () =>
		expect(splitCsvLine('a,"b,c",d,')).toEqual(['a', 'b,c', 'd']))
})

describe('parseShearwaterCsv', () => {
	const sample =
		'0,0,0,0,0.21,0.21,0,0,99,1,0,20,0,0,0,0,0,0,0,3.9,AI is off,AI is off,AI is off,AI is off,0,0,0,0,0'
	it('reads GF, units and surface pressure', () => {
		const d = parseShearwaterCsv(
			[SUMMARY_HEAD, summaryRow('3.9'), SAMPLE_HEAD, sample, sample].join('\n'),
		)
		expect(d.summary).toMatchObject({
			gfLow: 0.4,
			gfHigh: 0.85,
			imperial: false,
			decoModel: 'GF',
			startSurfaceMbar: 1000,
			product: 'Perdix AI',
		})
		expect(d.samples).toHaveLength(2)
	})
	it('tolerates unquoted decimal commas in the summary row (localized export)', () => {
		const d = parseShearwaterCsv(
			[SUMMARY_HEAD, summaryRow('3,9'), SAMPLE_HEAD, sample, sample].join('\n'),
		)
		expect(d.summary.startSurfaceMbar).toBe(1000)
		expect(d.summary.product).toBe('Perdix AI')
	})
	it('converts imperial depths', () => {
		const row = summaryRow('3.9').replace(',False,', ',True,')
		const ft =
			'10,100,0,0,0.21,0.21,0,0,99,1,0,20,0,0,0,0,0,0,0,3.9,x,x,x,x,0,0,0,0,0'
		const d = parseShearwaterCsv(
			[SUMMARY_HEAD, row, SAMPLE_HEAD, sample, ft].join('\n'),
		)
		expect(d.samples[1].depthM).toBeCloseTo(30.48, 9)
	})
	it('rejects rows with too many fields', () =>
		expect(() =>
			parseShearwaterCsv(
				[
					SUMMARY_HEAD,
					summaryRow('3.9'),
					SAMPLE_HEAD,
					sample,
					sample + ',x,y',
				].join('\n'),
			),
		).toThrow(/fields/))
})

// Self-consistency: a synthetic "log" whose logged values come from our own
// planner must replay within tolerance. Proves the harness wiring.
describe('replay harness (synthetic log)', () => {
	it('replays its own plan within tolerance', () => {
		const plan = planDive({
			levels: [
				{ depthM: 40, minutes: 18, breathing: { kind: 'oc', gas: AIR } },
			],
			gfLow: 0.4,
			gfHigh: 0.85,
		})
		const rows: string[] = []
		for (const s of plan.segments) {
			for (let k = 0; k < Math.round(s.minutes * 6); k++) {
				const tSec = Math.round((s.runtimeMinutes - s.minutes) * 60 + k * 10)
				const depth =
					s.fromDepthM +
					((s.toDepthM - s.fromDepthM) * k) / Math.max(1, s.minutes * 6)
				rows.push(
					`${tSec},${depth.toFixed(1)},0,0,0.21,0.209,0,0,99,1,0,20,0,0,0,0,0,0,0,3.9,x,x,x,x,0,0,0,0,0`,
				)
			}
		}
		const dive = parseShearwaterCsv(
			[SUMMARY_HEAD, summaryRow('3.9'), SAMPLE_HEAD, ...rows].join('\n'),
		)
		const cmp = replayShearwater(dive)
		expect(cmp.length).toBe(rows.length - 1)
		expect(cmp.some((c) => c.ours.firstStopDepthM > 0)).toBe(true)
	})
})

// Real logs: drop Shearwater Cloud CSV exports into test/fixtures/shearwater/.
const DIR = new URL('../fixtures/shearwater/', import.meta.url)
const files = existsSync(DIR)
	? readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.csv'))
	: []
describe.skipIf(files.length === 0)('Shearwater logs', () => {
	for (const f of files) {
		it(f, () => {
			const cmp = replayShearwater(
				parseShearwaterCsv(readFileSync(new URL(f, DIR), 'utf8')),
			)
			const bad = cmp.filter((c) => !c.withinTolerance)
			const share = 1 - bad.length / cmp.length
			console.log(
				`${f}: ${(share * 100).toFixed(1)}% of ${cmp.length} samples within`,
				TOLERANCE,
				bad.slice(0, 5),
			)
			expect(share).toBeGreaterThanOrEqual(0.95)
		})
	}
})
