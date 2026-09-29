import { defineConfig } from 'vitepress'
import apiSidebar from '../api/typedoc-sidebar.json' with { type: 'json' }

const guides = [
	['Getting started', 'getting-started'],
	['Conventions', 'conventions'],
	['Units', 'units'],
	['Pressure & depth', 'pressure'],
	['Altitude', 'altitude'],
	['Gas: MOD, END, best mix', 'gas'],
	['Gas density', 'density'],
	['Real gas (Z)', 'real-gas'],
	['Blending', 'blending'],
	['Filling', 'fill'],
	['Oxygen exposure', 'oxygen'],
	['Gas planning', 'planning'],
	['Cylinders', 'cylinders'],
	['Equipment', 'equipment'],
	['Rebreathers', 'ccr'],
]

export default defineConfig({
	title: 'dive-math',
	description: 'Scuba diving math for TypeScript',
	base: '/dive-math/',
	cleanUrls: true,
	// Internal plan/spec docs are not part of the published site.
	srcExclude: ['superpowers/**'],
	markdown: { math: true },
	themeConfig: {
		nav: [
			{ text: 'Guide', link: '/guide/getting-started' },
			{ text: 'API', link: '/api/' },
			{
				text: 'npm',
				link: 'https://www.npmjs.com/package/@marshallasch/dive-math',
			},
		],
		sidebar: {
			'/guide/': [
				{
					text: 'Guide',
					items: guides.map(([text, slug]) => ({
						text,
						link: `/guide/${slug}`,
					})),
				},
			],
			'/api/': [{ text: 'API reference', items: apiSidebar }],
		},
		socialLinks: [
			{ icon: 'github', link: 'https://github.com/MarshallAsch/dive-math' },
		],
		search: { provider: 'local' },
		footer: {
			message:
				'Reference only — verify every fill and dive plan independently.',
		},
	},
})
