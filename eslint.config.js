import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
	{
		ignores: [
			'dist',
			'coverage',
			'docs/api',
			'docs/.vitepress/cache',
			'docs/.vitepress/dist',
			'test/examples/generated',
		],
	},
	js.configs.recommended,
	...tseslint.configs.strict,
	{
		files: ['**/*.test.ts', 'test/**'],
		rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
	},
)
