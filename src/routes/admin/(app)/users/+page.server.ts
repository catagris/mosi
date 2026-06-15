import { fail } from '@sveltejs/kit';
import { requireOwner } from '$lib/server/auth/guards';
import {
	listAdminUsers,
	createAdminUser,
	deleteAdminUser,
	unlockAdminUser,
	resetTotp
} from '$lib/server/services/users';
import type { Actions, PageServerLoad } from './$types';

const USERNAME_RE = /^[a-z0-9._-]{3,50}$/;

export const load: PageServerLoad = async ({ locals }) => {
	requireOwner(locals);

	const users = await listAdminUsers();
	return {
		admins: users.map((u) => ({
			id: u.id,
			username: u.username,
			role: u.role,
			totpEnabled: u.totpEnabled,
			lastLoginAt: u.lastLoginAt,
			lockedUntil: u.lockedUntil,
			createdAt: u.createdAt
		}))
	};
};

/** pg unique-violation, with or without a drizzle wrapper in between. */
function isDuplicateKeyError(err: unknown): boolean {
	const e = err as { code?: string; cause?: { code?: string } };
	return e?.code === '23505' || e?.cause?.code === '23505';
}

export const actions: Actions = {
	create: async ({ locals, request }) => {
		requireOwner(locals);
		const form = await request.formData();
		const username = String(form.get('username') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');
		const role = String(form.get('role') ?? 'admin');

		const values = { username, role };

		if (!USERNAME_RE.test(username)) {
			return fail(400, {
				createError:
					'Username must be 3-50 characters: lowercase letters, digits, ".", "_" or "-".',
				...values
			});
		}
		if (password.length < 10) {
			return fail(400, {
				createError: 'Temporary password must be at least 10 characters.',
				...values
			});
		}
		if (role !== 'owner' && role !== 'admin') {
			return fail(400, { createError: 'Invalid role.', ...values });
		}

		try {
			await createAdminUser({ username, password, role });
		} catch (err) {
			if (isDuplicateKeyError(err)) {
				return fail(409, { createError: 'That username is already taken.', ...values });
			}
			throw err;
		}

		return { created: true };
	},

	delete: async ({ locals, request }) => {
		const me = requireOwner(locals);
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');

		const admins = await listAdminUsers();
		const target = admins.find((u) => u.id === userId);
		if (!target) return fail(404, { actionError: 'User not found.' });
		if (target.id === me.id) {
			return fail(400, { actionError: 'You can’t delete your own account.' });
		}
		if (target.role === 'owner' && admins.filter((u) => u.role === 'owner').length <= 1) {
			return fail(400, { actionError: 'You can’t delete the last owner.' });
		}

		await deleteAdminUser(target.id);
		return { deleted: true };
	},

	unlock: async ({ locals, request }) => {
		requireOwner(locals);
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		if (!userId) return fail(400, { actionError: 'Missing user id.' });

		await unlockAdminUser(userId);
		return { unlocked: true };
	},

	reset2fa: async ({ locals, request }) => {
		const me = requireOwner(locals);
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		if (!userId) return fail(400, { actionError: 'Missing user id.' });
		// Mirrors the delete self-guard: resetting your own 2FA here would strip
		// your second factor without re-enrolling, leaving the account weaker.
		if (userId === me.id) {
			return fail(400, {
				actionError: 'You can’t reset your own 2FA here — manage it from your account page.'
			});
		}

		// Clears the secret + recovery codes and revokes the user's sessions;
		// they re-enroll at their next login.
		await resetTotp(userId);
		return { reset: true };
	}
};
