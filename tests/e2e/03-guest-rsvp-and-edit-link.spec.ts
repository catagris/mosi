import { test, expect } from '@playwright/test';
import { SUBMIT_WAIT_MS, finishWizard, loginAsOwner, readState, writeState } from './helpers';

test.describe.configure({ mode: 'serial' });

const EVENT_PATH = '/e/e2e-summer-party';

test('guest submits an RSVP through the wizard (custom fields + dish)', async ({ page }) => {
	await page.goto(EVENT_PATH);
	await expect(page.getByRole('heading', { name: 'E2E Summer Party' })).toBeVisible();

	// Step 1 - response. "Yes" is the default; confirm and advance.
	await expect(page.locator('input[name="response"][value="yes"]')).toBeChecked();
	await page.getByRole('button', { name: /Next/ }).click();

	// Step 2 - about you.
	await expect(page.getByLabel(/Your name/)).toBeVisible();
	await page.getByLabel(/Your name/).fill('Gina Guest');
	await page.getByRole('button', { name: /Next/ }).click();

	// Step 3 - allergies (events collect these by default). Optional, so advance.
	await expect(page.getByRole('heading', { name: /Allergies/ })).toBeVisible();
	await page.getByRole('button', { name: /Next/ }).click();

	// Step 4 - dishes.
	await expect(page.locator('input[name="dish_item_0"]')).toBeVisible();
	await page.locator('input[name="dish_item_0"]').fill('Pavlova');
	await page.locator('select[name="dish_category_0"]').selectOption({ label: 'Desserts' });
	await page.locator('input[name="dish_serves_0"]').fill('8');
	await page.getByRole('button', { name: /Next/ }).click();

	// Step 5 - custom field details.
	await expect(page.getByRole('spinbutton', { name: /Parking spots needed/ })).toBeVisible();
	await page.getByRole('spinbutton', { name: /Parking spots needed/ }).fill('2');
	await page.getByRole('combobox', { name: 'T-shirt size' }).selectOption('M');
	await page.getByRole('button', { name: /Next/ }).click();

	// Step 6 - review + send (bot timer enforces a minimum render-to-submit gap).
	await expect(page.getByRole('button', { name: /Send my RSVP/ })).toBeVisible();
	await page.waitForTimeout(SUBMIT_WAIT_MS);
	await page.getByRole('button', { name: /Send my RSVP/ }).click();

	await expect(page).toHaveURL(/\/thanks\?token=/);
	await expect(page.getByText('Save this link to edit your RSVP later')).toBeVisible();
	const editUrl = await page.locator('input[readonly]').first().inputValue();
	expect(editUrl).toMatch(/\/e\/e2e-summer-party\/edit\//);
	writeState({ editUrl });

	// Add-to-calendar is offered and the .ics endpoint serves a calendar file.
	await expect(page.getByRole('link', { name: /Add to calendar/ })).toBeVisible();
	const ics = await page.request.get('/e/e2e-summer-party/event.ics');
	expect(ics.status()).toBe(200);
	expect(ics.headers()['content-type']).toContain('text/calendar');
	expect(await ics.text()).toContain('BEGIN:VEVENT');
});

test('guest edits their RSVP via the private edit link', async ({ page }) => {
	const { editUrl } = readState();
	await page.goto(editUrl!);

	// Prefill - assert via name locators (fields may sit on collapsed wizard steps).
	// The field's key derives from its label "Parking spots needed".
	await expect(page.locator('input[name="guestName"]')).toHaveValue('Gina Guest');
	await expect(page.locator('input[name="response"][value="yes"]')).toBeChecked();
	await expect(page.locator('input[name="cf_parking_spots_needed"]')).toHaveValue('2');

	// Switch to "maybe" (step 1), then walk the wizard to the end and save.
	await page.locator('input[name="response"][value="maybe"]').check();
	await finishWizard(page, /Save changes/);
	await expect(page.getByText('Your RSVP has been updated')).toBeVisible();
});

test('guest withdraws, then re-joins', async ({ page }) => {
	const { editUrl } = readState();
	await page.goto(editUrl!);

	page.on('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: /Withdraw my RSVP/ }).click();
	await expect(page.getByText(/withdrawn this RSVP/)).toBeVisible();

	// Re-join: re-select Yes and save through the wizard.
	await page.locator('input[name="response"][value="yes"]').check();
	await finishWizard(page, /Save changes/);
	await expect(page.getByText('Your RSVP has been updated')).toBeVisible();
});

test('admin sees the guest, regenerates the edit link, exports CSV', async ({ page }) => {
	const state = readState();
	await loginAsOwner(page);
	await page.goto(`/admin/events/${state.eventId}/rsvps`);

	const row = page.locator('tr', { hasText: 'Gina Guest' });
	await expect(row).toBeVisible();

	// Custom-field answers are visible in the expandable details.
	await row.getByText('answers').click();
	await expect(row.getByText('Parking spots needed')).toBeVisible();
	await expect(row.getByText('T-shirt size')).toBeVisible();

	// Regenerate the guest's edit link: old link dies, new one works.
	await row.locator('form[action="?/regenerate"] button').click();
	await expect(page.getByText('Edit link regenerated')).toBeVisible();
	const newLink = await page
		.locator('div', { hasText: 'Edit link regenerated' })
		.locator('input[readonly]')
		.first()
		.inputValue();
	expect(newLink).toMatch(/\/edit\//);
	expect(newLink).not.toBe(state.editUrl);

	const oldResponse = await page.request.get(state.editUrl!);
	expect(oldResponse.status()).toBe(404);
	const newResponse = await page.request.get(newLink);
	expect(newResponse.status()).toBe(200);
	writeState({ editUrl: newLink });

	// CSV export includes custom-field columns and the guest row.
	const csv = await page.request.get(`/admin/events/${state.eventId}/rsvps/export.csv`);
	expect(csv.status()).toBe(200);
	expect(csv.headers()['content-type']).toContain('text/csv');
	const body = await csv.text();
	expect(body).toContain('Parking spots needed');
	expect(body).toContain('Gina Guest');

	// The alias path also serves the export (via redirect).
	const alias = await page.request.get(`/admin/events/${state.eventId}/export.csv`);
	expect(alias.status()).toBe(200);
	expect(await alias.text()).toContain('Gina Guest');
});
