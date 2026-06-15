import type { EventTheme } from '$lib/server/db/schema';

/** "#7c3aed" → "124 58 237" (RGB triplet for Tailwind alpha support). */
export function hexToRgbTriplet(hex: string): string | null {
	const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!match) return null;
	const value = parseInt(match[1], 16);
	return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

/**
 * Build an inline `style` attribute that overrides the theme CSS variables
 * for one event (or the instance default).
 */
export function themeStyle(theme: EventTheme | null | undefined, fallbackPrimary?: string): string {
	const parts: string[] = [];
	const primary = theme?.primaryColor ?? fallbackPrimary;
	if (primary) {
		const triplet = hexToRgbTriplet(primary);
		if (triplet) parts.push(`--color-primary: ${triplet}`);
	}
	if (theme?.accent) {
		const triplet = hexToRgbTriplet(theme.accent);
		if (triplet) parts.push(`--color-accent: ${triplet}`);
	}
	if (theme?.font) {
		// Font family names only - strip anything that could escape the declaration.
		const safe = theme.font.replace(/[^a-zA-Z0-9 ,'-]/g, '');
		if (safe) parts.push(`--font-event: ${safe}`);
	}
	return parts.join('; ');
}
