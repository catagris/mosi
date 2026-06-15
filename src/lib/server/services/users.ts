import { asc, eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { adminUsers, type AdminUser } from '$lib/server/db/schema';
import { hashPassword } from '$lib/server/auth/password';
import { lockDurationMinutes } from '$lib/server/auth/login';
import { destroyUserSessions } from '$lib/server/auth/session';
import { encryptEmail, decryptEmail } from '$lib/server/crypto/pii';

/** Admin emails are encrypted at rest; decrypt for in-app use. */
function withPlainEmail(user: AdminUser): AdminUser {
	return user.email ? { ...user, email: decryptEmail(user.email) } : user;
}

export async function listAdminUsers(): Promise<AdminUser[]> {
	const rows = await getDb().select().from(adminUsers).orderBy(asc(adminUsers.createdAt));
	return rows.map(withPlainEmail);
}

export async function getAdminUser(id: string): Promise<AdminUser | undefined> {
	const [user] = await getDb().select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
	return user ? withPlainEmail(user) : undefined;
}

export async function getAdminUserByUsername(username: string): Promise<AdminUser | undefined> {
	const [user] = await getDb()
		.select()
		.from(adminUsers)
		.where(eq(adminUsers.username, username.trim().toLowerCase()))
		.limit(1);
	return user ? withPlainEmail(user) : undefined;
}

export async function countAdminUsers(): Promise<number> {
	const rows = await getDb().select({ id: adminUsers.id }).from(adminUsers);
	return rows.length;
}

export async function createAdminUser(input: {
	username: string;
	password: string;
	email?: string | null;
	role: 'owner' | 'admin';
}): Promise<AdminUser> {
	const [user] = await getDb()
		.insert(adminUsers)
		.values({
			username: input.username.trim().toLowerCase(),
			email: encryptEmail(input.email?.trim() || null),
			passwordHash: await hashPassword(input.password),
			role: input.role
		})
		.returning();
	return withPlainEmail(user);
}

/** Change password and revoke every other session. */
export async function changePassword(
	userId: string,
	newPassword: string,
	keepSessionId?: string
): Promise<void> {
	await getDb()
		.update(adminUsers)
		.set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
		.where(eq(adminUsers.id, userId));
	await destroyUserSessions(userId, keepSessionId);
}

/**
 * Owner-initiated 2FA reset: clears the secret so the user re-enrolls at next
 * login. (Self-service reset uses password + recovery code instead.)
 */
export async function resetTotp(userId: string): Promise<void> {
	await getDb()
		.update(adminUsers)
		.set({ totpSecret: null, totpEnabled: false, recoveryCodes: [], updatedAt: new Date() })
		.where(eq(adminUsers.id, userId));
	await destroyUserSessions(userId);
}

/**
 * Self-service 2FA disable (only offered when the instance policy allows it).
 * Unlike {@link resetTotp}, this keeps the user's current sessions alive.
 */
export async function disableTotp(userId: string): Promise<void> {
	await getDb()
		.update(adminUsers)
		.set({ totpSecret: null, totpEnabled: false, recoveryCodes: [], updatedAt: new Date() })
		.where(eq(adminUsers.id, userId));
}

export async function deleteAdminUser(id: string): Promise<void> {
	await getDb().delete(adminUsers).where(eq(adminUsers.id, id));
}

export async function unlockAdminUser(id: string): Promise<void> {
	await getDb()
		.update(adminUsers)
		.set({ failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() })
		.where(eq(adminUsers.id, id));
}

/** Whether the account is currently locked out (shared by password + 2FA steps). */
export function isAdminUserLocked(user: Pick<AdminUser, 'lockedUntil'>): boolean {
	return user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now();
}

/**
 * Record a failed second-factor attempt against the same `failedLoginCount` /
 * `lockedUntil` counters the password step uses, so the lockout curve
 * (5 fails → 2 min, doubling, capped at 1h) applies to TOTP/recovery guesses too.
 */
export async function recordSecondFactorFailure(
	user: Pick<AdminUser, 'id' | 'failedLoginCount'>
): Promise<void> {
	const failed = user.failedLoginCount + 1;
	const lockMinutes = lockDurationMinutes(failed);
	await getDb()
		.update(adminUsers)
		.set({
			failedLoginCount: failed,
			lockedUntil: lockMinutes > 0 ? new Date(Date.now() + lockMinutes * 60_000) : null,
			updatedAt: new Date()
		})
		.where(eq(adminUsers.id, user.id));
}

/** Clear accumulated login-failure state after a successful factor (no-op when already clean). */
export async function clearLoginFailures(
	user: Pick<AdminUser, 'id' | 'failedLoginCount' | 'lockedUntil'>
): Promise<void> {
	if (user.failedLoginCount === 0 && user.lockedUntil === null) return;
	await unlockAdminUser(user.id);
}
