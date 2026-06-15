import QRCode from 'qrcode';
import { fail, redirect } from '@sveltejs/kit';
import { enrollTotp } from '$lib/server/auth/login';
import { createSession, setSessionCookie, rotateSessionForAmr } from '$lib/server/auth/session';
import { generateTotpSecret, totpProvisioningUri } from '$lib/server/auth/totp';
import {
	putEnrollmentSecret,
	getEnrollmentSecret,
	clearEnrollmentSecret
} from '$lib/server/auth/enrollment';
import { countAdminUsers, createAdminUser } from '$lib/server/services/users';
import { getSettings, updateSettings, markBootstrapCompleted } from '$lib/server/services/settings';
import { env } from '$lib/server/env';
import { timingSafeStrEqual } from '$lib/server/crypto/timing';
import type { Actions, PageServerLoad } from './$types';

const USERNAME_RE = /^[a-z0-9._-]{3,50}$/;

/** getClientAddress() throws when no address is available; sessions allow a null ip. */
function clientIp(getClientAddress: () => string): string | null {
	try {
		return getClientAddress();
	} catch {
		return null;
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	// hooks.server.ts guarantees this route is only reachable pre-bootstrap.
	const usersExist = (await countAdminUsers()) > 0;
	const settings = await getSettings();

	if (usersExist && !locals.session) {
		return { step: 'login-required' as const, orgName: settings.orgName };
	}

	if (locals.session && locals.user && (locals.user.totpEnabled || !env.requireTotp)) {
		// Either already enrolled (post-enroll re-run / later visit) or 2FA isn't
		// required - setup is complete; never hand out a fresh enrollment secret.
		return { step: 'done' as const, orgName: settings.orgName };
	}

	if (locals.session && locals.user) {
		let secret = getEnrollmentSecret(locals.session.id);
		if (!secret) {
			secret = generateTotpSecret();
			putEnrollmentSecret(locals.session.id, secret);
		}
		const uri = totpProvisioningUri(secret, locals.user.username, settings.orgName);
		const qrDataUrl = await QRCode.toDataURL(uri, { width: 240 });
		return {
			step: 'enroll' as const,
			orgName: settings.orgName,
			username: locals.user.username,
			qrDataUrl,
			secret
		};
	}

	return {
		step: 'create' as const,
		orgName: settings.orgName,
		needsBootstrapToken: Boolean(env.bootstrapToken)
	};
};

export const actions: Actions = {
	create: async ({ request, cookies, getClientAddress }) => {
		const form = await request.formData();
		const orgName = String(form.get('orgName') ?? '').trim();
		const username = String(form.get('username') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');
		const confirm = String(form.get('confirm') ?? '');
		const bootstrapToken = String(form.get('bootstrapToken') ?? '').trim();

		const values = { orgName, username };

		if (!USERNAME_RE.test(username)) {
			return fail(400, {
				error: 'Username must be 3-50 characters: lowercase letters, digits, ".", "_" or "-".',
				...values
			});
		}
		if (password.length < 10) {
			return fail(400, { error: 'Password must be at least 10 characters.', ...values });
		}
		if (password !== confirm) {
			return fail(400, { error: 'Passwords do not match.', ...values });
		}
		if (env.bootstrapToken && !timingSafeStrEqual(bootstrapToken, env.bootstrapToken)) {
			return fail(403, { error: 'Bootstrap token is incorrect.', ...values });
		}
		if ((await countAdminUsers()) > 0) {
			return fail(409, { error: 'Setup was already started - sign in to continue.', ...values });
		}

		const user = await createAdminUser({ username, password, role: 'owner' });
		if (orgName) await updateSettings({ orgName });

		const session = await createSession(
			user.id,
			['pwd'],
			clientIp(getClientAddress),
			request.headers.get('user-agent')
		);
		setSessionCookie(cookies, session.id, session.expiresAt);

		if (!env.requireTotp) {
			// 2FA optional: finish setup with just the owner account. The user can
			// still enable two-factor later from the account page.
			await markBootstrapCompleted();
			redirect(303, '/admin');
		}

		// Reload into the enroll step.
		redirect(303, '/admin/setup');
	},

	enroll: async ({ locals, request, cookies, getClientAddress }) => {
		if (!locals.session || !locals.user) {
			return fail(401, { error: 'Sign in first to finish enrolling two-factor.' });
		}
		if (locals.user.totpEnabled) {
			return fail(400, { error: 'Two-factor is already set up for this account.' });
		}

		const form = await request.formData();
		const code = String(form.get('code') ?? '').trim();

		const secret = getEnrollmentSecret(locals.session.id);
		if (!secret) return fail(400, { error: 'Enrollment expired - reload the page and rescan.' });

		const result = await enrollTotp(locals.user.id, secret, code);
		if (!result.ok) return fail(400, { error: 'Code didn’t match - try again.' });

		clearEnrollmentSecret(locals.session.id);
		// Rotate to a fresh session id on elevation (anti-fixation).
		await rotateSessionForAmr(
			cookies,
			locals.session,
			'totp',
			clientIp(getClientAddress),
			request.headers.get('user-agent')
		);
		await markBootstrapCompleted();

		// No redirect: the page renders the recovery codes exactly once.
		return { recoveryCodes: result.recoveryCodes };
	}
};
