import { describe, it, expect } from 'vitest';
import { keyFromLabel, displayFieldValue } from '$lib/fields/registry';
import { slugify } from '$lib/server/services/events';
import { hexToRgbTriplet, themeStyle } from '$lib/theme';

describe('keyFromLabel', () => {
	it('derives a snake_case machine key from a human label', () => {
		expect(keyFromLabel('License plate(s) for parking')).toBe('license_plate_s_for_parking');
		expect(keyFromLabel('Dietary needs?')).toBe('dietary_needs');
		expect(keyFromLabel('  T-Shirt Size  ')).toBe('t_shirt_size');
	});

	it("falls back to 'field' when nothing survives", () => {
		expect(keyFromLabel('')).toBe('field');
		expect(keyFromLabel('!!!')).toBe('field');
		expect(keyFromLabel('   ')).toBe('field');
	});

	it('truncates to 64 characters', () => {
		expect(keyFromLabel('a'.repeat(100))).toBe('a'.repeat(64));
		expect(keyFromLabel('word '.repeat(40)).length).toBeLessThanOrEqual(64);
	});
});

describe('displayFieldValue', () => {
	it('joins arrays with a comma', () => {
		expect(displayFieldValue(['vegan', 'gf'])).toBe('vegan, gf');
		expect(displayFieldValue([])).toBe('');
	});

	it('renders booleans as Yes/No', () => {
		expect(displayFieldValue(true)).toBe('Yes');
		expect(displayFieldValue(false)).toBe('No');
	});

	it('renders null/undefined/empty-string as empty', () => {
		expect(displayFieldValue(null)).toBe('');
		expect(displayFieldValue(undefined)).toBe('');
		expect(displayFieldValue('')).toBe('');
	});

	it('stringifies numbers and strings (including 0)', () => {
		expect(displayFieldValue(42)).toBe('42');
		expect(displayFieldValue(0)).toBe('0');
		expect(displayFieldValue('ABC123')).toBe('ABC123');
	});
});

describe('slugify', () => {
	it('lowercases, strips apostrophes and dashes the rest', () => {
		expect(slugify("Summer BBQ '26!")).toBe('summer-bbq-26');
		expect(slugify('Bob’s Party')).toBe('bobs-party');
		expect(slugify('  Trim Me  ')).toBe('trim-me');
	});

	it('collapses runs of punctuation into single dashes and trims them', () => {
		expect(slugify('Hello --- World!!!')).toBe('hello-world');
		expect(slugify('--leading & trailing--')).toBe('leading-trailing');
	});

	it("falls back to 'event' when nothing survives", () => {
		expect(slugify('')).toBe('event');
		expect(slugify('!!!')).toBe('event');
		expect(slugify("'''")).toBe('event');
	});

	it('truncates to 60 characters', () => {
		expect(slugify('a'.repeat(80))).toBe('a'.repeat(60));
		expect(slugify('word '.repeat(30)).length).toBeLessThanOrEqual(60);
	});
});

describe('hexToRgbTriplet', () => {
	it('converts 6-digit hex colors to an RGB triplet', () => {
		expect(hexToRgbTriplet('#7c3aed')).toBe('124 58 237');
		expect(hexToRgbTriplet('#FFFFFF')).toBe('255 255 255');
		expect(hexToRgbTriplet('#000000')).toBe('0 0 0');
	});

	it('accepts the hash-less form and trims whitespace', () => {
		expect(hexToRgbTriplet('7c3aed')).toBe('124 58 237');
		expect(hexToRgbTriplet('  #7c3aed  ')).toBe('124 58 237');
	});

	it('returns null for anything else', () => {
		expect(hexToRgbTriplet('#fff')).toBe(null);
		expect(hexToRgbTriplet('red')).toBe(null);
		expect(hexToRgbTriplet('#7c3aeg')).toBe(null);
		expect(hexToRgbTriplet('')).toBe(null);
		expect(hexToRgbTriplet('#7c3aed00')).toBe(null);
	});
});

describe('themeStyle', () => {
	it('builds CSS variable declarations from the theme', () => {
		expect(themeStyle({ primaryColor: '#7c3aed', accent: '#22c55e' })).toBe(
			'--color-primary: 124 58 237; --color-accent: 34 197 94'
		);
	});

	it('includes a sanitized font variable', () => {
		expect(themeStyle({ font: "Inter, 'Comic Sans MS'" })).toBe("--font-event: Inter, 'Comic Sans MS'");
	});

	it('strips characters that could escape the declaration', () => {
		expect(themeStyle({ font: 'Inter; } body { background: url(x)' })).toBe(
			'--font-event: Inter  body  background urlx'
		);
	});

	it('returns an empty string for an empty/null theme', () => {
		expect(themeStyle({})).toBe('');
		expect(themeStyle(null)).toBe('');
		expect(themeStyle(undefined)).toBe('');
	});

	it('falls back to fallbackPrimary when the theme has no primary color', () => {
		expect(themeStyle(null, '#000000')).toBe('--color-primary: 0 0 0');
		expect(themeStyle({ primaryColor: '#ffffff' }, '#000000')).toBe('--color-primary: 255 255 255');
	});

	it('skips invalid colors instead of emitting garbage', () => {
		expect(themeStyle({ primaryColor: 'not-a-color', accent: '#22c55e' })).toBe('--color-accent: 34 197 94');
		expect(themeStyle({ primaryColor: 'nope' })).toBe('');
	});
});
