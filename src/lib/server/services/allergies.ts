import { and, eq, ne } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { rsvps, type Event } from '$lib/server/db/schema';
import { aggregateAllergies, type AllergyDigest } from '$lib/allergens';

/**
 * Aggregate every guest's declared allergies/dietary needs for an event into a
 * de-duplicated "what to avoid" digest. Withdrawn RSVPs are excluded; the pure
 * de-dup/severity/sort logic lives in {@link aggregateAllergies} (unit-tested).
 */
export async function buildAllergyDigest(event: Event): Promise<AllergyDigest[]> {
	if (!event.collectAllergies) return [];

	const rows = await getDb()
		.select({ allergies: rsvps.allergies })
		.from(rsvps)
		.where(and(eq(rsvps.eventId, event.id), ne(rsvps.status, 'withdrawn')));

	return aggregateAllergies(rows.map((row) => row.allergies ?? []));
}
