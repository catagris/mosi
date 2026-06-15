import QRCode from 'qrcode';
import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { adminUsers, pushSubscriptions } from '$lib/server/db/schema';
import { requireUser } from '$lib/server/auth/guards';
import { verifyPassword } from '$lib/server/auth/password';
import {
	verifyTotpCode,
	generateRecoveryCodes,
	generateTotpSecret,
	totpProvisioningUri
} from '$lib/server/auth/totp';
import { enrollTotp } from '$lib/server/auth/login';
import { rotateSessionForAmr } from '$lib/server/auth/session';
import {
	putEnrollmentSecret,
	getEnrollmentSecret,
	clearEnrollmentSecret
} from '$lib/server/auth/enrollment';
import { changePassword, disableTotp } from '$lib/server/services/users';
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
	const user = requireUser(locals);

	// Device metadata only - never endpoint/keys.
	const devices = await getDb()
		.select({
			id: pushSubscriptions.id,
			userAgent: pushSubscriptions.userAgent,
			createdAt: pushSubscriptions.createdAt,
			lastUsedAt: pushSubscriptions.lastUsedAt
		})
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.userId, user.id));

	let totpSetup: { qrDataUrl: string; secret: string } | null = null;
	if (!user.totpEnabled && locals.session) {
		// Provision a secret for voluntary enrollment (kept server-side, keyed by session).
		let secret = getEnrollmentSecret(locals.session.id);
		if (!secret) {
			secret = generateTotpSecret();
			putEnrollmentSecret(locals.session.id, secret);
		}
		const settings = await getSettings();
		const uri = totpProvisioningUri(secret, user.username, settings.orgName);
		totpSetup = { qrDataUrl: await QRCode.toDataURL(uri, { width: 240 }), secret };
	}

	return {
		devices,
		recoveryCodesRemaining: user.recoveryCodes.length,
		totpEnabled: user.totpEnabled,
		requireTotp: env.requireTotp,
		totpSetup
	};
};

export const actions: Actions = {
	password: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const currentPassword = String(form.get('currentPassword') ?? '');
		const newPassword = String(form.get('newPassword') ?? '');
		const confirm = String(form.get('confirm') ?? '');

		if (newPassword.length < 10) {
			return fail(400, { passwordError: 'New password must be at least 10 characters.' });
		}
		if (newPassword !== confirm) {
			return fail(400, { passwordError: 'New passwords do not match.' });
		}
		if (!(await verifyPassword(user.passwordHash, currentPassword))) {
			return fail(400, { passwordError: 'Current password is incorrect.' });
		}

		await changePassword(user.id, newPassword, locals.session?.id);
		return { passwordChanged: true };
	},

	enableTotp: async ({ locals, request, cookies, getClientAddress }) => {
		const user = requireUser(locals);
		if (!locals.session) return fail(401, { enrollError: 'Session expired - sign in again.' });
		if (user.totpEnabled) {
			return fail(400, { enrollError: 'Two-factor is already enabled.' });
		}

		const form = await request.formData();
		const code = String(form.get('code') ?? '').trim();

		const secret = getEnrollmentSecret(locals.session.id);
		if (!secret) return fail(400, { enrollError: 'Setup expired - reload the page and rescan.' });

		const result = await enrollTotp(user.id, secret, code);
		if (!result.ok) return fail(400, { enrollError: 'That code didn’t match - try again.' });

		clearEnrollmentSecret(locals.session.id);
		// Rotate to a fresh session id on elevation (anti-fixation).
		await rotateSessionForAmr(
			cookies,
			locals.session,
			'totp',
			clientIp(getClientAddress),
			request.headers.get('user-agent')
		);
		return { recoveryCodes: result.recoveryCodes };
	},

	disableTotp: async ({ locals, request }) => {
		const user = requireUser(locals);
		if (env.requireTotp) {
			return fail(403, { disableError: 'Two-factor is required on this deployment.' });
		}
		if (!user.totpEnabled) return fail(400, { disableError: 'Two-factor is not enabled.' });

		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		if (!(await verifyPassword(user.passwordHash, password))) {
			return fail(400, { disableError: 'Password is incorrect.' });
		}

		await disableTotp(user.id);
		return { totpDisabled: true };
	},

	regenerateCodes: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const code = String(form.get('code') ?? '').trim();

		if (!user.totpEnabled || !user.totpSecret) {
			return fail(400, { regenerateError: 'Two-factor is not set up on this account.' });
		}
		// Must be a live TOTP code - recovery codes can't mint new recovery codes.
		if (verifyTotpCode(user.totpSecret, code) === null) {
			return fail(400, { regenerateError: 'Invalid authenticator code.' });
		}

		const { plain, hashed } = generateRecoveryCodes(10);
		await getDb()
			.update(adminUsers)
			.set({ recoveryCodes: hashed, updatedAt: new Date() })
			.where(eq(adminUsers.id, user.id));

		// Shown exactly once.
		return { recoveryCodes: plain };
	},

	removeDevice: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const deviceId = String(form.get('deviceId') ?? '');

		if (!deviceId) return fail(400, { deviceError: 'Missing device id.' });

		await getDb()
			.delete(pushSubscriptions)
			.where(and(eq(pushSubscriptions.id, deviceId), eq(pushSubscriptions.userId, user.id)));

		return { deviceRemoved: true };
	}
};
