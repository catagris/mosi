<script lang="ts">
	import { enhance } from '$app/forms';
	import { confirmSubmit } from '$lib/utils/confirmSubmit';
	import TimezoneSelect from '$lib/components/admin-events/TimezoneSelect.svelte';
	import WebhookForm from '$lib/components/admin-events/WebhookForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const org = $derived(form?.org ?? null);
	const webhookForm = $derived(form?.webhookForm ?? null);

	// Bound to the native picker, so it needs to stay local $state — but it must
	// also reflect the latest server round-trip rather than snapshotting the first
	// render, otherwise the color reverts after a failed save. Re-sync via effect.
	let primaryColor = $state('');
	$effect(() => {
		primaryColor = form?.org?.values?.primary_color ?? data.settings.primaryColor;
	});

	function scopeTitle(eventId: string | null): string {
		if (!eventId) return 'All events';
		return data.events.find((e) => e.id === eventId)?.title ?? 'All events';
	}
</script>

<svelte:head>
	<title>Settings - Mosi</title>
</svelte:head>

<div class="space-y-8">
	<h1 class="text-2xl font-bold text-ink">Settings</h1>

	{#if form?.saved}
		<div
			class="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300"
		>
			Settings saved.
		</div>
	{/if}

	<section class="card space-y-4">
		<h2 class="text-lg font-semibold text-ink">Organization</h2>
		<form method="POST" action="?/save" use:enhance class="space-y-4">
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class="label" for="org-name"
						>Name <span class="text-red-600 dark:text-red-400">*</span></label
					>
					<input
						id="org-name"
						name="org_name"
						class="input"
						value={org?.values.org_name ?? data.settings.orgName}
						required
					/>
					{#if org?.errors.org_name}<p class="field-error">{org.errors.org_name}</p>{/if}
				</div>
				<div>
					<label class="label" for="org-logo">Logo URL (optional)</label>
					<input
						id="org-logo"
						type="url"
						name="logo_url"
						class="input"
						value={org?.values.logo_url ?? data.settings.logoUrl ?? ''}
					/>
					{#if org?.errors.logo_url}<p class="field-error">{org.errors.logo_url}</p>{/if}
				</div>
				<div>
					<label class="label" for="org-timezone">Default timezone</label>
					<TimezoneSelect
						id="org-timezone"
						name="default_timezone"
						value={org?.values.default_timezone ?? data.settings.defaultTimezone}
						timezones={data.timezones}
					/>
					{#if org?.errors.default_timezone}
						<p class="field-error">{org.errors.default_timezone}</p>
					{/if}
				</div>
				<div>
					<label class="label" for="org-color">Primary color</label>
					<div class="flex items-center gap-2">
						<input
							id="org-color"
							type="color"
							name="primary_color"
							bind:value={primaryColor}
							class="h-9 w-12 cursor-pointer rounded border border-line"
						/>
						<code class="text-sm text-muted">{primaryColor}</code>
					</div>
					{#if org?.errors.primary_color}
						<p class="field-error">{org.errors.primary_color}</p>
					{/if}
				</div>
			</div>
			<button type="submit" class="btn-primary">Save settings</button>
		</form>
	</section>

	<section class="grid gap-4 sm:grid-cols-2">
		<div class="card space-y-2">
			<div class="flex items-center justify-between">
				<h2 class="font-semibold text-ink">Email (guest magic links)</h2>
				<span
					class="badge {data.email.enabled
						? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300'
						: 'bg-line text-muted'}"
				>
					{data.email.enabled ? 'On' : 'Off'}
				</span>
			</div>
			{#if data.email.enabled}
				<p class="text-sm text-muted">
					Sending via <code>{data.email.host}</code> as <code>{data.email.from}</code>. Guests who
					give an email get their edit link mailed to them.
				</p>
			{:else}
				<p class="text-sm text-muted">
					Off - set <code>SMTP_HOST</code> to enable guest magic-link emails. Guests still get their edit
					link on the thanks page.
				</p>
			{/if}
		</div>

		<div class="card space-y-2">
			<div class="flex items-center justify-between">
				<h2 class="font-semibold text-ink">Web Push (admin phones)</h2>
				<span
					class="badge {data.pushEnabled
						? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300'
						: 'bg-line text-muted'}"
				>
					{data.pushEnabled ? 'On' : 'Off'}
				</span>
			</div>
			{#if data.pushEnabled}
				<p class="text-sm text-muted">
					On - admins can enable device notifications from the dashboard or their account page.
				</p>
			{:else}
				<p class="text-sm text-muted">
					Off - set VAPID keys to enable phone push. Generate them once with
					<code>npx web-push generate-vapid-keys</code>.
				</p>
			{/if}
		</div>
	</section>

	<section class="space-y-4">
		<h2 class="text-lg font-semibold text-ink">Webhook notifiers</h2>
		<p class="text-sm text-muted">
			POST RSVP alerts to ntfy, Telegram, or any JSON endpoint - handy if you already run a notifier
			app.
		</p>

		{#if form?.testResult}
			<div
				class="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
			>
				Test result: {form.testResult}
			</div>
		{/if}

		<details class="card" open={webhookForm?.id === null}>
			<summary class="cursor-pointer font-medium text-primary">Add notifier</summary>
			<div class="mt-4">
				<WebhookForm
					action="?/createWebhook"
					events={data.events}
					errors={webhookForm?.id === null ? webhookForm.errors : null}
					values={webhookForm?.id === null ? webhookForm.values : null}
					submitLabel="Add notifier"
				/>
			</div>
		</details>

		{#if data.webhooks.length === 0}
			<p class="card text-sm text-muted">No webhook notifiers configured.</p>
		{:else}
			<div class="space-y-3">
				{#each data.webhooks as webhook (webhook.id)}
					<div class="card space-y-3 p-4 {webhook.active ? '' : 'opacity-70'}">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<span class="font-medium text-ink">{webhook.label}</span>
									<span class="badge bg-line text-muted">{webhook.format}</span>
									<span
										class="badge {webhook.active
											? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300'
											: 'bg-line text-muted'}"
									>
										{webhook.active ? 'active' : 'paused'}
									</span>
								</div>
								<p class="max-w-xl truncate text-xs text-muted" title={webhook.url}>
									{webhook.url}
								</p>
								<p class="text-xs text-muted">
									{scopeTitle(webhook.eventId)} · {webhook.eventTypes.join(', ')}
								</p>
							</div>
							<div class="flex shrink-0 flex-wrap items-center gap-2">
								<form method="POST" action="?/testWebhook" use:enhance>
									<input type="hidden" name="id" value={webhook.id} />
									<button type="submit" class="btn-secondary px-2 py-1 text-xs">Send test</button>
								</form>
								<form method="POST" action="?/toggleWebhook" use:enhance>
									<input type="hidden" name="id" value={webhook.id} />
									<button type="submit" class="btn-secondary px-2 py-1 text-xs">
										{webhook.active ? 'Pause' : 'Resume'}
									</button>
								</form>
								<form
									method="POST"
									action="?/deleteWebhook"
									use:enhance={confirmSubmit(`Delete the “${webhook.label}” webhook notifier?`)}
								>
									<input type="hidden" name="id" value={webhook.id} />
									<button
										type="submit"
										class="text-xs text-red-600 hover:underline dark:text-red-400"
									>
										Delete
									</button>
								</form>
							</div>
						</div>

						<details open={webhookForm?.id === webhook.id}>
							<summary class="cursor-pointer text-sm font-medium text-primary">Edit</summary>
							<div class="mt-3 border-t border-line pt-3">
								<WebhookForm
									action="?/updateWebhook"
									{webhook}
									events={data.events}
									errors={webhookForm?.id === webhook.id ? webhookForm.errors : null}
									values={webhookForm?.id === webhook.id ? webhookForm.values : null}
									submitLabel="Save notifier"
								/>
							</div>
						</details>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
