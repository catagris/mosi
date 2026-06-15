import { fail, redirect } from '@sveltejs/kit';
import { verifyCredentials } from '$lib/server/auth/login';
import { createSession, setSessionCookie } from '$lib/server/auth/session';
import { getSettings } from '$lib/server/services/settings';
import { env } from '$lib/server/env';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const settings = await getSettings();
	return { orgName: settings.orgName, logoUrl: settings.logoUrl };
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		// Deliberately not trimmed - trimming would reject valid passwords.
		const password = String(form.get('password') ?? '');

		if (!username || !password) {
			return fail(400, { error: 'Enter your username and password.', username });
		}

		const result = await verifyCredentials(username, password);
		if (!result.ok) {
			if (result.reason === 'locked') {
				return fail(423, {
					error: `Account locked - try again after ${result.until.toLocaleTimeString()}.`,
					username
				});
			}
			return fail(400, { error: 'Invalid username or password.', username });
		}

		let ip: string | null = null;
		try {
			ip = getClientAddress();
		} catch {
			// no client address available (e.g. unusual proxy setups)
		}

		const session = await createSession(
			result.user.id,
			['pwd'],
			ip,
			request.headers.get('user-agent')
		);
		setSessionCookie(cookies, session.id, session.expiresAt);

		// Step 2 is needed only when the user has TOTP enabled (must verify) or
		// the instance requires enrollment. Otherwise the password alone is enough.
		const needsSecondFactor = result.user.totpEnabled || env.requireTotp;
		redirect(303, needsSecondFactor ? '/admin/login/2fa' : '/admin');
	}
};
