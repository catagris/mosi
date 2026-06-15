import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards';
import { getEvent } from '$lib/server/services/events';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params }) => {
	requireUser(locals);
	const event = await getEvent(params.id);
	if (!event) error(404, 'Event not found');
	return { event };
};
