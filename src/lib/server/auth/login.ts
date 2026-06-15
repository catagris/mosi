import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { adminUsers, type AdminUser } from '$lib/server/db/schema';
import { verifyPassword } from './password';
import { verifyTotpCode, consumeRecoveryCode, generateRecoveryCodes } from './totp';

const LOCK_THRESHOLD = 5;
const MAX_LOCK_MINUTES = 60;

export type CredentialResult =
	| { ok: true; user: AdminUser }
	| { ok: false; reason: 'invalid' }
	| { ok: false; reason: 'locked'; until: Date };

/** Exponential lockout: 5 fails → 2 min, doubling per extra failure, capped at 1h. */
export function lockDurationMinutes(failedCount: number): number {
	if (failedCount < LOCK_THRESHOLD) return 0;
	return Math.min(MAX_LOCK_MINUTES, 2 ** (failedCount - LOCK_THRESHOLD + 1));
}

export async function verifyCredentials(
	username: string,
	password: string
): Promise<CredentialResult> {
	const db = getDb();
	const [user] = await db
		.select()
		.from(adminUsers)
		.where(eq(adminUsers.username, username.trim().toLowerCase()))
		.limit(1);

	if (!user) {
		// Constant-ish time: hash compare against a throwaway value.
		await verifyPassword(
			'$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
			password
		);
		return { ok: false, reason: 'invalid' };
	}

	if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
		return { ok: false, reason: 'locked', until: user.lockedUntil };
	}

	const valid = await verifyPassword(user.passwordHash, password);
	if (!valid) {
		const failed = user.failedLoginCount + 1;
		const lockMinutes = lockDurationMinutes(failed);
		await db
			.update(adminUsers)
			.set({
				failedLoginCount: failed,
				lockedUntil: lockMinutes > 0 ? new Date(Date.now() + lockMinutes * 60_000) : null,
				updatedAt: new Date()
			})
			.where(eq(adminUsers.id, user.id));
		return { ok: false, reason: 'invalid' };
	}

	await db
		.update(adminUsers)
		.set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), updatedAt: new Date() })
		.where(eq(adminUsers.id, user.id));
	return { ok: true, user };
}

export type SecondFactorResult = { ok: true; usedRecoveryCode: boolean } | { ok: false };

/** Verify a TOTP code or a single-use recovery code for an enrolled user. */
export async function verifySecondFactor(
	user: AdminUser,
	code: string
): Promise<SecondFactorResult> {
	if (!user.totpSecret || !user.totpEnabled) return { ok: false };

	const step = verifyTotpCode(user.totpSecret, code);
	if (step !== null) {
		// Replay guard: window:1 keeps a code valid for ~90s. Reject any step at or
		// below the highest we've already accepted so the same code can't be reused
		// within its window; record the step on success.
		if (user.lastTotpStep !== null && step <= user.lastTotpStep) {
			return { ok: false };
		}
		await getDb()
			.update(adminUsers)
			.set({ lastTotpStep: step, updatedAt: new Date() })
			.where(eq(adminUsers.id, user.id));
		return { ok: true, usedRecoveryCode: false };
	}

	const remaining = consumeRecoveryCode(code, user.recoveryCodes);
	if (remaining !== null) {
		await getDb()
			.update(adminUsers)
			.set({ recoveryCodes: remaining, updatedAt: new Date() })
			.where(eq(adminUsers.id, user.id));
		return { ok: true, usedRecoveryCode: true };
	}

	return { ok: false };
}

/**
 * Finish TOTP enrollment: verify the first code against the provisional
 * secret, then persist it with a fresh set of recovery codes.
 * Returns the plaintext recovery codes (shown exactly once).
 */
export async function enrollTotp(
	userId: string,
	provisionalSecret: string,
	code: string
): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false }> {
	if (verifyTotpCode(provisionalSecret, code) === null) return { ok: false };
	const { plain, hashed } = generateRecoveryCodes(10);
	await getDb()
		.update(adminUsers)
		.set({
			totpSecret: provisionalSecret,
			totpEnabled: true,
			recoveryCodes: hashed,
			updatedAt: new Date()
		})
		.where(eq(adminUsers.id, userId));
	return { ok: true, recoveryCodes: plain };
}
