import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		}
	},
	{
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			],
			// Svelte compiler warnings (e.g. intentional initial-value captures in
			// form components) surface via svelte-check; only compile errors fail lint.
			'svelte/valid-compile': ['error', { ignoreWarnings: true }]
		}
	},
	{
		ignores: ['build/', '.svelte-kit/', 'node_modules/', 'drizzle/', 'static/', 'playwright-report/', 'test-results/']
	}
];
