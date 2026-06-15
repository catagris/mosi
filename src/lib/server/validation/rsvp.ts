import { z } from 'zod';
import type { DishCategory, Event, FieldDefinition, FieldValues } from '$lib/server/db/schema';
import { parseFieldValues, extractRawFieldValues } from './fields';
import {
	ALLERGEN_OTHER,
	ALLERGY_SEVERITY_VALUES,
	KNOWN_ALLERGENS,
	MAX_ALLERGY_ROWS,
	type AllergyEntry,
	type AllergySeverity
} from '$lib/allergens';

export type DishInput = {
	categoryId: string | null;
	itemName: string;
	serves: number | null;
	note: string | null;
};

export type RsvpInput = {
	guestName: string;
	guestEmail: string | null;
	response: 'yes' | 'no' | 'maybe';
	plusOnesAdults: number;
	plusOnesKids: number;
	note: string | null;
	fieldValues: FieldValues;
	dishes: DishInput[];
	allergies: AllergyEntry[];
};

export type RsvpParseResult =
	| { success: true; data: RsvpInput }
	| { success: false; errors: Record<string, string> };

export const MAX_DISH_ROWS = 10;
/** Bots submit instantly; humans need at least a couple of seconds. */
export const MIN_SUBMIT_MS = 2_000;
export const HONEYPOT_FIELD = 'website';

/** True when the submission trips the honeypot or the minimum-time check. */
export function looksLikeBot(formData: FormData, now = Date.now()): boolean {
	if (String(formData.get(HONEYPOT_FIELD) ?? '') !== '') return true;
	const startedAt = Number(formData.get('form_started_at') ?? 0);
	if (startedAt > 0 && now - startedAt < MIN_SUBMIT_MS) return true;
	return false;
}

/**
 * Parse + validate a guest RSVP submission against this event's configuration
 * (allow_maybe, max_plus_ones, track_kids, require_email) and its active
 * custom field definitions. Errors are keyed by input name.
 */
export function parseRsvpForm(
	event: Event,
	fieldDefinitions: FieldDefinition[],
	categories: DishCategory[],
	formData: FormData
): RsvpParseResult {
	const errors: Record<string, string> = {};

	const allowedResponses = event.allowMaybe ? (['yes', 'no', 'maybe'] as const) : (['yes', 'no'] as const);
	const baseSchema = z.object({
		guestName: z.string().trim().min(1, 'Your name is required').max(200, 'Name is too long'),
		guestEmail: event.requireEmail
			? z.string().trim().email('A valid email is required').max(254)
			: z
					.string()
					.trim()
					.max(254)
					.email('Enter a valid email or leave it blank')
					.nullable()
					.or(z.literal('').transform(() => null)),
		response: z.enum(allowedResponses as unknown as [string, ...string[]], {
			errorMap: () => ({ message: 'Pick a response' })
		}),
		plusOnesAdults: z.coerce
			.number()
			.int('Plus-ones must be a whole number')
			.min(0, 'Plus-ones cannot be negative')
			.max(event.maxPlusOnes, `At most ${event.maxPlusOnes} plus-one${event.maxPlusOnes === 1 ? '' : 's'} allowed`),
		plusOnesKids: z.coerce.number().int().min(0).max(event.maxPlusOnes),
		note: z
			.string()
			.trim()
			.max(2000, 'Note is too long')
			.transform((value) => (value === '' ? null : value))
	});

	const base = baseSchema.safeParse({
		guestName: String(formData.get('guestName') ?? ''),
		guestEmail: String(formData.get('guestEmail') ?? ''),
		response: String(formData.get('response') ?? ''),
		plusOnesAdults: String(formData.get('plusOnesAdults') ?? '0') || '0',
		plusOnesKids: event.trackKids ? String(formData.get('plusOnesKids') ?? '0') || '0' : '0',
		note: String(formData.get('note') ?? '')
	});

	if (!base.success) {
		for (const issue of base.error.issues) {
			const key = issue.path[0] != null ? String(issue.path[0]) : 'form';
			if (!errors[key]) errors[key] = issue.message;
		}
	}

	// Combined plus-ones cap applies across adults + kids. Each field is already
	// individually capped at maxPlusOnes above, so this only fires when both are
	// ≥1 and together exceed the cap — i.e. both contribute. Keying the message to
	// the (always-shown-first) adults field is therefore correct; a "kids-only"
	// overage is unreachable because kids alone over the cap fails the per-field rule.
	if (base.success) {
		const total = base.data.plusOnesAdults + base.data.plusOnesKids;
		if (total > event.maxPlusOnes) {
			errors.plusOnesAdults = `At most ${event.maxPlusOnes} plus-one${event.maxPlusOnes === 1 ? '' : 's'} in total`;
		}
	}

	// Custom fields - only required for attending responses ("no" skips them).
	const responseValue = base.success ? base.data.response : 'yes';
	let fieldValues: FieldValues = {};
	if (responseValue !== 'no') {
		const raw = extractRawFieldValues(formData, fieldDefinitions);
		const parsed = parseFieldValues(fieldDefinitions, raw);
		if (parsed.success) {
			fieldValues = parsed.data;
		} else {
			for (const [key, message] of Object.entries(parsed.errors)) {
				errors[`cf_${key}`] = message;
			}
		}
	}

	// Dish rows (bounded, fixed names - works without JS).
	const validCategoryIds = new Set(categories.map((c) => c.id));
	const dishes: DishInput[] = [];
	// Skip dish parsing entirely when the host isn't collecting dishes.
	for (let i = 0; event.collectDishes && i < MAX_DISH_ROWS; i++) {
		const itemName = String(formData.get(`dish_item_${i}`) ?? '').trim();
		if (!itemName) continue;
		if (itemName.length > 200) {
			errors[`dish_item_${i}`] = 'Name is too long';
			continue;
		}
		const rawCategory = String(formData.get(`dish_category_${i}`) ?? '').trim();
		const categoryId = rawCategory && validCategoryIds.has(rawCategory) ? rawCategory : null;
		const rawServes = String(formData.get(`dish_serves_${i}`) ?? '').trim();
		let serves: number | null = null;
		if (rawServes !== '') {
			const n = Number(rawServes);
			if (!Number.isInteger(n) || n < 1 || n > 1000) {
				errors[`dish_serves_${i}`] = 'Serves must be a positive whole number';
				continue;
			}
			serves = n;
		}
		const noteRaw = String(formData.get(`dish_note_${i}`) ?? '').trim();
		dishes.push({ categoryId, itemName, serves, note: noteRaw === '' ? null : noteRaw.slice(0, 500) });
	}

	// Allergy rows (bounded, fixed names - works without JS).
	const knownAllergens = new Set<string>(KNOWN_ALLERGENS);
	const validSeverities = new Set<string>(ALLERGY_SEVERITY_VALUES);
	const allergies: AllergyEntry[] = [];
	for (let i = 0; event.collectAllergies && i < MAX_ALLERGY_ROWS; i++) {
		const selected = String(formData.get(`allergen_${i}`) ?? '').trim();
		if (!selected) continue; // "- None -"
		let allergen: string;
		if (selected === ALLERGEN_OTHER) {
			allergen = String(formData.get(`allergen_other_${i}`) ?? '').trim();
			if (!allergen) continue; // "Other" with no text → nothing to record
			if (allergen.length > 100) {
				errors[`allergen_other_${i}`] = 'Keep this under 100 characters';
				continue;
			}
		} else if (knownAllergens.has(selected)) {
			allergen = selected;
		} else {
			continue; // unrecognized option → ignore
		}
		const rawSeverity = String(formData.get(`severity_${i}`) ?? '').trim();
		const severity = (validSeverities.has(rawSeverity) ? rawSeverity : 'allergy') as AllergySeverity;
		allergies.push({ allergen, severity });
	}

	if (Object.keys(errors).length > 0 || !base.success) {
		return { success: false, errors };
	}

	return {
		success: true,
		data: {
			guestName: base.data.guestName,
			guestEmail: (base.data.guestEmail as string | null) || null,
			response: base.data.response as 'yes' | 'no' | 'maybe',
			plusOnesAdults: base.data.plusOnesAdults,
			plusOnesKids: event.trackKids ? base.data.plusOnesKids : 0,
			note: base.data.note,
			fieldValues,
			dishes: responseValue === 'no' ? [] : dishes,
			allergies: responseValue === 'no' ? [] : allergies
		}
	};
}
