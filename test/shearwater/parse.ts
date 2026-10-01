// Shearwater Cloud CSV export parser (test tooling, not published).
// Layout (one dive per file): row 1 summary header, row 2 summary values,
// row 3 sample header, rows 4+ samples every 10 s. Localized exports put
// unquoted decimal commas in row 2, so summary fields are read by position
// from the front (before the first decimal field) and from the back.
import { ftToM } from '../../src/units'

export interface ShearwaterSummary {
	gfLow: number
	gfHigh: number
	imperial: boolean
	decoModel: string
	/** mbar */
	startSurfaceMbar: number
	/** mbar */
	endSurfaceMbar: number
	product: string
}

export interface ShearwaterSample {
	timeSec: number
	depthM: number
	firstStopDepthM: number
	firstStopMin: number
	ttsMin: number
	/** 99 means capped. */
	ndlMin: number
	ppo2: number
	fo2: number
	fhe: number
	/** Raw "Current Circuit Mode" value; '1' is open circuit in observed logs. */
	circuitMode: string
}

export interface ShearwaterDive {
	summary: ShearwaterSummary
	samples: ShearwaterSample[]
}

// Split one CSV line, honouring double quotes.
export function splitCsvLine(line: string): string[] {
	const out: string[] = []
	let cur = ''
	let quoted = false
	for (let i = 0; i < line.length; i++) {
		const ch = line[i]
		if (ch === '"') {
			if (quoted && line[i + 1] === '"') {
				cur += '"'
				i++
			} else quoted = !quoted
		} else if (ch === ',' && !quoted) {
			out.push(cur)
			cur = ''
		} else cur += ch
	}
	out.push(cur)
	while (out.length > 0 && out[out.length - 1] === '') out.pop()
	return out.map((s) => s.trim())
}

// Number with either '.' or ',' as the decimal separator.
function num(field: string | undefined, name: string): number {
	const text = (field ?? '').trim()
	const v = text === '' ? NaN : Number(text.replace(',', '.'))
	if (!Number.isFinite(v))
		throw new Error(`Shearwater CSV: ${name} is not a number (${field})`)
	return v
}

const SAMPLE_COLUMNS = {
	timeSec: 'Time (sec)',
	depth: 'Depth',
	firstStopDepth: 'First Stop Depth',
	tts: 'Time To Surface (min)',
	ppo2: 'Average PPO2',
	fo2: 'Fraction O2',
	fhe: 'Fraction He',
	firstStopTime: 'First Stop Time',
	ndl: 'Current NDL',
	circuitMode: 'Current Circuit Mode',
} as const

/** Parse a Shearwater Cloud CSV export. Throws Error on malformed input. */
export function parseShearwaterCsv(text: string): ShearwaterDive {
	const lines = text
		.replace(/^\uFEFF/, '') // strip a UTF-8 BOM
		.split(/\r?\n/)
		.filter((l) => l.trim() !== '')
	if (lines.length < 4)
		throw new Error(
			'Shearwater CSV: expected summary, sample header and samples',
		)
	const head = splitCsvLine(lines[0])
	const vals = splitCsvLine(lines[1])
	const at = (name: string) => head.indexOf(name)
	if (
		at('GF Minimum') !== 1 ||
		at('GF Maximum') !== 2 ||
		at('Imperial Units') !== 4
	) {
		throw new Error('Shearwater CSV: unexpected summary header')
	}
	// Fields after decimals are read from the end (they carry no decimals).
	const fromEnd = (name: string) => vals[vals.length - (head.length - at(name))]
	const summary: ShearwaterSummary = {
		gfLow: num(vals[1], 'GF Minimum') / 100,
		gfHigh: num(vals[2], 'GF Maximum') / 100,
		imperial: /^(true|1|yes)$/i.test(vals[4] ?? ''),
		decoModel: fromEnd('Deco Model') ?? '',
		startSurfaceMbar: num(
			fromEnd('Start Surface Pressure'),
			'Start Surface Pressure',
		),
		endSurfaceMbar: num(
			fromEnd('End Surface Pressure'),
			'End Surface Pressure',
		),
		product: fromEnd('Product') ?? '',
	}
	const sampleHead = splitCsvLine(lines[2])
	const col: Record<keyof typeof SAMPLE_COLUMNS, number> = Object.fromEntries(
		Object.entries(SAMPLE_COLUMNS).map(([k, name]) => {
			const i = sampleHead.indexOf(name)
			if (i < 0)
				throw new Error(`Shearwater CSV: missing sample column "${name}"`)
			return [k, i]
		}),
	) as Record<keyof typeof SAMPLE_COLUMNS, number>
	const depth = (v: number) => (summary.imperial ? ftToM(v) : v)
	const samples = lines.slice(3).map((line, i) => {
		const f = splitCsvLine(line)
		if (f.length > sampleHead.length) {
			throw new Error(
				`Shearwater CSV: sample row ${i + 4} has ${f.length} fields for ${sampleHead.length} columns (unquoted decimal commas?)`,
			)
		}
		return {
			timeSec: num(f[col.timeSec], 'Time (sec)'),
			depthM: depth(num(f[col.depth], 'Depth')),
			firstStopDepthM: depth(num(f[col.firstStopDepth], 'First Stop Depth')),
			firstStopMin: num(f[col.firstStopTime], 'First Stop Time'),
			ttsMin: num(f[col.tts], 'Time To Surface (min)'),
			ndlMin: num(f[col.ndl], 'Current NDL'),
			ppo2: num(f[col.ppo2], 'Average PPO2'),
			fo2: num(f[col.fo2], 'Fraction O2'),
			fhe: num(f[col.fhe], 'Fraction He'),
			circuitMode: f[col.circuitMode] ?? '',
		}
	})
	return { summary, samples }
}
