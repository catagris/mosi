import { fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards';
import {
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead
} from '$lib/server/services/notifications';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireUser(locals);
	return { notifications: await listNotifications(100) };
};

export const actions: Actions = {
	markAllRead: async ({ locals }) => {
		requireUser(locals);
		await markAllNotificationsRead();
		return { ok: true };
	},

	markRead: async ({ locals, request }) => {
		requireUser(locals);
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing notification id.' });
		await markNotificationRead(id);
		return { ok: true };
	}
};
