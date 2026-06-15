import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as OTPAuth from 'otpauth';
import { expect, type Page } from '@playwright/test';

/**
 * Cross-spec state for the serial E2E journey (specs run in filename order,
 * sharing one database lifetime per run).
 */

const STATE_PATH = join(dirname(fileURLToPath(import.meta.url)), '.state.json');

export type E2eState = {
	totpSecret?: string;
	recoveryCodes?: string[];
	eventId?: string;
	editUrl?: string;
};

export function readState(): E2eState {
	if (!existsSync(STATE_PATH)) return {};
	return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as E2eState;
}

export function writeState(patch: Partial<E2eState>): E2eState {
	const next = { ...readState(), ...patch };
	writeFileSync(STATE_PATH, JSON.stringify(next, null, '\t'));
	return next;
}

export const OWNER_USERNAME = 'owner';
export const OWNER_PASSWORD = 'e2e-password-123!';

/** Bot-protection minimum submit time on guest forms (server enforces 2s). */
export const SUBMIT_WAIT_MS = 2_500;

export function totpCode(secret: string): string {
	return new OTPAuth.TOTP({
		secret: OTPAuth.Secret.fromBase32(secret),
		algorithm: 'SHA1',
		digits: 6,
		period: 30
	}).generate();
}

/**
 * Drive the guest RSVP wizard (JS mode) to its end and submit. Clicks "Next"
 * until the submit button appears, then waits out the bot timer and submits.
 * Use when the relevant fields are already filled/prefilled.
 */
export async function finishWizard(page: Page, submitName: RegExp): Promise<void> {
	const submit = page.getByRole('button', { name: submitName });
	for (let i = 0; i < 8; i++) {
		if (await submit.isVisible().catch(() => false)) break;
		const next = page.getByRole('button', { name: /Next/ }).first();
		if (!(await next.isVisible().catch(() => false))) break;
		await next.click();
		await page.waitForTimeout(150);
	}
	await page.waitForTimeout(SUBMIT_WAIT_MS);
	await submit.click();
}

/** Idempotent owner login: password step + fresh TOTP code. */
export async function loginAsOwner(page: Page): Promise<void> {
	await page.goto('/admin/login');
	// Hooks redirect fully-authenticated sessions straight to the dashboard.
	if (new URL(page.url()).pathname === '/admin') return;

	await page.getByLabel('Username').fill(OWNER_USERNAME);
	await page.getByLabel('Password', { exact: true }).fill(OWNER_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page).toHaveURL(/\/admin\/login\/2fa$/);
	const secret = readState().totpSecret;
	if (!secret) throw new Error('No TOTP secret in E2E state - run 01-setup first');
	await page.getByLabel('Authentication code').fill(totpCode(secret));
	await page.getByRole('button', { name: 'Verify' }).click();
	await expect(page).toHaveURL(/\/admin(\?.*)?$/);
}
