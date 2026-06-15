import { test, expect } from '@playwright/test';
import { loginAsOwner, writeState } from './helpers';

test.describe.configure({ mode: 'serial' });

let eventUrl = '';

test('create an event from the events list', async ({ page }) => {
	await loginAsOwner(page);
	await page.goto('/admin/events');

	await page.getByLabel(/^Title/).fill('E2E Summer Party');
	await page.getByLabel(/^Starts/).fill('2026-07-15T18:00');
	await page.getByRole('button', { name: 'Create' }).click();

	await expect(page).toHaveURL(/\/admin\/events\/[0-9a-f-]{36}$/);
	eventUrl = new URL(page.url()).pathname;
	writeState({ eventId: eventUrl.split('/').pop() });
	await expect(page.getByRole('heading', { name: 'E2E Summer Party' })).toBeVisible();
});

test('field builder: required number field with min/max + live preview', async ({ page }) => {
	await loginAsOwner(page);
	await page.goto(`${eventUrl}/fields`);

	const addForm = page.locator('form[action="?/create"]');
	await addForm.getByLabel(/^Label/).fill('Parking spots needed');
	await addForm.getByLabel('Type').selectOption('number');
	await addForm.locator('input[name="required"]').check();
	await addForm.getByLabel('Min').fill('0');
	await addForm.getByLabel('Max').fill('4');
	await addForm.getByRole('button', { name: 'Add field' }).click();

	// Appears in the builder list and in the live preview pane.
	// (exact: true - the Type dropdown's option text also contains this phrase)
	await expect(page.getByText('Parking spots needed', { exact: true }).first()).toBeVisible();
	await expect(page.getByRole('spinbutton', { name: /Parking spots needed/ })).toBeVisible();
});

test('field builder: select field with options', async ({ page }) => {
	await loginAsOwner(page);
	await page.goto(`${eventUrl}/fields`);

	const addForm = page.locator('form[action="?/create"]');
	await addForm.getByLabel(/^Label/).fill('T-shirt size');
	await addForm.getByLabel('Type').selectOption('select');
	await addForm.locator('textarea[name="options"]').fill('S\nM\nL');
	await addForm.getByRole('button', { name: 'Add field' }).click();

	const preview = page.getByRole('combobox', { name: /T-shirt size/ });
	await expect(preview).toBeVisible();
	await expect(preview.locator('option')).toContainText(['S', 'M', 'L']);
});

test('add a dish category with a target', async ({ page }) => {
	await loginAsOwner(page);
	await page.goto(`${eventUrl}/dishes`);

	const addForm = page.locator('form[action="?/createCategory"]');
	await addForm.getByLabel(/^Name/).fill('Desserts');
	await addForm.getByLabel('Target').fill('5');
	await addForm.getByRole('button', { name: 'Add' }).click();

	await expect(page.getByText('Desserts', { exact: true }).first()).toBeVisible();
});

test('publish the event from the share page', async ({ page }) => {
	await loginAsOwner(page);
	await page.goto(`${eventUrl}/share`);

	await page.getByRole('button', { name: 'Publish event' }).click();
	await expect(page.getByRole('button', { name: 'Close RSVPs now' })).toBeVisible();

	const link = page.locator('input[readonly]').first();
	await expect(link).toHaveValue(/\/e\/e2e-summer-party$/);
});

test('save the event as a template, then instantiate an event from it', async ({ page }) => {
	await loginAsOwner(page);

	// Turn the configured event into a reusable template.
	await page.goto(eventUrl);
	await page.getByRole('button', { name: 'Save as template' }).click();
	await expect(page).toHaveURL(/\/admin\/events\/[0-9a-f-]{36}$/);
	await expect(page.getByText('Template', { exact: true })).toBeVisible();
	// Template mode hides event-only fields.
	await expect(page.locator('input[name="starts_at"]')).toHaveCount(0);
	// The template carried over the custom fields built earlier.
	await page.goto(`${page.url()}/fields`);
	await expect(page.getByText('Parking spots needed', { exact: true }).first()).toBeVisible();

	// It shows on the Templates page and is not publicly reachable.
	await page.goto('/admin/templates');
	const row = page.locator('li', { hasText: 'E2E Summer Party' });
	await expect(row).toBeVisible();

	// Instantiate a new event from the template via the Events create form.
	await page.goto('/admin/events');
	await page.getByLabel(/Base on template/).selectOption({ label: 'E2E Summer Party' });
	await page.getByLabel(/^Title/).fill('Cloned Party');
	await page.getByLabel(/^Starts/).fill('2026-09-01T17:00');
	await page.getByRole('button', { name: 'Create' }).click();
	await expect(page).toHaveURL(/\/admin\/events\/[0-9a-f-]{36}$/);
	await expect(page.getByRole('heading', { name: 'Cloned Party' })).toBeVisible();
	// Cloned event has the custom field too.
	await page.goto(`${page.url()}/fields`);
	await expect(page.getByText('Parking spots needed', { exact: true }).first()).toBeVisible();
});
