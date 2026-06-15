import { desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import {
	notifications,
	type Notification,
	type NotificationPayload
} from '$lib/server/db/schema';
import { broadcastSse } from '$lib/server/sse';
import { buildPushMessage, sendPushToAll } from '$lib/server/push';
import { dispatchWebhooks } from '$lib/server/webhooks';

export type RsvpEventType = 'rsvp.created' | 'rsvp.updated' | 'rsvp.withdrawn';

/**
 * The event bus: one call fans out to all three notification tiers.
 *  1. in-app feed row (+ SSE broadcast to open admin panels)
 *  2. Web Push to registered admin devices
 *  3. outbound webhooks (ntfy/Gotify/Telegram/custom)
 * Each tier is independent and must never block or fail the RSVP write.
 */
export async function emitRsvpEvent(type: RsvpEventType, payload: NotificationPayload): Promise<void> {
	let row: Notification | undefined;
	try {
		[row] = await getDb()
			.insert(notifications)
			.values({ eventId: payload.eventId, type, payload })
			.returning();
	} catch (err) {
		console.error('notifications: failed to persist feed row:', (err as Error).message);
	}

	try {
		broadcastSse({
			type,
			notificationId: row?.id,
			eventId: payload.eventId,
			payload
		});
	} catch (err) {
		console.error('notifications: SSE broadcast failed:', (err as Error).message);
	}

	// Push + webhooks are slow network calls - fire and forget.
	void sendPushToAll(buildPushMessage(type, payload)).catch((err) =>
		console.error('notifications: push tier failed:', (err as Error).message)
	);
	void dispatchWebhooks(type, payload).catch((err) =>
		console.error('notifications: webhook tier failed:', (err as Error).message)
	);
}

export async function listNotifications(limit = 50): Promise<Notification[]> {
	return getDb().select().from(notifications).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function unreadNotificationCount(): Promise<number> {
	const [row] = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(notifications)
		.where(isNull(notifications.readAt));
	return row?.count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
	await getDb().update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id));
}

/** v1 read-state is global per org. */
export async function markAllNotificationsRead(): Promise<void> {
	await getDb().update(notifications).set({ readAt: new Date() }).where(isNull(notifications.readAt));
}
