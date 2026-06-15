import { requireUser } from '$lib/server/auth/guards';
import { createSseResponse } from '$lib/server/sse';
import type { RequestHandler } from './$types';

/** Live new/updated-RSVP alerts scoped to one event. */
export const GET: RequestHandler = async ({ locals, params, request }) => {
	const user = requireUser(locals);
	return createSseResponse(params.id, request.signal, user.id);
};
