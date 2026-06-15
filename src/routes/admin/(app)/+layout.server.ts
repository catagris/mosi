import { requireUser } from '$lib/server/auth/guards';
import { getSettings } from '$lib/server/services/settings';
import { unreadNotificationCount } from '$lib/server/services/notifications';
import { env } from '$lib/server/env';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const [settings, unreadCount] = await Promise.all([getSettings(), unreadNotificationCount()]);

	return {
		// Only safe fields - never passwordHash / totpSecret / recoveryCodes.
		user: {
			id: user.id,
			username: user.username,
			role: user.role,
			totpEnabled: user.totpEnabled
		},
		orgName: settings.orgName,
		logoUrl: settings.logoUrl,
		unreadCount,
		pushEnabled: env.pushEnabled,
		vapidPublicKey: env.vapidPublicKey ?? null
	};
};
