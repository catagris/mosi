import { describe, it, expect } from 'vitest';
import { csvEscape, csvLine, buildRsvpCsv } from '$lib/server/services/csv';
import type { DishContribution, FieldDefinition, Rsvp } from '$lib/server/db/schema';

describe('csvEscape', () => {
	it('passes plain values through untouched', () => {
		expect(csvEscape('plain value')).toBe('plain value');
		expect(csvEscape('')).toBe('');
	});

	it('doubles embedded quotes and wraps in quotes', () => {
		expect(csvEscape('has "quotes"')).toBe('"has ""quotes"""');
	});

	it('quotes values containing commas or newlines', () => {
		expect(csvEscape('a,b')).toBe('"a,b"');
		expect(csvEscape('line\nbreak')).toBe('"line\nbreak"');
		expect(csvEscape('cr\rhere')).toBe('"cr\rhere"');
	});

	it('neutralizes spreadsheet formula injection with a leading apostrophe', () => {
		expect(csvEscape('=SUM(A1)')).toBe("'=SUM(A1)");
		expect(csvEscape('+x')).toBe("'+x");
		expect(csvEscape('-x')).toBe("'-x");
		expect(csvEscape('@x')).toBe("'@x");
		expect(csvEscape('\tx')).toBe("'\tx");
	});

	it('applies both formula prefixing and quoting when needed', () => {
		expect(csvEscape('=cmd,arg')).toBe('"\'=cmd,arg"');
	});

	it('does not prefix values where the dangerous char is not leading', () => {
		expect(csvEscape('a=b')).toBe('a=b');
		expect(csvEscape('1-2')).toBe('1-2');
	});
});

describe('csvLine', () => {
	it('joins escaped cells with commas', () => {
		expect(csvLine(['a', 'b,c', '=x'])).toBe('a,"b,c",\'=x');
	});
});

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

function makeRsvp(overrides: Partial<Rsvp> = {}): Rsvp {
	return {
		id: 'rsvp-1',
		eventId: 'event-1',
		editToken: 'tok',
		response: 'yes',
		guestName: 'Ada',
		guestEmail: 'ada@example.com',
		plusOnesAdults: 1,
		plusOnesKids: 2,
		partySize: 4,
		fieldValues: {},
		note: null,
		status: 'active',
		ipHash: null,
		createdAt: new Date('2026-06-01T10:00:00Z'),
		updatedAt: new Date('2026-06-02T11:30:00Z'),
		...overrides
	} as Rsvp;
}

function makeDish(overrides: Partial<DishContribution> = {}): DishContribution {
	return {
		id: 'dish-1',
		rsvpId: 'rsvp-1',
		categoryId: null,
		itemName: 'Lasagna',
		serves: null,
		note: null,
		visible: true,
		editedByAdmin: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	} as DishContribution;
}

describe('buildRsvpCsv', () => {
	it('ends every line with CRLF including the final one', () => {
		const csv = buildRsvpCsv([makeRsvp()], [], new Map(), true);
		expect(csv.endsWith('\r\n')).toBe(true);
		expect(csv.split('\r\n')).toHaveLength(3); // header + row + trailing empty
		expect(csv.replace(/\r\n/g, '')).not.toContain('\n');
	});

	it('includes custom field labels in the header, in order', () => {
		const fields = [
			makeField({ key: 'plate', label: 'License plate', type: 'text' }),
			makeField({ key: 'diet', label: 'Dietary needs', type: 'multiselect', options: ['vegan', 'gf'] })
		];
		const header = buildRsvpCsv([], fields, new Map(), true).split('\r\n')[0];
		expect(header).toBe(
			'Name,Email,Response,Status,Plus-one adults,Plus-one kids,Party size,Note,Dishes,' +
				'License plate,Dietary needs,Submitted at,Updated at'
		);
	});

	it('uses split plus-one columns when trackKids and a combined column otherwise', () => {
		const rsvp = makeRsvp({ plusOnesAdults: 1, plusOnesKids: 2 });
		const withKids = buildRsvpCsv([rsvp], [], new Map(), true).split('\r\n');
		expect(withKids[0]).toContain('Plus-one adults,Plus-one kids');
		expect(withKids[1].split(',').slice(4, 6)).toEqual(['1', '2']);

		const without = buildRsvpCsv([rsvp], [], new Map(), false).split('\r\n');
		expect(without[0]).toContain(',Plus-ones,');
		expect(without[0]).not.toContain('Plus-one adults');
		expect(without[1].split(',')[4]).toBe('3'); // adults + kids summed
	});

	it('renders custom field values via displayFieldValue', () => {
		const fields = [
			makeField({ key: 'diet', label: 'Diet', type: 'multiselect', options: ['vegan', 'gf'] }),
			makeField({ key: 'agree', label: 'Agreed', type: 'checkbox' }),
			makeField({ key: 'blank', label: 'Blank', type: 'text' })
		];
		const rsvp = makeRsvp({ fieldValues: { diet: ['vegan', 'gf'], agree: true, blank: null } });
		const row = buildRsvpCsv([rsvp], fields, new Map(), true).split('\r\n')[1];
		expect(row).toContain('"vegan, gf"');
		expect(row).toContain('Yes');
		const cells = row.split(',');
		// Blank custom field renders as an empty cell before the timestamps.
		expect(cells[cells.length - 3]).toBe('');
	});

	it('joins dishes with serves annotations', () => {
		const dishes = new Map([
			['rsvp-1', [makeDish({ itemName: 'Lasagna', serves: 8 }), makeDish({ id: 'dish-2', itemName: 'Rolls' })]]
		]);
		const row = buildRsvpCsv([makeRsvp()], [], dishes, true).split('\r\n')[1];
		expect(row).toContain('Lasagna (serves 8); Rolls');
	});

	it('escapes hostile guest data', () => {
		const rsvp = makeRsvp({ guestName: '=HYPERLINK("http://evil")', note: 'hi, "you"', guestEmail: null });
		const row = buildRsvpCsv([rsvp], [], new Map(), true).split('\r\n')[1];
		expect(row.startsWith('"\'=HYPERLINK(""http://evil"")"')).toBe(true);
		expect(row).toContain('"hi, ""you"""');
	});

	it('emits ISO timestamps', () => {
		const row = buildRsvpCsv([makeRsvp()], [], new Map(), true).split('\r\n')[1];
		expect(row).toContain('2026-06-01T10:00:00.000Z');
		expect(row).toContain('2026-06-02T11:30:00.000Z');
	});
});
