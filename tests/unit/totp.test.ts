import { describe, it, expect } from 'vitest';
import * as OTPAuth from 'otpauth';
import {
	generateTotpSecret,
	totpProvisioningUri,
	verifyTotpCode,
	generateRecoveryCodes,
	hashRecoveryCode,
	consumeRecoveryCode
} from '$lib/server/auth/totp';
import { lockDurationMinutes } from '$lib/server/auth/login';

function referenceTotp(secret: string): OTPAuth.TOTP {
	return new OTPAuth.TOTP({
		secret: OTPAuth.Secret.fromBase32(secret),
		algorithm: 'SHA1',
		digits: 6,
		period: 30
	});
}

/** A 6-digit code guaranteed not to be valid in the ±1-step window. */
function invalidCodeFor(secret: string): string {
	const totp = referenceTotp(secret);
	const now = Date.now();
	const valid = new Set([
		totp.generate({ timestamp: now - 30_000 }),
		totp.generate({ timestamp: now }),
		totp.generate({ timestamp: now + 30_000 })
	]);
	for (let i = 0; ; i++) {
		const candidate = String(i).padStart(6, '0');
		if (!valid.has(candidate)) return candidate;
	}
}

describe('generateTotpSecret', () => {
	it('returns a 32-char base32 secret (20 random bytes)', () => {
		const secret = generateTotpSecret();
		expect(secret).toMatch(/^[A-Z2-7]{32}$/);
	});

	it('returns a different secret each time', () => {
		expect(generateTotpSecret()).not.toBe(generateTotpSecret());
	});
});

describe('totpProvisioningUri', () => {
	it('contains the issuer, label and secret', () => {
		const secret = generateTotpSecret();
		const uri = totpProvisioningUri(secret, 'alice');
		expect(uri.startsWith('otpauth://totp/')).toBe(true);
		expect(uri).toContain('Mosi');
		expect(uri).toContain('alice');
		expect(uri).toContain(`secret=${secret}`);
	});

	it('honors a custom issuer', () => {
		const uri = totpProvisioningUri(generateTotpSecret(), 'bob', 'MyOrg');
		expect(uri).toContain('MyOrg');
		expect(uri).not.toContain('Mosi');
	});
});

describe('verifyTotpCode', () => {
	it('accepts a code generated with the same parameters (returns its step)', () => {
		const secret = generateTotpSecret();
		const code = referenceTotp(secret).generate();
		expect(verifyTotpCode(secret, code)).not.toBeNull();
	});

	it('rejects a wrong 6-digit code', () => {
		const secret = generateTotpSecret();
		expect(verifyTotpCode(secret, invalidCodeFor(secret))).toBeNull();
	});

	it('rejects malformed codes outright', () => {
		const secret = generateTotpSecret();
		expect(verifyTotpCode(secret, '12345')).toBeNull();
		expect(verifyTotpCode(secret, '1234567')).toBeNull();
		expect(verifyTotpCode(secret, 'abcdef')).toBeNull();
		expect(verifyTotpCode(secret, '')).toBeNull();
	});

	it('normalizes internal whitespace ("123 456" style input)', () => {
		const secret = generateTotpSecret();
		const code = referenceTotp(secret).generate();
		const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
		expect(verifyTotpCode(secret, spaced)).not.toBeNull();
		expect(verifyTotpCode(secret, ` ${code} `)).not.toBeNull();
	});

	it('returns the absolute step of the matched code, invariant across the drift window', () => {
		const secret = generateTotpSecret();
		const t0 = 1_700_000_100_000; // fixed ms, mid-window
		const code = referenceTotp(secret).generate({ timestamp: t0 });
		const expectedStep = Math.floor(t0 / 1000 / 30);
		expect(verifyTotpCode(secret, code, t0)).toBe(expectedStep);
		// The same code validated one period later (clock-drift tolerance) still
		// maps to the same step — that's what lets the replay guard reject reuse.
		expect(verifyTotpCode(secret, code, t0 + 30_000)).toBe(expectedStep);
		// A code minted in the next window yields a strictly higher step.
		const nextCode = referenceTotp(secret).generate({ timestamp: t0 + 30_000 });
		expect(verifyTotpCode(secret, nextCode, t0 + 30_000)).toBe(expectedStep + 1);
	});
});

describe('generateRecoveryCodes', () => {
	const UNAMBIGUOUS = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
	const FORMAT = new RegExp(`^[${UNAMBIGUOUS}]{4}-[${UNAMBIGUOUS}]{4}-[${UNAMBIGUOUS}]{4}$`);

	it('produces the requested number of unique XXXX-XXXX-XXXX codes', () => {
		const { plain, hashed } = generateRecoveryCodes(10);
		expect(plain).toHaveLength(10);
		expect(hashed).toHaveLength(10);
		expect(new Set(plain).size).toBe(10);
		for (const code of plain) expect(code).toMatch(FORMAT);
	});

	it('hashes each code with sha256 in order', () => {
		const { plain, hashed } = generateRecoveryCodes(5);
		for (let i = 0; i < plain.length; i++) {
			expect(hashed[i]).toMatch(/^[0-9a-f]{64}$/);
			expect(hashed[i]).toBe(hashRecoveryCode(plain[i]));
		}
	});

	it('defaults to 10 codes', () => {
		expect(generateRecoveryCodes().plain).toHaveLength(10);
	});
});

describe('consumeRecoveryCode', () => {
	it('returns the remaining 9 hashes when a valid code is used', () => {
		const { plain, hashed } = generateRecoveryCodes(10);
		const remaining = consumeRecoveryCode(plain[3], hashed);
		expect(remaining).toHaveLength(9);
		expect(remaining).not.toContain(hashed[3]);
	});

	it('is case-insensitive and ignores dashes', () => {
		const { plain, hashed } = generateRecoveryCodes(10);
		const mangled = plain[0].toLowerCase().replace(/-/g, '');
		const remaining = consumeRecoveryCode(mangled, hashed);
		expect(remaining).toHaveLength(9);
		expect(remaining).not.toContain(hashed[0]);
	});

	it('returns null for an unknown code', () => {
		const { hashed } = generateRecoveryCodes(10);
		expect(consumeRecoveryCode('NOPE-NOPE-NOPE', hashed)).toBeNull();
	});

	it('a consumed code cannot be reused', () => {
		const { plain, hashed } = generateRecoveryCodes(10);
		const remaining = consumeRecoveryCode(plain[0], hashed);
		expect(remaining).not.toBeNull();
		expect(consumeRecoveryCode(plain[0], remaining!)).toBeNull();
	});
});

describe('lockDurationMinutes', () => {
	it('does not lock below 5 failures', () => {
		for (const n of [0, 1, 2, 3, 4]) expect(lockDurationMinutes(n)).toBe(0);
	});

	it('doubles from 2 minutes starting at the 5th failure', () => {
		expect(lockDurationMinutes(5)).toBe(2);
		expect(lockDurationMinutes(6)).toBe(4);
		expect(lockDurationMinutes(7)).toBe(8);
		expect(lockDurationMinutes(8)).toBe(16);
		expect(lockDurationMinutes(9)).toBe(32);
	});

	it('caps at 60 minutes', () => {
		expect(lockDurationMinutes(10)).toBe(60);
		expect(lockDurationMinutes(15)).toBe(60);
		expect(lockDurationMinutes(100)).toBe(60);
	});
});
