import { error } from '@sveltejs/kit';
import { getEventBySlug } from '$lib/server/services/events';
import { getRsvpByEditToken, listDishesForRsvp } from '$lib/server/services/rsvps';
import { calendarHrefs } from '$lib/calendar';
import { emailEnabled } from '$lib/server/email';
import { formatEventTime } from '$lib/utils/datetime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const event = await getEventBySlug(params.slug);
	if (!event || event.status === 'draft' || event.status === 'archived') {
		error(404, 'Event not found');
	}

	// Only echo the public token back into the event link when it is the real one.
	const providedPublicToken = url.searchParams.get('t');
	const publicTokenQS =
		event.publicToken && providedPublicToken === event.publicToken
			? `?t=${encodeURIComponent(event.publicToken)}`
			: '';

	// Missing/invalid token (incl. the honeypot path) → generic thanks, no details.
	const editToken = url.searchParams.get('token');
	let summary: {
		guestName: string;
		response: 'yes' | 'no' | 'maybe';
		partySize: number;
		hasEmail: boolean;
		waitlisted: boolean;
		dishes: { itemName: string; serves: number | null }[];
	} | null = null;
	let editUrl: string | null = null;
	let validEditToken: string | null = null;

	if (editToken) {
		const rsvp = await getRsvpByEditToken(editToken);
		if (rsvp && rsvp.eventId === event.id) {
			const dishes = await listDishesForRsvp(rsvp.id);
			summary = {
				guestName: rsvp.guestName,
				response: rsvp.response,
				partySize: rsvp.partySize,
				hasEmail: rsvp.guestEmail !== null,
				waitlisted: rsvp.status === 'waitlisted',
				dishes: dishes.map((dish) => ({ itemName: dish.itemName, serves: dish.serves }))
			};
			editUrl = `${url.origin}/e/${event.slug}/edit/${rsvp.editToken}`;
			validEditToken = rsvp.editToken;
		}
	}

	return {
		eventTitle: event.title,
		theme: event.theme,
		backUrl: `/e/${event.slug}${publicTokenQS}`,
		summary,
		editUrl,
		location: event.location,
		mapUrl: event.mapUrl,
		whenLabel: formatEventTime(event.startsAt, event.timezone),
		// Personalize the calendar invite with the guest's edit link when known.
		calendar: calendarHrefs(event, url.origin, providedPublicToken, validEditToken),
		emailEnabled: emailEnabled()
	};
};
