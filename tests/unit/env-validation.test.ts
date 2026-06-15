import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv } from '$lib/server/env';

// validateEnv reads process.env directly; snapshot the keys it touches and set a
// valid baseline before each test, then restore afterward.
const KEYS = [
	'DATABASE_URL',
	'SESSION_SECRET',
	'ENCRYPTION_KEY',
	'NODE_ENV',
	'ORIGIN',
	'VAPID_PUBLIC_KEY',
	'VAPID_PRIVATE_KEY',
	'VAPID_SUBJECT'
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
	for (const k of KEYS) saved[k] = process.env[k];
	process.env.DATABASE_URL = 'postgres://app:s3cret@db:5432/mosi';
	process.env.SESSION_SECRET = 'x'.repeat(40);
	delete process.env.ENCRYPTION_KEY;
	process.env.NODE_ENV = 'test';
	delete process.env.ORIGIN;
	delete process.env.VAPID_PUBLIC_KEY;
	delete process.env.VAPID_PRIVATE_KEY;
	delete process.env.VAPID_SUBJECT;
});

afterEach(() => {
	for (const k of KEYS) {
		if (saved[k] === undefined) delete process.env[k];
		else process.env[k] = saved[k];
	}
});

describe('validateEnv', () => {
	it('passes a valid baseline config', () => {
		expect(() => validateEnv()).not.toThrow();
	});

	it('requires DATABASE_URL and rejects the change-me placeholder', () => {
		delete process.env.DATABASE_URL;
		expect(() => validateEnv()).toThrow(/DATABASE_URL is required/);
		process.env.DATABASE_URL = 'postgres://app:change-me@db:5432/mosi';
		expect(() => validateEnv()).toThrow(/change-me/);
	});

	it('requires a SESSION_SECRET of at least 32 characters', () => {
		delete process.env.SESSION_SECRET;
		expect(() => validateEnv()).toThrow(/SESSION_SECRET is required/);
		process.env.SESSION_SECRET = 'short';
		expect(() => validateEnv()).toThrow(/too short/);
	});

	it('accepts a 64-hex ENCRYPTION_KEY but rejects a short hex one', () => {
		process.env.ENCRYPTION_KEY = 'a'.repeat(64);
		expect(() => validateEnv()).not.toThrow();
		process.env.ENCRYPTION_KEY = 'abcd1234'; // 8 hex chars = 4 bytes
		expect(() => validateEnv()).toThrow(/ENCRYPTION_KEY/);
	});

	it('accepts a ≥32-char non-hex passphrase as ENCRYPTION_KEY', () => {
		process.env.ENCRYPTION_KEY = 'z'.repeat(33); // non-hex, long enough
		expect(() => validateEnv()).not.toThrow();
	});

	it('requires an https ORIGIN in production', () => {
		process.env.NODE_ENV = 'production';
		process.env.ORIGIN = 'http://events.example.com';
		expect(() => validateEnv()).toThrow(/ORIGIN must use https/);
		delete process.env.ORIGIN;
		expect(() => validateEnv()).toThrow(/ORIGIN must be set/);
		process.env.ORIGIN = 'https://events.example.com';
		expect(() => validateEnv()).not.toThrow();
	});

	it('does not enforce the ORIGIN scheme outside production', () => {
		process.env.NODE_ENV = 'development';
		delete process.env.ORIGIN;
		expect(() => validateEnv()).not.toThrow();
	});

	it('rejects an https ORIGIN when NODE_ENV is not production', () => {
		process.env.NODE_ENV = 'development';
		process.env.ORIGIN = 'https://events.example.com';
		expect(() => validateEnv()).toThrow(/NODE_ENV must be "production"/);
	});

	it('requires a non-placeholder VAPID_SUBJECT when push keys are set', () => {
		process.env.VAPID_PUBLIC_KEY = 'pub';
		process.env.VAPID_PRIVATE_KEY = 'priv';
		expect(() => validateEnv()).toThrow(/VAPID_SUBJECT/);
		process.env.VAPID_SUBJECT = 'mailto:admin@example.com';
		expect(() => validateEnv()).toThrow(/VAPID_SUBJECT/);
		process.env.VAPID_SUBJECT = 'mailto:ops@myhost.com';
		expect(() => validateEnv()).not.toThrow();
	});

	it('ignores VAPID_SUBJECT when push keys are absent', () => {
		delete process.env.VAPID_PUBLIC_KEY;
		delete process.env.VAPID_PRIVATE_KEY;
		expect(() => validateEnv()).not.toThrow();
	});

	it('reports every problem at once', () => {
		delete process.env.SESSION_SECRET;
		process.env.DATABASE_URL = 'postgres://app:change-me@db/mosi';
		try {
			validateEnv();
			throw new Error('expected validateEnv to throw');
		} catch (err) {
			const msg = (err as Error).message;
			expect(msg).toContain('change-me');
			expect(msg).toContain('SESSION_SECRET');
		}
	});
});
