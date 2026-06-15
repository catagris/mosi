import { describe, it, expect, beforeEach } from 'vitest';
import { parseRule, consume, resetRateLimits, RULES, type RateLimitRule } from '$lib/server/rate-limit';

const FALLBACK: RateLimitRule = { capacity: 30, windowMs: 60_000 };

beforeEach(() => {
	resetRateLimits();
});

describe('parseRule', () => {
	it('parses minute rules', () => {
		expect(parseRule('30/min', FALLBACK)).toEqual({ capacity: 30, windowMs: 60_000 });
		expect(parseRule('5/minute', FALLBACK)).toEqual({ capacity: 5, windowMs: 60_000 });
		expect(parseRule('5/m', FALLBACK)).toEqual({ capacity: 5, windowMs: 60_000 });
	});

	it('parses second rules', () => {
		expect(parseRule('10/sec', FALLBACK)).toEqual({ capacity: 10, windowMs: 1_000 });
		expect(parseRule('10/second', FALLBACK)).toEqual({ capacity: 10, windowMs: 1_000 });
		expect(parseRule('10/s', FALLBACK)).toEqual({ capacity: 10, windowMs: 1_000 });
	});

	it('parses hour rules', () => {
		expect(parseRule('100/hour', FALLBACK)).toEqual({ capacity: 100, windowMs: 3_600_000 });
		expect(parseRule('100/h', FALLBACK)).toEqual({ capacity: 100, windowMs: 3_600_000 });
	});

	it('tolerates whitespace and case', () => {
		expect(parseRule('  30 / MIN  ', FALLBACK)).toEqual({ capacity: 30, windowMs: 60_000 });
	});

	it('falls back for garbage input', () => {
		expect(parseRule('lots/day', FALLBACK)).toBe(FALLBACK);
		expect(parseRule('per minute', FALLBACK)).toBe(FALLBACK);
		expect(parseRule('', FALLBACK)).toBe(FALLBACK);
		expect(parseRule('-5/min', FALLBACK)).toBe(FALLBACK);
		expect(parseRule('30min', FALLBACK)).toBe(FALLBACK);
	});

	it('falls back for a zero capacity', () => {
		expect(parseRule('0/min', FALLBACK)).toBe(FALLBACK);
	});
});

describe('consume - token bucket', () => {
	const rule: RateLimitRule = { capacity: 3, windowMs: 1_000 };
	const T0 = 1_750_000_000_000;

	it('allows exactly `capacity` requests in a burst, then blocks', () => {
		expect(consume('k', rule, T0)).toBe(true);
		expect(consume('k', rule, T0)).toBe(true);
		expect(consume('k', rule, T0)).toBe(true);
		expect(consume('k', rule, T0)).toBe(false);
		expect(consume('k', rule, T0)).toBe(false);
	});

	it('refills continuously over time', () => {
		for (let i = 0; i < 3; i++) consume('k', rule, T0);
		expect(consume('k', rule, T0)).toBe(false);
		// +500ms refills 1.5 tokens → one request allowed, the next blocked.
		expect(consume('k', rule, T0 + 500)).toBe(true);
		expect(consume('k', rule, T0 + 500)).toBe(false);
		// After a full window the bucket is back at capacity (but never above it).
		expect(consume('k', rule, T0 + 500 + 1_000)).toBe(true);
		expect(consume('k', rule, T0 + 500 + 1_000)).toBe(true);
		expect(consume('k', rule, T0 + 500 + 1_000)).toBe(true);
		expect(consume('k', rule, T0 + 500 + 1_000)).toBe(false);
	});

	it('never refills above capacity even after a long idle period', () => {
		consume('k', rule, T0);
		const later = T0 + 100 * rule.windowMs;
		for (let i = 0; i < rule.capacity; i++) expect(consume('k', rule, later)).toBe(true);
		expect(consume('k', rule, later)).toBe(false);
	});

	it('tracks keys independently', () => {
		for (let i = 0; i < 3; i++) consume('login:1.2.3.4', rule, T0);
		expect(consume('login:1.2.3.4', rule, T0)).toBe(false);
		expect(consume('login:5.6.7.8', rule, T0)).toBe(true);
	});

	it('is unaffected by a clock that moves backwards', () => {
		expect(consume('k', rule, T0)).toBe(true);
		expect(consume('k', rule, T0 - 10_000)).toBe(true);
		expect(consume('k', rule, T0 - 10_000)).toBe(true);
		// Bucket exhausted; an earlier timestamp must not grant negative-elapsed refill.
		expect(consume('k', rule, T0 - 10_000)).toBe(false);
	});

	it('resetRateLimits clears all buckets', () => {
		for (let i = 0; i < 3; i++) consume('k', rule, T0);
		expect(consume('k', rule, T0)).toBe(false);
		resetRateLimits();
		expect(consume('k', rule, T0)).toBe(true);
	});
});

describe('RULES presets', () => {
	it('defines sane positive capacities and windows', () => {
		for (const rule of Object.values(RULES)) {
			expect(rule.capacity).toBeGreaterThan(0);
			expect(rule.windowMs).toBeGreaterThan(0);
		}
	});
});
