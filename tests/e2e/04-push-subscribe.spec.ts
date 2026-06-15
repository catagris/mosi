import { test, expect } from '@playwright/test';
import { loginAsOwner } from './helpers';

test.describe.configure({ mode: 'serial' });

const FAKE_SUBSCRIPTION = {
	endpoint: 'https://localhost:9/push/e2e-fake-endpoint',
	keys: { p256dh: 'BFakeClientPublicKey', auth: 'fakeauthsecret' }
};

test('admin registers a push subscription and manages devices', async ({ page }) => {
	await loginAsOwner(page);

	// VAPID is configured in the E2E env, so the endpoint accepts subscriptions.
	const subscribe = await page.request.post('/admin/push/subscribe', { data: FAKE_SUBSCRIPTION });
	expect(subscribe.status()).toBe(200);
	expect(await subscribe.json()).toEqual({ ok: true });

	// The device shows up on the account page…
	await page.goto('/admin/account');
	await expect(page.locator('form[action="?/removeDevice"]')).toBeVisible();

	// …and can be removed from the UI.
	await page.locator('form[action="?/removeDevice"] button').first().click();
	await expect(page.getByText('No devices registered for push alerts yet.')).toBeVisible();
});

test('unsubscribe endpoint removes a registered subscription', async ({ page }) => {
	await loginAsOwner(page);
	await page.request.post('/admin/push/subscribe', { data: FAKE_SUBSCRIPTION });

	const unsubscribe = await page.request.post('/admin/push/unsubscribe', {
		data: { endpoint: FAKE_SUBSCRIPTION.endpoint }
	});
	expect(unsubscribe.status()).toBe(200);

	await page.goto('/admin/account');
	await expect(page.getByText('No devices registered for push alerts yet.')).toBeVisible();
});

test('unauthenticated subscribe attempts are rejected', async ({ browser }) => {
	const context = await browser.newContext();
	const response = await context.request.post('/admin/push/subscribe', {
		data: FAKE_SUBSCRIPTION,
		maxRedirects: 0
	});
	expect([303, 400, 401, 403]).toContain(response.status());
	await context.close();
});
