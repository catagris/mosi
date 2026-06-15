import type { AdminUser, AdminSession } from '$lib/server/db/schema';

declare global {
	namespace App {
		interface Locals {
			/** Fully authenticated admin user (password + TOTP when enabled), null otherwise. */
			user: AdminUser | null;
			/** Session row if a valid session cookie is present (may be half-authenticated). */
			session: AdminSession | null;
			/** True when the session has satisfied all required auth factors. */
			fullyAuthenticated: boolean;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
