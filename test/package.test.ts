import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import config from '../tsdown.config'

const pkg = JSON.parse(
	readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)
export const MODULES = [
	'units',
	'pressure',
	'altitude',
	'gas',
	'density',
	'real-gas',
	'cylinders',
	'equipment',
	'blending',
	'fill',
	'oxygen',
	'planning',
	'ccr',
]

describe('package surface', () => {
	it('has no runtime dependencies', () =>
		expect(pkg.dependencies).toBeUndefined())
	it('exports every module as a subpath', () => {
		for (const m of MODULES) {
			expect(pkg.exports[`./${m}`]).toEqual({
				types: `./dist/${m}.d.ts`,
				import: `./dist/${m}.js`,
			})
		}
	})
	it('tsdown builds every module', () => {
		const entry = (config as { entry: Record<string, string> }).entry
		expect(Object.keys(entry).sort()).toEqual(['index', ...MODULES].sort())
		for (const file of Object.values(entry))
			expect(existsSync(new URL(`../${file}`, import.meta.url))).toBe(true)
	})
	it('typedoc documents exactly the tsdown entries minus index', () => {
		const typedoc = JSON.parse(
			readFileSync(new URL('../typedoc.json', import.meta.url), 'utf8'),
		) as { entryPoints: string[] }
		const entry = (config as { entry: Record<string, string> }).entry
		const expected = Object.entries(entry)
			.filter(([name]) => name !== 'index')
			.map(([, file]) => file)
		expect([...typedoc.entryPoints].sort()).toEqual(expected.sort())
	})
})
