import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Alias to the canonical guest-list export handler. */
export const GET: RequestHandler = async ({ params }) => {
	redirect(307, `/admin/events/${params.id}/rsvps/export.csv`);
};
