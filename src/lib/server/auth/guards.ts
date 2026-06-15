import { redirect, error } from '@sveltejs/kit';
import type { AdminUser } from '$lib/server/db/schema';

/** Require a fully-authenticated admin; redirects to login otherwise. */
export function requireUser(locals: App.Locals): AdminUser {
	if (!locals.user || !locals.fullyAuthenticated) redirect(303, '/admin/login');
	return locals.user;
}

/** Require the owner role (admin user management, etc.). */
export function requireOwner(locals: App.Locals): AdminUser {
	const user = requireUser(locals);
	if (user.role !== 'owner') error(403, 'Owner access required');
	return user;
}
