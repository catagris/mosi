import { describe, it, expect } from 'vitest';
import {
	parseRsvpForm,
	looksLikeBot,
	MAX_DISH_ROWS,
	MIN_SUBMIT_MS,
	HONEYPOT_FIELD
} from '$lib/server/validation/rsvp';
import type { DishCategory, Event, FieldDefinition } from '$lib/server/db/schema';

function makeEvent(overrides: Partial<Event> = {}): Event {
	return {
		id: 'event-1',
		slug: 'summer-bbq',
		title: 'Summer BBQ',
		capacity: null,
		maxPlusOnes: 5,
		trackKids: true,
		allowMaybe: true,
		requireEmail: false,
		collectDishes: true,
		dishShowCategory: true,
		dishShowServes: true,
		dishShowNote: true,
		collectAllergies: true,
		...overrides
	} as Event;
}

function makeField(
	partial: Partial<FieldDefinition> & Pick<FieldDefinition, 'key' | 'label' | 'type'>
): FieldDefinition {
	return {
		id: `field-${partial.key}`,
		eventId: 'event-1',
		helpText: null,
		options: null,
		required: false,
		validation: null,
		sortOrder: 0,
		active: true,
		createdAt: new Date(),
		updatedAt: new Date(),
		...partial
	} as FieldDefinition;
}

const CATEGORIES: DishCategory[] = [
	{
		id: 'cat-mains',
		eventId: 'event-1',
		name: 'Mains',
		description: null,
		targetCount: null,
		sortOrder: 0,
		createdAt: new Date()
	} as DishCategory
];

function form(entries: Record<string, string | string[]>): FormData {
	const fd = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		if (Array.isArray(value)) {
			for (const v of value) fd.append(key, v);
		} else {
			fd.set(key, value);
		}
	}
	return fd;
}

function baseForm(extra: Record<string, string | string[]> = {}): FormData {
	return form({ guestName: 'Ada Lovelace', response: 'yes', ...extra });
}

function expectOk(result: ReturnType<typeof parseRsvpForm>) {
	expect(result.success).toBe(true);
	if (!result.success) throw new Error(`expected success, got ${JSON.stringify(result.errors)}`);
	return result.data;
}

function expectErrors(result: ReturnType<typeof parseRsvpForm>) {
	expect(result.success).toBe(false);
	if (result.success) throw new Error('expected failure');
	return result.errors;
}

describe('parseRsvpForm - base fields', () => {
	it('parses a minimal valid yes RSVP', () => {
		const data = expectOk(parseRsvpForm(makeEvent(), [], [], baseForm()));
		expect(data).toEqual({
			guestName: 'Ada Lovelace',
			guestEmail: null,
			response: 'yes',
			plusOnesAdults: 0,
			plusOnesKids: 0,
			note: null,
			fieldValues: {},
			dishes: [],
			allergies: []
		});
	});

	it('requires a guest name', () => {
		const errors = expectErrors(parseRsvpForm(makeEvent(), [], [], form({ response: 'yes' })));
		expect(errors.guestName).toBe('Your name is required');
	});

	it('rejects names over 200 characters', () => {
		const errors = expectErrors(
			parseRsvpForm(makeEvent(), [], [], form({ guestName: 'x'.repeat(201), response: 'yes' }))
		);
		expect(errors.guestName).toBe('Name is too long');
	});

	it('rejects an unknown response value', () => {
		const errors = expectErrors(parseRsvpForm(makeEvent(), [], [], baseForm({ response: 'perhaps' })));
		expect(errors.response).toBe('Pick a response');
	});

	it('trims and nullifies an empty note, keeps a real one', () => {
		expect(expectOk(parseRsvpForm(makeEvent(), [], [], baseForm({ note: '   ' }))).note).toBeNull();
		expect(expectOk(parseRsvpForm(makeEvent(), [], [], baseForm({ note: ' hi ' }))).note).toBe('hi');
	});

	it('rejects notes over 2000 characters', () => {
		const errors = expectErrors(parseRsvpForm(makeEvent(), [], [], baseForm({ note: 'x'.repeat(2001) })));
		expect(errors.note).toBe('Note is too long');
	});
});

describe('parseRsvpForm - allowMaybe', () => {
	it("rejects 'maybe' when allowMaybe is false", () => {
		const errors = expectErrors(
			parseRsvpForm(makeEvent({ allowMaybe: false }), [], [], baseForm({ response: 'maybe' }))
		);
		expect(errors.response).toBe('Pick a response');
	});

	it("accepts 'maybe' when allowMaybe is true", () => {
		const data = expectOk(parseRsvpForm(makeEvent({ allowMaybe: true }), [], [], baseForm({ response: 'maybe' })));
		expect(data.response).toBe('maybe');
	});

	it("still accepts 'yes' and 'no' when allowMaybe is false", () => {
		const event = makeEvent({ allowMaybe: false });
		expect(expectOk(parseRsvpForm(event, [], [], baseForm({ response: 'yes' }))).response).toBe('yes');
		expect(expectOk(parseRsvpForm(event, [], [], baseForm({ response: 'no' }))).response).toBe('no');
	});
});

describe('parseRsvpForm - email', () => {
	it('requireEmail: empty email fails', () => {
		const errors = expectErrors(parseRsvpForm(makeEvent({ requireEmail: true }), [], [], baseForm()));
		expect(errors.guestEmail).toBe('A valid email is required');
	});

	it('requireEmail: invalid email fails', () => {
		const errors = expectErrors(
			parseRsvpForm(makeEvent({ requireEmail: true }), [], [], baseForm({ guestEmail: 'nope' }))
		);
		expect(errors.guestEmail).toBe('A valid email is required');
	});

	it('requireEmail: valid email passes', () => {
		const data = expectOk(
			parseRsvpForm(makeEvent({ requireEmail: true }), [], [], baseForm({ guestEmail: ' ada@example.com ' }))
		);
		expect(data.guestEmail).toBe('ada@example.com');
	});

	it('optional email: blank becomes null, valid value kept, garbage rejected', () => {
		const event = makeEvent({ requireEmail: false });
		expect(expectOk(parseRsvpForm(event, [], [], baseForm({ guestEmail: '' }))).guestEmail).toBeNull();
		expect(expectOk(parseRsvpForm(event, [], [], baseForm({ guestEmail: 'a@b.com' }))).guestEmail).toBe('a@b.com');
		const errors = expectErrors(parseRsvpForm(event, [], [], baseForm({ guestEmail: 'not-an-email' })));
		expect(errors.guestEmail).toBeTruthy();
	});
});

describe('parseRsvpForm - plus-ones', () => {
	it('caps individual adults at maxPlusOnes', () => {
		const errors = expectErrors(
			parseRsvpForm(makeEvent({ maxPlusOnes: 2 }), [], [], baseForm({ plusOnesAdults: '3' }))
		);
		expect(errors.plusOnesAdults).toBe('At most 2 plus-ones allowed');
	});

	it('uses the singular form for maxPlusOnes = 1', () => {
		const errors = expectErrors(
			parseRsvpForm(makeEvent({ maxPlusOnes: 1 }), [], [], baseForm({ plusOnesAdults: '2' }))
		);
		expect(errors.plusOnesAdults).toBe('At most 1 plus-one allowed');
	});

	it('caps adults + kids combined at maxPlusOnes', () => {
		const errors = expectErrors(
			parseRsvpForm(
				makeEvent({ maxPlusOnes: 2, trackKids: true }),
				[],
				[],
				baseForm({ plusOnesAdults: '2', plusOnesKids: '1' })
			)
		);
		expect(errors.plusOnesAdults).toBe('At most 2 plus-ones in total');
	});

	it('a kids-only overage is caught by the per-field cap, not the combined message', () => {
		// kids alone over the cap can't reach the combined check (per-field cap fires first).
		const errors = expectErrors(
			parseRsvpForm(
				makeEvent({ maxPlusOnes: 2, trackKids: true }),
				[],
				[],
				baseForm({ plusOnesAdults: '0', plusOnesKids: '3' })
			)
		);
		expect(errors.plusOnesKids).toBeDefined();
		expect(errors.plusOnesAdults).toBeUndefined();
	});

	it('accepts an exact combined fit', () => {
		const data = expectOk(
			parseRsvpForm(
				makeEvent({ maxPlusOnes: 3, trackKids: true }),
				[],
				[],
				baseForm({ plusOnesAdults: '2', plusOnesKids: '1' })
			)
		);
		expect(data.plusOnesAdults).toBe(2);
		expect(data.plusOnesKids).toBe(1);
	});

	it('zeroes kids when trackKids is false even if submitted', () => {
		const data = expectOk(
			parseRsvpForm(
				makeEvent({ maxPlusOnes: 5, trackKids: false }),
				[],
				[],
				baseForm({ plusOnesAdults: '2', plusOnesKids: '4' })
			)
		);
		expect(data.plusOnesKids).toBe(0);
		expect(data.plusOnesAdults).toBe(2);
	});

	it('rejects negative and fractional plus-ones', () => {
		expect(
			expectErrors(parseRsvpForm(makeEvent(), [], [], baseForm({ plusOnesAdults: '-1' }))).plusOnesAdults
		).toBe('Plus-ones cannot be negative');
		expect(
			expectErrors(parseRsvpForm(makeEvent(), [], [], baseForm({ plusOnesAdults: '1.5' }))).plusOnesAdults
		).toBe('Plus-ones must be a whole number');
	});

	it('treats missing plus-one inputs as 0', () => {
		const data = expectOk(parseRsvpForm(makeEvent(), [], [], baseForm()));
		expect(data.plusOnesAdults).toBe(0);
		expect(data.plusOnesKids).toBe(0);
	});
});

describe('parseRsvpForm - custom fields', () => {
	const requiredField = makeField({ key: 'plate', label: 'License plate', type: 'text', required: true });

	it('validates custom fields for attending responses, errors prefixed cf_', () => {
		const errors = expectErrors(parseRsvpForm(makeEvent(), [requiredField], [], baseForm()));
		expect(errors.cf_plate).toBe('License plate is required');
	});

	it('collects custom field values on success', () => {
		const data = expectOk(parseRsvpForm(makeEvent(), [requiredField], [], baseForm({ cf_plate: 'ABC123' })));
		expect(data.fieldValues).toEqual({ plate: 'ABC123' });
	});

	it("skips custom-field validation entirely for response 'no'", () => {
		const data = expectOk(parseRsvpForm(makeEvent(), [requiredField], [], baseForm({ response: 'no' })));
		expect(data.fieldValues).toEqual({});
	});

	it("still validates custom fields for 'maybe'", () => {
		const errors = expectErrors(parseRsvpForm(makeEvent(), [requiredField], [], baseForm({ response: 'maybe' })));
		expect(errors.cf_plate).toBeTruthy();
	});
});

describe('parseRsvpForm - dishes', () => {
	it('keeps a valid category id and parses serves', () => {
		const data = expectOk(
			parseRsvpForm(
				makeEvent(),
				[],
				CATEGORIES,
				baseForm({ dish_item_0: 'Lasagna', dish_category_0: 'cat-mains', dish_serves_0: '8' })
			)
		);
		expect(data.dishes).toEqual([{ categoryId: 'cat-mains', itemName: 'Lasagna', serves: 8, note: null }]);
	});

	it('maps an unknown category id to null', () => {
		const data = expectOk(
			parseRsvpForm(makeEvent(), [], CATEGORIES, baseForm({ dish_item_0: 'Salad', dish_category_0: 'cat-bogus' }))
		);
		expect(data.dishes[0].categoryId).toBeNull();
	});

	it('rejects non-positive, fractional and oversized serves', () => {
		for (const bad of ['0', '-2', '2.5', '1001', 'lots']) {
			const errors = expectErrors(
				parseRsvpForm(makeEvent(), [], CATEGORIES, baseForm({ dish_item_0: 'Pie', dish_serves_0: bad }))
			);
			expect(errors.dish_serves_0).toBe('Serves must be a positive whole number');
		}
	});

	it('treats blank serves as null', () => {
		const data = expectOk(parseRsvpForm(makeEvent(), [], CATEGORIES, baseForm({ dish_item_0: 'Pie' })));
		expect(data.dishes[0].serves).toBeNull();
	});

	it('truncates dish notes to 500 characters and nullifies empty ones', () => {
		const data = expectOk(
			parseRsvpForm(
				makeEvent(),
				[],
				CATEGORIES,
				baseForm({ dish_item_0: 'Pie', dish_note_0: 'n'.repeat(600), dish_item_1: 'Cake', dish_note_1: '  ' })
			)
		);
		expect(data.dishes[0].note).toHaveLength(500);
		expect(data.dishes[1].note).toBeNull();
	});

	it('skips rows with an empty item name without breaking later rows', () => {
		const data = expectOk(
			parseRsvpForm(makeEvent(), [], CATEGORIES, baseForm({ dish_item_0: 'First', dish_item_2: 'Third' }))
		);
		expect(data.dishes.map((d) => d.itemName)).toEqual(['First', 'Third']);
	});

	it('rejects dish names over 200 characters', () => {
		const errors = expectErrors(
			parseRsvpForm(makeEvent(), [], CATEGORIES, baseForm({ dish_item_0: 'x'.repeat(201) }))
		);
		expect(errors.dish_item_0).toBe('Name is too long');
	});

	it(`ignores rows at or beyond MAX_DISH_ROWS (${MAX_DISH_ROWS})`, () => {
		const entries: Record<string, string> = {};
		for (let i = 0; i < MAX_DISH_ROWS + 3; i++) entries[`dish_item_${i}`] = `Dish ${i}`;
		const data = expectOk(parseRsvpForm(makeEvent(), [], CATEGORIES, baseForm(entries)));
		expect(data.dishes).toHaveLength(MAX_DISH_ROWS);
		expect(data.dishes.at(-1)?.itemName).toBe(`Dish ${MAX_DISH_ROWS - 1}`);
	});

	it("drops dishes for response 'no'", () => {
		const data = expectOk(
			parseRsvpForm(makeEvent(), [], CATEGORIES, baseForm({ response: 'no', dish_item_0: 'Lasagna' }))
		);
		expect(data.dishes).toEqual([]);
	});

	it('ignores dish input entirely when the event does not collect dishes', () => {
		const data = expectOk(
			parseRsvpForm(
				makeEvent({ collectDishes: false }),
				[],
				CATEGORIES,
				baseForm({ dish_item_0: 'Lasagna', dish_serves_0: '8' })
			)
		);
		expect(data.dishes).toEqual([]);
	});
});

describe('parseRsvpForm - allergies', () => {
	it('parses a known allergen with its severity', () => {
		const data = expectOk(
			parseRsvpForm(
				makeEvent(),
				[],
				[],
				baseForm({ allergen_0: 'Peanuts', severity_0: 'severe' })
			)
		);
		expect(data.allergies).toEqual([{ allergen: 'Peanuts', severity: 'severe' }]);
	});

	it('uses the free-text value when "Other" is selected', () => {
		const data = expectOk(
			parseRsvpForm(
				makeEvent(),
				[],
				[],
				baseForm({ allergen_0: 'other', allergen_other_0: 'no pork (halal)', severity_0: 'religious' })
			)
		);
		expect(data.allergies).toEqual([{ allergen: 'no pork (halal)', severity: 'religious' }]);
	});

	it('skips "Other" with no text, and skips "- None -" rows', () => {
		const data = expectOk(
			parseRsvpForm(
				makeEvent(),
				[],
				[],
				baseForm({
					allergen_0: 'other',
					allergen_other_0: '   ',
					severity_0: 'allergy',
					allergen_1: '',
					severity_1: 'allergy'
				})
			)
		);
		expect(data.allergies).toEqual([]);
	});

	it('defaults an unknown/missing severity to "allergy"', () => {
		const data = expectOk(
			parseRsvpForm(makeEvent(), [], [], baseForm({ allergen_0: 'Soy', severity_0: 'bogus' }))
		);
		expect(data.allergies).toEqual([{ allergen: 'Soy', severity: 'allergy' }]);
	});

	it('ignores an unrecognized allergen option', () => {
		const data = expectOk(
			parseRsvpForm(makeEvent(), [], [], baseForm({ allergen_0: 'Plutonium', severity_0: 'severe' }))
		);
		expect(data.allergies).toEqual([]);
	});

	it('rejects an "Other" value over 100 characters', () => {
		const errors = expectErrors(
			parseRsvpForm(
				makeEvent(),
				[],
				[],
				baseForm({ allergen_0: 'other', allergen_other_0: 'x'.repeat(101), severity_0: 'allergy' })
			)
		);
		expect(errors.allergen_other_0).toBe('Keep this under 100 characters');
	});

	it('skips allergy parsing when the host is not collecting them', () => {
		const data = expectOk(
			parseRsvpForm(
				makeEvent({ collectAllergies: false }),
				[],
				[],
				baseForm({ allergen_0: 'Peanuts', severity_0: 'severe' })
			)
		);
		expect(data.allergies).toEqual([]);
	});

	it('drops allergies for a "no" response', () => {
		const data = expectOk(
			parseRsvpForm(
				makeEvent(),
				[],
				[],
				baseForm({ response: 'no', allergen_0: 'Peanuts', severity_0: 'severe' })
			)
		);
		expect(data.allergies).toEqual([]);
	});
});

describe('looksLikeBot', () => {
	const NOW = 1_750_000_000_000;

	it('flags a filled honeypot', () => {
		expect(looksLikeBot(form({ [HONEYPOT_FIELD]: 'http://spam.example' }), NOW)).toBe(true);
	});

	it('ignores an empty honeypot', () => {
		expect(looksLikeBot(form({ [HONEYPOT_FIELD]: '' }), NOW)).toBe(false);
	});

	it('flags a submission faster than the minimum time', () => {
		const fd = form({ form_started_at: String(NOW - (MIN_SUBMIT_MS - 1)) });
		expect(looksLikeBot(fd, NOW)).toBe(true);
	});

	it('allows a submission older than the minimum time', () => {
		const fd = form({ form_started_at: String(NOW - 10_000) });
		expect(looksLikeBot(fd, NOW)).toBe(false);
	});

	it('allows submissions with no timing field at all', () => {
		expect(looksLikeBot(new FormData(), NOW)).toBe(false);
	});
});
