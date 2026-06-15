import { describe, it, expect } from 'vitest';
import { isFullyAuthenticated } from '$lib/server/auth/session';
import type { AdminSession, AdminUser } from '$lib/server/db/schema';

const session = (amr: string[]) => ({ amr }) as AdminSession;
const user = (totpEnabled: boolean) => ({ totpEnabled }) as AdminUser;

describe('isFullyAuthenticated', () => {
	it('always requires the password factor', () => {
		expect(isFullyAuthenticated(session([]), user(false), false)).toBe(false);
		expect(isFullyAuthenticated(session([]), user(false), true)).toBe(false);
		// A stray totp claim without pwd is never sufficient.
		expect(isFullyAuthenticated(session(['totp']), user(true), true)).toBe(false);
	});

	it('a user with TOTP enabled must always complete it (never weakened)', () => {
		expect(isFullyAuthenticated(session(['pwd']), user(true), true)).toBe(false);
		expect(isFullyAuthenticated(session(['pwd']), user(true), false)).toBe(false);
		expect(isFullyAuthenticated(session(['pwd', 'totp']), user(true), true)).toBe(true);
		expect(isFullyAuthenticated(session(['pwd', 'totp']), user(true), false)).toBe(true);
	});

	it('an un-enrolled user is full-auth on password alone only when TOTP is optional', () => {
		expect(isFullyAuthenticated(session(['pwd']), user(false), false)).toBe(true);
		expect(isFullyAuthenticated(session(['pwd']), user(false), true)).toBe(false);
	});
});
