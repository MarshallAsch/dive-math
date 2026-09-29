import { defineConfig } from 'tsdown'

export default defineConfig({
	entry: { index: 'src/index.ts' },
	format: 'esm',
	platform: 'neutral',
	target: 'node20',
	dts: true,
	sourcemap: true,
	clean: true,
	outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
})
