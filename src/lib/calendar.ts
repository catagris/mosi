/**
 * Calendar export helpers (no dependencies): an RFC 5545 .ics generator and a
 * Google Calendar "add event" URL. Used by the /e/[slug]/event.ics endpoint
 * and the guest pages' "Add to calendar" buttons.
 */

export type CalendarEvent = {
	id: string;
	slug: string;
	title: string;
	description: string;
	location: string;
	/** Optional map/directions link; empty string when unset. */
	mapUrl: string;
	startsAt: Date;
	endsAt: Date | null;
};

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000; // 2h when no end time

/** UTC instant → iCalendar timestamp, e.g. 20260713T180000Z. */
export function icsStamp(date: Date): string {
	return date
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d+/, ''); // strip the fractional seconds (any precision) before the Z
}

export function eventEnd(event: Pick<CalendarEvent, 'startsAt' | 'endsAt'>): Date {
	return event.endsAt ?? new Date(event.startsAt.getTime() + DEFAULT_DURATION_MS);
}

/** Escape a value for an iCalendar text field (RFC 5545, section 3.3.11). */
function escapeIcsText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');
}

/**
 * Fold a content line to ≤75 octets with leading-space continuations.
 * Measures UTF-8 octets (per RFC 5545) and iterates by Unicode code point so a
 * multibyte character — accented letters, emoji surrogate pairs — is never split
 * across a fold boundary.
 */
function foldLine(line: string): string {
	if (Buffer.byteLength(line, 'utf8') <= 75) return line;
	const chunks: string[] = [];
	let current = '';
	let currentBytes = 0;
	// First line allows 75 octets; continuations spend one octet on the leading space.
	let limit = 75;
	for (const char of line) {
		const charBytes = Buffer.byteLength(char, 'utf8');
		if (currentBytes + charBytes > limit) {
			chunks.push(current);
			current = '';
			currentBytes = 0;
			limit = 74;
		}
		current += char;
		currentBytes += charBytes;
	}
	if (current.length > 0) chunks.push(current);
	return chunks.map((chunk, i) => (i === 0 ? chunk : ' ' + chunk)).join('\r\n');
}

/** Strip common markdown so calendar descriptions read as plain text. */
export function stripMarkdown(markdown: string): string {
	return markdown
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) / images → text
		.replace(/^#{1,6}\s+/gm, '') // headings
		.replace(/^>\s?/gm, '') // blockquotes
		.replace(/[*_`~]/g, '') // emphasis / code markers
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/**
 * Build a single-event .ics document. When `editUrl` is given (a guest adding
 * the event from their thanks/edit page), the guest's private edit link is
 * appended to the description so it lives in their calendar entry. `now` is
 * injectable for testing.
 */
export function buildEventIcs(
	event: CalendarEvent,
	eventUrl: string,
	opts: { now?: Date; editUrl?: string } = {}
): string {
	const now = opts.now ?? new Date();
	let description = stripMarkdown(event.description);
	if (event.mapUrl) {
		description = `${description ? `${description}\n\n` : ''}Map & directions:\n${event.mapUrl}`;
	}
	if (opts.editUrl) {
		description = `${description ? `${description}\n\n` : ''}Edit or cancel your RSVP:\n${opts.editUrl}`;
	}
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Mosi//Event//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${event.id}@mosi`,
		`DTSTAMP:${icsStamp(now)}`,
		`DTSTART:${icsStamp(event.startsAt)}`,
		`DTEND:${icsStamp(eventEnd(event))}`,
		`SUMMARY:${escapeIcsText(event.title)}`,
		event.location ? `LOCATION:${escapeIcsText(event.location)}` : null,
		description ? `DESCRIPTION:${escapeIcsText(description)}` : null,
		eventUrl ? `URL:${escapeIcsText(eventUrl)}` : null,
		'END:VEVENT',
		'END:VCALENDAR'
	].filter((line): line is string => line !== null);

	return lines.map(foldLine).join('\r\n') + '\r\n';
}

/**
 * Build the "Add to calendar" hrefs for a guest page. `icsHref` is null when
 * the event is public-token-gated but a valid token isn't available (the .ics
 * endpoint requires it), in which case only the Google link is offered.
 */
export function calendarHrefs(
	event: CalendarEvent & { publicToken: string | null },
	origin: string,
	providedToken: string | null,
	editToken?: string | null
): { icsHref: string | null; googleHref: string } {
	const tokenOk = !event.publicToken || providedToken === event.publicToken;
	const tokenQS = event.publicToken && tokenOk ? `?t=${encodeURIComponent(event.publicToken)}` : '';
	const eventUrl = `${origin}/e/${event.slug}${tokenQS}`;
	const editUrl = editToken ? `${origin}/e/${event.slug}/edit/${editToken}` : undefined;

	// A valid edit token authorizes the .ics endpoint on its own, so it works
	// even for token-gated events (where the page can't safely carry `?t=`).
	let icsHref: string | null;
	if (editToken) {
		icsHref = `/e/${event.slug}/event.ics?edit=${encodeURIComponent(editToken)}`;
	} else if (tokenOk) {
		icsHref = `/e/${event.slug}/event.ics${tokenQS}`;
	} else {
		icsHref = null;
	}

	return { icsHref, googleHref: googleCalendarUrl(event, eventUrl, editUrl) };
}

/** Google Calendar "create event" template URL. */
export function googleCalendarUrl(
	event: CalendarEvent,
	eventUrl: string,
	editUrl?: string
): string {
	const details = [
		stripMarkdown(event.description),
		event.mapUrl ? `\n\nMap & directions:\n${event.mapUrl}` : '',
		eventUrl ? `\n${eventUrl}` : '',
		editUrl ? `\n\nEdit or cancel your RSVP:\n${editUrl}` : ''
	]
		.join('')
		.trim();
	const params = new URLSearchParams({
		action: 'TEMPLATE',
		text: event.title,
		dates: `${icsStamp(event.startsAt)}/${icsStamp(eventEnd(event))}`
	});
	if (details) params.set('details', details);
	if (event.location) params.set('location', event.location);
	return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
