import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/**
 * Render event descriptions: markdown → HTML through a strict allowlist.
 * Svelte renders the result with {@html} only after this sanitization.
 */
export function renderMarkdown(markdown: string): string {
	const html = marked.parse(markdown, { async: false, gfm: true, breaks: true });
	return sanitizeHtml(html, {
		allowedTags: [
			'p',
			'br',
			'strong',
			'em',
			'del',
			'a',
			'ul',
			'ol',
			'li',
			'blockquote',
			'code',
			'pre',
			'h1',
			'h2',
			'h3',
			'h4',
			'hr',
			'table',
			'thead',
			'tbody',
			'tr',
			'th',
			'td'
		],
		allowedAttributes: {
			a: ['href', 'title']
		},
		allowedSchemes: ['http', 'https', 'mailto'],
		transformTags: {
			a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' })
		}
	});
}
