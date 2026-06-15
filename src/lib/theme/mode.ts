/**
 * Client-side dark/light mode. Default follows the OS preference; an explicit
 * choice is persisted in localStorage and wins. The no-FOUC script in app.html
 * applies the stored/system value before first paint - this just toggles it.
 */

export type Mode = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function systemPrefersDark(): boolean {
	return (
		typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
	);
}

function stored(): Mode | null {
	if (typeof localStorage === 'undefined') return null;
	const value = localStorage.getItem(STORAGE_KEY);
	return value === 'dark' || value === 'light' ? value : null;
}

/** The effective mode right now (explicit choice, else system). */
export function currentMode(): Mode {
	return stored() ?? (systemPrefersDark() ? 'dark' : 'light');
}

function apply(mode: Mode): void {
	const root = document.documentElement;
	root.classList.toggle('dark', mode === 'dark');
	root.style.colorScheme = mode;
}

/** Persist an explicit choice and apply it. */
export function setMode(mode: Mode): void {
	localStorage.setItem(STORAGE_KEY, mode);
	apply(mode);
}

/** Flip light↔dark and return the new mode. */
export function toggleMode(): Mode {
	const next: Mode = currentMode() === 'dark' ? 'light' : 'dark';
	setMode(next);
	return next;
}

/** Forget the explicit choice and fall back to the OS preference. */
export function resetToSystem(): void {
	localStorage.removeItem(STORAGE_KEY);
	apply(systemPrefersDark() ? 'dark' : 'light');
}
