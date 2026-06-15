import { describe, it, expect } from 'vitest';
import {
	parseFieldValues,
	extractRawFieldValues,
	fieldInputName,
	checkPatternSafety
} from '$lib/server/validation/fields';
import type { FieldDefinition } from '$lib/server/db/schema';

function def(
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
		createdAt: new Date('2026-01-01T00:00:00Z'),
		updatedAt: new Date('2026-01-01T00:00:00Z'),
		...partial
	} as FieldDefinition;
}

function expectError(result: ReturnType<typeof parseFieldValues>, key: string): string {
	expect(result.success).toBe(false);
	if (result.success) throw new Error('expected failure');
	expect(result.errors[key]).toBeTruthy();
	return result.errors[key];
}

function expectData(result: ReturnType<typeof parseFieldValues>) {
	expect(result.success).toBe(true);
	if (!result.success) throw new Error(`expected success, got ${JSON.stringify(result.errors)}`);
	return result.data;
}

describe('fieldInputName', () => {
	it('namespaces the key with cf_', () => {
		expect(fieldInputName('plate')).toBe('cf_plate');
	});
});

describe('parseFieldValues - text', () => {
	it('accepts and trims a required text value', () => {
		const data = expectData(
			parseFieldValues([def({ key: 't', label: 'T', type: 'text', required: true })], {
				t: '  hello  '
			})
		);
		expect(data.t).toBe('hello');
	});

	it('rejects a missing required text value with a message keyed by field key', () => {
		const msg = expectError(
			parseFieldValues([def({ key: 't', label: 'Plate', type: 'text', required: true })], {}),
			't'
		);
		expect(msg).toBe('Plate is required');
	});

	it('rejects an empty-string required text value', () => {
		expectError(
			parseFieldValues([def({ key: 't', label: 'Plate', type: 'text', required: true })], {
				t: ''
			}),
			't'
		);
	});

	it('optional text: empty string and whitespace normalize to null', () => {
		const d = def({ key: 't', label: 'Plate', type: 'text' });
		expect(expectData(parseFieldValues([d], { t: '' })).t).toBeNull();
		expect(expectData(parseFieldValues([d], { t: '   ' })).t).toBeNull();
		expect(expectData(parseFieldValues([d], {})).t).toBeNull();
	});

	it('optional text with a value passes', () => {
		const data = expectData(
			parseFieldValues([def({ key: 't', label: 'T', type: 'text' })], { t: 'abc' })
		);
		expect(data.t).toBe('abc');
	});

	it('enforces maxLength', () => {
		const d = def({
			key: 't',
			label: 'T',
			type: 'text',
			required: true,
			validation: { maxLength: 5 }
		});
		expect(expectError(parseFieldValues([d], { t: 'abcdef' }), 't')).toContain('at most 5');
		expect(expectData(parseFieldValues([d], { t: 'abcde' })).t).toBe('abcde');
	});

	it('defaults maxLength to 500 for text and 5000 for textarea', () => {
		const text = def({ key: 't', label: 'T', type: 'text', required: true });
		const area = def({ key: 'a', label: 'A', type: 'textarea', required: true });
		expectError(parseFieldValues([text], { t: 'x'.repeat(501) }), 't');
		expect(expectData(parseFieldValues([area], { a: 'x'.repeat(501) })).a).toHaveLength(501);
		expectError(parseFieldValues([area], { a: 'x'.repeat(5001) }), 'a');
	});

	it('enforces pattern with patternMessage', () => {
		const d = def({
			key: 't',
			label: 'T',
			type: 'text',
			required: true,
			validation: { pattern: '^[A-Z]{3}$', patternMessage: 'Must be three capitals' }
		});
		expect(expectError(parseFieldValues([d], { t: 'abc' }), 't')).toBe('Must be three capitals');
		expect(expectData(parseFieldValues([d], { t: 'ABC' })).t).toBe('ABC');
	});

	it('falls back to a default pattern message when patternMessage is unset', () => {
		const d = def({
			key: 't',
			label: 'Code',
			type: 'text',
			required: true,
			validation: { pattern: '^\\d+$' }
		});
		expect(expectError(parseFieldValues([d], { t: 'abc' }), 't')).toBe(
			'Code has an invalid format'
		);
	});

	it('fails open when the admin-supplied regex is invalid', () => {
		const d = def({
			key: 't',
			label: 'T',
			type: 'text',
			required: true,
			validation: { pattern: '([' }
		});
		expect(expectData(parseFieldValues([d], { t: 'anything goes' })).t).toBe('anything goes');
	});

	it('fails open for an unsafe (nested-quantifier) pattern instead of running it', () => {
		const d = def({
			key: 't',
			label: 'T',
			type: 'text',
			required: true,
			validation: { pattern: '(a+)+$' }
		});
		expect(expectData(parseFieldValues([d], { t: 'anything' })).t).toBe('anything');
	});
});

describe('checkPatternSafety (ReDoS guard)', () => {
	it('accepts simple, safe patterns', () => {
		expect(checkPatternSafety('^[A-Z]{3}$')).toBeNull();
		expect(checkPatternSafety('^\\d{5}(-\\d{4})?$')).toBeNull();
		expect(checkPatternSafety('^[a-z0-9._%-]+@[a-z0-9.-]+$')).toBeNull();
	});

	it('rejects nested quantifiers (catastrophic backtracking)', () => {
		expect(checkPatternSafety('(a+)+$')).toMatch(/complex|nested/i);
		expect(checkPatternSafety('(a*)*')).toMatch(/complex|nested/i);
		expect(checkPatternSafety('(\\d+)+')).toMatch(/complex|nested/i);
	});

	it('rejects over-long patterns', () => {
		expect(checkPatternSafety('a'.repeat(201))).toMatch(/200/);
	});

	it('rejects invalid regex syntax', () => {
		expect(checkPatternSafety('([')).toMatch(/Invalid/);
	});
});

describe('parseFieldValues - number', () => {
	const base = def({ key: 'n', label: 'Spots', type: 'number' });

	it('coerces numeric strings', () => {
		expect(expectData(parseFieldValues([{ ...base, required: true }], { n: '42' })).n).toBe(42);
		expect(expectData(parseFieldValues([{ ...base, required: true }], { n: ' 3.5 ' })).n).toBe(3.5);
	});

	it('accepts a real number value', () => {
		expect(expectData(parseFieldValues([{ ...base, required: true }], { n: 7 })).n).toBe(7);
	});

	it('rejects non-numeric input with a type message', () => {
		expect(expectError(parseFieldValues([{ ...base, required: true }], { n: 'abc' }), 'n')).toBe(
			'Spots must be a number'
		);
	});

	it('optional number: empty → null', () => {
		expect(expectData(parseFieldValues([base], { n: '' })).n).toBeNull();
		expect(expectData(parseFieldValues([base], {})).n).toBeNull();
	});

	it('required number: empty fails', () => {
		expectError(parseFieldValues([{ ...base, required: true }], { n: '' }), 'n');
	});

	it('enforces min and max', () => {
		const d = { ...base, required: true, validation: { min: 0, max: 10 } };
		expect(expectError(parseFieldValues([d], { n: '-1' }), 'n')).toContain('≥ 0');
		expect(expectError(parseFieldValues([d], { n: '11' }), 'n')).toContain('≤ 10');
		expect(expectData(parseFieldValues([d], { n: '10' })).n).toBe(10);
		expect(expectData(parseFieldValues([d], { n: '0' })).n).toBe(0);
	});

	it('rejects non-finite values (Infinity, overflow, NaN) as a type error', () => {
		const d = { ...base, required: true };
		for (const raw of ['Infinity', '-Infinity', '1e999', 'NaN']) {
			expect(expectError(parseFieldValues([d], { n: raw }), 'n')).toContain('must be a');
		}
		// A literal non-finite number value is also rejected (not just strings).
		expect(expectError(parseFieldValues([d], { n: Infinity }), 'n')).toContain('finite');
	});

	it('still accepts large finite numbers', () => {
		expect(expectData(parseFieldValues([{ ...base, required: true }], { n: '1000000' })).n).toBe(
			1000000
		);
	});
});

describe('parseFieldValues - select', () => {
	const d = def({ key: 's', label: 'Size', type: 'select', options: ['S', 'M', 'L'] });

	it('accepts an allowed option', () => {
		expect(expectData(parseFieldValues([d], { s: 'M' })).s).toBe('M');
	});

	it('rejects an option outside the allowlist', () => {
		expect(expectError(parseFieldValues([d], { s: 'XL' }), 's')).toBe('Size: pick a valid option');
	});

	it('optional select: empty → null', () => {
		expect(expectData(parseFieldValues([d], { s: '' })).s).toBeNull();
	});

	it('required select: missing fails', () => {
		expectError(parseFieldValues([{ ...d, required: true }], {}), 's');
	});
});

describe('parseFieldValues - multiselect', () => {
	const d = def({
		key: 'm',
		label: 'Colors',
		type: 'multiselect',
		options: ['red', 'green', 'blue']
	});

	it('accepts an array of allowed options', () => {
		expect(expectData(parseFieldValues([d], { m: ['red', 'blue'] })).m).toEqual(['red', 'blue']);
	});

	it('wraps a scalar into a single-element array', () => {
		expect(expectData(parseFieldValues([d], { m: 'green' })).m).toEqual(['green']);
	});

	it('rejects any option outside the allowlist', () => {
		expect(expectError(parseFieldValues([d], { m: ['red', 'purple'] }), 'm')).toBe(
			'Colors: invalid option'
		);
	});

	it('optional multiselect: empty → []', () => {
		expect(expectData(parseFieldValues([d], { m: '' })).m).toEqual([]);
		expect(expectData(parseFieldValues([d], {})).m).toEqual([]);
	});

	it('required multiselect: empty fails with the required message', () => {
		expect(expectError(parseFieldValues([{ ...d, required: true }], {}), 'm')).toBe(
			'Colors is required'
		);
	});
});

describe('parseFieldValues - checkbox', () => {
	const d = def({ key: 'c', label: 'Agree', type: 'checkbox' });

	it("treats 'on', 'true', '1' and true as checked", () => {
		for (const raw of ['on', 'true', '1', true]) {
			expect(expectData(parseFieldValues([d], { c: raw })).c).toBe(true);
		}
	});

	it('treats absence and other values as unchecked', () => {
		expect(expectData(parseFieldValues([d], {})).c).toBe(false);
		expect(expectData(parseFieldValues([d], { c: 'off' })).c).toBe(false);
		expect(expectData(parseFieldValues([d], { c: '' })).c).toBe(false);
	});

	it('required checkbox must be checked', () => {
		expect(expectError(parseFieldValues([{ ...d, required: true }], {}), 'c')).toBe(
			'Agree must be checked'
		);
		expect(expectData(parseFieldValues([{ ...d, required: true }], { c: 'on' })).c).toBe(true);
	});
});

describe('parseFieldValues - date', () => {
	const d = def({ key: 'd', label: 'Arrival', type: 'date' });

	it('accepts YYYY-MM-DD', () => {
		expect(expectData(parseFieldValues([d], { d: '2026-01-15' })).d).toBe('2026-01-15');
	});

	it('rejects non-ISO formats', () => {
		expect(expectError(parseFieldValues([d], { d: '15/01/2026' }), 'd')).toContain('YYYY-MM-DD');
		expectError(parseFieldValues([d], { d: '2026-1-5' }), 'd');
	});

	it('rejects calendar-impossible dates that pass the regex', () => {
		expect(expectError(parseFieldValues([d], { d: '2026-13-45' }), 'd')).toBe(
			'Arrival is not a valid date'
		);
	});

	it('rejects rollover dates that JS silently advances (2024-02-30 → Mar 1)', () => {
		expect(expectError(parseFieldValues([d], { d: '2024-02-30' }), 'd')).toBe(
			'Arrival is not a valid date'
		);
		expect(expectError(parseFieldValues([d], { d: '2023-02-29' }), 'd')).toBe(
			'Arrival is not a valid date'
		);
		expect(expectError(parseFieldValues([d], { d: '2026-04-31' }), 'd')).toBe(
			'Arrival is not a valid date'
		);
	});

	it('accepts a real leap day but rejects absurd years', () => {
		expect(expectData(parseFieldValues([d], { d: '2024-02-29' })).d).toBe('2024-02-29');
		expectError(parseFieldValues([d], { d: '9999-12-31' }), 'd');
		expectError(parseFieldValues([d], { d: '0001-01-01' }), 'd');
	});

	it('optional date: empty → null', () => {
		expect(expectData(parseFieldValues([d], { d: '' })).d).toBeNull();
	});

	it('required date: missing fails', () => {
		expectError(parseFieldValues([{ ...d, required: true }], {}), 'd');
	});
});

describe('parseFieldValues - phone', () => {
	const d = def({ key: 'p', label: 'Phone', type: 'phone' });

	it('accepts common phone formats', () => {
		expect(expectData(parseFieldValues([d], { p: '+1 (555) 123-4567' })).p).toBe(
			'+1 (555) 123-4567'
		);
		expect(expectData(parseFieldValues([d], { p: '555.123.4567' })).p).toBe('555.123.4567');
	});

	it('rejects letters and too-short values', () => {
		expect(expectError(parseFieldValues([d], { p: 'call me' }), 'p')).toBe(
			'Phone must be a valid phone number'
		);
		expectError(parseFieldValues([d], { p: '123' }), 'p');
	});

	it('optional phone: empty → null', () => {
		expect(expectData(parseFieldValues([d], { p: '' })).p).toBeNull();
	});
});

describe('parseFieldValues - email', () => {
	const d = def({ key: 'e', label: 'Email', type: 'email' });

	it('accepts a valid email and trims it', () => {
		expect(expectData(parseFieldValues([d], { e: ' a@b.com ' })).e).toBe('a@b.com');
	});

	it('rejects invalid emails', () => {
		expect(expectError(parseFieldValues([d], { e: 'nope' }), 'e')).toBe(
			'Email must be a valid email'
		);
	});

	it('optional email: empty → null', () => {
		expect(expectData(parseFieldValues([d], { e: '' })).e).toBeNull();
	});
});

describe('parseFieldValues - structural behavior', () => {
	it('strips unknown keys from the input', () => {
		const data = expectData(
			parseFieldValues([def({ key: 'known', label: 'K', type: 'text', required: true })], {
				known: 'yes',
				hacker: 'DROP TABLE',
				__proto__x: 'nope'
			})
		);
		expect(Object.keys(data)).toEqual(['known']);
	});

	it('skips inactive definitions entirely (even required ones)', () => {
		const data = expectData(
			parseFieldValues(
				[
					def({ key: 'gone', label: 'Gone', type: 'text', required: true, active: false }),
					def({ key: 'here', label: 'Here', type: 'text', required: true })
				],
				{ here: 'value' }
			)
		);
		expect(data).toEqual({ here: 'value' });
	});

	it('collects errors for every failing field keyed by field key', () => {
		const result = parseFieldValues(
			[
				def({ key: 'a', label: 'A', type: 'text', required: true }),
				def({ key: 'b', label: 'B', type: 'number', required: true }),
				def({ key: 'c', label: 'C', type: 'text', required: true })
			],
			{ b: 'NaN-ish', c: 'fine' }
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(Object.keys(result.errors).sort()).toEqual(['a', 'b']);
		}
	});

	it('returns an empty data object for no definitions', () => {
		expect(expectData(parseFieldValues([], { junk: 1 }))).toEqual({});
	});
});

describe('extractRawFieldValues', () => {
	const defs = [
		def({ key: 'name', label: 'N', type: 'text' }),
		def({ key: 'colors', label: 'C', type: 'multiselect', options: ['x', 'y', 'z'] }),
		def({ key: 'agree', label: 'A', type: 'checkbox' }),
		def({ key: 'hidden', label: 'H', type: 'text', active: false })
	];

	it('reads namespaced cf_ inputs from FormData', () => {
		const fd = new FormData();
		fd.set('cf_name', 'Ada');
		fd.append('cf_colors', 'x');
		fd.append('cf_colors', 'z');
		fd.set('cf_agree', 'on');
		const raw = extractRawFieldValues(fd, defs);
		expect(raw.name).toBe('Ada');
		expect(raw.colors).toEqual(['x', 'z']);
		expect(raw.agree).toBe('on');
	});

	it('maps absent scalar inputs to undefined and absent multiselects to []', () => {
		const raw = extractRawFieldValues(new FormData(), defs);
		expect(raw.name).toBeUndefined();
		expect(raw.colors).toEqual([]);
		expect(raw.agree).toBeUndefined();
	});

	it('skips inactive definitions', () => {
		const fd = new FormData();
		fd.set('cf_hidden', 'sneaky');
		const raw = extractRawFieldValues(fd, defs);
		expect('hidden' in raw).toBe(false);
	});

	it('round-trips with parseFieldValues', () => {
		const fd = new FormData();
		fd.set('cf_name', 'Ada');
		fd.append('cf_colors', 'y');
		const raw = extractRawFieldValues(fd, defs.slice(0, 3));
		const data = expectData(parseFieldValues(defs.slice(0, 3), raw));
		expect(data).toEqual({ name: 'Ada', colors: ['y'], agree: false });
	});
});
