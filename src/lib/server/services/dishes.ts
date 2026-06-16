import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import {
	dishCategories,
	dishContributions,
	rsvps,
	type DishCategory,
	type DishContribution,
	type Event
} from '$lib/server/db/schema';

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function createDishCategory(input: {
	eventId: string;
	name: string;
	description?: string | null;
	targetCount?: number | null;
	sortOrder?: number;
}): Promise<DishCategory> {
	const [row] = await getDb().insert(dishCategories).values(input).returning();
	return row;
}

export async function updateDishCategory(
	id: string,
	eventId: string,
	patch: Partial<Pick<DishCategory, 'name' | 'description' | 'targetCount' | 'sortOrder'>>
): Promise<DishCategory | undefined> {
	const [row] = await getDb()
		.update(dishCategories)
		.set(patch)
		.where(and(eq(dishCategories.id, id), eq(dishCategories.eventId, eventId)))
		.returning();
	return row;
}

export async function deleteDishCategory(id: string, eventId: string): Promise<void> {
	await getDb()
		.delete(dishCategories)
		.where(and(eq(dishCategories.id, id), eq(dishCategories.eventId, eventId)));
}

/**
 * Persist a drag/move reorder: category ids in their new display order. The
 * `eventId` guard means foreign ids are silently ignored (can't reorder another
 * event's categories). The guest dish step + admin board already sort by
 * `sortOrder`, so this is the single source of truth for ordering.
 */
export async function reorderDishCategories(eventId: string, orderedIds: string[]): Promise<void> {
	const db = getDb();
	await db.transaction(async (tx) => {
		for (let i = 0; i < orderedIds.length; i++) {
			await tx
				.update(dishCategories)
				.set({ sortOrder: i })
				.where(and(eq(dishCategories.id, orderedIds[i]), eq(dishCategories.eventId, eventId)));
		}
	});
}

// ---------------------------------------------------------------------------
// Dish board (public + admin views)
// ---------------------------------------------------------------------------

export type DishBoardItem = {
	id: string;
	itemName: string;
	serves: number | null;
	note: string | null;
	contributorName: string | null;
};

export type DishBoardCategory = {
	category: DishCategory | null; // null bucket = "Other"
	claimed: number;
	target: number | null;
	items: DishBoardItem[];
};

/**
 * Aggregate the dish board: per category, target vs claimed, and -
 * when the event allows - the visible items list (contributor names only when
 * show_dish_contributor_names).
 */
export async function buildDishBoard(
	event: Event,
	options: { includeItems: boolean; includeNames: boolean; includeHidden?: boolean }
): Promise<DishBoardCategory[]> {
	const db = getDb();
	const categories = await db
		.select()
		.from(dishCategories)
		.where(eq(dishCategories.eventId, event.id))
		.orderBy(asc(dishCategories.sortOrder), asc(dishCategories.createdAt));

	const contributions = await db
		.select({ dish: dishContributions, guestName: rsvps.guestName, rsvpStatus: rsvps.status })
		.from(dishContributions)
		.innerJoin(rsvps, eq(dishContributions.rsvpId, rsvps.id))
		.where(eq(rsvps.eventId, event.id))
		.orderBy(asc(dishContributions.createdAt));

	const live = contributions.filter(
		(c) => c.rsvpStatus === 'active' && (options.includeHidden || c.dish.visible)
	);

	const byCategory = new Map<string | null, DishBoardItem[]>();
	for (const { dish, guestName } of live) {
		const key = dish.categoryId ?? null;
		if (!byCategory.has(key)) byCategory.set(key, []);
		byCategory.get(key)!.push({
			id: dish.id,
			itemName: dish.itemName,
			serves: dish.serves,
			note: dish.note,
			contributorName: options.includeNames ? guestName : null
		});
	}

	const board: DishBoardCategory[] = categories.map((category) => ({
		category,
		claimed: byCategory.get(category.id)?.length ?? 0,
		target: category.targetCount,
		items: options.includeItems ? (byCategory.get(category.id) ?? []) : []
	}));

	const uncategorized = byCategory.get(null) ?? [];
	if (uncategorized.length > 0) {
		board.push({
			category: null,
			claimed: uncategorized.length,
			target: null,
			items: options.includeItems ? uncategorized : []
		});
	}

	return board;
}

// ---------------------------------------------------------------------------
// Moderation (admin hide/edit any contribution)
// ---------------------------------------------------------------------------

/**
 * Resolve a single contribution scoped to an event (guards cross-event ids). The
 * join + WHERE pushes the filter into Postgres instead of scanning every event dish
 * in JS for each moderation action.
 */
export async function getDishInEvent(
	dishId: string,
	eventId: string
): Promise<DishContribution | undefined> {
	const [row] = await getDb()
		.select({ dish: dishContributions })
		.from(dishContributions)
		.innerJoin(rsvps, eq(dishContributions.rsvpId, rsvps.id))
		.where(and(eq(dishContributions.id, dishId), eq(rsvps.eventId, eventId)))
		.limit(1);
	return row?.dish;
}

export async function setDishVisibility(id: string, visible: boolean): Promise<void> {
	await getDb()
		.update(dishContributions)
		.set({ visible, editedByAdmin: true, updatedAt: new Date() })
		.where(eq(dishContributions.id, id));
}

export async function adminEditDish(
	id: string,
	patch: Partial<Pick<DishContribution, 'itemName' | 'serves' | 'note' | 'categoryId'>>
): Promise<DishContribution | undefined> {
	const [row] = await getDb()
		.update(dishContributions)
		.set({ ...patch, editedByAdmin: true, updatedAt: new Date() })
		.where(eq(dishContributions.id, id))
		.returning();
	return row;
}

export async function deleteDishContribution(id: string): Promise<void> {
	await getDb().delete(dishContributions).where(eq(dishContributions.id, id));
}
