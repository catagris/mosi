import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards';
import { unreadNotificationCount } from '$lib/server/services/notifications';
import type { RequestHandler } from './$types';

/** Polling fallback for the admin shell when the SSE stream is down. */
export const GET: RequestHandler = async ({ locals }) => {
	requireUser(locals);
	return json({ count: await unreadNotificationCount() });
};
