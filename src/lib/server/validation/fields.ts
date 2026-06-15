import { z } from 'zod';
import type { FieldDefinition, FieldValues, FieldValue } from '$lib/server/db/schema';

/**
 * Dynamic validation for the custom field engine.
 *
 * The authoritative server-side schema is built from `field_definitions` at
 * request time: unknown keys are stripped, option allowlists enforced, and
 * per-field errors returned keyed by field key.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_RE = /^[+()\-./\s\d]{5,25}$/;

const MAX_PATTERN_LENGTH = 200;
// A quantified group whose body itself contains a quantifier — e.g. (a+)+, (a*)* —
// the classic catastrophic-backtracking shape. Field patterns never need this.
const NESTED_QUANTIFIER_RE = /\([^)]*[+*][^)]*\)[+*{]/;

/**
 * Guard admin-supplied field patterns against ReDoS (the compiled regex runs on
 * guest input). Returns an error message when the pattern is unusable or risky,
 * else null. We cap length and reject nested quantifiers rather than trying to
 * time arbitrary regexes (Node can't interrupt a runaway synchronous match).
 */
export function checkPatternSafety(pattern: string): string | null {
	if (pattern.length > MAX_PATTERN_LENGTH) {
		return `Pattern must be at most ${MAX_PATTERN_LENGTH} characters`;
	}
	try {
		new RegExp(pattern);
	} catch {
		return 'Invalid regular expression';
	}
	if (NESTED_QUANTIFIER_RE.test(pattern)) {
		return 'Pattern is too complex (nested quantifiers can cause catastrophic backtracking)';
	}
	return null;
}

/**
 * True only for a real Gregorian calendar date in YYYY-MM-DD form within a sane
 * year range. JS `Date` silently rolls over impossible dates (2024-02-30 → Mar 1),
 * so we round-trip the parsed instant back to a string and require an exact match;
 * we also cap the year to reject absurd values like 9999-12-31.
 */
function isValidCalendarDate(val: string): boolean {
	const d = new Date(`${val}T00:00:00Z`);
	if (Number.isNaN(d.getTime())) return false;
	if (d.toISOString().slice(0, 10) !== val) return false;
	const year = d.getUTCFullYear();
	return year >= 1900 && year <= 2100;
}

function schemaForDefinition(def: FieldDefinition): z.ZodType<FieldValue> {
	const v = def.validation ?? {};
	const requiredMsg = `${def.label} is required`;

	switch (def.type) {
		case 'text':
		case 'textarea': {
			const maxLen = v.maxLength ?? (def.type === 'text' ? 500 : 5000);
			let base = z
				.string()
				.trim()
				.max(maxLen, { message: `${def.label} must be at most ${maxLen} characters` });
			if (def.required) base = base.min(1, { message: requiredMsg });
			let schema: z.ZodType<FieldValue> = def.required ? base : base.nullable();

			// Only honor a pattern that passes the ReDoS safety gate (defends against
			// pre-existing/DB-injected risky patterns too), and never run it on input
			// longer than the field's own max — the length check already rejects that,
			// so this just caps the work the regex does. Fail open otherwise.
			if (v.pattern && checkPatternSafety(v.pattern) === null) {
				const compiled = new RegExp(v.pattern);
				schema = schema.refine(
					(val) => typeof val !== 'string' || val.length > maxLen || compiled.test(val),
					{ message: v.patternMessage ?? `${def.label} has an invalid format` }
				);
			}
			return schema;
		}
		case 'number': {
			let s = z
				.number({ invalid_type_error: `${def.label} must be a number` })
				.finite({ message: `${def.label} must be a finite number` });
			if (v.min !== undefined) s = s.min(v.min, { message: `${def.label} must be ≥ ${v.min}` });
			if (v.max !== undefined) s = s.max(v.max, { message: `${def.label} must be ≤ ${v.max}` });
			return def.required ? s : s.nullable();
		}
		case 'select': {
			const options = def.options ?? [];
			const s = z
				.string()
				.refine((val) => options.includes(val), { message: `${def.label}: pick a valid option` });
			return def.required ? s : s.nullable();
		}
		case 'multiselect': {
			const options = def.options ?? [];
			let s = z.array(
				z
					.string()
					.refine((val) => options.includes(val), { message: `${def.label}: invalid option` })
			);
			if (def.required) s = s.min(1, { message: requiredMsg });
			return s;
		}
		case 'checkbox': {
			const s = z.boolean();
			return def.required
				? s.refine((val) => val === true, { message: `${def.label} must be checked` })
				: s;
		}
		case 'date': {
			const s = z
				.string()
				.regex(DATE_RE, { message: `${def.label} must be a date (YYYY-MM-DD)` })
				.refine((val) => isValidCalendarDate(val), {
					message: `${def.label} is not a valid date`
				});
			return def.required ? s : s.nullable();
		}
		case 'phone': {
			const s = z
				.string()
				.trim()
				.regex(PHONE_RE, { message: `${def.label} must be a valid phone number` });
			return def.required ? s : s.nullable();
		}
		case 'email': {
			const s = z
				.string()
				.trim()
				.email({ message: `${def.label} must be a valid email` })
				.max(254);
			return def.required ? s : s.nullable();
		}
	}
}

/**
 * Normalize a raw form/JSON value into the shape the Zod schema expects.
 * Handles FormData quirks: everything arrives as strings, checkboxes arrive
 * as "on" or are absent, optional empties become null.
 */
function normalizeRaw(def: FieldDefinition, raw: unknown): unknown {
	switch (def.type) {
		case 'checkbox':
			return raw === true || raw === 'on' || raw === 'true' || raw === '1';
		case 'number': {
			if (raw === undefined || raw === null || raw === '') return def.required ? undefined : null;
			if (typeof raw === 'number') return raw;
			const n = Number(String(raw).trim());
			// Non-finite parses ("Infinity", "1e999", "NaN") fall back to the raw
			// string so Zod yields the clean "must be a number" type error.
			return Number.isFinite(n) ? n : String(raw);
		}
		case 'multiselect': {
			if (raw === undefined || raw === null || raw === '') return [];
			if (Array.isArray(raw)) return raw.map(String);
			return [String(raw)];
		}
		default: {
			if (raw === undefined || raw === null) return def.required ? '' : null;
			const s = String(raw).trim();
			if (s === '' && !def.required) return null;
			return s;
		}
	}
}

export type FieldParseResult =
	| { success: true; data: FieldValues }
	| { success: false; errors: Record<string, string> };

/**
 * Validate raw custom-field input against the active definitions.
 * Unknown keys in `raw` are ignored (stripped); errors are keyed by field key.
 */
export function parseFieldValues(
	definitions: FieldDefinition[],
	raw: Record<string, unknown>
): FieldParseResult {
	const active = definitions.filter((d) => d.active);
	const data: FieldValues = {};
	const errors: Record<string, string> = {};

	for (const def of active) {
		const normalized = normalizeRaw(def, raw[def.key]);
		const result = schemaForDefinition(def).safeParse(normalized);
		if (result.success) {
			data[def.key] = result.data;
		} else {
			errors[def.key] = result.error.issues[0]?.message ?? `${def.label} is invalid`;
		}
	}

	if (Object.keys(errors).length > 0) return { success: false, errors };
	return { success: true, data };
}

/** Form input name for a custom field (namespaced to avoid collisions). */
export function fieldInputName(key: string): string {
	return `cf_${key}`;
}

/** Pull raw custom-field values out of a submitted FormData. */
export function extractRawFieldValues(
	formData: FormData,
	definitions: FieldDefinition[]
): Record<string, unknown> {
	const raw: Record<string, unknown> = {};
	for (const def of definitions) {
		if (!def.active) continue;
		const name = fieldInputName(def.key);
		if (def.type === 'multiselect') {
			raw[def.key] = formData.getAll(name).map(String);
		} else {
			const value = formData.get(name);
			raw[def.key] = value === null ? undefined : String(value);
		}
	}
	return raw;
}
