import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { pushSubscriptions, type NotificationPayload } from '$lib/server/db/schema';
import { env } from '$lib/server/env';

let configured = false;

function ensureConfigured(): boolean {
	if (!env.pushEnabled) return false;
	if (!configured) {
		webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey!, env.vapidPrivateKey!);
		configured = true;
	}
	return true;
}

export type PushMessage = {
	title: string;
	body: string;
	/** Admin-panel path to open when the notification is tapped. */
	url: string;
	tag?: string;
};

export function buildPushMessage(type: string, payload: NotificationPayload): PushMessage {
	const verb =
		type === 'rsvp.created' ? 'RSVP’d' : type === 'rsvp.withdrawn' ? 'withdrew' : 'updated their RSVP';
	const heads = payload.partySize > 1 ? ` (party of ${payload.partySize})` : '';
	return {
		title: payload.eventTitle,
		body: `${payload.guestName} ${verb} - ${payload.response.toUpperCase()}${heads}`,
		url: `/admin/events/${payload.eventId}/rsvps`,
		tag: payload.rsvpId
	};
}

/** Register (or refresh) a Web Push subscription for an admin device. */
export async function saveSubscription(
	userId: string,
	subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
	userAgent: string | null
): Promise<void> {
	const db = getDb();
	await db
		.insert(pushSubscriptions)
		.values({
			userId,
			endpoint: subscription.endpoint,
			p256dh: subscription.keys.p256dh,
			auth: subscription.keys.auth,
			userAgent: userAgent?.slice(0, 512) ?? null
		})
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: {
				userId,
				p256dh: subscription.keys.p256dh,
				auth: subscription.keys.auth,
				userAgent: userAgent?.slice(0, 512) ?? null
			}
		});
}

export async function removeSubscription(endpoint: string): Promise<void> {
	await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

/** Send to every registered admin device; prune endpoints that are gone. */
export async function sendPushToAll(message: PushMessage): Promise<void> {
	if (!ensureConfigured()) return;
	const db = getDb();
	const subscriptions = await db.select().from(pushSubscriptions);
	const body = JSON.stringify(message);

	await Promise.allSettled(
		subscriptions.map(async (sub) => {
			try {
				await webpush.sendNotification(
					{ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
					body,
					{ TTL: 3600 }
				);
				await db
					.update(pushSubscriptions)
					.set({ lastUsedAt: new Date() })
					.where(eq(pushSubscriptions.id, sub.id));
			} catch (err) {
				const status = (err as { statusCode?: number }).statusCode;
				if (status === 404 || status === 410) {
					await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
				} else {
					console.error(`web-push send failed (${status ?? 'unknown'}):`, (err as Error).message);
				}
			}
		})
	);
}
