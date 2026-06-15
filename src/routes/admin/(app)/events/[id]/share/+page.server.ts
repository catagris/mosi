import QRCode from 'qrcode';
import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards';
import { getEvent, rsvpWindowState, updateEvent } from '$lib/server/services/events';
import type { Event } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	requireUser(locals);
	const { event } = await parent();
	// Templates have no public page; the tab is hidden but the URL is reachable directly.
	if (event.isTemplate) error(404, 'Not found');
	const publicUrl = `${url.origin}/e/${event.slug}${
		event.publicToken ? `?t=${event.publicToken}` : ''
	}`;
	const qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 280 });
	return { publicUrl, qrDataUrl, windowState: rsvpWindowState(event) };
};

async function loadEvent(id: string): Promise<Event> {
	const event = await getEvent(id);
	if (!event) error(404, 'Event not found');
	return event;
}

export const actions: Actions = {
	publish: async ({ locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		await updateEvent(event.id, { status: 'published' });
		return { saved: true };
	},

	close: async ({ locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		await updateEvent(event.id, { status: 'closed' });
		return { saved: true };
	},

	reopen: async ({ locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		await updateEvent(event.id, { status: 'published', rsvpClosesAt: null });
		return { saved: true };
	},

	closeRsvps: async ({ locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		await updateEvent(event.id, { rsvpClosesAt: new Date() });
		return { saved: true };
	},

	openRsvps: async ({ locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		await updateEvent(event.id, { rsvpOpensAt: null, rsvpClosesAt: null });
		return { saved: true };
	}
};
