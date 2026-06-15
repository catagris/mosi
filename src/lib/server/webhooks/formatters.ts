import { createHmac } from 'node:crypto';
import type { NotificationPayload, WebhookEndpoint } from '$lib/server/db/schema';

/**
 * Outbound webhook payload formatters: ntfy, Telegram bot, or generic JSON.
 * Pure functions - unit-tested independently of the dispatcher.
 */

export type OutboundRequest = {
	url: string;
	method: 'POST';
	headers: Record<string, string>;
	body: string;
};

export function summarizeNotification(
	type: string,
	payload: NotificationPayload
): {
	title: string;
	body: string;
} {
	const verb =
		type === 'rsvp.created'
			? 'RSVP’d'
			: type === 'rsvp.withdrawn'
				? 'withdrew'
				: 'updated their RSVP';
	const heads = payload.partySize > 1 ? ` (party of ${payload.partySize})` : '';
	const dishes = payload.dishes?.length ? `\nBringing: ${payload.dishes.join(', ')}` : '';
	const note = payload.note ? `\nNote: ${payload.note}` : '';
	return {
		title: `${payload.eventTitle}: ${payload.guestName} ${verb}`,
		body: `Response: ${payload.response.toUpperCase()}${heads}${dishes}${note}`
	};
}

export function formatNtfy(
	endpoint: WebhookEndpoint,
	type: string,
	payload: NotificationPayload
): OutboundRequest {
	const { title, body } = summarizeNotification(type, payload);
	const headers: Record<string, string> = {
		'Content-Type': 'text/plain; charset=utf-8',
		// ntfy header values must be latin-1 safe; strip anything outside it.
		Title: title.replace(/[^\x20-\x7E]/g, ''),
		Tags: type === 'rsvp.withdrawn' ? 'wave' : 'tada',
		Priority: 'default'
	};
	if (endpoint.secret) headers.Authorization = `Bearer ${endpoint.secret}`;
	return { url: endpoint.url, method: 'POST', headers, body };
}

export function formatTelegram(
	endpoint: WebhookEndpoint,
	type: string,
	payload: NotificationPayload
): OutboundRequest {
	const { title, body } = summarizeNotification(type, payload);
	// endpoint.url: https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>
	// or a plain URL with the chat id supplied via secret ("chat_id").
	const url = new URL(endpoint.url);
	const chatId = url.searchParams.get('chat_id') ?? endpoint.secret ?? '';
	url.searchParams.delete('chat_id');
	return {
		url: url.toString(),
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ chat_id: chatId, text: `${title}\n${body}` })
	};
}

export function formatJson(
	endpoint: WebhookEndpoint,
	type: string,
	payload: NotificationPayload,
	now: number = Date.now()
): OutboundRequest {
	const { title, body } = summarizeNotification(type, payload);
	const requestBody = JSON.stringify({ type, title, message: body, payload });
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (endpoint.secret) {
		headers.Authorization = `Bearer ${endpoint.secret}`;
		// Sign the body with the shared secret so receivers can verify authenticity
		// and reject replays: HMAC over "<unix-seconds>.<raw-body>", à la Stripe.
		const timestamp = Math.floor(now / 1000).toString();
		const signature = createHmac('sha256', endpoint.secret)
			.update(`${timestamp}.${requestBody}`)
			.digest('hex');
		headers['X-Mosi-Timestamp'] = timestamp;
		headers['X-Mosi-Signature'] = `sha256=${signature}`;
	}
	return { url: endpoint.url, method: 'POST', headers, body: requestBody };
}

export function formatWebhook(
	endpoint: WebhookEndpoint,
	type: string,
	payload: NotificationPayload,
	now: number = Date.now()
): OutboundRequest {
	switch (endpoint.format) {
		case 'ntfy':
			return formatNtfy(endpoint, type, payload);
		case 'telegram':
			return formatTelegram(endpoint, type, payload);
		default:
			return formatJson(endpoint, type, payload, now);
	}
}
