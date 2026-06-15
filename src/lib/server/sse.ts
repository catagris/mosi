/**
 * In-process SSE hub for live admin alerts.
 *
 * Admin panels subscribe (optionally filtered to one event); the notification
 * service broadcasts on RSVP create/update/withdraw. Single-node by design.
 */

export type SseMessage = {
	type: string;
	notificationId?: string;
	eventId?: string | null;
	payload: unknown;
};

type Client = {
	id: number;
	userId: string;
	eventFilter: string | null;
	send: (data: string) => void;
	/** Full teardown: drop from the registry, stop the heartbeat, close the stream. */
	destroy: () => void;
};

/** Ceilings to bound memory/file-descriptor use on this single-node hub. */
export const MAX_GLOBAL_CLIENTS = 200;
export const MAX_PER_USER_CLIENTS = 10;

let nextClientId = 1;
const clients = new Map<number, Client>();

export function sseClientCount(): number {
	return clients.size;
}

/** Evict a user's oldest streams until at most `keep` of theirs remain. */
function evictOldestForUser(userId: string, keep: number): void {
	// Map preserves insertion order, so this user's clients come out oldest-first.
	const own = [...clients.values()].filter((c) => c.userId === userId);
	for (let i = 0; i < own.length - keep; i++) own[i].destroy();
}

/** Create an SSE Response streaming hub broadcasts to one admin connection. */
export function createSseResponse(
	eventFilter: string | null,
	requestSignal: AbortSignal,
	userId: string
): Response {
	// Global ceiling: shed load (503) rather than exhaust memory/sockets. We don't
	// evict other users' streams to satisfy a newcomer.
	if (clients.size >= MAX_GLOBAL_CLIENTS) {
		return new Response('Too many live connections - try again shortly.', {
			status: 503,
			headers: { 'Retry-After': '30', 'Content-Type': 'text/plain' }
		});
	}
	// Per-user ceiling: make room by closing this user's oldest streams (e.g. stale
	// tabs) so a single account can't monopolize the hub.
	evictOldestForUser(userId, MAX_PER_USER_CLIENTS - 1);

	const id = nextClientId++;
	let heartbeat: ReturnType<typeof setInterval> | undefined;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			const client: Client = {
				id,
				userId,
				eventFilter,
				send: (data) => {
					try {
						controller.enqueue(encoder.encode(data));
					} catch {
						client.destroy();
					}
				},
				destroy: () => {
					clients.delete(id);
					if (heartbeat) clearInterval(heartbeat);
					try {
						controller.close();
					} catch {
						// already closed
					}
				}
			};
			clients.set(id, client);
			client.send(`retry: 5000\n\n`);
			heartbeat = setInterval(() => client.send(`: ping\n\n`), 25_000);
			heartbeat.unref?.();
			requestSignal.addEventListener('abort', () => client.destroy());
		},
		cancel() {
			clients.get(id)?.destroy();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
}

/** Broadcast a message to all connected admin panels (honoring event filters). */
export function broadcastSse(message: SseMessage): void {
	const frame = `event: notification\ndata: ${JSON.stringify(message)}\n\n`;
	for (const client of clients.values()) {
		if (client.eventFilter && message.eventId && client.eventFilter !== message.eventId) continue;
		client.send(frame);
	}
}
