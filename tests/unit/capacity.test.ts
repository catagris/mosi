import { describe, it, expect, beforeAll } from 'vitest';
import { computePartySize, capacityAllows, newEditToken, hashIp } from '$lib/server/services/rsvps';

// hashIp mixes env.sessionSecret into the digest via a lazy getter, so setting
// it before the tests run (after imports) is sufficient and keeps it stable.
beforeAll(() => {
	process.env.SESSION_SECRET = 'unit-test-session-secret';
});

describe('computePartySize', () => {
	it('is 1 (the primary guest) with no plus-ones', () => {
		expect(computePartySize(0, 0)).toBe(1);
	});

	it('adds adult and kid plus-ones', () => {
		expect(computePartySize(2, 3)).toBe(6);
		expect(computePartySize(1, 0)).toBe(2);
		expect(computePartySize(0, 4)).toBe(5);
	});

	it('clamps negative inputs to 0', () => {
		expect(computePartySize(-5, -2)).toBe(1);
		expect(computePartySize(-1, 2)).toBe(3);
		expect(computePartySize(3, -1)).toBe(4);
	});
});

describe('capacityAllows', () => {
	it('always allows when capacity is null (unlimited)', () => {
		expect(capacityAllows(null, 1_000_000, 50, 'yes')).toBe(true);
	});

	it("always allows 'no' and 'maybe' responses even when full", () => {
		expect(capacityAllows(10, 10, 5, 'no')).toBe(true);
		expect(capacityAllows(10, 10, 5, 'maybe')).toBe(true);
		expect(capacityAllows(0, 0, 1, 'no')).toBe(true);
	});

	it('allows an exact fit', () => {
		expect(capacityAllows(10, 8, 2, 'yes')).toBe(true);
		expect(capacityAllows(1, 0, 1, 'yes')).toBe(true);
	});

	it('rejects overflow by one or more', () => {
		expect(capacityAllows(10, 9, 2, 'yes')).toBe(false);
		expect(capacityAllows(10, 10, 1, 'yes')).toBe(false);
		expect(capacityAllows(0, 0, 1, 'yes')).toBe(false);
	});
});

describe('newEditToken', () => {
	it('is 32 chars of url-safe base64 (24 random bytes)', () => {
		expect(newEditToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
	});

	it('is unique across many generations', () => {
		const tokens = new Set(Array.from({ length: 200 }, () => newEditToken()));
		expect(tokens.size).toBe(200);
	});
});

describe('hashIp', () => {
	it('returns null for null and empty input', () => {
		expect(hashIp(null)).toBeNull();
		expect(hashIp('')).toBeNull();
	});

	it('is stable for the same IP and 32 hex chars long', () => {
		const a = hashIp('203.0.113.7');
		const b = hashIp('203.0.113.7');
		expect(a).toMatch(/^[0-9a-f]{32}$/);
		expect(a).toBe(b);
	});

	it('differs across IPs', () => {
		expect(hashIp('203.0.113.7')).not.toBe(hashIp('203.0.113.8'));
	});

	it('mixes the session secret into the hash', () => {
		const before = hashIp('203.0.113.7');
		process.env.SESSION_SECRET = 'a-different-secret';
		const after = hashIp('203.0.113.7');
		process.env.SESSION_SECRET = 'unit-test-session-secret';
		expect(after).not.toBe(before);
		expect(hashIp('203.0.113.7')).toBe(before);
	});
});
