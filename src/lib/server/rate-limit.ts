/**
 * In-process token-bucket rate limiter.
 *
 * Buckets are keyed by an arbitrary string (e.g. `login:1.2.3.4`). Each bucket
 * holds `capacity` tokens and refills continuously at `capacity / windowMs`.
 * Suitable for a single-node deployment (the design's self-host target).
 */

type Bucket = { tokens: number; lastRefill: number };

const buckets = new Map<string, Bucket>();

export type RateLimitRule = { capacity: number; windowMs: number };

/** Parse "30/min", "10/sec", "100/hour" into a rule. */
export function parseRule(spec: string, fallback: RateLimitRule): RateLimitRule {
	const match = /^(\d+)\s*\/\s*(sec|second|min|minute|hour|h|m|s)$/i.exec(spec.trim());
	if (!match) return fallback;
	const capacity = Number(match[1]);
	const unit = match[2].toLowerCase();
	const windowMs = unit.startsWith('h') ? 3_600_000 : unit.startsWith('m') ? 60_000 : 1_000;
	if (capacity <= 0) return fallback;
	return { capacity, windowMs };
}

/** Consume one token; returns true when the request is allowed. */
export function consume(key: string, rule: RateLimitRule, now = Date.now()): boolean {
	let bucket = buckets.get(key);
	if (!bucket) {
		bucket = { tokens: rule.capacity, lastRefill: now };
		buckets.set(key, bucket);
	}
	const elapsed = Math.max(0, now - bucket.lastRefill);
	bucket.tokens = Math.min(rule.capacity, bucket.tokens + (elapsed * rule.capacity) / rule.windowMs);
	bucket.lastRefill = now;
	if (bucket.tokens < 1) return false;
	bucket.tokens -= 1;
	return true;
}

/** Test hook / memory hygiene. */
export function resetRateLimits(): void {
	buckets.clear();
}

// Periodically drop stale buckets so the map can't grow unbounded.
const SWEEP_INTERVAL_MS = 10 * 60_000;
let sweeper: ReturnType<typeof setInterval> | undefined;
export function startSweeper(): void {
	if (sweeper) return;
	sweeper = setInterval(() => {
		const cutoff = Date.now() - 60 * 60_000;
		for (const [key, bucket] of buckets) {
			if (bucket.lastRefill < cutoff) buckets.delete(key);
		}
	}, SWEEP_INTERVAL_MS);
	sweeper.unref?.();
}

export const RULES = {
	login: { capacity: 10, windowMs: 60_000 },
	twoFactor: { capacity: 10, windowMs: 60_000 },
	editToken: { capacity: 30, windowMs: 60_000 },
	emailSend: { capacity: 10, windowMs: 60_000 },
	resendLink: { capacity: 5, windowMs: 60_000 },
	findLinks: { capacity: 5, windowMs: 60_000 },
	webhookSend: { capacity: 60, windowMs: 60_000 }
} as const satisfies Record<string, RateLimitRule>;
