import type { Config } from 'tailwindcss';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	darkMode: 'class',
	theme: {
		extend: {
			colors: {
				// Semantic surface/text tokens - light & dark values live in app.css.
				surface: 'rgb(var(--surface) / <alpha-value>)',
				card: 'rgb(var(--card) / <alpha-value>)',
				line: 'rgb(var(--line) / <alpha-value>)',
				ink: 'rgb(var(--ink) / <alpha-value>)',
				muted: 'rgb(var(--muted) / <alpha-value>)',
				// Brand colors - overridable per event via themeStyle().
				primary: 'rgb(var(--color-primary) / <alpha-value>)',
				'primary-fg': 'rgb(var(--primary-fg) / <alpha-value>)',
				accent: 'rgb(var(--color-accent) / <alpha-value>)'
			},
			fontFamily: {
				sans: 'var(--font-sans)',
				event: 'var(--font-event, var(--font-sans))'
			}
		}
	},
	plugins: []
} satisfies Config;
