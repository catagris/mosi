import { env } from '$lib/server/env';
import { countAdminUsers, createAdminUser } from '$lib/server/services/users';
import { markBootstrapCompleted } from '$lib/server/services/settings';

/**
 * First-run admin bootstrap from environment variables.
 *
 * When ADMIN_PASSWORD is set and no admin exists yet, the owner account is
 * created automatically (username from ADMIN_USERNAME, default "admin") and
 * bootstrap is marked complete - so `docker compose up` can come online with a
 * working login and no manual wizard step. If REQUIRE_TOTP is left at its
 * default, that owner still enrolls TOTP at first login; with REQUIRE_TOTP=false
 * the password alone signs them in (handy for automated testing).
 *
 * Runs at most once per process; a failure (e.g. DB not ready) is not cached,
 * so the next request retries.
 */
let pending: Promise<void> | undefined;

export function ensureEnvAdmin(): Promise<void> {
	if (!pending) {
		pending = run().catch((err) => {
			pending = undefined; // allow a retry on the next request
			throw err;
		});
	}
	return pending;
}

async function run(): Promise<void> {
	if (!env.adminPassword) return;
	if ((await countAdminUsers()) > 0) return;

	try {
		await createAdminUser({
			username: env.adminUsername,
			password: env.adminPassword,
			role: 'owner'
		});
		await markBootstrapCompleted();
		console.log(`Bootstrapped admin "${env.adminUsername}" from environment.`);
	} catch (err) {
		// A concurrent request may have created it first (unique username) - fine.
		if ((await countAdminUsers()) === 0) throw err;
	}
}
