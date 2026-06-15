import { redirect } from '@sveltejs/kit';
import { destroySession, clearSessionCookie } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

/** Sign out: revoke the session server-side and clear the cookie. */
export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (locals.session) await destroySession(locals.session.id);
	clearSessionCookie(cookies);
	redirect(303, '/admin/login');
};

/** Logout must be a POST (CSRF) - a stray GET just goes back to the panel. */
export const GET: RequestHandler = async () => {
	redirect(303, '/admin');
};
