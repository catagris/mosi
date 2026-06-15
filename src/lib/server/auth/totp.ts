import * as OTPAuth from 'otpauth';
import { createHash, randomBytes } from 'node:crypto';
import { timingSafeStrEqual } from '$lib/server/crypto/timing';

const TOTP_PARAMS = { algorithm: 'SHA1', digits: 6, period: 30 } as const;

export function generateTotpSecret(): string {
	return new OTPAuth.Secret({ size: 20 }).base32;
}

export function buildTotp(secret: string, username: string, issuer = 'Mosi'): OTPAuth.TOTP {
	return new OTPAuth.TOTP({
		issuer,
		label: username,
		secret: OTPAuth.Secret.fromBase32(secret),
		...TOTP_PARAMS
	});
}

/** otpauth:// provisioning URI for QR codes. */
export function totpProvisioningUri(secret: string, username: string, issuer = 'Mosi'): string {
	return buildTotp(secret, username, issuer).toString();
}

/**
 * Verify a 6-digit code, allowing ±1 time step of clock drift. Returns the
 * absolute TOTP step (counter) the code belongs to — this is invariant across
 * the drift window, so callers can persist it and reject replays of an
 * already-accepted step. Returns null for a malformed or invalid code.
 */
export function verifyTotpCode(
	secret: string,
	code: string,
	now: number = Date.now()
): number | null {
	const normalized = code.replace(/\s+/g, '');
	if (!/^\d{6}$/.test(normalized)) return null;
	const delta = buildTotp(secret, 'verify').validate({
		token: normalized,
		window: 1,
		timestamp: now
	});
	if (delta === null) return null;
	// validate() returns (token step − current step); add it back to recover the
	// absolute step the code was minted for, regardless of when we validated it.
	return Math.floor(now / 1000 / TOTP_PARAMS.period) + delta;
}

// ---------------------------------------------------------------------------
// Recovery codes - single-use, stored hashed (sha256 of normalized code).
// ---------------------------------------------------------------------------

const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // no ambiguous chars
const RECOVERY_GROUPS = 3;
const RECOVERY_GROUP_LEN = 4;

export function generateRecoveryCodes(count = 10): { plain: string[]; hashed: string[] } {
	const plain: string[] = [];
	for (let i = 0; i < count; i++) {
		const groups: string[] = [];
		for (let g = 0; g < RECOVERY_GROUPS; g++) {
			let group = '';
			const bytes = randomBytes(RECOVERY_GROUP_LEN);
			for (let c = 0; c < RECOVERY_GROUP_LEN; c++) {
				group += RECOVERY_ALPHABET[bytes[c] % RECOVERY_ALPHABET.length];
			}
			groups.push(group);
		}
		plain.push(groups.join('-'));
	}
	return { plain, hashed: plain.map(hashRecoveryCode) };
}

export function hashRecoveryCode(code: string): string {
	const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
	return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Check `input` against the stored hashed codes. Returns the remaining list
 * (with the used code removed) when valid, or null when invalid.
 */
export function consumeRecoveryCode(input: string, hashedCodes: string[]): string[] | null {
	const candidate = hashRecoveryCode(input);
	// Compare against every stored hash without an early exit, so the response time
	// doesn't reveal which (if any) code position matched. Each comparison is
	// constant-time; both sides are 64-hex SHA-256 digests of equal length.
	let index = -1;
	for (let i = 0; i < hashedCodes.length; i++) {
		if (timingSafeStrEqual(candidate, hashedCodes[i])) index = i;
	}
	if (index === -1) return null;
	return [...hashedCodes.slice(0, index), ...hashedCodes.slice(index + 1)];
}
