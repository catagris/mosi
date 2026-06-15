import { json } from '@sveltejs/kit';
import { getSettings } from '$lib/server/services/settings';
import type { RequestHandler } from './$types';

/**
 * `short_name` should stay ≤12 chars for home-screen labels. Truncate the org name
 * (preferring a word boundary) instead of discarding it for a generic fallback —
 * e.g. "Riverside Community" → "Riverside", not "Mosi".
 */
function shortName(name: string): string {
	if (name.length <= 12) return name;
	const clipped = name.slice(0, 12);
	const lastSpace = clipped.lastIndexOf(' ');
	return (lastSpace >= 4 ? clipped.slice(0, lastSpace) : clipped).trim();
}

/** PWA manifest: org-branded, installable, standalone. */
export const GET: RequestHandler = async () => {
	let orgName = 'Mosi';
	let themeColor = '#4f46e5';
	try {
		const settings = await getSettings();
		orgName = settings.orgName;
		themeColor = settings.primaryColor;
	} catch {
		// DB not up yet - serve defaults so install/registration still works.
	}

	return json(
		{
			name: orgName,
			short_name: shortName(orgName),
			description: 'Party & event RSVP admin',
			start_url: '/admin',
			scope: '/',
			display: 'standalone',
			background_color: '#fafaf9',
			theme_color: themeColor,
			icons: [
				{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
				{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
				{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
			]
		},
		{ headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=300' } }
	);
};
