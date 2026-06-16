/**
 * Pure, browser-safe helpers for the guest "Add to calendar" UI. Kept separate
 * from `$lib/calendar.ts` (which pulls in Node `Buffer` for ICS folding) so the
 * client bundle stays clean. Unit-tested in tests/unit/calendar-options.test.ts.
 */

export type GuestOs = 'ios' | 'android' | 'other';

export type CalendarOption = {
	/** Stable key for {#each}. */
	key: 'apple' | 'google' | 'ics';
	label: string;
	href: string;
	/** Hint the browser to save the .ics (Apple Calendar / Outlook pick it up). */
	download: boolean;
	/** Open in a new tab (the Google template is a web page). */
	external: boolean;
};

/**
 * Best-guess the guest's OS from navigator hints so we can lead with the
 * calendar they almost certainly use. Pure so it can be unit-tested; the
 * component passes `navigator.{userAgent,platform,maxTouchPoints}`.
 */
export function detectGuestOs(
	userAgent: string,
	platform: string,
	maxTouchPoints: number
): GuestOs {
	if (/iPad|iPhone|iPod/.test(userAgent)) return 'ios';
	// iPadOS 13+ reports as desktop Safari on "MacIntel"; a touch screen gives it away.
	if (platform === 'MacIntel' && maxTouchPoints > 1) return 'ios';
	if (/Android/i.test(userAgent)) return 'android';
	return 'other';
}

/**
 * Calendar options ordered best-first for the detected OS. The .ics download
 * opens Apple Calendar on iOS/macOS and imports into Outlook/others on desktop;
 * Android users almost always want the Google Calendar template instead. The
 * first entry is the recommended ("primary") action.
 */
export function orderedCalendarOptions(
	os: GuestOs,
	icsHref: string | null,
	googleHref: string
): CalendarOption[] {
	const google: CalendarOption = {
		key: 'google',
		label: 'Google Calendar',
		href: googleHref,
		download: false,
		external: true
	};
	// Token-gated events without a usable token can't serve an .ics → Google only.
	if (!icsHref) return [google];

	const apple: CalendarOption = {
		key: 'apple',
		label: os === 'ios' ? 'Apple Calendar' : 'Add to calendar',
		href: icsHref,
		download: true,
		external: false
	};
	if (os === 'android') {
		return [google, { ...apple, key: 'ics', label: '.ics file' }];
	}
	return [apple, google];
}
