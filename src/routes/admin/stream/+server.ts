import { requireUser } from '$lib/server/auth/guards';
import { createSseResponse } from '$lib/server/sse';
import type { RequestHandler } from './$types';

/** Global live alert stream for the admin shell (badge + toasts, tier 1). */
export const GET: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	return createSseResponse(null, request.signal, user.id);
};
