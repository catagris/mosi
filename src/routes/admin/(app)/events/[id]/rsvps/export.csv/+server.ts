import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards';
import { getEvent, listFieldDefinitions } from '$lib/server/services/events';
import { listDishesForEvent, listRsvps } from '$lib/server/services/rsvps';
import { buildRsvpCsv } from '$lib/server/services/csv';
import type { DishContribution } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/** Guest-list export: RSVPs + custom-field answers + dishes. */
export const GET: RequestHandler = async ({ locals, params }) => {
	requireUser(locals);
	const event = await getEvent(params.id);
	if (!event) error(404, 'Event not found');
	// Templates have no RSVPs to export; block the direct endpoint, not just the tab.
	if (event.isTemplate) error(404, 'Not found');

	const [rows, fieldDefinitions, dishes] = await Promise.all([
		listRsvps(event.id),
		listFieldDefinitions(event.id),
		listDishesForEvent(event.id)
	]);

	const dishesByRsvp = new Map<string, DishContribution[]>();
	for (const dish of dishes) {
		const list = dishesByRsvp.get(dish.rsvpId) ?? [];
		list.push(dish);
		dishesByRsvp.set(dish.rsvpId, list);
	}

	const body = buildRsvpCsv(rows, fieldDefinitions, dishesByRsvp, event.trackKids);
	return new Response(body, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${event.slug}-rsvps.csv"`
		}
	});
};
