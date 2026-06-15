import { error, fail, redirect } from '@sveltejs/kit';
import {
	getEventBySlug,
	listDishCategories,
	listFieldDefinitions,
	publicTokenOk,
	rsvpWindowState
} from '$lib/server/services/events';
import { createRsvp, yesHeadcount } from '$lib/server/services/rsvps';
import { buildDishBoard } from '$lib/server/services/dishes';
import { buildAllergyDigest } from '$lib/server/services/allergies';
import { looksLikeBot, parseRsvpForm, MAX_DISH_ROWS } from '$lib/server/validation/rsvp';
import { MAX_ALLERGY_ROWS } from '$lib/allergens';
import { fieldInputName } from '$lib/server/validation/fields';
import { renderMarkdown } from '$lib/server/markdown';
import { calendarHrefs } from '$lib/calendar';
import { emailEnabled, sendEditLinkEmail } from '$lib/server/email';
import type { Event, FieldDefinition } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

/** 404 for missing/draft/archived events - guests must not learn they exist. */
function guestVisibleEvent(event: Event | undefined): Event {
	if (!event || event.status === 'draft' || event.status === 'archived') {
		error(404, 'Event not found');
	}
	return event;
}

/** Echo raw submitted values (keyed by input name) so the form re-renders prefilled. */
function echoValues(
	formData: FormData,
	fieldDefinitions: FieldDefinition[]
): Record<string, string | string[]> {
	const values: Record<string, string | string[]> = {
		guestName: String(formData.get('guestName') ?? ''),
		guestEmail: String(formData.get('guestEmail') ?? ''),
		response: String(formData.get('response') ?? ''),
		plusOnesAdults: String(formData.get('plusOnesAdults') ?? ''),
		plusOnesKids: String(formData.get('plusOnesKids') ?? ''),
		note: String(formData.get('note') ?? '')
	};
	for (const def of fieldDefinitions) {
		const name = fieldInputName(def.key);
		if (def.type === 'multiselect') {
			values[name] = formData.getAll(name).map(String);
		} else {
			const value = formData.get(name);
			if (value !== null) values[name] = String(value);
		}
	}
	for (let i = 0; i < MAX_DISH_ROWS; i++) {
		for (const part of ['item', 'category', 'serves', 'note']) {
			const value = formData.get(`dish_${part}_${i}`);
			if (value !== null) values[`dish_${part}_${i}`] = String(value);
		}
	}
	for (let i = 0; i < MAX_ALLERGY_ROWS; i++) {
		for (const name of [`allergen_${i}`, `allergen_other_${i}`, `severity_${i}`]) {
			const value = formData.get(name);
			if (value !== null) values[name] = String(value);
		}
	}
	return values;
}

export const load: PageServerLoad = async ({ params, url }) => {
	const event = guestVisibleEvent(await getEventBySlug(params.slug));

	const providedToken = url.searchParams.get('t');
	if (!publicTokenOk(event, providedToken)) {
		error(404, 'Event not found');
	}

	const windowState = rsvpWindowState(event);
	const fieldDefinitions = await listFieldDefinitions(event.id, true);
	const categories = await listDishCategories(event.id);
	const board = await buildDishBoard(event, {
		includeItems: event.showDishListPublic,
		includeNames: event.showDishContributorNames
	});
	const allergyDigest = await buildAllergyDigest(event);

	let spotsLeft: number | null = null;
	if (event.capacity != null) {
		const headcount = await yesHeadcount(event.id);
		spotsLeft = Math.max(0, event.capacity - headcount);
	}

	return {
		event,
		windowState,
		fieldDefinitions,
		categories,
		board,
		allergyDigest,
		spotsLeft,
		descriptionHtml: renderMarkdown(event.description),
		now: Date.now(),
		publicToken: event.publicToken ? providedToken : null,
		calendar: calendarHrefs(event, url.origin, providedToken),
		maxDishRows: MAX_DISH_ROWS,
		emailEnabled: emailEnabled()
	};
};

export const actions: Actions = {
	rsvp: async ({ params, request, url, getClientAddress }) => {
		const event = guestVisibleEvent(await getEventBySlug(params.slug));
		const formData = await request.formData();

		const rawToken = formData.get('t');
		if (!publicTokenOk(event, rawToken === null ? null : String(rawToken))) {
			error(404, 'Event not found');
		}

		const fieldDefinitions = await listFieldDefinitions(event.id, true);

		if (rsvpWindowState(event) !== 'open') {
			return fail(403, {
				errors: { form: 'RSVPs are not open for this event right now.' },
				values: echoValues(formData, fieldDefinitions)
			});
		}

		// Bots get silently waved through to a generic thanks page - nothing is written.
		if (looksLikeBot(formData)) {
			redirect(303, `/e/${params.slug}/thanks`);
		}

		const categories = await listDishCategories(event.id);
		const parsed = parseRsvpForm(event, fieldDefinitions, categories, formData);
		if (!parsed.success) {
			return fail(400, {
				errors: parsed.errors,
				values: echoValues(formData, fieldDefinitions)
			});
		}

		let clientIp: string | null = null;
		try {
			clientIp = getClientAddress();
		} catch {
			// no client address available (e.g. unusual proxy setups)
		}

		const result = await createRsvp(event, parsed.data, clientIp);
		if (!result.ok) {
			return fail(409, {
				errors: { response: `Sorry - only ${result.remaining} spot(s) left.` },
				values: echoValues(formData, fieldDefinitions)
			});
		}

		// Best-effort: sendEditLinkEmail catches its own errors and returns a boolean.
		if (parsed.data.guestEmail && emailEnabled()) {
			await sendEditLinkEmail({
				to: parsed.data.guestEmail,
				guestName: parsed.data.guestName,
				eventTitle: event.title,
				editUrl: `${url.origin}/e/${params.slug}/edit/${result.rsvp.editToken}`
			});
		}

		const tokenQS = event.publicToken ? `&t=${encodeURIComponent(event.publicToken)}` : '';
		redirect(
			303,
			`/e/${params.slug}/thanks?token=${encodeURIComponent(result.rsvp.editToken)}${tokenQS}`
		);
	}
};
