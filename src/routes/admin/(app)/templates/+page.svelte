<script lang="ts">
	import { enhance } from '$app/forms';
	import TimezoneSelect from '$lib/components/admin-events/TimezoneSelect.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const createErrors = $derived(form?.create?.errors ?? null);
	const createValues = $derived(form?.create?.values ?? null);
</script>

<svelte:head>
	<title>Templates - Mosi</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-ink">Templates</h1>
		<p class="mt-1 text-sm text-muted">
			Reusable event setups. Create an event from a template (on the Events page or here) to copy
			its fields, dish categories, options, and theme.
		</p>
	</div>

	<section class="card">
		<h2 class="mb-4 text-lg font-semibold text-ink">New blank template</h2>
		<form
			method="POST"
			action="?/createBlank"
			use:enhance
			class="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-start"
		>
			<div>
				<label class="label" for="tpl-title">Title <span class="text-red-600 dark:text-red-400">*</span></label>
				<input id="tpl-title" name="title" class="input" value={createValues?.title ?? ''} required />
				{#if createErrors?.title}<p class="field-error">{createErrors.title}</p>{/if}
			</div>
			<div>
				<label class="label" for="tpl-timezone">Default timezone</label>
				<TimezoneSelect
					id="tpl-timezone"
					value={createValues?.timezone ?? data.defaultTimezone}
					timezones={data.timezones}
				/>
				{#if createErrors?.timezone}<p class="field-error">{createErrors.timezone}</p>{/if}
			</div>
			<button type="submit" class="btn-primary sm:mt-6">Create</button>
		</form>
		<p class="mt-3 text-xs text-muted">
			Tip: you can also turn any existing event into a template from its Details page
			(“Save as template”).
		</p>
	</section>

	{#if form?.deleted}
		<p class="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-500/10 dark:text-green-300" role="status">
			Template deleted.
		</p>
	{/if}
	{#if form?.rowError}
		<p class="field-error" role="alert">{form.rowError}</p>
	{/if}

	{#if data.templates.length === 0}
		<p class="card text-sm text-muted">
			No templates yet - create a blank one above, or open an event and choose “Save as template”.
		</p>
	{:else}
		<ul class="space-y-3">
			{#each data.templates as template (template.id)}
				<li class="card flex flex-wrap items-center justify-between gap-3">
					<div class="min-w-0">
						<a
							href={`/admin/events/${template.id}`}
							class="font-medium text-ink hover:text-primary hover:underline"
						>
							{template.title}
						</a>
						<p class="text-xs text-muted">
							{template.fieldCount} custom field{template.fieldCount === 1 ? '' : 's'} ·
							{template.categoryCount} dish categor{template.categoryCount === 1 ? 'y' : 'ies'} ·
							{template.timezone}
						</p>
					</div>
					<div class="flex shrink-0 items-center gap-2">
						<form method="POST" action="?/use" use:enhance>
							<input type="hidden" name="templateId" value={template.id} />
							<button type="submit" class="btn-primary">Create event</button>
						</form>
						<a href={`/admin/events/${template.id}`} class="btn-secondary">Edit</a>
						<details class="relative">
							<summary class="btn-secondary cursor-pointer text-red-600 dark:text-red-400">Delete</summary>
							<form
								method="POST"
								action="?/delete"
								use:enhance
								class="absolute right-0 z-10 mt-2 w-56 rounded-lg border border-line bg-card p-3 shadow-sm dark:shadow-none"
							>
								<input type="hidden" name="templateId" value={template.id} />
								<p class="mb-2 text-sm text-muted">Delete “{template.title}”?</p>
								<button type="submit" class="btn-danger w-full">Delete template</button>
							</form>
						</details>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
