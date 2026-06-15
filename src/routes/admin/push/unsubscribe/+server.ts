import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireUser } from '$lib/server/auth/guards';
import { removeSubscription } from '$lib/server/push';
import type { RequestHandler } from './$types';

const bodySchema = z.object({ endpoint: z.string().url().max(1024) });

export const POST: RequestHandler = async ({ locals, request }) => {
	requireUser(locals);
	const parsed = bodySchema.safeParse(await request.json());
	if (!parsed.success) error(400, 'Invalid request');
	await removeSubscription(parsed.data.endpoint);
	return json({ ok: true });
};
