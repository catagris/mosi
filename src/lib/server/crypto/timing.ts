import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string equality.
 *
 * `crypto.timingSafeEqual` requires equal-length buffers, so a length mismatch
 * (the common case for a wrong/absent secret) short-circuits to `false`. That
 * leaks length but not content, which is the standard trade-off for comparing
 * secrets of otherwise-fixed length (tokens, hashes).
 */
export function timingSafeStrEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	return ab.length === bb.length && timingSafeEqual(ab, bb);
}
