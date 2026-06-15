import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lookup } from 'node:dns/promises';
import { isPrivateIp, validateWebhookUrl, checkWebhookUrl } from '$lib/server/webhooks/ssrf';

// Keep tests offline-safe: never hit real DNS.
vi.mock('node:dns/promises', () => ({
	lookup: vi.fn(async () => {
		throw new Error('DNS lookup not mocked for this test');
	})
}));

const mockedLookup = vi.mocked(lookup);

beforeEach(() => {
	mockedLookup.mockReset();
	mockedLookup.mockRejectedValue(new Error('DNS lookup not mocked for this test'));
});

describe('isPrivateIp - IPv4', () => {
	it('blocks RFC1918 and loopback ranges', () => {
		expect(isPrivateIp('10.0.0.1')).toBe(true);
		expect(isPrivateIp('10.255.255.255')).toBe(true);
		expect(isPrivateIp('127.0.0.1')).toBe(true);
		expect(isPrivateIp('192.168.1.50')).toBe(true);
		expect(isPrivateIp('172.16.0.1')).toBe(true);
		expect(isPrivateIp('172.31.255.255')).toBe(true);
	});

	it('only blocks 172.16/12, not the rest of 172/8', () => {
		expect(isPrivateIp('172.15.0.1')).toBe(false);
		expect(isPrivateIp('172.32.0.1')).toBe(false);
	});

	it('blocks link-local (cloud metadata), 0/8 and multicast/reserved', () => {
		expect(isPrivateIp('169.254.169.254')).toBe(true);
		expect(isPrivateIp('0.0.0.0')).toBe(true);
		expect(isPrivateIp('0.1.2.3')).toBe(true);
		expect(isPrivateIp('224.0.0.1')).toBe(true);
		expect(isPrivateIp('255.255.255.255')).toBe(true);
	});

	it('blocks CGNAT shared space (100.64.0.0/10)', () => {
		expect(isPrivateIp('100.64.0.1')).toBe(true);
		expect(isPrivateIp('100.100.50.1')).toBe(true);
		expect(isPrivateIp('100.127.255.255')).toBe(true);
		// Just outside the /10 stays public.
		expect(isPrivateIp('100.63.255.255')).toBe(false);
		expect(isPrivateIp('100.128.0.0')).toBe(false);
	});

	it('allows public addresses', () => {
		expect(isPrivateIp('8.8.8.8')).toBe(false);
		expect(isPrivateIp('1.1.1.1')).toBe(false);
		expect(isPrivateIp('192.169.1.1')).toBe(false);
		expect(isPrivateIp('169.253.1.1')).toBe(false);
	});

	it('treats malformed addresses as private (fail closed)', () => {
		expect(isPrivateIp('999.1.1.1')).toBe(true);
		expect(isPrivateIp('1.2.3')).toBe(true);
		expect(isPrivateIp('1.2.3.4.5')).toBe(true);
		expect(isPrivateIp('not-an-ip')).toBe(true);
		expect(isPrivateIp('')).toBe(true);
	});
});

describe('isPrivateIp - IPv6', () => {
	it('blocks loopback, unspecified, link-local and unique-local', () => {
		expect(isPrivateIp('::1')).toBe(true);
		expect(isPrivateIp('::')).toBe(true);
		expect(isPrivateIp('fe80::1')).toBe(true);
		expect(isPrivateIp('fc00::1')).toBe(true);
		expect(isPrivateIp('fd12:3456::1')).toBe(true);
	});

	it('recurses into v4-mapped addresses', () => {
		expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
		expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
		expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);
	});

	it('blocks v4-mapped addresses in hex-group form (the URL-normalized shape)', () => {
		expect(isPrivateIp('::ffff:7f00:1')).toBe(true); // 127.0.0.1
		expect(isPrivateIp('::ffff:a00:1')).toBe(true); // 10.0.0.1
		expect(isPrivateIp('::ffff:c0a8:101')).toBe(true); // 192.168.1.1
		expect(isPrivateIp('::ffff:808:808')).toBe(false); // 8.8.8.8 (public)
	});

	it('allows public IPv6', () => {
		expect(isPrivateIp('2606:4700::1111')).toBe(false);
		expect(isPrivateIp('2001:4860:4860::8888')).toBe(false);
	});
});

describe('validateWebhookUrl', () => {
	it('accepts a public https URL', () => {
		const result = validateWebhookUrl('https://hooks.example.com/notify', false);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.url.hostname).toBe('hooks.example.com');
	});

	it('accepts plain http to a public host', () => {
		expect(validateWebhookUrl('http://example.com/hook', false).ok).toBe(true);
	});

	it('rejects non-http(s) protocols', () => {
		const result = validateWebhookUrl('ftp://example.com/file', false);
		expect(result).toEqual({ ok: false, reason: 'Only http(s) URLs are allowed' });
		expect(validateWebhookUrl('file:///etc/passwd', false).ok).toBe(false);
	});

	it('rejects URLs with embedded credentials', () => {
		const result = validateWebhookUrl('https://user:pass@example.com/hook', false);
		expect(result).toEqual({ ok: false, reason: 'Credentials in the URL are not allowed' });
		expect(validateWebhookUrl('https://user@example.com/hook', false).ok).toBe(false);
	});

	it('rejects unparseable URLs', () => {
		expect(validateWebhookUrl('not a url', false)).toEqual({
			ok: false,
			reason: 'Not a valid URL'
		});
		expect(validateWebhookUrl('', false).ok).toBe(false);
	});

	it('rejects localhost and .local hosts unless allowPrivate', () => {
		expect(validateWebhookUrl('http://localhost:8080/notify', false).ok).toBe(false);
		expect(validateWebhookUrl('http://foo.localhost/notify', false).ok).toBe(false);
		expect(validateWebhookUrl('http://printer.local/notify', false).ok).toBe(false);
		expect(validateWebhookUrl('http://localhost:8080/notify', true).ok).toBe(true);
		expect(validateWebhookUrl('http://printer.local/notify', true).ok).toBe(true);
	});

	it('rejects literal private IPs unless allowPrivate', () => {
		expect(validateWebhookUrl('http://192.168.1.10/notify', false).ok).toBe(false);
		expect(validateWebhookUrl('http://10.0.0.5:3000/notify', false).ok).toBe(false);
		expect(validateWebhookUrl('http://169.254.169.254/latest/meta-data', false).ok).toBe(false);
		expect(validateWebhookUrl('http://[::1]:3000/notify', false).ok).toBe(false);
		expect(validateWebhookUrl('http://192.168.1.10/notify', true).ok).toBe(true);
		expect(validateWebhookUrl('http://[::1]:3000/notify', true).ok).toBe(true);
	});

	it('allows literal public IPs', () => {
		expect(validateWebhookUrl('http://8.8.8.8/notify', false).ok).toBe(true);
	});

	it('blocks decimal/octal/hex IPv4 spellings of private hosts', () => {
		// The WHATWG URL parser normalizes these numeric forms to dotted-quad,
		// so the static private-IP screen catches them.
		expect(validateWebhookUrl('http://2130706433/notify', false).ok).toBe(false); // 127.0.0.1
		expect(validateWebhookUrl('http://0x7f000001/notify', false).ok).toBe(false); // 0x7f000001
		expect(validateWebhookUrl('http://017700000001/notify', false).ok).toBe(false); // octal
		expect(validateWebhookUrl('http://127.1/notify', false).ok).toBe(false); // short form
	});

	it('blocks v4-mapped IPv6 literals for private hosts', () => {
		expect(validateWebhookUrl('http://[::ffff:127.0.0.1]/notify', false).ok).toBe(false);
		expect(validateWebhookUrl('http://[::ffff:7f00:1]/notify', false).ok).toBe(false);
	});
});

describe('checkWebhookUrl', () => {
	it('short-circuits without DNS when allowPrivate is true', async () => {
		const result = await checkWebhookUrl('http://localhost:8080/notify', true);
		expect(result.ok).toBe(true);
		expect(mockedLookup).not.toHaveBeenCalled();
	});

	it('short-circuits without DNS for literal IPs', async () => {
		expect((await checkWebhookUrl('https://8.8.8.8/notify', false)).ok).toBe(true);
		expect((await checkWebhookUrl('https://10.0.0.5/notify', false)).ok).toBe(false);
		expect(mockedLookup).not.toHaveBeenCalled();
	});

	it('fails fast on an invalid URL without DNS', async () => {
		const result = await checkWebhookUrl('not a url', false);
		expect(result).toEqual({ ok: false, reason: 'Not a valid URL' });
		expect(mockedLookup).not.toHaveBeenCalled();
	});

	it('rejects hostnames that resolve to a private address (mocked DNS)', async () => {
		mockedLookup.mockResolvedValue([
			{ address: '93.184.216.34', family: 4 },
			{ address: '10.0.0.5', family: 4 }
		] as never);
		const result = await checkWebhookUrl('https://internal.example.com/hook', false);
		expect(result).toEqual({ ok: false, reason: 'Host resolves to a private address (10.0.0.5)' });
	});

	it('accepts hostnames that resolve only to public addresses (mocked DNS)', async () => {
		mockedLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
		const result = await checkWebhookUrl('https://hooks.example.com/notify', false);
		expect(result.ok).toBe(true);
	});

	it('rejects hostnames that do not resolve (mocked DNS failure)', async () => {
		mockedLookup.mockRejectedValue(new Error('ENOTFOUND'));
		const result = await checkWebhookUrl('https://nope.invalid/hook', false);
		expect(result).toEqual({ ok: false, reason: 'Hostname did not resolve' });
	});
});
