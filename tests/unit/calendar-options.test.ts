import { describe, it, expect } from 'vitest';
import { detectGuestOs, orderedCalendarOptions } from '$lib/calendar-options';

const IOS_UA =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36';
const WINDOWS_UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const MAC_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

describe('detectGuestOs', () => {
	it('detects iPhone/iPad/iPod as ios', () => {
		expect(detectGuestOs(IOS_UA, 'iPhone', 5)).toBe('ios');
	});

	it('detects iPadOS-13+ (masquerades as MacIntel with touch) as ios', () => {
		expect(detectGuestOs(MAC_UA, 'MacIntel', 5)).toBe('ios');
	});

	it('treats a real desktop Mac (no touch) as other', () => {
		expect(detectGuestOs(MAC_UA, 'MacIntel', 0)).toBe('other');
	});

	it('detects Android', () => {
		expect(detectGuestOs(ANDROID_UA, 'Linux armv8l', 5)).toBe('android');
	});

	it('falls back to other for desktop', () => {
		expect(detectGuestOs(WINDOWS_UA, 'Win32', 0)).toBe('other');
	});
});

describe('orderedCalendarOptions', () => {
	const ICS = '/e/party/event.ics?t=abc';
	const GOOGLE = 'https://calendar.google.com/calendar/render?action=TEMPLATE';

	it('leads with Apple Calendar (.ics) on iOS, Google second', () => {
		const opts = orderedCalendarOptions('ios', ICS, GOOGLE);
		expect(opts.map((o) => o.key)).toEqual(['apple', 'google']);
		expect(opts[0]).toMatchObject({ label: 'Apple Calendar', href: ICS, download: true });
		expect(opts[1]).toMatchObject({ key: 'google', external: true, download: false });
	});

	it('leads with Google on Android, .ics file second', () => {
		const opts = orderedCalendarOptions('android', ICS, GOOGLE);
		expect(opts.map((o) => o.key)).toEqual(['google', 'ics']);
		expect(opts[0].href).toBe(GOOGLE);
		expect(opts[1]).toMatchObject({ label: '.ics file', href: ICS, download: true });
	});

	it('leads with a generic "Add to calendar" .ics on desktop/other', () => {
		const opts = orderedCalendarOptions('other', ICS, GOOGLE);
		expect(opts.map((o) => o.key)).toEqual(['apple', 'google']);
		expect(opts[0].label).toBe('Add to calendar');
	});

	it('offers only Google when no .ics is available (token-gated, no token)', () => {
		for (const os of ['ios', 'android', 'other'] as const) {
			const opts = orderedCalendarOptions(os, null, GOOGLE);
			expect(opts).toHaveLength(1);
			expect(opts[0].key).toBe('google');
		}
	});

	it('keys are unique within each ordering (valid for {#each})', () => {
		for (const os of ['ios', 'android', 'other'] as const) {
			const keys = orderedCalendarOptions(os, ICS, GOOGLE).map((o) => o.key);
			expect(new Set(keys).size).toBe(keys.length);
		}
	});
});
