import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF guard for outbound webhook URLs.
 * Private/loopback/link-local ranges are blocked unless the self-hoster
 * explicitly opts in (ALLOW_PRIVATE_WEBHOOKS=true) for LAN notifiers.
 */

export function isPrivateIp(ip: string): boolean {
	if (ip.includes(':')) {
		// IPv6
		const lower = ip.toLowerCase();
		if (lower === '::1' || lower === '::') return true;
		if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
		// IPv4-mapped/compatible — screen the embedded v4 in BOTH dotted
		// (::ffff:127.0.0.1) and hex-group (::ffff:7f00:1) forms. The WHATWG URL
		// parser normalizes the dotted form into the hex form, which a naive
		// dotted-only check would wave through.
		const mapped = embeddedIpv4(lower);
		if (mapped) return isPrivateIp(mapped);
		return false;
	}
	const octets = ip.split('.').map(Number);
	if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return true;
	const [a, b] = octets;
	if (a === 10 || a === 127 || a === 0) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	if (a === 169 && b === 254) return true; // link-local / cloud metadata
	if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT shared space (RFC 6598)
	if (a >= 224) return true; // multicast/reserved
	return false;
}

/** Embedded IPv4 from a `::ffff:`-prefixed IPv6, as a dotted quad, or null. */
function embeddedIpv4(lowerIpv6: string): string | null {
	if (!lowerIpv6.startsWith('::ffff:')) return null;
	const suffix = lowerIpv6.slice('::ffff:'.length);
	if (suffix.includes('.')) return suffix; // ::ffff:127.0.0.1
	const groups = suffix.split(':'); // ::ffff:7f00:1  →  ["7f00","1"]
	if (groups.length !== 2) return null;
	const hi = parseInt(groups[0], 16);
	const lo = parseInt(groups[1], 16);
	if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
	return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join('.');
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** Static (no-DNS) validation - used when admins save a webhook endpoint. */
export function validateWebhookUrl(rawUrl: string, allowPrivate: boolean): UrlCheck {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return { ok: false, reason: 'Not a valid URL' };
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		return { ok: false, reason: 'Only http(s) URLs are allowed' };
	}
	if (url.username || url.password) {
		return { ok: false, reason: 'Credentials in the URL are not allowed' };
	}
	const hostname = url.hostname.replace(/^\[|\]$/g, '');
	if (!allowPrivate) {
		if (
			hostname === 'localhost' ||
			hostname.endsWith('.localhost') ||
			hostname.endsWith('.local')
		) {
			return {
				ok: false,
				reason: 'Private/loopback hosts are blocked (set ALLOW_PRIVATE_WEBHOOKS=true to allow)'
			};
		}
		if (isIP(hostname) && isPrivateIp(hostname)) {
			return {
				ok: false,
				reason: 'Private IP ranges are blocked (set ALLOW_PRIVATE_WEBHOOKS=true to allow)'
			};
		}
	}
	return { ok: true, url };
}

/** Full validation incl. DNS resolution - used right before each send. */
export async function checkWebhookUrl(rawUrl: string, allowPrivate: boolean): Promise<UrlCheck> {
	const staticCheck = validateWebhookUrl(rawUrl, allowPrivate);
	if (!staticCheck.ok || allowPrivate) return staticCheck;

	const hostname = staticCheck.url.hostname.replace(/^\[|\]$/g, '');
	if (isIP(hostname)) return staticCheck; // already screened above

	// Best-effort pre-flight: resolve and reject if any address is private. We do
	// NOT pin to the resolved IP — fetch resolves again on its own, which keeps
	// normal DNS failover and picks up IP changes (self-hosted targets often have
	// stable DNS but rotating IPs). The blocklist above is the real guard.
	try {
		const results = await lookup(hostname, { all: true });
		for (const { address } of results) {
			if (isPrivateIp(address)) {
				return { ok: false, reason: `Host resolves to a private address (${address})` };
			}
		}
	} catch {
		return { ok: false, reason: 'Hostname did not resolve' };
	}
	return staticCheck;
}
