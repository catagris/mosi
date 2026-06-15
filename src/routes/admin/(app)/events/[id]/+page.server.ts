import { error, fail, redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards';
import {
	createTemplateFromEvent,
	deleteEvent,
	getEvent,
	newPublicToken,
	uniqueSlug,
	updateEvent
} from '$lib/server/services/events';
import { isValidTimezone, zonedLocalToUtc } from '$lib/utils/datetime';
import type { EventTheme } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

const STATUSES = ['draft', 'published', 'closed', 'archived'] as const;
type Status = (typeof STATUSES)[number];

function text(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

export const load: PageServerLoad = async ({ locals }) => {
	requireUser(locals);
	return { timezones: Intl.supportedValuesOf('timeZone') };
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await getEvent(params.id);
		if (!event) error(404, 'Event not found');
		const isTemplate = event.isTemplate;

		const form = await request.formData();
		const values: Record<string, string> = {};
		const textFields = [
			'title',
			'slug',
			'description',
			'location',
			'map_url',
			'starts_at',
			'ends_at',
			'timezone',
			'status',
			'rsvp_opens_at',
			'rsvp_closes_at',
			'capacity',
			'max_plus_ones',
			'item_noun_singular',
			'item_noun_plural',
			'theme_primary',
			'theme_accent',
			'theme_banner',
			'theme_font'
		];
		for (const name of textFields) values[name] = text(form, name);
		const flagFields = [
			'track_kids',
			'allow_maybe',
			'enable_waitlist',
			'require_email',
			'show_dish_list_public',
			'show_dish_contributor_names',
			'collect_dishes',
			'dish_show_category',
			'dish_show_serves',
			'dish_show_note',
			'collect_allergies'
		];
		for (const name of flagFields) values[name] = form.get(name) === 'on' ? 'on' : '';

		const errors: Record<string, string> = {};
		if (!values.title) errors.title = 'Title is required';
		if (!values.timezone || !isValidTimezone(values.timezone)) {
			errors.timezone = 'Pick a valid IANA timezone';
		}
		// Cap free-text / URL fields so unbounded input can't land in `text` columns.
		const lengthCaps: ReadonlyArray<readonly [string, number, string]> = [
			['title', 200, 'Title'],
			['description', 5000, 'Description'],
			['location', 300, 'Location'],
			['map_url', 2000, 'Map link'],
			['theme_banner', 2000, 'Banner URL'],
			['theme_font', 100, 'Font']
		];
		for (const [name, max, label] of lengthCaps) {
			if (values[name].length > max) {
				errors[name] = `${label} is too long (max ${max} characters)`;
			}
		}
		// Date/status/slug are event-only - templates carry no concrete schedule.
		let startsAt: Date | null = null;
		let endsAt: Date | null = null;
		let rsvpOpensAt: Date | null = null;
		let rsvpClosesAt: Date | null = null;
		if (!isTemplate) {
			if (!STATUSES.includes(values.status as Status)) errors.status = 'Invalid status';
			if (!errors.timezone) {
				startsAt = values.starts_at ? zonedLocalToUtc(values.starts_at, values.timezone) : null;
				if (!startsAt) errors.starts_at = 'Enter a valid start date and time';
				if (values.ends_at) {
					endsAt = zonedLocalToUtc(values.ends_at, values.timezone);
					if (!endsAt) errors.ends_at = 'Enter a valid end date and time';
					else if (startsAt && endsAt <= startsAt) errors.ends_at = 'End must be after the start';
				}
				if (values.rsvp_opens_at) {
					rsvpOpensAt = zonedLocalToUtc(values.rsvp_opens_at, values.timezone);
					if (!rsvpOpensAt) errors.rsvp_opens_at = 'Enter a valid date and time';
				}
				if (values.rsvp_closes_at) {
					rsvpClosesAt = zonedLocalToUtc(values.rsvp_closes_at, values.timezone);
					if (!rsvpClosesAt) errors.rsvp_closes_at = 'Enter a valid date and time';
					else if (rsvpOpensAt && rsvpClosesAt <= rsvpOpensAt) {
						errors.rsvp_closes_at = 'Must be after RSVPs open';
					}
				}
			}
		}

		const capacity = values.capacity === '' ? null : Number(values.capacity);
		if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0)) {
			errors.capacity = 'Enter a whole number, or leave empty for unlimited';
		}
		const maxPlusOnes = values.max_plus_ones === '' ? 0 : Number(values.max_plus_ones);
		if (!Number.isInteger(maxPlusOnes) || maxPlusOnes < 0) {
			errors.max_plus_ones = 'Enter a whole number of 0 or more';
		}

		if (values.theme_banner) {
			try {
				const url = new URL(values.theme_banner);
				if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
			} catch {
				errors.theme_banner = 'Enter a valid http(s) URL';
			}
		}

		if (values.map_url) {
			try {
				const url = new URL(values.map_url);
				if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
			} catch {
				errors.map_url = 'Enter a valid http(s) link';
			}
		}

		if (Object.keys(errors).length > 0 || (!isTemplate && !startsAt)) {
			return fail(400, { update: { errors, values } });
		}

		// Contribution nouns: trim + cap length, falling back to the food defaults
		// when left blank so copy never renders an empty word.
		const itemNounSingular = values.item_noun_singular.slice(0, 30) || 'dish';
		const itemNounPlural = values.item_noun_plural.slice(0, 30) || 'dishes';

		const theme: EventTheme = {};
		if (values.theme_primary) theme.primaryColor = values.theme_primary;
		if (values.theme_accent) theme.accent = values.theme_accent;
		if (values.theme_banner) theme.bannerImageUrl = values.theme_banner;
		if (values.theme_font) theme.font = values.theme_font;

		// Reusable config shared by events and templates.
		const common = {
			title: values.title,
			description: values.description,
			location: values.location,
			mapUrl: values.map_url,
			timezone: values.timezone,
			capacity,
			maxPlusOnes,
			trackKids: values.track_kids === 'on',
			allowMaybe: values.allow_maybe === 'on',
			enableWaitlist: values.enable_waitlist === 'on',
			requireEmail: values.require_email === 'on',
			showDishListPublic: values.show_dish_list_public === 'on',
			showDishContributorNames: values.show_dish_contributor_names === 'on',
			collectDishes: values.collect_dishes === 'on',
			dishShowCategory: values.dish_show_category === 'on',
			dishShowServes: values.dish_show_serves === 'on',
			dishShowNote: values.dish_show_note === 'on',
			itemNounSingular,
			itemNounPlural,
			collectAllergies: values.collect_allergies === 'on',
			theme
		};

		if (isTemplate) {
			await updateEvent(event.id, common);
		} else {
			const slug = await uniqueSlug(values.slug || values.title, event.id);
			await updateEvent(event.id, {
				...common,
				slug,
				startsAt: startsAt as Date, // guaranteed non-null by the guard above
				endsAt,
				status: values.status as Status,
				rsvpOpensAt,
				rsvpClosesAt
			});
		}

		return { saved: true };
	},

	saveAsTemplate: async ({ locals, params }) => {
		requireUser(locals);
		const event = await getEvent(params.id);
		if (!event) error(404, 'Event not found');
		if (event.isTemplate) error(400, 'Already a template');
		const template = await createTemplateFromEvent(event.id);
		if (!template) error(500, 'Could not create template');
		redirect(303, `/admin/events/${template.id}`);
	},

	togglePublicToken: async ({ locals, params }) => {
		requireUser(locals);
		const event = await getEvent(params.id);
		if (!event) error(404, 'Event not found');
		await updateEvent(event.id, { publicToken: event.publicToken ? null : newPublicToken() });
		return { saved: true };
	},

	delete: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await getEvent(params.id);
		if (!event) error(404, 'Event not found');
		const form = await request.formData();
		if (text(form, 'confirm') !== event.title) {
			return fail(400, { danger: { error: 'Type the title exactly to confirm deletion' } });
		}
		const wasTemplate = event.isTemplate;
		await deleteEvent(event.id);
		redirect(303, wasTemplate ? '/admin/templates' : '/admin/events');
	}
};
