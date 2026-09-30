import { defineConfig } from 'tsdown'

export default defineConfig({
	entry: {
		index: 'src/index.ts',
		units: 'src/units.ts',
		pressure: 'src/pressure.ts',
		altitude: 'src/altitude.ts',
		gas: 'src/gas.ts',
		density: 'src/density.ts',
		'real-gas': 'src/real-gas.ts',
		cylinders: 'src/cylinders.ts',
		equipment: 'src/equipment.ts',
		blending: 'src/blending/index.ts',
		fill: 'src/fill/index.ts',
		oxygen: 'src/oxygen.ts',
		planning: 'src/planning/index.ts',
		ccr: 'src/ccr/index.ts',
	},
	format: 'esm',
	platform: 'neutral',
	target: 'node22',
	dts: true,
	sourcemap: true,
	clean: true,
	outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
})
