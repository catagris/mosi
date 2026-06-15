import { json } from '@sveltejs/kit';
import { pingDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

/** Liveness probe for the Docker healthcheck. */
export const GET: RequestHandler = async () => {
	const dbOk = await pingDb();
	return json({ ok: dbOk, db: dbOk ? 'up' : 'down' }, { status: dbOk ? 200 : 503 });
};
