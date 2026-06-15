import { asc, eq, sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards';
import { getDb } from '$lib/server/db';
import { webhookEndpoints, type NotificationPayload } from '$lib/server/db/schema';
import { getSettings, updateSettings } from '$lib/server/services/settings';
import { listEvents } from '$lib/server/services/events';
import { emailStatus } from '$lib/server/email';
import { env } from '$lib/server/env';
import { validateWebhookUrl, checkWebhookUrl } from '$lib/server/webhooks/ssrf';
import { formatWebhook } from '$lib/server/webhooks/formatters';
import { isValidTimezone } from '$lib/utils/datetime';
import type { Actions, PageServerLoad } from './$types';

const WEBHOOK_EVENT_TYPES = ['rsvp.created', 'rsvp.updated', 'rsvp.withdrawn'];
const WEBHOOK_FORMATS = ['ntfy', 'json', 'telegram'] as const;
type WebhookFormat = (typeof WEBHOOK_FORMATS)[number];

function text(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

export const load: PageServerLoad = async ({ locals }) => {
	requireUser(locals);
	const [settingsRow, events, webhooks] = await Promise.all([
		getSettings(),
		listEvents(),
		// Explicit columns: the `secret` is deliberately omitted so it never
		// reaches the browser. We surface only whether one is set, for the UI hint.
		getDb()
			.select({
				id: webhookEndpoints.id,
				label: webhookEndpoints.label,
				url: webhookEndpoints.url,
				format: webhookEndpoints.format,
				eventTypes: webhookEndpoints.eventTypes,
				eventId: webhookEndpoints.eventId,
				active: webhookEndpoints.active,
				createdAt: webhookEndpoints.createdAt,
				updatedAt: webhookEndpoints.updatedAt,
				hasSecret: sql<boolean>`${webhookEndpoints.secret} is not null`
			})
			.from(webhookEndpoints)
			.orderBy(asc(webhookEndpoints.createdAt))
	]);
	return {
		settings: settingsRow,
		events: events.map((event) => ({ id: event.id, title: event.title })),
		webhooks,
		email: emailStatus(),
		pushEnabled: env.pushEnabled,
		timezones: Intl.supportedValuesOf('timeZone')
	};
};

type WebhookParse = {
	values: Record<string, string>;
	errors: Record<string, string>;
	label: string;
	url: string;
	format: WebhookFormat;
	secret: string | null;
	eventTypes: string[];
	eventId: string | null;
	active: boolean;
};

function parseWebhookForm(form: FormData): WebhookParse {
	const selectedTypes = form
		.getAll('event_types')
		.map(String)
		.filter((t) => WEBHOOK_EVENT_TYPES.includes(t));
	const secretInput = text(form, 'secret');
	// `secret` is intentionally excluded from `values`: it is never echoed back to
	// the browser (a password-style field), so a failed submit won't re-expose it.
	const values: Record<string, string> = {
		label: text(form, 'label'),
		url: text(form, 'url'),
		format: text(form, 'format'),
		event_types: selectedTypes.join(','),
		event_id: text(form, 'event_id'),
		active: form.get('active') === 'on' ? 'on' : ''
	};

	const errors: Record<string, string> = {};
	if (!values.label) errors.label = 'Label is required';
	if (!values.url) {
		errors.url = 'URL is required';
	} else {
		const check = validateWebhookUrl(values.url, env.allowPrivateWebhooks);
		if (!check.ok) errors.url = check.reason;
	}
	const formatOk = (WEBHOOK_FORMATS as readonly string[]).includes(values.format);
	if (!formatOk) errors.format = 'Pick a format';

	return {
		values,
		errors,
		label: values.label,
		url: values.url,
		format: (formatOk ? values.format : 'json') as WebhookFormat,
		// null when the field was left blank — the update action reads this as
		// "leave the stored secret unchanged" rather than "clear it".
		secret: secretInput || null,
		eventTypes: selectedTypes.length > 0 ? selectedTypes : [...WEBHOOK_EVENT_TYPES],
		eventId: values.event_id || null,
		active: values.active === 'on'
	};
}

export const actions: Actions = {
	save: async ({ request, locals }) => {
		requireUser(locals);
		const form = await request.formData();
		const values = {
			org_name: text(form, 'org_name'),
			logo_url: text(form, 'logo_url'),
			default_timezone: text(form, 'default_timezone'),
			primary_color: text(form, 'primary_color')
		};

		const errors: Record<string, string> = {};
		if (!values.org_name) errors.org_name = 'Organization name is required';
		if (values.logo_url) {
			try {
				const url = new URL(values.logo_url);
				if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
			} catch {
				errors.logo_url = 'Enter a valid http(s) URL';
			}
		}
		if (!values.default_timezone || !isValidTimezone(values.default_timezone)) {
			errors.default_timezone = 'Pick a valid IANA timezone';
		}
		if (!/^#[0-9a-fA-F]{6}$/.test(values.primary_color)) {
			errors.primary_color = 'Use a hex color like #7c3aed';
		}
		if (Object.keys(errors).length > 0) {
			return fail(400, { org: { errors, values } });
		}

		await updateSettings({
			orgName: values.org_name,
			logoUrl: values.logo_url || null,
			defaultTimezone: values.default_timezone,
			primaryColor: values.primary_color
		});
		return { saved: true };
	},

	createWebhook: async ({ request, locals }) => {
		requireUser(locals);
		const parsed = parseWebhookForm(await request.formData());
		if (Object.keys(parsed.errors).length > 0) {
			return fail(400, { webhookForm: { id: null, errors: parsed.errors, values: parsed.values } });
		}
		await getDb().insert(webhookEndpoints).values({
			label: parsed.label,
			url: parsed.url,
			format: parsed.format,
			secret: parsed.secret,
			eventTypes: parsed.eventTypes,
			eventId: parsed.eventId,
			active: parsed.active
		});
		return { webhookSaved: true };
	},

	updateWebhook: async ({ request, locals }) => {
		requireUser(locals);
		const form = await request.formData();
		const id = text(form, 'id');
		const parsed = parseWebhookForm(form);
		if (!id || Object.keys(parsed.errors).length > 0) {
			return fail(400, {
				webhookForm: { id: id || null, errors: parsed.errors, values: parsed.values }
			});
		}
		const [updated] = await getDb()
			.update(webhookEndpoints)
			.set({
				label: parsed.label,
				url: parsed.url,
				format: parsed.format,
				// A blank secret field means "keep the existing secret"; only
				// overwrite when the admin actually typed a new one.
				...(parsed.secret !== null ? { secret: parsed.secret } : {}),
				eventTypes: parsed.eventTypes,
				eventId: parsed.eventId,
				active: parsed.active,
				updatedAt: new Date()
			})
			.where(eq(webhookEndpoints.id, id))
			.returning();
		if (!updated) {
			return fail(404, {
				webhookForm: { id, errors: { label: 'Notifier not found' }, values: parsed.values }
			});
		}
		return { webhookSaved: true };
	},

	deleteWebhook: async ({ request, locals }) => {
		requireUser(locals);
		const form = await request.formData();
		const id = text(form, 'id');
		if (id) await getDb().delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
		return { webhookSaved: true };
	},

	toggleWebhook: async ({ request, locals }) => {
		requireUser(locals);
		const form = await request.formData();
		const id = text(form, 'id');
		const [endpoint] = await getDb()
			.select()
			.from(webhookEndpoints)
			.where(eq(webhookEndpoints.id, id))
			.limit(1);
		if (!endpoint) return fail(404, { webhookForm: null });
		await getDb()
			.update(webhookEndpoints)
			.set({ active: !endpoint.active, updatedAt: new Date() })
			.where(eq(webhookEndpoints.id, id));
		return { webhookSaved: true };
	},

	testWebhook: async ({ request, locals }) => {
		requireUser(locals);
		const form = await request.formData();
		const id = text(form, 'id');
		const [endpoint] = await getDb()
			.select()
			.from(webhookEndpoints)
			.where(eq(webhookEndpoints.id, id))
			.limit(1);
		if (!endpoint) {
			return fail(404, { testResult: 'Notifier not found', testedId: id });
		}

		const payload: NotificationPayload = {
			rsvpId: '00000000-0000-0000-0000-000000000000',
			eventId: '00000000-0000-0000-0000-000000000000',
			eventTitle: 'Test event',
			eventSlug: 'test',
			guestName: 'Test Guest',
			response: 'yes',
			partySize: 2,
			note: 'This is a test',
			dishes: ['Lemonade']
		};
		// Re-run the SSRF guard (with DNS resolution) before sending, exactly like
		// the live dispatch path - a stored hostname could resolve to a private IP.
		const check = await checkWebhookUrl(endpoint.url, env.allowPrivateWebhooks);
		if (!check.ok) {
			return fail(400, { testResult: `Blocked: ${check.reason}`, testedId: id });
		}

		const outbound = formatWebhook(endpoint, 'rsvp.created', payload);
		try {
			const response = await fetch(outbound.url, {
				method: outbound.method,
				headers: outbound.headers,
				body: outbound.body,
				redirect: 'error',
				signal: AbortSignal.timeout(5000)
			});
			return { testResult: `HTTP ${response.status} ${response.statusText}`.trim(), testedId: id };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Request failed';
			return { testResult: message, testedId: id };
		}
	}
};
