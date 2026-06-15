import { and, eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { withUniqueRetry } from '$lib/server/db/errors';
import {
	fieldDefinitions,
	type FieldDefinition,
	type NewFieldDefinition
} from '$lib/server/db/schema';
import { keyFromLabel } from '$lib/fields/registry';
import { listFieldDefinitions } from './events';

/** Derive a key from the label, de-duplicating within the event. */
export async function uniqueFieldKey(eventId: string, label: string, excludeId?: string): Promise<string> {
	const existing = await listFieldDefinitions(eventId);
	const taken = new Set(existing.filter((f) => f.id !== excludeId).map((f) => f.key));
	const base = keyFromLabel(label);
	for (let i = 0; ; i++) {
		const candidate = i === 0 ? base : `${base}_${i + 1}`;
		if (!taken.has(candidate)) return candidate;
	}
}

export async function createFieldDefinition(input: NewFieldDefinition): Promise<FieldDefinition> {
	const [row] = await getDb().insert(fieldDefinitions).values(input).returning();
	return row;
}

/**
 * Create a field, deriving a unique key from `label` and transparently retrying if
 * a concurrent create grabbed the same (event_id, key) first (see `withUniqueRetry`).
 */
export async function createFieldWithUniqueKey(
	eventId: string,
	label: string,
	rest: Omit<NewFieldDefinition, 'eventId' | 'key' | 'label'>
): Promise<FieldDefinition> {
	return withUniqueRetry(async () =>
		createFieldDefinition({ eventId, label, key: await uniqueFieldKey(eventId, label), ...rest })
	);
}

export async function updateFieldDefinition(
	id: string,
	eventId: string,
	patch: Partial<NewFieldDefinition>
): Promise<FieldDefinition | undefined> {
	const [row] = await getDb()
		.update(fieldDefinitions)
		.set({ ...patch, updatedAt: new Date() })
		.where(and(eq(fieldDefinitions.id, id), eq(fieldDefinitions.eventId, eventId)))
		.returning();
	return row;
}

export async function deleteFieldDefinition(id: string, eventId: string): Promise<void> {
	await getDb()
		.delete(fieldDefinitions)
		.where(and(eq(fieldDefinitions.id, id), eq(fieldDefinitions.eventId, eventId)));
}

/** Persist a drag-reorder: ids in their new display order. */
export async function reorderFieldDefinitions(eventId: string, orderedIds: string[]): Promise<void> {
	const db = getDb();
	await db.transaction(async (tx) => {
		for (let i = 0; i < orderedIds.length; i++) {
			await tx
				.update(fieldDefinitions)
				.set({ sortOrder: i, updatedAt: new Date() })
				.where(and(eq(fieldDefinitions.id, orderedIds[i]), eq(fieldDefinitions.eventId, eventId)));
		}
	});
}
