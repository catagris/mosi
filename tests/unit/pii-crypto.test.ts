import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encryptEmail, decryptEmail, emailHash, encryptionEnabled } from '$lib/server/crypto/pii';

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('PII crypto - with a key', () => {
	beforeEach(() => vi.stubEnv('ENCRYPTION_KEY', KEY));
	afterEach(() => vi.unstubAllEnvs());

	it('reports enabled', () => {
		expect(encryptionEnabled()).toBe(true);
	});

	it('round-trips an email through encrypt/decrypt', () => {
		const stored = encryptEmail('Ada@Example.com');
		expect(stored).toMatch(/^enc:v1:/);
		expect(stored).not.toContain('Ada');
		expect(decryptEmail(stored)).toBe('Ada@Example.com');
	});

	it('produces different ciphertext each time (random IV) but decrypts the same', () => {
		const a = encryptEmail('guest@example.com');
		const b = encryptEmail('guest@example.com');
		expect(a).not.toBe(b);
		expect(decryptEmail(a)).toBe('guest@example.com');
		expect(decryptEmail(b)).toBe('guest@example.com');
	});

	it('rejects tampered ciphertext (GCM auth tag)', () => {
		const stored = encryptEmail('guest@example.com')!;
		const body = Buffer.from(stored.slice('enc:v1:'.length), 'base64');
		body[body.length - 1] ^= 0xff; // flip a ciphertext bit
		const tampered = 'enc:v1:' + body.toString('base64');
		expect(() => decryptEmail(tampered)).toThrow();
	});

	it('emailHash is deterministic and case/space-insensitive', () => {
		const h1 = emailHash('Ada@Example.com');
		const h2 = emailHash('  ada@example.com ');
		expect(h1).toBe(h2);
		expect(h1).toMatch(/^[0-9a-f]{64}$/);
		expect(emailHash('other@example.com')).not.toBe(h1);
	});

	it('null/empty inputs map to null', () => {
		expect(encryptEmail(null)).toBeNull();
		expect(encryptEmail('')).toBeNull();
		expect(decryptEmail(null)).toBeNull();
		expect(emailHash(null)).toBeNull();
	});

	it('passes through legacy plaintext on read', () => {
		expect(decryptEmail('plain@example.com')).toBe('plain@example.com');
	});

	it('a different key cannot decrypt', () => {
		const stored = encryptEmail('guest@example.com');
		vi.stubEnv('ENCRYPTION_KEY', 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
		expect(() => decryptEmail(stored)).toThrow();
	});
});

describe('PII crypto - without a key (backward compatible)', () => {
	beforeEach(() => vi.stubEnv('ENCRYPTION_KEY', ''));
	afterEach(() => vi.unstubAllEnvs());

	it('reports disabled and stores plaintext', () => {
		expect(encryptionEnabled()).toBe(false);
		expect(encryptEmail('guest@example.com')).toBe('guest@example.com');
		expect(decryptEmail('guest@example.com')).toBe('guest@example.com');
		expect(emailHash('guest@example.com')).toBeNull();
	});
});
