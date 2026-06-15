import { error } from '@sveltejs/kit';
import { getEventBySlug, publicTokenOk } from '$lib/server/services/events';
import { getRsvpByEditToken } from '$lib/server/services/rsvps';
import { buildEventIcs } from '$lib/calendar';
import type { RequestHandler } from './$types';

/**
 * Downloadable calendar invite for an event. A valid `?edit=<token>` both
 * authorizes the download and embeds that guest's private edit link in the
 * description; otherwise the event's public token (when set) is required.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const event = await getEventBySlug(params.slug);
	if (!event || event.status === 'draft' || event.status === 'archived') {
		error(404, 'Event not found');
	}

	let editUrl: string | undefined;
	const editToken = url.searchParams.get('edit');
	if (editToken) {
		const rsvp = await getRsvpByEditToken(editToken);
		if (rsvp && rsvp.eventId === event.id) {
			editUrl = `${url.origin}/e/${event.slug}/edit/${editToken}`;
		}
	}

	const providedPublicToken = url.searchParams.get('t');
	// A valid edit link is sufficient on its own; otherwise enforce the public token.
	if (!editUrl && !publicTokenOk(event, providedPublicToken)) {
		error(404, 'Event not found');
	}

	// Only echo the public token into the event URL when it was actually supplied
	// (don't hand it to a guest who arrived with just an edit token).
	const tokenQS =
		event.publicToken && providedPublicToken === event.publicToken
			? `?t=${encodeURIComponent(event.publicToken)}`
			: '';
	const ics = buildEventIcs(event, `${url.origin}/e/${event.slug}${tokenQS}`, { editUrl });

	return new Response(ics, {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Content-Disposition': `attachment; filename="${event.slug}.ics"`,
			'Cache-Control': 'no-store'
		}
	});
};
