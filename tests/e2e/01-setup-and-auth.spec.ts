import { test, expect } from '@playwright/test';
import {
	OWNER_PASSWORD,
	OWNER_USERNAME,
	readState,
	totpCode,
	verifyWithTotp,
	writeState
} from './helpers';

test.describe.configure({ mode: 'serial' });

test('fresh deploy redirects /admin to the setup wizard', async ({ page }) => {
	await page.goto('/admin');
	await expect(page).toHaveURL(/\/admin\/setup$/);
	await expect(page.getByRole('heading', { name: /Welcome to/ })).toBeVisible();
});

test('bootstrap: create owner, enroll TOTP, save recovery codes', async ({ page }) => {
	await page.goto('/admin/setup');

	// Step 1 - create the owner account.
	await page.getByLabel(/Organization \/ household name/).fill('E2E Org');
	await page.getByLabel('Username').fill(OWNER_USERNAME);
	await page.getByLabel('Password', { exact: true }).fill(OWNER_PASSWORD);
	await page.getByLabel('Confirm password').fill(OWNER_PASSWORD);
	await page.getByRole('button', { name: 'Create owner account' }).click();

	// Step 2 - TOTP enrollment: read the manual secret, answer with a live code.
	const secretLine = page.locator('p', { hasText: 'Enter this secret manually' });
	await expect(secretLine).toBeVisible();
	const secretText = (await secretLine.textContent()) ?? '';
	const secret = /manually:\s*([A-Z2-7]+)/.exec(secretText)?.[1];
	expect(secret, 'manual TOTP secret shown on the page').toBeTruthy();
	writeState({ totpSecret: secret });

	await page.getByLabel('6-digit code').fill(totpCode(secret!));
	await page.getByRole('button', { name: 'Activate two-factor' }).click();

	// Step 3 - recovery codes shown exactly once.
	await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
	const codes = await page.locator('ul.font-mono li').allTextContents();
	expect(codes).toHaveLength(10);
	writeState({ recoveryCodes: codes.map((c) => c.trim()) });

	await page.getByRole('link', { name: 'Finish - go to dashboard' }).click();
	await expect(page).toHaveURL(/\/admin$/);
	await expect(page.getByRole('link', { name: 'Events' })).toBeVisible();
});

test('setup is no longer reachable once bootstrap completes', async ({ page }) => {
	await page.goto('/admin/setup');
	await expect(page).toHaveURL(/\/admin\/login$|\/admin$/);
});

test('two-step login with password + TOTP', async ({ page }) => {
	await page.goto('/admin/login');
	await page.getByLabel('Username').fill(OWNER_USERNAME);
	await page.getByLabel('Password', { exact: true }).fill(OWNER_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page).toHaveURL(/\/admin\/login\/2fa$/);
	// Password alone must not grant access to the panel (half-auth).
	await page.goto('/admin/notifications');
	await expect(page).toHaveURL(/\/admin\/login\/2fa$/);

	await verifyWithTotp(page, readState().totpSecret!);
	await expect(page).toHaveURL(/\/admin$/);

	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/admin\/login$/);
});

test('login with a single-use recovery code', async ({ page }) => {
	const state = readState();
	const recoveryCode = state.recoveryCodes![0];

	await page.goto('/admin/login');
	await page.getByLabel('Username').fill(OWNER_USERNAME);
	await page.getByLabel('Password', { exact: true }).fill(OWNER_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.getByLabel('Authentication code').fill(recoveryCode);
	await page.getByRole('button', { name: 'Verify' }).click();
	await expect(page).toHaveURL(/\/admin\?recovery=used$/);

	// Mark the code consumed so later specs never reuse it.
	writeState({ recoveryCodes: state.recoveryCodes!.slice(1) });

	// The same code must not work twice.
	await page.getByRole('button', { name: 'Sign out' }).click();
	await page.getByLabel('Username').fill(OWNER_USERNAME);
	await page.getByLabel('Password', { exact: true }).fill(OWNER_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.getByLabel('Authentication code').fill(recoveryCode);
	await page.getByRole('button', { name: 'Verify' }).click();
	await expect(page.getByRole('alert')).toContainText('Invalid code');

	// Finish the login properly so the session ends in a clean state.
	await verifyWithTotp(page, readState().totpSecret!);
	await expect(page).toHaveURL(/\/admin(\?.*)?$/);
});

test('wrong password is rejected', async ({ page }) => {
	await page.goto('/admin/login');
	await page.getByLabel('Username').fill(OWNER_USERNAME);
	await page.getByLabel('Password', { exact: true }).fill('definitely-wrong');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/admin\/login$/);
	await expect(page.getByRole('alert')).toContainText('Invalid username or password');
});
