import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireUser } from '$lib/server/auth/guards';
import { saveSubscription } from '$lib/server/push';
import { checkWebhookUrl } from '$lib/server/webhooks/ssrf';
import { env } from '$lib/server/env';
import type { RequestHandler } from './$types';

const subscriptionSchema = z.object({
	endpoint: z.string().url().max(1024),
	keys: z.object({
		p256dh: z.string().min(1).max(512),
		auth: z.string().min(1).max(512)
	})
});

/** Register this browser/device for admin Web Push. */
export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	if (!env.pushEnabled) error(400, 'Web Push is not configured (set VAPID keys)');
	const parsed = subscriptionSchema.safeParse(await request.json());
	if (!parsed.success) error(400, 'Invalid push subscription');

	// The endpoint becomes an outbound target for web-push, so vet it like a
	// webhook (SSRF guard) and require TLS — a hostile subscription could
	// otherwise point the server at an internal service.
	let protocol: string;
	try {
		protocol = new URL(parsed.data.endpoint).protocol;
	} catch {
		error(400, 'Invalid push endpoint');
	}
	if (protocol !== 'https:') error(400, 'Push endpoint must use https');
	const check = await checkWebhookUrl(parsed.data.endpoint, env.allowPrivateWebhooks);
	if (!check.ok) error(400, `Push endpoint is not allowed: ${check.reason}`);

	await saveSubscription(user.id, parsed.data, request.headers.get('user-agent'));
	return json({ ok: true });
};
