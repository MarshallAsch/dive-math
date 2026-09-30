import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig({
	resolve: {
		alias: [
			{ find: /^dive-math$/, replacement: `${src}/index.ts` },
			{ find: /^dive-math\/(.*)$/, replacement: `${src}/$1` },
		],
	},
	test: {
		include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
		typecheck: { enabled: true, include: ['test/**/*.test-d.ts'] },
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/types.ts'],
			thresholds: { functions: 100, branches: 95, lines: 95, statements: 95 },
		},
	},
})
