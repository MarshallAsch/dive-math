// Turns ```ts example fenced blocks in docs/guide/*.md into Vitest files.
// A line `expr // => 33.75` becomes expect(expr).toBeCloseTo(33.75, 2)
// (decimals = digits shown); `// => true|false` becomes toBe().
import {
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'

const DOCS = 'docs/guide'
const OUT = 'test/examples/generated'
const FENCE = /```ts example\n([\s\S]*?)```/g
const ASSERT = /^(.*?)\s*\/\/ => (-?\d+(?:\.\d+)?|true|false)\s*$/
const IMPORT = /^import\s+\{([^}]+)\}\s+from\s+'([^']+)'/

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const decimals = (v) => (v.includes('.') ? v.split('.')[1].length : 0)

for (const file of readdirSync(DOCS).filter((f) => f.endsWith('.md'))) {
	const blocks = [
		...readFileSync(join(DOCS, file), 'utf8').matchAll(FENCE),
	].map((m) => m[1])
	if (blocks.length === 0) continue
	const imports = new Map()
	const tests = blocks.map((code, i) => {
		const body = []
		for (const line of code.split('\n')) {
			const imp = line.match(IMPORT)
			if (imp) {
				const names = imports.get(imp[2]) ?? new Set()
				for (const n of imp[1].split(',')) if (n.trim()) names.add(n.trim())
				imports.set(imp[2], names)
				continue
			}
			const a = line.match(ASSERT)
			if (!a) {
				body.push(line)
				continue
			}
			const expr = a[1].trim().replace(/;$/, '')
			const val = a[2]
			body.push(
				val === 'true' || val === 'false'
					? `expect(${expr}).toBe(${val})`
					: `expect(${expr}).toBeCloseTo(${val}, ${decimals(val)})`,
			)
		}
		return `it('example ${i + 1}', () => {\n${body.join('\n')}\n})`
	})
	const header = [
		"import { describe, expect, it } from 'vitest'",
		...[...imports].map(
			([mod, names]) => `import { ${[...names].join(', ')} } from '${mod}'`,
		),
	]
	writeFileSync(
		join(OUT, `${basename(file, '.md')}.test.ts`),
		`${header.join('\n')}\n\ndescribe('docs/guide/${file}', () => {\n${tests.join('\n\n')}\n})\n`,
	)
}
