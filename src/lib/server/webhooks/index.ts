import { and, eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { webhookEndpoints, type NotificationPayload } from '$lib/server/db/schema';
import { env } from '$lib/server/env';
import { consume, RULES } from '$lib/server/rate-limit';
import { checkWebhookUrl } from './ssrf';
import { formatWebhook } from './formatters';

const SEND_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendOnce(url: string, init: RequestInit): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
	try {
		return await fetch(url, { ...init, signal: controller.signal, redirect: 'error' });
	} finally {
		clearTimeout(timer);
	}
}

/** Fan an RSVP event out to all matching active webhook endpoints. */
export async function dispatchWebhooks(type: string, payload: NotificationPayload): Promise<void> {
	const db = getDb();
	const endpoints = await db
		.select()
		.from(webhookEndpoints)
		.where(and(eq(webhookEndpoints.active, true)));

	const matching = endpoints.filter(
		(e) => e.eventTypes.includes(type) && (!e.eventId || e.eventId === payload.eventId)
	);

	await Promise.allSettled(
		matching.map(async (endpoint) => {
			if (!consume(`webhook:${endpoint.id}`, RULES.webhookSend)) {
				console.warn(`webhook ${endpoint.label}: rate limited, dropping ${type}`);
				return;
			}
			const check = await checkWebhookUrl(endpoint.url, env.allowPrivateWebhooks);
			if (!check.ok) {
				console.warn(`webhook ${endpoint.label}: blocked (${check.reason})`);
				return;
			}
			const request = formatWebhook(endpoint, type, payload);
			for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
				try {
					const response = await sendOnce(request.url, {
						method: request.method,
						headers: request.headers,
						body: request.body
					});
					if (response.ok) return;
					// 4xx won't improve on retry; 5xx might.
					if (response.status < 500) {
						console.warn(`webhook ${endpoint.label}: HTTP ${response.status}, giving up`);
						return;
					}
				} catch (err) {
					if (attempt === MAX_RETRIES - 1) {
						console.warn(`webhook ${endpoint.label}: ${(err as Error).message}, giving up`);
					}
				}
				await sleep(BACKOFF_BASE_MS * 2 ** attempt);
			}
		})
	);
}
