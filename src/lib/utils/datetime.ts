/**
 * Timezone helpers built on Intl (no date library).
 * Events store UTC instants plus an IANA timezone for display/input.
 */

/** Offset of `timeZone` from UTC at `date`, in milliseconds. */
export function tzOffsetMs(timeZone: string, date: Date): number {
	const dtf = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});
	const parts: Record<string, string> = {};
	for (const part of dtf.formatToParts(date)) parts[part.type] = part.value;
	const wall = Date.UTC(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
		parts.hour === '24' ? 0 : Number(parts.hour),
		Number(parts.minute),
		Number(parts.second)
	);
	return wall - Math.floor(date.getTime() / 1000) * 1000;
}

/** Interpret a `datetime-local` string ("2026-07-04T18:00") as wall time in `timeZone` → UTC Date. */
export function zonedLocalToUtc(local: string, timeZone: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
	if (!match) return null;
	const [, y, mo, d, h, mi, s] = match;
	const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0);
	if (Number.isNaN(asUtc)) return null;
	// Two-pass: guess with the offset at the naive instant, then correct (DST edges).
	const offset1 = tzOffsetMs(timeZone, new Date(asUtc));
	let ts = asUtc - offset1;
	const offset2 = tzOffsetMs(timeZone, new Date(ts));
	if (offset2 !== offset1) ts = asUtc - offset2;
	return new Date(ts);
}

/** UTC Date → `datetime-local` value rendered in `timeZone`. */
export function utcToZonedLocal(date: Date, timeZone: string): string {
	const dtf = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	});
	const parts: Record<string, string> = {};
	for (const part of dtf.formatToParts(date)) parts[part.type] = part.value;
	const hour = parts.hour === '24' ? '00' : parts.hour;
	return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

/** Human-friendly event time, e.g. "Sat, Jul 4, 2026, 6:00 PM PDT". */
export function formatEventTime(date: Date, timeZone: string): string {
	return new Intl.DateTimeFormat('en-US', {
		timeZone,
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZoneName: 'short'
	}).format(date);
}

/** Compact timestamp for admin lists, in the viewer's locale. */
export function formatShort(date: Date, timeZone?: string): string {
	return new Intl.DateTimeFormat('en-US', {
		timeZone,
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	}).format(date);
}

export function isValidTimezone(tz: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}
