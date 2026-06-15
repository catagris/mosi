import { describe, it, expect } from 'vitest';
import {
	tzOffsetMs,
	zonedLocalToUtc,
	utcToZonedLocal,
	formatEventTime,
	formatShort,
	isValidTimezone
} from '$lib/utils/datetime';

describe('zonedLocalToUtc', () => {
	it('converts a PDT summer wall time to UTC (UTC-7)', () => {
		const date = zonedLocalToUtc('2026-07-04T18:00', 'America/Los_Angeles');
		expect(date?.toISOString()).toBe('2026-07-05T01:00:00.000Z');
	});

	it('converts a PST winter wall time to UTC (UTC-8)', () => {
		const date = zonedLocalToUtc('2026-01-15T12:00', 'America/Los_Angeles');
		expect(date?.toISOString()).toBe('2026-01-15T20:00:00.000Z');
	});

	it('handles eastern timezones (UTC+ offsets)', () => {
		const date = zonedLocalToUtc('2026-07-04T18:00', 'Asia/Tokyo');
		expect(date?.toISOString()).toBe('2026-07-04T09:00:00.000Z');
	});

	it('supports an optional seconds component', () => {
		const date = zonedLocalToUtc('2026-07-04T18:00:30', 'UTC');
		expect(date?.toISOString()).toBe('2026-07-04T18:00:30.000Z');
	});

	it('passes UTC wall times through unchanged', () => {
		const date = zonedLocalToUtc('2026-07-04T18:00', 'UTC');
		expect(date?.toISOString()).toBe('2026-07-04T18:00:00.000Z');
	});

	it('returns a valid nearby instant for a DST spring-forward gap', () => {
		// 2:30 AM on 2026-03-08 does not exist in America/Los_Angeles.
		const date = zonedLocalToUtc('2026-03-08T02:30', 'America/Los_Angeles');
		expect(date).not.toBeNull();
		const target = Date.UTC(2026, 2, 8, 10, 30);
		expect(Math.abs(date!.getTime() - target)).toBeLessThanOrEqual(3_600_000);
	});

	it('returns null for malformed input', () => {
		expect(zonedLocalToUtc('not-a-date', 'UTC')).toBeNull();
		expect(zonedLocalToUtc('2026-07-04', 'UTC')).toBeNull();
		expect(zonedLocalToUtc('', 'UTC')).toBeNull();
		expect(zonedLocalToUtc('2026/07/04T18:00', 'UTC')).toBeNull();
	});

	it('tolerates surrounding whitespace', () => {
		expect(zonedLocalToUtc('  2026-07-04T18:00  ', 'UTC')?.toISOString()).toBe('2026-07-04T18:00:00.000Z');
	});
});

describe('utcToZonedLocal', () => {
	it('renders a UTC instant as a datetime-local string in the target zone', () => {
		expect(utcToZonedLocal(new Date('2026-07-05T01:00:00Z'), 'America/Los_Angeles')).toBe('2026-07-04T18:00');
		expect(utcToZonedLocal(new Date('2026-01-15T20:00:00Z'), 'America/Los_Angeles')).toBe('2026-01-15T12:00');
	});

	it('round-trips with zonedLocalToUtc', () => {
		for (const [local, tz] of [
			['2026-07-04T18:00', 'America/New_York'],
			['2026-12-25T09:30', 'Europe/Berlin'],
			['2026-02-01T00:00', 'UTC']
		] as const) {
			const utc = zonedLocalToUtc(local, tz);
			expect(utc).not.toBeNull();
			expect(utcToZonedLocal(utc!, tz)).toBe(local);
		}
	});

	it('renders midnight as 00, not 24', () => {
		expect(utcToZonedLocal(new Date('2026-07-04T00:00:00Z'), 'UTC')).toBe('2026-07-04T00:00');
	});
});

describe('tzOffsetMs', () => {
	it('reports the standard and daylight offsets for Los Angeles', () => {
		expect(tzOffsetMs('America/Los_Angeles', new Date('2026-07-04T12:00:00Z'))).toBe(-7 * 3_600_000);
		expect(tzOffsetMs('America/Los_Angeles', new Date('2026-01-15T12:00:00Z'))).toBe(-8 * 3_600_000);
	});

	it('reports zero for UTC', () => {
		expect(tzOffsetMs('UTC', new Date('2026-07-04T12:00:00Z'))).toBe(0);
	});
});

describe('formatEventTime', () => {
	it('contains weekday, date, time and timezone abbreviation', () => {
		const text = formatEventTime(new Date('2026-07-05T01:00:00Z'), 'America/Los_Angeles');
		expect(text).toContain('Sat');
		expect(text).toContain('Jul');
		expect(text).toContain('4');
		expect(text).toContain('2026');
		expect(text).toContain('6:00');
		expect(text).toContain('PM');
		expect(text).toContain('PDT');
	});
});

describe('formatShort', () => {
	it('contains the month, day and time', () => {
		const text = formatShort(new Date('2026-07-05T01:00:00Z'), 'UTC');
		expect(text).toContain('Jul');
		expect(text).toContain('5');
		expect(text).toContain('1:00');
	});
});

describe('isValidTimezone', () => {
	it('accepts real IANA zones', () => {
		expect(isValidTimezone('America/New_York')).toBe(true);
		expect(isValidTimezone('Europe/Berlin')).toBe(true);
		expect(isValidTimezone('UTC')).toBe(true);
	});

	it('rejects bogus zones', () => {
		expect(isValidTimezone('Not/AZone')).toBe(false);
		expect(isValidTimezone('Mars/Olympus_Mons')).toBe(false);
	});
});
