import {
	createHash,
	createHmac,
	createCipheriv,
	createDecipheriv,
	hkdfSync,
	randomBytes
} from 'node:crypto';
import { env } from '$lib/server/env';

/**
 * Application-level encryption for PII at rest (email addresses).
 *
 * - Values are encrypted with AES-256-GCM (authenticated) and stored as
 *   `enc:v1:<base64(iv|tag|ciphertext)>`. The prefix makes storage
 *   self-describing, so legacy plaintext rows still read back unchanged and a
 *   one-time backfill can upgrade them.
 * - A separate keyed HMAC (`emailHash`) gives a deterministic, searchable token
 *   so emails can still be looked up (the "resend my link" flow) without
 *   decrypting every row.
 * - Two sub-keys (encrypt / MAC) are HKDF-derived from ENCRYPTION_KEY so the
 *   same secret is never reused for two purposes.
 *
 * When ENCRYPTION_KEY is unset, writes stay plaintext (backward compatible) and
 * lookups fall back to a plaintext match - but operators are urged to set it.
 *
 * NOTE: scripts/encrypt-existing.mjs reimplements this with identical
 * parameters; keep them in sync (prefix, HKDF info strings, AES-256-GCM, 12-byte
 * IV, 16-byte tag).
 */

const PREFIX = 'enc:v1:';
const IV_LEN = 12;
const TAG_LEN = 16;

type Keys = { enc: Buffer; mac: Buffer };

// The derivation (SHA-256 + two HKDF passes) is pure in ENCRYPTION_KEY, which never
// changes at runtime — so cache the result and only recompute if the secret itself
// changes (which in practice only happens in tests that stub the env).
let cached: { secret: string; keys: Keys } | null = null;

function deriveKeys(): Keys | null {
	const secret = env.encryptionKey;
	if (!secret) return null;
	if (cached && cached.secret === secret) return cached.keys;
	// Normalize any key string to 32 bytes, then split into purpose-specific keys.
	const master = createHash('sha256').update(secret).digest();
	const keys: Keys = {
		enc: Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'pp-email-enc-v1', 32)),
		mac: Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'pp-email-mac-v1', 32))
	};
	cached = { secret, keys };
	return keys;
}

export function encryptionEnabled(): boolean {
	return env.encryptionKey != null && env.encryptionKey !== '';
}

/** Encrypt an email for storage. Returns null for empty input; plaintext when no key. */
export function encryptEmail(email: string | null | undefined): string | null {
	if (!email) return null;
	const keys = deriveKeys();
	if (!keys) return email; // no key configured → store as-is (backward compatible)
	const iv = randomBytes(IV_LEN);
	const cipher = createCipheriv('aes-256-gcm', keys.enc, iv);
	const ciphertext = Buffer.concat([cipher.update(email, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/** Decrypt a stored value. Plaintext (non-prefixed) values pass through unchanged. */
export function decryptEmail(stored: string | null | undefined): string | null {
	if (!stored) return null;
	if (!stored.startsWith(PREFIX)) return stored; // legacy/plaintext
	const keys = deriveKeys();
	if (!keys) throw new Error('Encrypted email found but ENCRYPTION_KEY is not set');
	const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
	const iv = raw.subarray(0, IV_LEN);
	const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
	const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
	const decipher = createDecipheriv('aes-256-gcm', keys.enc, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Deterministic keyed hash of a normalized email, for equality lookups. Null when no key. */
export function emailHash(email: string | null | undefined): string | null {
	if (!email) return null;
	const keys = deriveKeys();
	if (!keys) return null;
	return createHmac('sha256', keys.mac).update(email.trim().toLowerCase()).digest('hex');
}
