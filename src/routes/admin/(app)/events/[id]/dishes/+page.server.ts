import { error, fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards';
import { getEvent, listDishCategories } from '$lib/server/services/events';
import {
	adminEditDish,
	buildDishBoard,
	createDishCategory,
	deleteDishCategory,
	deleteDishContribution,
	getDishInEvent,
	reorderDishCategories,
	setDishVisibility,
	updateDishCategory
} from '$lib/server/services/dishes';
import { listDishesForEvent } from '$lib/server/services/rsvps';
import type { Event } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	requireUser(locals);
	const { event } = await parent();
	const [categories, board, contributions] = await Promise.all([
		listDishCategories(event.id),
		buildDishBoard(event, { includeItems: false, includeNames: false, includeHidden: true }),
		listDishesForEvent(event.id)
	]);

	const claimedByCategory: Record<string, number> = {};
	for (const entry of board) {
		if (entry.category) claimedByCategory[entry.category.id] = entry.claimed;
	}

	return {
		categories,
		claimedByCategory,
		// Strip the joined RSVP row down to what the moderation table needs (no edit tokens).
		contributions: contributions.map((c) => ({
			id: c.id,
			categoryId: c.categoryId,
			itemName: c.itemName,
			serves: c.serves,
			note: c.note,
			visible: c.visible,
			editedByAdmin: c.editedByAdmin,
			guestName: c.rsvp.guestName,
			rsvpStatus: c.rsvp.status
		}))
	};
};

async function loadEvent(id: string): Promise<Event> {
	const event = await getEvent(id);
	if (!event) error(404, 'Event not found');
	return event;
}

function text(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

type CategoryParse = {
	values: Record<string, string>;
	errors: Record<string, string>;
	name: string;
	description: string | null;
	targetCount: number | null;
};

function parseCategoryForm(form: FormData): CategoryParse {
	const values = {
		name: text(form, 'name'),
		description: text(form, 'description'),
		target_count: text(form, 'target_count')
	};
	const errors: Record<string, string> = {};
	if (!values.name) errors.name = 'Name is required';
	let targetCount: number | null = null;
	if (values.target_count !== '') {
		const n = Number(values.target_count);
		if (Number.isInteger(n) && n >= 0) targetCount = n;
		else errors.target_count = 'Enter a whole number, or leave empty';
	}
	return { values, errors, name: values.name, description: values.description || null, targetCount };
}

export const actions: Actions = {
	createCategory: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		const parsed = parseCategoryForm(await request.formData());
		if (Object.keys(parsed.errors).length > 0) {
			return fail(400, { category: { id: null, errors: parsed.errors, values: parsed.values } });
		}
		const categories = await listDishCategories(event.id);
		await createDishCategory({
			eventId: event.id,
			name: parsed.name,
			description: parsed.description,
			targetCount: parsed.targetCount,
			sortOrder: categories.length
		});
		return { dishSaved: true };
	},

	updateCategory: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const parsed = parseCategoryForm(form);
		if (!id || Object.keys(parsed.errors).length > 0) {
			return fail(400, {
				category: { id: id || null, errors: parsed.errors, values: parsed.values }
			});
		}
		const updated = await updateDishCategory(id, event.id, {
			name: parsed.name,
			description: parsed.description,
			targetCount: parsed.targetCount
		});
		if (!updated) {
			return fail(404, {
				category: {
					id,
					errors: { name: 'Category not found' } as Record<string, string>,
					values: parsed.values
				}
			});
		}
		return { dishSaved: true };
	},

	deleteCategory: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		await deleteDishCategory(id, event.id);
		return { dishSaved: true };
	},

	// Drag-to-reorder: the client posts the full id order (comma-separated).
	reorderCategories: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		const form = await request.formData();
		const orderedIds = String(form.get('order') ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		if (orderedIds.length > 0) await reorderDishCategories(event.id, orderedIds);
		return { dishSaved: true };
	},

	// Up/down buttons (touch + keyboard fallback for the drag handle).
	moveCategory: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const direction = String(form.get('direction') ?? '');
		const orderedIds = (await listDishCategories(event.id)).map((c) => c.id);
		const index = orderedIds.indexOf(id);
		if (index === -1) return fail(404, { dish: null });
		const target = direction === 'up' ? index - 1 : index + 1;
		if (target < 0 || target >= orderedIds.length) return { dishSaved: true };
		[orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];
		await reorderDishCategories(event.id, orderedIds);
		return { dishSaved: true };
	},

	toggleVisible: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const dish = await getDishInEvent(id, event.id);
		if (!dish) return fail(404, { dish: null });
		await setDishVisibility(id, form.get('visible') === 'true');
		return { dishSaved: true };
	},

	recategorize: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const dish = await getDishInEvent(id, event.id);
		if (!dish) return fail(404, { dish: null });
		const categoryId = text(form, 'category_id') || null;
		if (categoryId) {
			const categories = await listDishCategories(event.id);
			if (!categories.some((c) => c.id === categoryId)) return fail(400, { dish: null });
		}
		await adminEditDish(id, { categoryId });
		return { dishSaved: true };
	},

	updateDish: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const dish = await getDishInEvent(id, event.id);
		if (!dish) return fail(404, { dish: null });

		const values = {
			item_name: text(form, 'item_name'),
			serves: text(form, 'serves'),
			note: text(form, 'note'),
			category_id: text(form, 'category_id')
		};
		const errors: Record<string, string> = {};
		if (!values.item_name) errors.item_name = 'Item name is required';
		let serves: number | null = null;
		if (values.serves !== '') {
			const n = Number(values.serves);
			if (Number.isInteger(n) && n > 0) serves = n;
			else errors.serves = 'Enter a whole number greater than 0';
		}
		const categoryId = values.category_id || null;
		if (categoryId) {
			const categories = await listDishCategories(event.id);
			if (!categories.some((c) => c.id === categoryId)) errors.category_id = 'Unknown category';
		}
		if (Object.keys(errors).length > 0) {
			return fail(400, { dish: { id, errors, values } });
		}

		await adminEditDish(id, {
			itemName: values.item_name,
			serves,
			note: values.note || null,
			categoryId
		});
		return { dishSaved: true };
	},

	deleteDish: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const dish = await getDishInEvent(id, event.id);
		if (!dish) return fail(404, { dish: null });
		await deleteDishContribution(id);
		return { dishSaved: true };
	}
};
