import { randomBytes } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import {
	adminSessions,
	adminUsers,
	type AdminSession,
	type AdminUser
} from '$lib/server/db/schema';
import { env } from '$lib/server/env';

export const SESSION_COOKIE = 'pp_session';
const IDLE_TTL_MS = 12 * 60 * 60 * 1000; // 12h sliding
const ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d hard cap
const REFRESH_THRESHOLD_MS = 15 * 60 * 1000; // avoid a DB write on every request

export function newSessionId(): string {
	return randomBytes(32).toString('base64url'); // 256-bit
}

function idleExpiry(createdAt: Date, now: Date): Date {
	return new Date(Math.min(now.getTime() + IDLE_TTL_MS, createdAt.getTime() + ABSOLUTE_TTL_MS));
}

export async function createSession(
	userId: string,
	amr: string[],
	ip: string | null,
	userAgent: string | null
): Promise<AdminSession> {
	const db = getDb();
	const now = new Date();
	const [session] = await db
		.insert(adminSessions)
		.values({
			id: newSessionId(),
			userId,
			amr,
			ip,
			userAgent: userAgent?.slice(0, 512) ?? null,
			expiresAt: idleExpiry(now, now)
		})
		.returning();
	return session;
}

export async function validateSession(
	sessionId: string
): Promise<{ session: AdminSession; user: AdminUser } | null> {
	const db = getDb();
	const rows = await db
		.select({ session: adminSessions, user: adminUsers })
		.from(adminSessions)
		.innerJoin(adminUsers, eq(adminSessions.userId, adminUsers.id))
		.where(eq(adminSessions.id, sessionId))
		.limit(1);
	if (rows.length === 0) return null;
	const { session, user } = rows[0];

	const now = new Date();
	if (session.expiresAt.getTime() <= now.getTime()) {
		await db.delete(adminSessions).where(eq(adminSessions.id, sessionId));
		return null;
	}

	// Sliding expiry, refreshed at most every REFRESH_THRESHOLD_MS.
	const target = idleExpiry(session.createdAt, now);
	if (target.getTime() - session.expiresAt.getTime() > REFRESH_THRESHOLD_MS) {
		session.expiresAt = target;
		await db
			.update(adminSessions)
			.set({ expiresAt: target })
			.where(eq(adminSessions.id, sessionId));
	}

	return { session, user };
}

/**
 * Elevate a session after a successful second factor by rotating to a brand-new
 * session id (and discarding the old one). Mutating the existing password-only
 * session in place would leave it vulnerable to fixation: an id an attacker
 * planted before login would inherit the elevated `amr`. Issuing a fresh id —
 * and setting the cookie to it — abandons any pre-login id the moment the
 * factor is satisfied.
 */
export async function rotateSessionForAmr(
	cookies: Cookies,
	current: AdminSession,
	method: string,
	ip: string | null,
	userAgent: string | null
): Promise<AdminSession> {
	const amr = current.amr.includes(method) ? current.amr : [...current.amr, method];
	const next = await createSession(current.userId, amr, ip, userAgent);
	setSessionCookie(cookies, next.id, next.expiresAt);
	await destroySession(current.id);
	return next;
}

export async function destroySession(sessionId: string): Promise<void> {
	await getDb().delete(adminSessions).where(eq(adminSessions.id, sessionId));
}

/** Revoke all of a user's sessions (e.g. after a password change). */
export async function destroyUserSessions(userId: string, exceptId?: string): Promise<void> {
	const db = getDb();
	const sessions = await db.select().from(adminSessions).where(eq(adminSessions.userId, userId));
	for (const s of sessions) {
		if (s.id !== exceptId) await db.delete(adminSessions).where(eq(adminSessions.id, s.id));
	}
}

export async function pruneExpiredSessions(): Promise<void> {
	await getDb().delete(adminSessions).where(lt(adminSessions.expiresAt, new Date()));
}

export function setSessionCookie(cookies: Cookies, sessionId: string, expiresAt: Date): void {
	cookies.set(SESSION_COOKIE, sessionId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: env.isProduction,
		expires: expiresAt
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

/**
 * Whether a session has satisfied every required auth factor.
 *  - Password is always required.
 *  - A user who has TOTP enabled must always have completed it (never weakened).
 *  - A user without TOTP is fully authed by password alone only when the
 *    instance policy doesn't require 2FA (`requireTotp` false).
 */
export function isFullyAuthenticated(
	session: AdminSession,
	user: AdminUser,
	requireTotp: boolean
): boolean {
	if (!session.amr.includes('pwd')) return false;
	if (user.totpEnabled) return session.amr.includes('totp');
	return !requireTotp;
}
