import { describe, it, expect } from 'vitest';
import { renderEventEmail, renderMyLinksEmail, type EmailBranding } from '$lib/server/email/templates';

const BRAND: EmailBranding = { orgName: 'Riverside Potluck', primaryColor: '#1d4ed8', logoUrl: null };

describe('renderEventEmail', () => {
	const html = renderEventEmail(BRAND, {
		heading: "You're all set, Gina!",
		intro: 'Thanks for responding.',
		eventTitle: 'Summer Party',
		whenLabel: 'Wed, Jul 15, 2026, 6:00 PM',
		location: 'The Riverbank',
		buttonLabel: 'View or edit your RSVP',
		buttonUrl: 'https://x.test/e/summer/edit/tok',
		footerNote: 'Keep this link private.'
	});

	it('is a full HTML document with the org branding', () => {
		expect(html).toContain('<!DOCTYPE html>');
		expect(html).toContain('Riverside Potluck');
	});

	it('includes the heading, event details, location and CTA link', () => {
		expect(html).toContain("You're all set, Gina!");
		expect(html).toContain('Summer Party');
		expect(html).toContain('Wed, Jul 15, 2026, 6:00 PM');
		expect(html).toContain('The Riverbank');
		expect(html).toContain('href="https://x.test/e/summer/edit/tok"');
		expect(html).toContain('View or edit your RSVP');
	});

	it('uses the org primaryColor for the accent', () => {
		expect(html).toContain('#1d4ed8');
	});

	it('omits the location row when not provided', () => {
		const noLoc = renderEventEmail(BRAND, {
			heading: 'h',
			intro: 'i',
			eventTitle: 'E',
			whenLabel: 'W',
			buttonLabel: 'B',
			buttonUrl: 'https://x.test',
			footerNote: 'F'
		});
		expect(noLoc).not.toContain('The Riverbank');
	});

	it('HTML-escapes interpolated values (no injection)', () => {
		const evil = renderEventEmail(
			{ orgName: '<script>x</script>', primaryColor: '#000000', logoUrl: null },
			{
				heading: '<b>hi</b>',
				intro: 'i',
				eventTitle: 'Tom & "Jerry"',
				whenLabel: 'W',
				buttonLabel: 'B',
				buttonUrl: 'https://x.test',
				footerNote: 'F'
			}
		);
		expect(evil).not.toContain('<script>x</script>');
		expect(evil).toContain('&lt;script&gt;');
		expect(evil).toContain('Tom &amp; &quot;Jerry&quot;');
		expect(evil).not.toContain('<b>hi</b>');
	});

	it('rejects a non-hex primaryColor (falls back to the default, no CSS injection)', () => {
		const html = renderEventEmail(
			{ orgName: 'X', primaryColor: 'red;}body{display:none', logoUrl: null },
			{
				heading: 'h',
				intro: 'i',
				eventTitle: 'E',
				whenLabel: 'W',
				buttonLabel: 'B',
				buttonUrl: 'https://x.test',
				footerNote: 'F'
			}
		);
		expect(html).not.toContain('display:none');
		expect(html).toContain('#7c3aed');
	});
});

describe('renderMyLinksEmail', () => {
	const html = renderMyLinksEmail(BRAND, {
		intro: 'Here are your links.',
		items: [
			{ title: 'Summer Party', whenLabel: 'Jul 15', editUrl: 'https://x.test/a' },
			{ title: 'Game Night', whenLabel: 'Aug 2', editUrl: 'https://x.test/b' }
		],
		footerNote: 'Keep these private.'
	});

	it('lists every event with its edit link', () => {
		expect(html).toContain('Summer Party');
		expect(html).toContain('Game Night');
		expect(html).toContain('href="https://x.test/a"');
		expect(html).toContain('href="https://x.test/b"');
	});
});
