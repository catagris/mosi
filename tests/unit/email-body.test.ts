import { describe, it, expect } from 'vitest';
import { buildMyLinksEmailBody } from '$lib/server/email';

describe('buildMyLinksEmailBody', () => {
	const items = [
		{
			title: 'Summer Potluck',
			whenLabel: 'Sat, Jul 4, 2026, 6:00 PM PDT',
			editUrl: 'https://events.example.com/e/summer-potluck/edit/tok-a'
		},
		{
			title: 'Game Night',
			whenLabel: 'Fri, Jul 10, 2026, 7:30 PM PDT',
			editUrl: 'https://events.example.com/e/game-night/edit/tok-b'
		}
	];

	it('lists every event title, when-label and edit URL', () => {
		const body = buildMyLinksEmailBody(items);
		for (const item of items) {
			expect(body).toContain(item.title);
			expect(body).toContain(item.whenLabel);
			expect(body).toContain(item.editUrl);
		}
	});

	it('preserves the given order', () => {
		const body = buildMyLinksEmailBody(items);
		expect(body.indexOf('Summer Potluck')).toBeLessThan(body.indexOf('Game Night'));
	});

	it('includes the keep-it-private warning', () => {
		const body = buildMyLinksEmailBody(items);
		expect(body.toLowerCase()).toContain('keep these links to yourself');
	});

	it('handles a single item without throwing', () => {
		const body = buildMyLinksEmailBody([items[0]]);
		expect(body).toContain(items[0].editUrl);
		expect(body).not.toContain('Game Night');
	});

	it('still renders the intro and warning with no items', () => {
		const body = buildMyLinksEmailBody([]);
		expect(body).toContain('Hi there,');
		expect(body.toLowerCase()).toContain('keep these links to yourself');
	});
});
