import { fail, redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards';
import {
	createEventWithSlug,
	createEventFromTemplate,
	listEvents,
	listTemplates
} from '$lib/server/services/events';
import { yesHeadcount } from '$lib/server/services/rsvps';
import { getSettings } from '$lib/server/services/settings';
import { isValidTimezone, zonedLocalToUtc } from '$lib/utils/datetime';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireUser(locals);
	const [events, templates, settingsRow] = await Promise.all([
		listEvents(),
		listTemplates(),
		getSettings()
	]);
	const headcounts = await Promise.all(events.map((event) => yesHeadcount(event.id)));
	return {
		events: events.map((event, i) => ({ ...event, yesHeadcount: headcounts[i] })),
		templates: templates.map((t) => ({ id: t.id, title: t.title })),
		timezones: Intl.supportedValuesOf('timeZone'),
		defaultTimezone: settingsRow.defaultTimezone
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const startsAtLocal = String(form.get('starts_at') ?? '').trim();
		const timezone = String(form.get('timezone') ?? '').trim();
		const templateId = String(form.get('template') ?? '').trim();

		const errors: Record<string, string> = {};
		if (!title) errors.title = 'Title is required';
		else if (title.length > 200) errors.title = 'Title is too long (max 200 characters)';
		if (!timezone || !isValidTimezone(timezone)) errors.timezone = 'Pick a valid timezone';
		const startsAt = errors.timezone ? null : zonedLocalToUtc(startsAtLocal, timezone);
		if (!errors.timezone && !startsAt) errors.starts_at = 'Enter a valid start date and time';

		if (Object.keys(errors).length > 0 || !startsAt) {
			return fail(400, {
				create: { errors, values: { title, starts_at: startsAtLocal, timezone, template: templateId } }
			});
		}

		// Optionally clone a template's full config (fields, dishes, options, theme).
		const event = templateId
			? await createEventFromTemplate(templateId, {
					title,
					startsAt,
					timezone,
					createdBy: user.id
				})
			: await createEventWithSlug(title, { title, startsAt, timezone, createdBy: user.id, status: 'draft' });

		if (!event) {
			const tplErrors: Record<string, string> = { template: 'That template no longer exists' };
			return fail(400, {
				create: { errors: tplErrors, values: { title, starts_at: startsAtLocal, timezone, template: '' } }
			});
		}
		redirect(303, `/admin/events/${event.id}`);
	}
};
