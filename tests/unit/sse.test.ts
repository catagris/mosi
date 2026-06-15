import { describe, it, expect, afterEach } from 'vitest';
import {
	createSseResponse,
	sseClientCount,
	MAX_GLOBAL_CLIENTS,
	MAX_PER_USER_CLIENTS
} from '$lib/server/sse';

// Track opened connections so each test can tear them down (the hub is global
// module state) and leave a clean slate for the next.
const opened: AbortController[] = [];

function connect(userId: string): Response {
	const ac = new AbortController();
	opened.push(ac);
	return createSseResponse(null, ac.signal, userId);
}

afterEach(() => {
	for (const ac of opened) ac.abort();
	opened.length = 0;
});

describe('SSE connection caps', () => {
	it('evicts a user’s oldest streams beyond the per-user ceiling', () => {
		for (let i = 0; i < MAX_PER_USER_CLIENTS + 3; i++) connect('alice');
		expect(sseClientCount()).toBe(MAX_PER_USER_CLIENTS);
	});

	it('counts users independently', () => {
		for (let i = 0; i < MAX_PER_USER_CLIENTS; i++) connect('alice');
		for (let i = 0; i < 3; i++) connect('bob');
		expect(sseClientCount()).toBe(MAX_PER_USER_CLIENTS + 3);
	});

	it('releases a slot when a connection aborts', () => {
		const ac = new AbortController();
		createSseResponse(null, ac.signal, 'carol');
		expect(sseClientCount()).toBe(1);
		ac.abort();
		expect(sseClientCount()).toBe(0);
	});

	it('rejects with 503 once the global ceiling is reached', () => {
		// Distinct users so the per-user cap never trims our fill.
		for (let i = 0; i < MAX_GLOBAL_CLIENTS; i++) connect(`u${i}`);
		expect(sseClientCount()).toBe(MAX_GLOBAL_CLIENTS);

		const overflow = connect('u-extra');
		expect(overflow.status).toBe(503);
		expect(overflow.headers.get('Retry-After')).toBe('30');
		// The rejected connection was not registered.
		expect(sseClientCount()).toBe(MAX_GLOBAL_CLIENTS);
	});
});
