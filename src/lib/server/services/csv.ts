import type { DishContribution, FieldDefinition, Rsvp } from '$lib/server/db/schema';
import { displayFieldValue } from '$lib/fields/registry';

/** RFC 4180-ish escaping; also neutralizes spreadsheet formula injection. */
export function csvEscape(value: string): string {
	let v = value;
	if (/^[=+\-@\t]/.test(v)) v = `'${v}`;
	if (/[",\r\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
	return v;
}

export function csvLine(cells: string[]): string {
	return cells.map(csvEscape).join(',');
}

/**
 * Guest-list export: base RSVP columns + one column per custom field
 * + the guest's dish contributions.
 */
export function buildRsvpCsv(
	rows: Rsvp[],
	fieldDefinitions: FieldDefinition[],
	dishesByRsvp: Map<string, DishContribution[]>,
	trackKids: boolean
): string {
	const header = [
		'Name',
		'Email',
		'Response',
		'Status',
		...(trackKids ? ['Plus-one adults', 'Plus-one kids'] : ['Plus-ones']),
		'Party size',
		'Note',
		'Dishes',
		...fieldDefinitions.map((f) => f.label),
		'Submitted at',
		'Updated at'
	];

	const lines = [csvLine(header)];
	for (const rsvp of rows) {
		const dishes = (dishesByRsvp.get(rsvp.id) ?? [])
			.map((d) => (d.serves ? `${d.itemName} (serves ${d.serves})` : d.itemName))
			.join('; ');
		lines.push(
			csvLine([
				rsvp.guestName,
				rsvp.guestEmail ?? '',
				rsvp.response,
				rsvp.status,
				...(trackKids
					? [String(rsvp.plusOnesAdults), String(rsvp.plusOnesKids)]
					: [String(rsvp.plusOnesAdults + rsvp.plusOnesKids)]),
				String(rsvp.partySize),
				rsvp.note ?? '',
				dishes,
				...fieldDefinitions.map((f) => displayFieldValue(rsvp.fieldValues[f.key])),
				rsvp.createdAt.toISOString(),
				rsvp.updatedAt.toISOString()
			])
		);
	}
	return lines.join('\r\n') + '\r\n';
}
