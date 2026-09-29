import { describe, expectTypeOf, it } from 'vitest'
import * as root from '@marshallasch/dive-math'
import { mod, type Gas } from '@marshallasch/dive-math/gas'
import {
	partialPressureBlend,
	type BlendResult,
} from '@marshallasch/dive-math/blending'
import { classifyO2Cell, type O2CellVerdict } from '@marshallasch/dive-math/ccr'

describe('public API types', () => {
	it('Gas is readonly fractions', () => {
		expectTypeOf<Gas>().toEqualTypeOf<{
			readonly fo2: number
			readonly fhe: number
		}>()
	})
	it('mod signature', () => {
		expectTypeOf(mod).parameters.toEqualTypeOf<
			[Gas, number, root.DepthOptions?]
		>()
		expectTypeOf(mod).returns.toBeNumber()
	})
	it('blend result', () =>
		expectTypeOf(partialPressureBlend).returns.toEqualTypeOf<BlendResult>())
	it('O₂ cell verdict nullable', () =>
		expectTypeOf(classifyO2Cell).returns.toEqualTypeOf<O2CellVerdict | null>())
	it('root re-exports subpath symbols', () =>
		expectTypeOf(root.mod).toEqualTypeOf(mod))
})
