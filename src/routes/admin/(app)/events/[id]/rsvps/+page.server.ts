import { error, fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards';
import { getEvent, listFieldDefinitions } from '$lib/server/services/events';
import { buildDishBoard } from '$lib/server/services/dishes';
import {
	getRsvp,
	listDishesForEvent,
	listRsvps,
	regenerateEditToken,
	withdrawRsvp
} from '$lib/server/services/rsvps';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	requireUser(locals);
	const { event } = await parent();
	// Templates have no RSVPs; the tab is hidden but the URL is still reachable directly.
	if (event.isTemplate) error(404, 'Not found');

	const responseFilter = url.searchParams.get('response') ?? 'all';
	const statusFilter = url.searchParams.get('status') ?? 'active';
	const q = (url.searchParams.get('q') ?? '').trim();

	const [allRsvps, fieldDefinitions, eventDishes, board] = await Promise.all([
		listRsvps(event.id),
		listFieldDefinitions(event.id),
		listDishesForEvent(event.id),
		buildDishBoard(event, { includeItems: true, includeNames: true, includeHidden: true })
	]);

	const dishesByRsvp: Record<string, { itemName: string; serves: number | null }[]> = {};
	for (const dish of eventDishes) {
		(dishesByRsvp[dish.rsvpId] ??= []).push({ itemName: dish.itemName, serves: dish.serves });
	}

	// Summary stats always cover ACTIVE rsvps, regardless of the current filters.
	const active = allRsvps.filter((r) => r.status === 'active');
	const yes = active.filter((r) => r.response === 'yes');
	const stats = {
		yesHeadcount: yes.reduce((sum, r) => sum + r.partySize, 0),
		yesAdults: yes.reduce((sum, r) => sum + 1 + r.plusOnesAdults, 0),
		yesKids: yes.reduce((sum, r) => sum + r.plusOnesKids, 0),
		maybeHeadcount: active
			.filter((r) => r.response === 'maybe')
			.reduce((sum, r) => sum + r.partySize, 0),
		noCount: active.filter((r) => r.response === 'no').length,
		waitlistCount: allRsvps.filter((r) => r.status === 'waitlisted').length,
		waitlistHeadcount: allRsvps
			.filter((r) => r.status === 'waitlisted')
			.reduce((sum, r) => sum + r.partySize, 0)
	};

	let rows = allRsvps;
	if (
		statusFilter === 'active' ||
		statusFilter === 'withdrawn' ||
		statusFilter === 'waitlisted'
	) {
		rows = rows.filter((r) => r.status === statusFilter);
	}
	if (responseFilter === 'yes' || responseFilter === 'no' || responseFilter === 'maybe') {
		rows = rows.filter((r) => r.response === responseFilter);
	}
	if (q) {
		const needle = q.toLowerCase();
		rows = rows.filter(
			(r) =>
				r.guestName.toLowerCase().includes(needle) ||
				(r.guestEmail ?? '').toLowerCase().includes(needle)
		);
	}

	return {
		// editToken is needed here (copy/regenerate edit links); ipHash is not.
		rsvps: rows.map((r) => ({ ...r, ipHash: null })),
		fieldDefinitions,
		dishesByRsvp,
		coverage: board.map((entry) => ({
			name: entry.category?.name ?? 'Other',
			claimed: entry.claimed,
			target: entry.target
		})),
		stats,
		filters: { response: responseFilter, status: statusFilter, q }
	};
};

export const actions: Actions = {
	regenerate: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await getEvent(params.id);
		if (!event) error(404, 'Event not found');
		const form = await request.formData();
		const rsvpId = String(form.get('rsvpId') ?? '');
		const rsvp = rsvpId ? await getRsvp(rsvpId) : undefined;
		if (!rsvp || rsvp.eventId !== event.id) {
			return fail(404, { rowError: 'RSVP not found' });
		}
		const newToken = await regenerateEditToken(rsvp.id);
		return { regenerated: rsvp.id, newToken };
	},

	withdraw: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await getEvent(params.id);
		if (!event) error(404, 'Event not found');
		const form = await request.formData();
		const rsvpId = String(form.get('rsvpId') ?? '');
		const rsvp = rsvpId ? await getRsvp(rsvpId) : undefined;
		if (!rsvp || rsvp.eventId !== event.id) {
			return fail(404, { rowError: 'RSVP not found' });
		}
		if (rsvp.status === 'withdrawn') {
			return fail(400, { rowError: 'This RSVP is already withdrawn' });
		}
		await withdrawRsvp(event, rsvp);
		return { withdrawn: rsvp.id };
	}
};
