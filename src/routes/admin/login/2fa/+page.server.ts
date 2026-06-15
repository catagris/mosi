import QRCode from 'qrcode';
import { fail, redirect } from '@sveltejs/kit';
import { verifySecondFactor, enrollTotp } from '$lib/server/auth/login';
import { rotateSessionForAmr } from '$lib/server/auth/session';
import { generateTotpSecret, totpProvisioningUri } from '$lib/server/auth/totp';
import {
	putEnrollmentSecret,
	getEnrollmentSecret,
	clearEnrollmentSecret
} from '$lib/server/auth/enrollment';
import {
	isAdminUserLocked,
	recordSecondFactorFailure,
	clearLoginFailures
} from '$lib/server/services/users';
import { getSettings } from '$lib/server/services/settings';
import { env } from '$lib/server/env';
import type { Actions, PageServerLoad } from './$types';

/** getClientAddress() throws when no address is available; sessions allow a null ip. */
function clientIp(getClientAddress: () => string): string | null {
	try {
		return getClientAddress();
	} catch {
		return null;
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	// hooks.server.ts guarantees a session here - belt and braces.
	if (!locals.session || !locals.user) redirect(303, '/admin/login');

	const settings = await getSettings();

	if (locals.user.totpEnabled) {
		return { mode: 'verify' as const, orgName: settings.orgName, username: locals.user.username };
	}

	// 2FA optional and not enrolled → password already fully authenticated them.
	if (!env.requireTotp) redirect(303, '/admin');

	// Forced enrollment: the user has no TOTP yet (fresh user or owner-reset).
	let secret = getEnrollmentSecret(locals.session.id);
	if (!secret) {
		secret = generateTotpSecret();
		putEnrollmentSecret(locals.session.id, secret);
	}
	const uri = totpProvisioningUri(secret, locals.user.username, settings.orgName);
	const qrDataUrl = await QRCode.toDataURL(uri, { width: 240 });

	return {
		mode: 'enroll' as const,
		orgName: settings.orgName,
		username: locals.user.username,
		qrDataUrl,
		secret
	};
};

export const actions: Actions = {
	verify: async ({ locals, request, cookies, getClientAddress }) => {
		if (!locals.session || !locals.user) redirect(303, '/admin/login');

		// Per-account lockout covers the second factor too (not just IP throttling
		// in hooks): a stolen password shouldn't grant unlimited TOTP guesses.
		if (isAdminUserLocked(locals.user)) {
			return fail(429, { error: 'Too many attempts - wait a bit and try again.' });
		}

		const form = await request.formData();
		const code = String(form.get('code') ?? '').trim();

		const result = await verifySecondFactor(locals.user, code);
		if (!result.ok) {
			await recordSecondFactorFailure(locals.user);
			return fail(400, { error: 'Invalid code - try again.' });
		}

		await clearLoginFailures(locals.user);
		// Rotate to a fresh session id on elevation (anti-fixation).
		await rotateSessionForAmr(
			cookies,
			locals.session,
			'totp',
			clientIp(getClientAddress),
			request.headers.get('user-agent')
		);
		redirect(303, result.usedRecoveryCode ? '/admin?recovery=used' : '/admin');
	},

	enroll: async ({ locals, request, cookies, getClientAddress }) => {
		if (!locals.session || !locals.user) redirect(303, '/admin/login');
		if (locals.user.totpEnabled) {
			return fail(400, { error: 'Two-factor is already set up - enter a code from your app.' });
		}

		const form = await request.formData();
		const code = String(form.get('code') ?? '').trim();

		const secret = getEnrollmentSecret(locals.session.id);
		if (!secret) return fail(400, { error: 'Enrollment expired - reload the page and rescan.' });

		const result = await enrollTotp(locals.user.id, secret, code);
		if (!result.ok) return fail(400, { error: 'Code didn’t match - try again.' });

		clearEnrollmentSecret(locals.session.id);
		await rotateSessionForAmr(
			cookies,
			locals.session,
			'totp',
			clientIp(getClientAddress),
			request.headers.get('user-agent')
		);

		// No redirect: the page renders the recovery codes exactly once.
		return { recoveryCodes: result.recoveryCodes };
	}
};
