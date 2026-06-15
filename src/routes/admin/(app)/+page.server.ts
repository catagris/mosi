import { requireUser } from '$lib/server/auth/guards';
import { listEvents } from '$lib/server/services/events';
import { yesHeadcount } from '$lib/server/services/rsvps';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireUser(locals);

	const events = await listEvents();
	const overview = await Promise.all(
		events.map(async (event) => ({
			id: event.id,
			title: event.title,
			status: event.status,
			startsAt: event.startsAt,
			capacity: event.capacity,
			headcount: await yesHeadcount(event.id)
		}))
	);

	return { events: overview };
};
