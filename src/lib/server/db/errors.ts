/** Postgres unique-violation (SQLSTATE 23505), as surfaced by node-postgres. */
export function isUniqueViolation(err: unknown): boolean {
	return (
		typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '23505'
	);
}

/**
 * Retry a generate-then-insert that can race on a unique constraint.
 *
 * `uniqueSlug`/`uniqueFieldKey` pick the next free value with a check-then-insert,
 * so two concurrent creates can choose the same candidate. The unique index keeps
 * the data correct (one insert wins), but the loser would otherwise surface a raw
 * 500. This catches that 23505 and re-runs `run`, whose generator re-scans and
 * lands on the next free value. Bounded so a genuinely persistent violation still
 * throws.
 */
export async function withUniqueRetry<T>(run: () => Promise<T>, attempts = 5): Promise<T> {
	for (let i = 0; ; i++) {
		try {
			return await run();
		} catch (err) {
			if (i < attempts - 1 && isUniqueViolation(err)) continue;
			throw err;
		}
	}
}
