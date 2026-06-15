import { randomBytes } from 'node:crypto';
import { asc, desc, eq, ne, and } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { withUniqueRetry } from '$lib/server/db/errors';
import { timingSafeStrEqual } from '$lib/server/crypto/timing';
import {
	events,
	dishCategories,
	fieldDefinitions,
	type Event,
	type NewEvent,
	type DishCategory,
	type FieldDefinition
} from '$lib/server/db/schema';

export function slugify(title: string): string {
	return (
		title
			.toLowerCase()
			.trim()
			.replace(/['’]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 60) || 'event'
	);
}

/** Ensure slug uniqueness by appending -2, -3, ... when taken. */
export async function uniqueSlug(base: string, excludeEventId?: string): Promise<string> {
	const db = getDb();
	const want = slugify(base);
	for (let i = 0; ; i++) {
		const candidate = i === 0 ? want : `${want}-${i + 1}`;
		const clash = await db
			.select({ id: events.id })
			.from(events)
			.where(
				excludeEventId
					? and(eq(events.slug, candidate), ne(events.id, excludeEventId))
					: eq(events.slug, candidate)
			)
			.limit(1);
		if (clash.length === 0) return candidate;
	}
}

export function newPublicToken(): string {
	return randomBytes(12).toString('base64url');
}

export async function createEvent(input: NewEvent): Promise<Event> {
	const [event] = await getDb().insert(events).values(input).returning();
	return event;
}

/**
 * Create an event, deriving a unique slug from `base` and transparently retrying
 * if a concurrent create grabbed the same slug first (see `withUniqueRetry`).
 */
export async function createEventWithSlug(
	base: string,
	rest: Omit<NewEvent, 'slug'>
): Promise<Event> {
	return withUniqueRetry(async () => createEvent({ ...rest, slug: await uniqueSlug(base) }));
}

export async function updateEvent(id: string, patch: Partial<NewEvent>): Promise<Event | undefined> {
	const [event] = await getDb()
		.update(events)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(events.id, id))
		.returning();
	return event;
}

export async function getEvent(id: string): Promise<Event | undefined> {
	const [event] = await getDb().select().from(events).where(eq(events.id, id)).limit(1);
	return event;
}

/** Public lookup: templates are never resolvable by slug (never public). */
export async function getEventBySlug(slug: string): Promise<Event | undefined> {
	const [event] = await getDb()
		.select()
		.from(events)
		.where(and(eq(events.slug, slug), eq(events.isTemplate, false)))
		.limit(1);
	return event;
}

export async function listEvents(): Promise<Event[]> {
	return getDb()
		.select()
		.from(events)
		.where(eq(events.isTemplate, false))
		.orderBy(desc(events.startsAt));
}

export async function listTemplates(): Promise<Event[]> {
	return getDb()
		.select()
		.from(events)
		.where(eq(events.isTemplate, true))
		.orderBy(asc(events.title), asc(events.createdAt));
}

export async function deleteEvent(id: string): Promise<void> {
	await getDb().delete(events).where(eq(events.id, id));
}

// ---------------------------------------------------------------------------
// Templates - events and templates share the `events` table (is_template flag)
// and all child tables, so the whole editor is reused for both.
// ---------------------------------------------------------------------------

/** The reusable, non-instance-specific config shared by events and templates. */
function reusableConfig(src: Event) {
	return {
		description: src.description,
		location: src.location,
		mapUrl: src.mapUrl,
		timezone: src.timezone,
		capacity: src.capacity,
		maxPlusOnes: src.maxPlusOnes,
		trackKids: src.trackKids,
		allowMaybe: src.allowMaybe,
		enableWaitlist: src.enableWaitlist,
		requireEmail: src.requireEmail,
		showDishListPublic: src.showDishListPublic,
		showDishContributorNames: src.showDishContributorNames,
		collectDishes: src.collectDishes,
		dishShowCategory: src.dishShowCategory,
		dishShowServes: src.dishShowServes,
		dishShowNote: src.dishShowNote,
		itemNounSingular: src.itemNounSingular,
		itemNounPlural: src.itemNounPlural,
		collectAllergies: src.collectAllergies,
		theme: src.theme
	};
}

function templateSlug(): string {
	return `tpl-${randomBytes(9).toString('base64url')}`;
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

/** Copy a source row's field definitions and dish categories onto a target row. */
async function cloneEventChildren(tx: Tx, sourceId: string, targetId: string): Promise<void> {
	const fields = await tx
		.select()
		.from(fieldDefinitions)
		.where(eq(fieldDefinitions.eventId, sourceId));
	if (fields.length > 0) {
		await tx.insert(fieldDefinitions).values(
			fields.map((f) => ({
				eventId: targetId,
				key: f.key,
				label: f.label,
				helpText: f.helpText,
				type: f.type,
				options: f.options,
				required: f.required,
				validation: f.validation,
				sortOrder: f.sortOrder,
				active: f.active
			}))
		);
	}

	const categories = await tx
		.select()
		.from(dishCategories)
		.where(eq(dishCategories.eventId, sourceId));
	if (categories.length > 0) {
		await tx.insert(dishCategories).values(
			categories.map((c) => ({
				eventId: targetId,
				name: c.name,
				description: c.description,
				targetCount: c.targetCount,
				sortOrder: c.sortOrder
			}))
		);
	}
}

export async function createBlankTemplate(input: {
	title: string;
	timezone: string;
	createdBy: string | null;
}): Promise<Event> {
	const [template] = await getDb()
		.insert(events)
		.values({
			slug: templateSlug(),
			isTemplate: true,
			title: input.title,
			timezone: input.timezone,
			// Placeholder instant - templates carry no real date (hidden in the editor).
			startsAt: new Date(),
			status: 'draft',
			createdBy: input.createdBy
		})
		.returning();
	return template;
}

/** Snapshot an existing event's config (incl. fields + categories) as a template. */
export async function createTemplateFromEvent(eventId: string): Promise<Event | undefined> {
	const source = await getEvent(eventId);
	if (!source) return undefined;
	return getDb().transaction(async (tx) => {
		const [template] = await tx
			.insert(events)
			.values({
				...reusableConfig(source),
				slug: templateSlug(),
				isTemplate: true,
				title: source.title,
				startsAt: source.startsAt, // placeholder, ignored for templates
				status: 'draft',
				publicToken: null,
				createdBy: source.createdBy
			})
			.returning();
		await cloneEventChildren(tx, source.id, template.id);
		return template;
	});
}

/** Instantiate a real event from a template (its config + fields + categories). */
export async function createEventFromTemplate(
	templateId: string,
	overrides: { title: string; startsAt: Date; timezone: string; createdBy: string | null }
): Promise<Event | undefined> {
	const template = await getEvent(templateId);
	if (!template || !template.isTemplate) return undefined;
	// Regenerate the slug inside the retry so a concurrent create can't wedge us on
	// a now-taken candidate.
	return withUniqueRetry(async () => {
		const slug = await uniqueSlug(overrides.title);
		return getDb().transaction(async (tx) => {
			const [event] = await tx
				.insert(events)
				.values({
					...reusableConfig(template),
					slug,
					isTemplate: false,
					title: overrides.title,
					startsAt: overrides.startsAt,
					timezone: overrides.timezone,
					status: 'draft',
					publicToken: null,
					createdBy: overrides.createdBy
				})
				.returning();
			await cloneEventChildren(tx, template.id, event.id);
			return event;
		});
	});
}

export async function listFieldDefinitions(eventId: string, activeOnly = false): Promise<FieldDefinition[]> {
	const db = getDb();
	const where = activeOnly
		? and(eq(fieldDefinitions.eventId, eventId), eq(fieldDefinitions.active, true))
		: eq(fieldDefinitions.eventId, eventId);
	return db.select().from(fieldDefinitions).where(where).orderBy(asc(fieldDefinitions.sortOrder), asc(fieldDefinitions.createdAt));
}

export async function listDishCategories(eventId: string): Promise<DishCategory[]> {
	return getDb()
		.select()
		.from(dishCategories)
		.where(eq(dishCategories.eventId, eventId))
		.orderBy(asc(dishCategories.sortOrder), asc(dishCategories.createdAt));
}

export type RsvpWindowState = 'open' | 'not-yet-open' | 'closed' | 'event-not-published';

/** Whether guests may currently submit/edit RSVPs for this event. */
export function rsvpWindowState(event: Event, now = new Date()): RsvpWindowState {
	if (event.status !== 'published') return 'event-not-published';
	if (event.rsvpOpensAt && now < event.rsvpOpensAt) return 'not-yet-open';
	if (event.rsvpClosesAt && now > event.rsvpClosesAt) return 'closed';
	return 'open';
}

/** Public token gate: events may require ?t=<token> on the public link. */
export function publicTokenOk(event: Event, provided: string | null): boolean {
	if (!event.publicToken) return true;
	if (provided == null) return false;
	return timingSafeStrEqual(provided, event.publicToken);
}
