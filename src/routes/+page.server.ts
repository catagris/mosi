import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { getSettings } from '$lib/server/services/settings';
import { emailEnabled, sendMyLinksEmail } from '$lib/server/email';
import { findActiveRsvpsByEmailAcrossEvents } from '$lib/server/services/rsvps';
import { consume, RULES } from '$lib/server/rate-limit';
import { formatEventTime } from '$lib/utils/datetime';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const settings = await getSettings();
		return { orgName: settings.orgName, emailEnabled: emailEnabled() };
	} catch {
		// DB not up yet - serve the default brand so the page still renders.
		return { orgName: 'Mosi', emailEnabled: emailEnabled() };
	}
};

const emailSchema = z.object({ email: z.string().trim().email().max(254) });

export const actions: Actions = {
	default: async ({ request, url, getClientAddress }) => {
		if (!emailEnabled()) {
			return fail(400, { error: 'Email isn’t set up on this server - ask your host for your link.' });
		}

		let ip = 'unknown';
		try {
			ip = getClientAddress();
		} catch {
			// no client address available
		}
		if (!consume(`find-links:${ip}`, RULES.findLinks)) {
			return fail(429, { error: 'Too many requests - please wait a minute and try again.' });
		}

		const form = await request.formData();
		const rawEmail = String(form.get('email') ?? '');
		const parsed = emailSchema.safeParse({ email: rawEmail });
		if (!parsed.success) {
			return fail(400, { error: 'Enter a valid email address.', email: rawEmail });
		}

		// Email links only to an address that actually has upcoming RSVPs, but always
		// return the same generic confirmation so the form can't be used to probe who
		// has responded (and so a failed lookup never leaks DB state).
		try {
			const matches = await findActiveRsvpsByEmailAcrossEvents(parsed.data.email);
			if (matches.length > 0) {
				await sendMyLinksEmail({
					to: parsed.data.email,
					items: matches.map(({ event, rsvp }) => ({
						title: event.title,
						whenLabel: formatEventTime(event.startsAt, event.timezone),
						editUrl: `${url.origin}/e/${event.slug}/edit/${rsvp.editToken}`
					}))
				});
			}
		} catch (err) {
			console.error('find-links lookup failed:', (err as Error).message);
		}

		return { sent: true };
	}
};
