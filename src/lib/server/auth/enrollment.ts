/**
 * Short-lived in-memory store for provisional TOTP secrets during enrollment
 * (setup and forced enrollment at first login). Keyed by session id so the
 * secret never round-trips through the client. Single-node by design.
 */

const TTL_MS = 10 * 60_000;

type Entry = { secret: string; expiresAt: number };
const store = new Map<string, Entry>();

export function putEnrollmentSecret(sessionId: string, secret: string): void {
	store.set(sessionId, { secret, expiresAt: Date.now() + TTL_MS });
}

/** Returns the provisional secret if present and unexpired (does not consume). */
export function getEnrollmentSecret(sessionId: string): string | null {
	const entry = store.get(sessionId);
	if (!entry) return null;
	if (entry.expiresAt < Date.now()) {
		store.delete(sessionId);
		return null;
	}
	return entry.secret;
}

export function clearEnrollmentSecret(sessionId: string): void {
	store.delete(sessionId);
}
