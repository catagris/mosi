import { error, fail } from '@sveltejs/kit';
import {
	getEventBySlug,
	listDishCategories,
	listFieldDefinitions,
	rsvpWindowState
} from '$lib/server/services/events';
import {
	getRsvpByEditToken,
	listDishesForRsvp,
	updateRsvp,
	withdrawRsvp
} from '$lib/server/services/rsvps';
import { parseRsvpForm, MAX_DISH_ROWS } from '$lib/server/validation/rsvp';
import { ALLERGEN_OTHER, KNOWN_ALLERGENS, MAX_ALLERGY_ROWS } from '$lib/allergens';
import { fieldInputName } from '$lib/server/validation/fields';
import { calendarHrefs } from '$lib/calendar';
import { emailEnabled } from '$lib/server/email';
import type { DishContribution, Event, FieldDefinition, Rsvp } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * The edit token itself is the secret - no public token gate here, but the
 * RSVP must belong to the event in the URL.
 */
async function requireRsvp(params: { slug: string; editToken: string }): Promise<{
	event: Event;
	rsvp: Rsvp;
}> {
	const rsvp = await getRsvpByEditToken(params.editToken);
	if (!rsvp) error(404, 'RSVP not found');
	const event = await getEventBySlug(params.slug);
	if (!event || rsvp.eventId !== event.id) error(404, 'RSVP not found');
	return { event, rsvp };
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

/** Stored RSVP → prefill record keyed by input name (same shape echoValues produces). */
function prefillFromRsvp(
	rsvp: Rsvp,
	dishes: DishContribution[],
	fieldDefinitions: FieldDefinition[]
): Record<string, string | string[]> {
	const values: Record<string, string | string[]> = {
		guestName: rsvp.guestName,
		guestEmail: rsvp.guestEmail ?? '',
		response: rsvp.response,
		plusOnesAdults: String(rsvp.plusOnesAdults),
		plusOnesKids: String(rsvp.plusOnesKids),
		note: rsvp.note ?? ''
	};
	for (const def of fieldDefinitions) {
		const value = rsvp.fieldValues[def.key];
		if (value === undefined || value === null) continue;
		const name = fieldInputName(def.key);
		if (Array.isArray(value)) {
			values[name] = value.map(String);
		} else if (typeof value === 'boolean') {
			if (value) values[name] = 'on';
		} else {
			values[name] = String(value);
		}
	}
	dishes.slice(0, MAX_DISH_ROWS).forEach((dish, i) => {
		values[`dish_item_${i}`] = dish.itemName;
		values[`dish_category_${i}`] = dish.categoryId ?? '';
		values[`dish_serves_${i}`] = dish.serves != null ? String(dish.serves) : '';
		values[`dish_note_${i}`] = dish.note ?? '';
	});
	rsvp.allergies.slice(0, MAX_ALLERGY_ROWS).forEach((a, i) => {
		const known = (KNOWN_ALLERGENS as readonly string[]).includes(a.allergen);
		values[`allergen_${i}`] = known ? a.allergen : ALLERGEN_OTHER;
		values[`allergen_other_${i}`] = known ? '' : a.allergen;
		values[`severity_${i}`] = a.severity;
	});
	return values;
}

export const load: PageServerLoad = async ({ params, url }) => {
	const { event, rsvp } = await requireRsvp(params);
	const fieldDefinitions = await listFieldDefinitions(event.id, true);
	const categories = await listDishCategories(event.id);
	const dishes = await listDishesForRsvp(rsvp.id);

	// Never serialize the event's public token to a guest who only has an edit token.
	const { publicToken: _publicToken, ...publicEvent } = event;

	// The edit token authorizes the .ics endpoint and is embedded in the calendar
	// description; providedToken is null so the public token isn't exposed here.
	const calendar = calendarHrefs(event, url.origin, null, params.editToken);

	return {
		event: publicEvent,
		calendar,
		rsvp: {
			status: rsvp.status,
			response: rsvp.response,
			guestName: rsvp.guestName,
			partySize: rsvp.partySize,
			note: rsvp.note
		},
		fieldDefinitions,
		categories,
		dishes: dishes.map((dish) => ({
			itemName: dish.itemName,
			serves: dish.serves,
			note: dish.note
		})),
		windowState: rsvpWindowState(event),
		values: prefillFromRsvp(rsvp, dishes, fieldDefinitions),
		maxDishRows: MAX_DISH_ROWS,
		emailEnabled: emailEnabled()
	};
};

export const actions: Actions = {
	update: async ({ params, request }) => {
		const { event, rsvp } = await requireRsvp(params);
		const formData = await request.formData();
		const fieldDefinitions = await listFieldDefinitions(event.id, true);

		if (rsvpWindowState(event) !== 'open') {
			return fail(403, {
				errors: { form: 'RSVP changes are closed for this event.' },
				values: echoValues(formData, fieldDefinitions)
			});
		}

		const categories = await listDishCategories(event.id);
		const parsed = parseRsvpForm(event, fieldDefinitions, categories, formData);
		if (!parsed.success) {
			return fail(400, {
				errors: parsed.errors,
				values: echoValues(formData, fieldDefinitions)
			});
		}

		const result = await updateRsvp(event, rsvp, parsed.data);
		if (!result.ok) {
			return fail(409, {
				errors: { response: `Sorry - only ${result.remaining} spot(s) left.` },
				values: echoValues(formData, fieldDefinitions)
			});
		}

		return { saved: true };
	},

	withdraw: async ({ params }) => {
		const { event, rsvp } = await requireRsvp(params);

		if (rsvpWindowState(event) !== 'open') {
			return fail(403, {
				errors: { form: 'RSVP changes are closed for this event.' }
			});
		}

		await withdrawRsvp(event, rsvp);
		return { withdrawn: true };
	}
};
