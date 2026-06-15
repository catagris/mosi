import { fail, redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards';
import {
	createBlankTemplate,
	createEventFromTemplate,
	deleteEvent,
	getEvent,
	listDishCategories,
	listFieldDefinitions,
	listTemplates
} from '$lib/server/services/events';
import { getSettings } from '$lib/server/services/settings';
import { isValidTimezone } from '$lib/utils/datetime';
import type { Actions, PageServerLoad } from './$types';

const NEW_EVENT_LEAD_MS = 7 * 24 * 60 * 60 * 1000; // default an instantiated event a week out

export const load: PageServerLoad = async ({ locals }) => {
	requireUser(locals);
	const [templates, settingsRow] = await Promise.all([listTemplates(), getSettings()]);
	const withCounts = await Promise.all(
		templates.map(async (t) => {
			const [fields, categories] = await Promise.all([
				listFieldDefinitions(t.id),
				listDishCategories(t.id)
			]);
			return {
				id: t.id,
				title: t.title,
				timezone: t.timezone,
				fieldCount: fields.length,
				categoryCount: categories.length
			};
		})
	);
	return {
		templates: withCounts,
		timezones: Intl.supportedValuesOf('timeZone'),
		defaultTimezone: settingsRow.defaultTimezone
	};
};

export const actions: Actions = {
	createBlank: async ({ request, locals }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const timezone = String(form.get('timezone') ?? '').trim();

		const errors: Record<string, string> = {};
		if (!title) errors.title = 'Title is required';
		if (!timezone || !isValidTimezone(timezone)) errors.timezone = 'Pick a valid timezone';
		if (Object.keys(errors).length > 0) {
			return fail(400, { create: { errors, values: { title, timezone } } });
		}

		const template = await createBlankTemplate({ title, timezone, createdBy: user.id });
		redirect(303, `/admin/events/${template.id}`);
	},

	use: async ({ request, locals }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const templateId = String(form.get('templateId') ?? '');
		const template = templateId ? await getEvent(templateId) : undefined;
		if (!template || !template.isTemplate) {
			return fail(404, { rowError: 'Template not found' });
		}
		const event = await createEventFromTemplate(template.id, {
			title: template.title,
			startsAt: new Date(Date.now() + NEW_EVENT_LEAD_MS),
			timezone: template.timezone,
			createdBy: user.id
		});
		if (!event) return fail(500, { rowError: 'Could not create the event' });
		redirect(303, `/admin/events/${event.id}`);
	},

	delete: async ({ request, locals }) => {
		requireUser(locals);
		const form = await request.formData();
		const templateId = String(form.get('templateId') ?? '');
		const template = templateId ? await getEvent(templateId) : undefined;
		if (!template || !template.isTemplate) {
			return fail(404, { rowError: 'Template not found' });
		}
		await deleteEvent(template.id);
		return { deleted: true };
	}
};
