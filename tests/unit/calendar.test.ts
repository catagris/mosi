import { describe, it, expect } from 'vitest';
import {
	icsStamp,
	eventEnd,
	stripMarkdown,
	buildEventIcs,
	googleCalendarUrl,
	calendarHrefs,
	type CalendarEvent
} from '$lib/calendar';

const event: CalendarEvent = {
	id: 'evt-1',
	slug: 'summer-bbq',
	title: 'Summer BBQ; food & fun',
	description: 'Join us at **Riverside**\n\nSee [map](https://maps.example.com).',
	location: 'Riverside Park, Pavilion B',
	mapUrl: 'https://naver.me/abc123',
	startsAt: new Date('2026-07-13T18:00:00Z'),
	endsAt: new Date('2026-07-13T21:00:00Z')
};

/** Undo RFC 5545 line folding (CRLF + leading space) to assert on contiguous content. */
const unfold = (ics: string): string => ics.replace(/\r\n[ \t]/g, '');

describe('icsStamp', () => {
	it('formats a UTC instant as YYYYMMDDTHHMMSSZ', () => {
		expect(icsStamp(new Date('2026-07-13T18:00:00Z'))).toBe('20260713T180000Z');
	});
});

describe('eventEnd', () => {
	it('uses endsAt when present', () => {
		expect(eventEnd(event)).toEqual(new Date('2026-07-13T21:00:00Z'));
	});
	it('defaults to start + 2h when endsAt is null', () => {
		expect(eventEnd({ startsAt: new Date('2026-07-13T18:00:00Z'), endsAt: null })).toEqual(
			new Date('2026-07-13T20:00:00Z')
		);
	});
});

describe('stripMarkdown', () => {
	it('removes emphasis, headings, and link syntax', () => {
		expect(stripMarkdown('# Hi\n**bold** and [text](http://x)')).toBe('Hi\nbold and text');
	});
});

describe('buildEventIcs', () => {
	const ics = buildEventIcs(event, 'https://host/e/summer-bbq', {
		now: new Date('2026-06-01T00:00:00Z')
	});

	it('produces a valid VEVENT envelope', () => {
		expect(ics).toContain('BEGIN:VCALENDAR');
		expect(ics).toContain('BEGIN:VEVENT');
		expect(ics).toContain('END:VEVENT');
		expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
		expect(ics).toContain('\r\n'); // CRLF line endings
	});

	it('includes start/end stamps and a stable UID', () => {
		expect(ics).toContain('DTSTART:20260713T180000Z');
		expect(ics).toContain('DTEND:20260713T210000Z');
		expect(ics).toContain('UID:evt-1@mosi');
		expect(ics).toContain('DTSTAMP:20260601T000000Z');
	});

	it('escapes special characters in text fields', () => {
		expect(ics).toContain('SUMMARY:Summer BBQ\\; food & fun');
		expect(ics).toContain('LOCATION:Riverside Park\\, Pavilion B');
	});

	it('strips markdown from the description', () => {
		expect(ics).toContain('DESCRIPTION:');
		expect(ics).not.toContain('**');
		expect(ics).toContain('Riverside');
	});

	it('includes the map link in the description when set', () => {
		expect(unfold(ics)).toContain('Map & directions:');
		expect(unfold(ics)).toContain('https://naver.me/abc123');
	});

	it('embeds the guest edit link in the description when provided', () => {
		const personalized = buildEventIcs(event, 'https://host/e/summer-bbq', {
			now: new Date('2026-06-01T00:00:00Z'),
			editUrl: 'https://host/e/summer-bbq/edit/TOKEN123'
		});
		expect(unfold(personalized)).toContain('Edit or cancel your RSVP:');
		expect(unfold(personalized)).toContain('https://host/e/summer-bbq/edit/TOKEN123');
	});

	// A description long enough to force folding, packed with multibyte content:
	// accented letters (2 octets each) and emoji (4 octets, surrogate pairs in JS).
	// No commas/semicolons so the escaped form equals the raw text for assertions.
	const multibyte =
		'Célébration 🎉🎊 à la piñata — crème brûlée et café crème — naïve façade décor 🥳🎈🎆 für alle Gäste willkommen';
	const multibyteIcs = buildEventIcs(
		{ ...event, description: multibyte, mapUrl: '' },
		'https://host/e/summer-bbq',
		{ now: new Date('2026-06-01T00:00:00Z') }
	);

	it('never emits a content line longer than 75 octets, even with emoji/accents', () => {
		for (const line of multibyteIcs.split('\r\n')) {
			expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
		}
	});

	it('folds without splitting a multibyte character (unfolds back intact)', () => {
		const unfolded = unfold(multibyteIcs);
		// U+FFFD appears only when a multibyte UTF-8 sequence is cut mid-byte.
		expect(unfolded).not.toContain('�');
		expect(unfolded).toContain(multibyte);
	});
});

describe('googleCalendarUrl', () => {
	const url = googleCalendarUrl(event, 'https://host/e/summer-bbq');

	it('targets the Google template endpoint with title, dates, and location', () => {
		expect(url.startsWith('https://calendar.google.com/calendar/render?')).toBe(true);
		const qs = new URL(url).searchParams;
		expect(qs.get('action')).toBe('TEMPLATE');
		expect(qs.get('text')).toBe('Summer BBQ; food & fun');
		expect(qs.get('dates')).toBe('20260713T180000Z/20260713T210000Z');
		expect(qs.get('location')).toBe('Riverside Park, Pavilion B');
	});

	it('includes the map link in the details', () => {
		const qs = new URL(url).searchParams;
		expect(qs.get('details')).toContain('https://naver.me/abc123');
	});
});

describe('calendarHrefs', () => {
	it('builds a token-free .ics path when the event is not gated', () => {
		const { icsHref, googleHref } = calendarHrefs(
			{ ...event, publicToken: null },
			'https://host',
			null
		);
		expect(icsHref).toBe('/e/summer-bbq/event.ics');
		expect(googleHref).toContain('calendar.google.com');
	});

	it('includes the token when gated and the right token is provided', () => {
		const { icsHref } = calendarHrefs(
			{ ...event, publicToken: 'sEcReT' },
			'https://host',
			'sEcReT'
		);
		expect(icsHref).toBe('/e/summer-bbq/event.ics?t=sEcReT');
	});

	it('omits the .ics link when gated and no valid token is available', () => {
		const { icsHref } = calendarHrefs({ ...event, publicToken: 'sEcReT' }, 'https://host', null);
		expect(icsHref).toBeNull();
	});

	it('routes the .ics through the edit token (works even when gated) and adds the edit link', () => {
		const { icsHref, googleHref } = calendarHrefs(
			{ ...event, publicToken: 'sEcReT' },
			'https://host',
			null,
			'TOKEN123'
		);
		expect(icsHref).toBe('/e/summer-bbq/event.ics?edit=TOKEN123');
		expect(decodeURIComponent(googleHref)).toContain('/e/summer-bbq/edit/TOKEN123');
	});
});
