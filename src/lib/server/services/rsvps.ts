import { randomBytes, createHash } from 'node:crypto';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import {
	events,
	rsvps,
	dishContributions,
	type Event,
	type Rsvp,
	type DishContribution,
	type NotificationPayload
} from '$lib/server/db/schema';
import type { RsvpInput } from '$lib/server/validation/rsvp';
import { emitRsvpEvent } from './notifications';
import { emailEnabled, sendWaitlistPromotedEmail } from '$lib/server/email';
import { encryptEmail, decryptEmail, emailHash, encryptionEnabled } from '$lib/server/crypto/pii';
import { env } from '$lib/server/env';

/** Return a copy of an RSVP row with its email decrypted for in-app use. */
function withPlainEmail(row: Rsvp): Rsvp {
	return row.guestEmail ? { ...row, guestEmail: decryptEmail(row.guestEmail) } : row;
}

// ---------------------------------------------------------------------------
// Pure capacity / party-size logic (unit-tested)
// ---------------------------------------------------------------------------

/** party_size is denormalized as 1 (primary) + adult and kid plus-ones. */
export function computePartySize(plusOnesAdults: number, plusOnesKids: number): number {
	return 1 + Math.max(0, plusOnesAdults) + Math.max(0, plusOnesKids);
}

/**
 * Capacity check (open question #1 default: only active "yes" RSVPs
 * count; everyone in party_size counts, kids included).
 */
export function capacityAllows(
	capacity: number | null,
	currentYesHeadcount: number,
	incomingPartySize: number,
	response: 'yes' | 'no' | 'maybe'
): boolean {
	if (capacity === null || response !== 'yes') return true;
	return currentYesHeadcount + incomingPartySize <= capacity;
}

/**
 * FIFO-with-skip waitlist promotion: from `waiting` (oldest first), pick the
 * entries that fit within `available` capacity. A party that doesn't fit is
 * skipped so a smaller later party can still be promoted.
 */
export function selectPromotions<T extends { partySize: number }>(
	available: number,
	waiting: T[]
): T[] {
	const promoted: T[] = [];
	let remaining = available;
	for (const entry of waiting) {
		if (remaining <= 0) break;
		if (entry.partySize <= remaining) {
			promoted.push(entry);
			remaining -= entry.partySize;
		}
	}
	return promoted;
}

export function newEditToken(): string {
	return randomBytes(24).toString('base64url');
}

export function hashIp(ip: string | null): string | null {
	if (!ip) return null;
	let secret = '';
	try {
		secret = env.sessionSecret;
	} catch {
		// no secret available (e.g. unit tests) - still avoid storing raw IPs
	}
	return createHash('sha256').update(`${secret}:${ip}`).digest('hex').slice(0, 32);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** SUM(party_size) over active "yes" RSVPs, optionally excluding one RSVP. */
export async function yesHeadcount(eventId: string, excludeRsvpId?: string): Promise<number> {
	const conditions = [
		eq(rsvps.eventId, eventId),
		eq(rsvps.status, 'active'),
		eq(rsvps.response, 'yes')
	];
	if (excludeRsvpId) conditions.push(sql`${rsvps.id} <> ${excludeRsvpId}`);
	const [row] = await getDb()
		.select({ total: sql<number>`coalesce(sum(${rsvps.partySize}), 0)::int` })
		.from(rsvps)
		.where(and(...conditions));
	return row?.total ?? 0;
}

export async function getRsvpByEditToken(token: string): Promise<Rsvp | undefined> {
	const [row] = await getDb().select().from(rsvps).where(eq(rsvps.editToken, token)).limit(1);
	return row ? withPlainEmail(row) : undefined;
}

export async function getRsvp(id: string): Promise<Rsvp | undefined> {
	const [row] = await getDb().select().from(rsvps).where(eq(rsvps.id, id)).limit(1);
	return row ? withPlainEmail(row) : undefined;
}

/**
 * Most recent non-withdrawn RSVP for an event matching this email. Used by the
 * self-service "resend my edit link" flow. With encryption on, the match is by
 * the keyed email hash; otherwise it falls back to a case-insensitive compare.
 */
export async function getActiveRsvpByEmail(
	eventId: string,
	email: string
): Promise<Rsvp | undefined> {
	const normalized = email.trim().toLowerCase();
	if (!normalized) return undefined;
	const match = encryptionEnabled()
		? eq(rsvps.guestEmailHash, emailHash(normalized)!)
		: sql`lower(${rsvps.guestEmail}) = ${normalized}`;
	const [row] = await getDb()
		.select()
		.from(rsvps)
		.where(and(eq(rsvps.eventId, eventId), ne(rsvps.status, 'withdrawn'), match))
		.orderBy(desc(rsvps.createdAt))
		.limit(1);
	return row ? withPlainEmail(row) : undefined;
}

/**
 * Every non-withdrawn RSVP tied to this email across events that are still
 * relevant - published/closed events starting in the future or within the last
 * 7 days. Powers the home-page "email me my links" flow. Returns one (latest)
 * RSVP per event, soonest event first. Match is by keyed email hash when
 * encryption is on, else a case-insensitive plaintext compare.
 */
export async function findActiveRsvpsByEmailAcrossEvents(
	email: string
): Promise<Array<{ event: Event; rsvp: Rsvp }>> {
	const normalized = email.trim().toLowerCase();
	if (!normalized) return [];
	const match = encryptionEnabled()
		? eq(rsvps.guestEmailHash, emailHash(normalized)!)
		: sql`lower(${rsvps.guestEmail}) = ${normalized}`;
	const rows = await getDb()
		.select({ event: events, rsvp: rsvps })
		.from(rsvps)
		.innerJoin(events, eq(rsvps.eventId, events.id))
		.where(
			and(
				inArray(events.status, ['published', 'closed']),
				sql`${events.startsAt} >= now() - interval '7 days'`,
				ne(rsvps.status, 'withdrawn'),
				match
			)
		)
		.orderBy(asc(events.startsAt), desc(rsvps.createdAt));
	// Collapse to one RSVP per event. Rows for a given event arrive newest-first
	// (createdAt desc), so the first one seen is the one to keep.
	const seen = new Set<string>();
	const result: Array<{ event: Event; rsvp: Rsvp }> = [];
	for (const row of rows) {
		if (seen.has(row.event.id)) continue;
		seen.add(row.event.id);
		result.push(row);
	}
	return result;
}

export async function listRsvps(eventId: string): Promise<Rsvp[]> {
	const rows = await getDb()
		.select()
		.from(rsvps)
		.where(eq(rsvps.eventId, eventId))
		.orderBy(desc(rsvps.createdAt));
	return rows.map(withPlainEmail);
}

export async function listDishesForRsvp(rsvpId: string): Promise<DishContribution[]> {
	return getDb()
		.select()
		.from(dishContributions)
		.where(eq(dishContributions.rsvpId, rsvpId))
		.orderBy(asc(dishContributions.createdAt));
}

export async function listDishesForEvent(
	eventId: string
): Promise<(DishContribution & { rsvp: Rsvp })[]> {
	const rows = await getDb()
		.select({ dish: dishContributions, rsvp: rsvps })
		.from(dishContributions)
		.innerJoin(rsvps, eq(dishContributions.rsvpId, rsvps.id))
		.where(eq(rsvps.eventId, eventId))
		.orderBy(asc(dishContributions.createdAt));
	return rows.map(({ dish, rsvp }) => ({ ...dish, rsvp: withPlainEmail(rsvp) }));
}

// ---------------------------------------------------------------------------
// Mutations (atomic; capacity enforced under a row lock on the event)
// ---------------------------------------------------------------------------

export type CreateRsvpResult =
	| { ok: true; rsvp: Rsvp; waitlisted: boolean }
	| { ok: false; reason: 'capacity'; remaining: number };

/** Build a payload from already-loaded dish names (no DB access). */
function buildPayloadWith(event: Event, rsvp: Rsvp, dishNames: string[]): NotificationPayload {
	return {
		rsvpId: rsvp.id,
		eventId: event.id,
		eventTitle: event.title,
		eventSlug: event.slug,
		guestName: rsvp.guestName,
		response: rsvp.response,
		partySize: rsvp.partySize,
		note: rsvp.note,
		dishes: dishNames
	};
}

async function buildPayload(event: Event, rsvp: Rsvp): Promise<NotificationPayload> {
	const dishes = await listDishesForRsvp(rsvp.id);
	return buildPayloadWith(
		event,
		rsvp,
		dishes.map((d) => d.itemName)
	);
}

/** One query for many RSVPs: rsvpId → dish item names (in creation order). */
async function dishNamesByRsvp(rsvpIds: string[]): Promise<Map<string, string[]>> {
	const map = new Map<string, string[]>();
	if (rsvpIds.length === 0) return map;
	const rows = await getDb()
		.select({ rsvpId: dishContributions.rsvpId, itemName: dishContributions.itemName })
		.from(dishContributions)
		.where(inArray(dishContributions.rsvpId, rsvpIds))
		.orderBy(asc(dishContributions.createdAt));
	for (const row of rows) {
		const list = map.get(row.rsvpId);
		if (list) list.push(row.itemName);
		else map.set(row.rsvpId, [row.itemName]);
	}
	return map;
}

export async function createRsvp(
	event: Event,
	input: RsvpInput,
	clientIp: string | null
): Promise<CreateRsvpResult> {
	const db = getDb();
	const partySize = computePartySize(input.plusOnesAdults, input.plusOnesKids);

	const result = await db.transaction(async (tx) => {
		// Serialize capacity checks per event.
		await tx.execute(sql`select id from events where id = ${event.id} for update`);
		const [headcountRow] = await tx
			.select({ total: sql<number>`coalesce(sum(${rsvps.partySize}), 0)::int` })
			.from(rsvps)
			.where(
				and(eq(rsvps.eventId, event.id), eq(rsvps.status, 'active'), eq(rsvps.response, 'yes'))
			);
		const current = headcountRow?.total ?? 0;

		// Over capacity: waitlist the 'yes' (when enabled), else reject.
		let status: 'active' | 'waitlisted' = 'active';
		if (!capacityAllows(event.capacity, current, partySize, input.response)) {
			if (event.enableWaitlist && input.response === 'yes') {
				status = 'waitlisted';
			} else {
				return {
					ok: false as const,
					reason: 'capacity' as const,
					remaining: Math.max(0, (event.capacity ?? 0) - current)
				};
			}
		}

		const [rsvp] = await tx
			.insert(rsvps)
			.values({
				eventId: event.id,
				editToken: newEditToken(),
				response: input.response,
				guestName: input.guestName,
				guestEmail: encryptEmail(input.guestEmail),
				guestEmailHash: emailHash(input.guestEmail),
				plusOnesAdults: input.plusOnesAdults,
				plusOnesKids: input.plusOnesKids,
				partySize,
				fieldValues: input.fieldValues,
				allergies: input.allergies,
				note: input.note,
				status,
				ipHash: hashIp(clientIp)
			})
			.returning();

		if (input.dishes.length > 0) {
			await tx.insert(dishContributions).values(
				input.dishes.map((dish) => ({
					rsvpId: rsvp.id,
					categoryId: dish.categoryId,
					itemName: dish.itemName,
					serves: dish.serves,
					note: dish.note
				}))
			);
		}
		return { ok: true as const, rsvp: withPlainEmail(rsvp), waitlisted: status === 'waitlisted' };
	});

	if (result.ok) {
		await emitRsvpEvent('rsvp.created', await buildPayload(event, result.rsvp));
	}
	return result;
}

export type UpdateRsvpResult = CreateRsvpResult;

/** Guest self-edit (also used by withdraw-and-rejoin): replaces dishes wholesale. */
export async function updateRsvp(
	event: Event,
	existing: Rsvp,
	input: RsvpInput
): Promise<UpdateRsvpResult> {
	const db = getDb();
	const partySize = computePartySize(input.plusOnesAdults, input.plusOnesKids);

	const result = await db.transaction(async (tx) => {
		await tx.execute(sql`select id from events where id = ${event.id} for update`);
		const [headcountRow] = await tx
			.select({ total: sql<number>`coalesce(sum(${rsvps.partySize}), 0)::int` })
			.from(rsvps)
			.where(
				and(
					eq(rsvps.eventId, event.id),
					eq(rsvps.status, 'active'),
					eq(rsvps.response, 'yes'),
					sql`${rsvps.id} <> ${existing.id}`
				)
			);
		const current = headcountRow?.total ?? 0;
		const capacityError = {
			ok: false as const,
			reason: 'capacity' as const,
			remaining: Math.max(0, (event.capacity ?? 0) - current)
		};

		// Decide the resulting status. A guest who is already confirmed is never
		// demoted to the waitlist by their own edit - an over-capacity change is
		// rejected so they keep their existing spot. Waitlisted guests stay on the
		// list (the FIFO promotion pass that runs after this decides entry).
		let status: 'active' | 'waitlisted';
		if (input.response !== 'yes') {
			status = 'active'; // no/maybe never consume capacity
		} else if (existing.status === 'waitlisted') {
			status = 'waitlisted';
		} else if (capacityAllows(event.capacity, current, partySize, 'yes')) {
			status = 'active';
		} else if (event.enableWaitlist && existing.status === 'withdrawn') {
			status = 'waitlisted'; // re-joining a full event - no confirmed spot to keep
		} else {
			return capacityError; // confirmed guest over capacity, or no waitlist
		}

		const [updated] = await tx
			.update(rsvps)
			.set({
				response: input.response,
				guestName: input.guestName,
				guestEmail: encryptEmail(input.guestEmail),
				guestEmailHash: emailHash(input.guestEmail),
				plusOnesAdults: input.plusOnesAdults,
				plusOnesKids: input.plusOnesKids,
				partySize,
				fieldValues: input.fieldValues,
				allergies: input.allergies,
				note: input.note,
				status,
				updatedAt: new Date()
			})
			.where(eq(rsvps.id, existing.id))
			.returning();

		// Replace guest-managed dishes, preserving nothing admin-edited silently.
		await tx.delete(dishContributions).where(eq(dishContributions.rsvpId, existing.id));
		if (input.dishes.length > 0) {
			await tx.insert(dishContributions).values(
				input.dishes.map((dish) => ({
					rsvpId: existing.id,
					categoryId: dish.categoryId,
					itemName: dish.itemName,
					serves: dish.serves,
					note: dish.note
				}))
			);
		}
		return {
			ok: true as const,
			rsvp: withPlainEmail(updated),
			waitlisted: status === 'waitlisted'
		};
	});

	if (result.ok) {
		await emitRsvpEvent('rsvp.updated', await buildPayload(event, result.rsvp));
		// An edit that lowered the confirmed headcount may free room for the waitlist.
		await promoteFromWaitlist(event);
	}
	return result;
}

export async function withdrawRsvp(event: Event, rsvp: Rsvp): Promise<Rsvp> {
	const [updated] = await getDb()
		.update(rsvps)
		.set({ status: 'withdrawn', updatedAt: new Date() })
		.where(eq(rsvps.id, rsvp.id))
		.returning();
	await emitRsvpEvent('rsvp.withdrawn', await buildPayload(event, updated));
	// Withdrawing a confirmed guest may open a spot for someone on the waitlist.
	await promoteFromWaitlist(event);
	return withPlainEmail(updated);
}

/**
 * Promote waitlisted guests into freed capacity (oldest first). Runs under the
 * event row lock so it can't race with concurrent RSVPs. No-op unless the event
 * has a waitlist and a capacity. Notifies admins per promotion and emails the
 * promoted guest when possible.
 */
export async function promoteFromWaitlist(event: Event): Promise<Rsvp[]> {
	if (!event.enableWaitlist || event.capacity == null) return [];
	const db = getDb();

	const promoted = await db.transaction(async (tx) => {
		// Lock the event row AND read the authoritative capacity/waitlist settings
		// from it — the `event` argument is a snapshot that may be stale by now
		// (e.g. an admin edited capacity between the caller's fetch and this lock).
		const [locked] = await tx
			.select({ capacity: events.capacity, enableWaitlist: events.enableWaitlist })
			.from(events)
			.where(eq(events.id, event.id))
			.for('update');
		if (!locked || !locked.enableWaitlist || locked.capacity == null) return [];

		const [headcountRow] = await tx
			.select({ total: sql<number>`coalesce(sum(${rsvps.partySize}), 0)::int` })
			.from(rsvps)
			.where(
				and(eq(rsvps.eventId, event.id), eq(rsvps.status, 'active'), eq(rsvps.response, 'yes'))
			);
		const available = locked.capacity - (headcountRow?.total ?? 0);
		if (available <= 0) return [];

		const waiting = await tx
			.select()
			.from(rsvps)
			.where(
				and(eq(rsvps.eventId, event.id), eq(rsvps.status, 'waitlisted'), eq(rsvps.response, 'yes'))
			)
			.orderBy(asc(rsvps.createdAt));

		const toPromote = selectPromotions(available, waiting);
		const updated: Rsvp[] = [];
		for (const entry of toPromote) {
			const [row] = await tx
				.update(rsvps)
				.set({ status: 'active', updatedAt: new Date() })
				.where(eq(rsvps.id, entry.id))
				.returning();
			updated.push(row);
		}
		return updated;
	});

	// One dish query for the whole promoted batch instead of one per RSVP.
	const dishNames = await dishNamesByRsvp(promoted.map((r) => r.id));
	for (const rsvp of promoted.map(withPlainEmail)) {
		await emitRsvpEvent(
			'rsvp.updated',
			buildPayloadWith(event, rsvp, dishNames.get(rsvp.id) ?? [])
		);
		if (rsvp.guestEmail && emailEnabled()) {
			await sendWaitlistPromotedEmail({
				to: rsvp.guestEmail,
				guestName: rsvp.guestName,
				eventTitle: event.title,
				editUrl: `${env.origin}/e/${event.slug}/edit/${rsvp.editToken}`
			});
		}
	}
	return promoted.map(withPlainEmail);
}

/** Admin: rotate a guest's private edit link (admin-assisted edits). */
export async function regenerateEditToken(rsvpId: string): Promise<string> {
	const token = newEditToken();
	await getDb()
		.update(rsvps)
		.set({ editToken: token, updatedAt: new Date() })
		.where(eq(rsvps.id, rsvpId));
	return token;
}
