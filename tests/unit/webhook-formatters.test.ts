import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
	summarizeNotification,
	formatNtfy,
	formatTelegram,
	formatJson,
	formatWebhook
} from '$lib/server/webhooks/formatters';
import type { NotificationPayload, WebhookEndpoint } from '$lib/server/db/schema';

function makePayload(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
	return {
		rsvpId: 'rsvp-1',
		eventId: 'event-1',
		eventTitle: 'Summer BBQ',
		eventSlug: 'summer-bbq',
		guestName: 'Ada',
		response: 'yes',
		partySize: 1,
		note: null,
		dishes: [],
		...overrides
	};
}

function makeEndpoint(overrides: Partial<WebhookEndpoint> = {}): WebhookEndpoint {
	return {
		id: 'wh-1',
		label: 'Test hook',
		url: 'https://hooks.example.com/notify',
		format: 'json',
		secret: null,
		eventTypes: ['rsvp.created', 'rsvp.updated', 'rsvp.withdrawn'],
		eventId: null,
		active: true,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	} as WebhookEndpoint;
}

describe('summarizeNotification', () => {
	it('uses a verb per notification type', () => {
		const payload = makePayload();
		expect(summarizeNotification('rsvp.created', payload).title).toBe('Summer BBQ: Ada RSVP’d');
		expect(summarizeNotification('rsvp.withdrawn', payload).title).toBe('Summer BBQ: Ada withdrew');
		expect(summarizeNotification('rsvp.updated', payload).title).toBe(
			'Summer BBQ: Ada updated their RSVP'
		);
	});

	it('omits the party suffix for a party of 1 and adds it for larger parties', () => {
		expect(summarizeNotification('rsvp.created', makePayload({ partySize: 1 })).body).toBe(
			'Response: YES'
		);
		expect(summarizeNotification('rsvp.created', makePayload({ partySize: 4 })).body).toBe(
			'Response: YES (party of 4)'
		);
	});

	it('uppercases the response', () => {
		expect(summarizeNotification('rsvp.created', makePayload({ response: 'maybe' })).body).toBe(
			'Response: MAYBE'
		);
	});

	it('appends dish and note lines when present', () => {
		const { body } = summarizeNotification(
			'rsvp.created',
			makePayload({ partySize: 2, dishes: ['Pasta', 'Salad'], note: 'Running late' })
		);
		expect(body).toBe('Response: YES (party of 2)\nBringing: Pasta, Salad\nNote: Running late');
	});

	it('skips dish/note lines when empty', () => {
		const { body } = summarizeNotification('rsvp.created', makePayload({ dishes: [], note: null }));
		expect(body).not.toContain('Bringing');
		expect(body).not.toContain('Note:');
	});
});

describe('formatNtfy', () => {
	it('builds a plain-text POST with Title/Tags/Priority headers', () => {
		const req = formatNtfy(
			makeEndpoint({ url: 'https://ntfy.sh/party' }),
			'rsvp.created',
			makePayload()
		);
		expect(req.url).toBe('https://ntfy.sh/party');
		expect(req.method).toBe('POST');
		expect(req.headers['Content-Type']).toBe('text/plain; charset=utf-8');
		expect(req.headers.Priority).toBe('default');
		expect(req.body).toBe('Response: YES');
	});

	it('strips non-latin-1-safe characters from the Title header', () => {
		const req = formatNtfy(makeEndpoint(), 'rsvp.created', makePayload({ guestName: 'Zoë 🎉' }));
		// The curly apostrophe in “RSVP’d” and the non-ASCII chars are stripped.
		expect(req.headers.Title).toBe('Summer BBQ: Zo  RSVPd');
		expect(req.headers.Title).toMatch(/^[\x20-\x7E]*$/);
	});

	it('tags withdrawals with wave and everything else with tada', () => {
		expect(formatNtfy(makeEndpoint(), 'rsvp.withdrawn', makePayload()).headers.Tags).toBe('wave');
		expect(formatNtfy(makeEndpoint(), 'rsvp.created', makePayload()).headers.Tags).toBe('tada');
		expect(formatNtfy(makeEndpoint(), 'rsvp.updated', makePayload()).headers.Tags).toBe('tada');
	});

	it('adds a Bearer Authorization header only when a secret is set', () => {
		expect(
			formatNtfy(makeEndpoint({ secret: 'tk_123' }), 'rsvp.created', makePayload()).headers
				.Authorization
		).toBe('Bearer tk_123');
		expect(formatNtfy(makeEndpoint(), 'rsvp.created', makePayload()).headers).not.toHaveProperty(
			'Authorization'
		);
	});
});

describe('formatTelegram', () => {
	const TG_URL = 'https://api.telegram.org/bot123:ABC/sendMessage';

	it('extracts chat_id from the URL query and removes it from the final URL', () => {
		const req = formatTelegram(
			makeEndpoint({ url: `${TG_URL}?chat_id=42` }),
			'rsvp.created',
			makePayload()
		);
		expect(req.url).toBe(TG_URL);
		expect(req.url).not.toContain('chat_id');
		expect(JSON.parse(req.body)).toEqual({
			chat_id: '42',
			text: 'Summer BBQ: Ada RSVP’d\nResponse: YES'
		});
	});

	it('preserves unrelated query params', () => {
		const req = formatTelegram(
			makeEndpoint({ url: `${TG_URL}?chat_id=42&disable_notification=true` }),
			'rsvp.created',
			makePayload()
		);
		expect(req.url).toBe(`${TG_URL}?disable_notification=true`);
	});

	it('falls back to the endpoint secret when the URL has no chat_id', () => {
		const req = formatTelegram(
			makeEndpoint({ url: TG_URL, secret: '999' }),
			'rsvp.created',
			makePayload()
		);
		expect(JSON.parse(req.body).chat_id).toBe('999');
	});

	it('uses an empty chat_id when neither URL nor secret provide one', () => {
		const req = formatTelegram(makeEndpoint({ url: TG_URL }), 'rsvp.created', makePayload());
		expect(JSON.parse(req.body).chat_id).toBe('');
	});

	it('sends JSON', () => {
		const req = formatTelegram(
			makeEndpoint({ url: `${TG_URL}?chat_id=1` }),
			'rsvp.created',
			makePayload()
		);
		expect(req.method).toBe('POST');
		expect(req.headers['Content-Type']).toBe('application/json');
	});
});

describe('formatJson', () => {
	it('builds a generic JSON envelope with the full payload embedded', () => {
		const payload = makePayload({ partySize: 3, dishes: ['Pie'] });
		const req = formatJson(makeEndpoint(), 'rsvp.updated', payload);
		expect(req.method).toBe('POST');
		expect(req.headers['Content-Type']).toBe('application/json');
		expect(JSON.parse(req.body)).toEqual({
			type: 'rsvp.updated',
			title: 'Summer BBQ: Ada updated their RSVP',
			message: 'Response: YES (party of 3)\nBringing: Pie',
			payload
		});
	});

	it('adds a Bearer Authorization header only when a secret is set', () => {
		expect(
			formatJson(makeEndpoint({ secret: 'shh' }), 'rsvp.created', makePayload()).headers
				.Authorization
		).toBe('Bearer shh');
		expect(formatJson(makeEndpoint(), 'rsvp.created', makePayload()).headers).not.toHaveProperty(
			'Authorization'
		);
	});

	it('signs the body with an HMAC over "<timestamp>.<body>" when a secret is set', () => {
		const now = 1_700_000_000_000; // fixed ms → 1700000000 s
		const req = formatJson(makeEndpoint({ secret: 'whsec' }), 'rsvp.created', makePayload(), now);
		expect(req.headers['X-Mosi-Timestamp']).toBe('1700000000');
		const expected = createHmac('sha256', 'whsec').update(`1700000000.${req.body}`).digest('hex');
		expect(req.headers['X-Mosi-Signature']).toBe(`sha256=${expected}`);
	});

	it('omits signature headers when no secret is configured', () => {
		const req = formatJson(makeEndpoint(), 'rsvp.created', makePayload());
		expect(req.headers).not.toHaveProperty('X-Mosi-Signature');
		expect(req.headers).not.toHaveProperty('X-Mosi-Timestamp');
	});

	it('flows the signature through formatWebhook for json endpoints', () => {
		const now = 1_700_000_500_000;
		const req = formatWebhook(
			makeEndpoint({ format: 'json', secret: 'k' }),
			'rsvp.created',
			makePayload(),
			now
		);
		const expected = createHmac('sha256', 'k').update(`1700000500.${req.body}`).digest('hex');
		expect(req.headers['X-Mosi-Signature']).toBe(`sha256=${expected}`);
		expect(req.headers['X-Mosi-Timestamp']).toBe('1700000500');
	});
});

describe('formatWebhook dispatch', () => {
	it('routes ntfy endpoints to formatNtfy', () => {
		const req = formatWebhook(makeEndpoint({ format: 'ntfy' }), 'rsvp.created', makePayload());
		expect(req.headers.Tags).toBe('tada');
		expect(req.headers['Content-Type']).toContain('text/plain');
	});

	it('routes telegram endpoints to formatTelegram', () => {
		const req = formatWebhook(
			makeEndpoint({
				format: 'telegram',
				url: 'https://api.telegram.org/botX/sendMessage?chat_id=7'
			}),
			'rsvp.created',
			makePayload()
		);
		expect(JSON.parse(req.body).chat_id).toBe('7');
	});

	it('routes everything else to formatJson', () => {
		const req = formatWebhook(makeEndpoint({ format: 'json' }), 'rsvp.created', makePayload());
		expect(JSON.parse(req.body).type).toBe('rsvp.created');
	});
});
