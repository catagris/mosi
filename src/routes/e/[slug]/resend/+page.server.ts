import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { getEventBySlug, publicTokenOk } from '$lib/server/services/events';
import { getActiveRsvpByEmail } from '$lib/server/services/rsvps';
import { emailEnabled, sendEditLinkEmail } from '$lib/server/email';
import { consume, RULES } from '$lib/server/rate-limit';
import type { Event } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

function guestVisibleEvent(event: Event | undefined): Event {
	if (!event || event.status === 'draft' || event.status === 'archived') {
		error(404, 'Event not found');
	}
	return event;
}

const emailSchema = z.object({ email: z.string().trim().email().max(254) });

export const load: PageServerLoad = async ({ params, url }) => {
	const event = guestVisibleEvent(await getEventBySlug(params.slug));
	if (!publicTokenOk(event, url.searchParams.get('t'))) error(404, 'Event not found');

	const tokenQS = event.publicToken ? `?t=${encodeURIComponent(event.publicToken)}` : '';
	return {
		eventTitle: event.title,
		theme: event.theme,
		emailEnabled: emailEnabled(),
		backUrl: `/e/${event.slug}${tokenQS}`
	};
};

export const actions: Actions = {
	default: async ({ params, request, url, getClientAddress }) => {
		const event = guestVisibleEvent(await getEventBySlug(params.slug));
		// The form posts to the current URL, so the public token (when any) rides along.
		if (!publicTokenOk(event, url.searchParams.get('t'))) error(404, 'Event not found');

		if (!emailEnabled()) {
			return fail(400, {
				error: 'Email isn’t set up for this event - ask your host for your link.'
			});
		}

		let ip = 'unknown';
		try {
			ip = getClientAddress();
		} catch {
			// no client address available
		}
		if (!consume(`resend:${ip}`, RULES.resendLink)) {
			return fail(429, { error: 'Too many requests - please wait a minute and try again.' });
		}

		const form = await request.formData();
		const rawEmail = String(form.get('email') ?? '');
		const parsed = emailSchema.safeParse({ email: rawEmail });
		if (!parsed.success) {
			return fail(400, { error: 'Enter a valid email address.', email: rawEmail });
		}

		// Send only to an address that actually has an RSVP - but always return the
		// same generic confirmation so the form can't be used to probe who responded.
		const rsvp = await getActiveRsvpByEmail(event.id, parsed.data.email);
		if (rsvp?.guestEmail) {
			// Fire-and-forget: awaiting the send only on a hit would make the
			// response measurably slower when an RSVP exists, turning this form into
			// a timing oracle for who has responded. sendEditLinkEmail never throws.
			void sendEditLinkEmail({
				to: rsvp.guestEmail,
				guestName: rsvp.guestName,
				event,
				eventUrl: `${url.origin}/e/${event.slug}${event.publicToken ? `?t=${encodeURIComponent(event.publicToken)}` : ''}`,
				editUrl: `${url.origin}/e/${event.slug}/edit/${rsvp.editToken}`
			}).catch((err) => console.error('resend: edit-link send failed:', (err as Error).message));
		}

		return { sent: true };
	}
};
