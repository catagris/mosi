<script lang="ts">
	import { enhance } from '$app/forms';
	import EventStatusBadge from '$lib/components/admin-events/EventStatusBadge.svelte';
	import TimezoneSelect from '$lib/components/admin-events/TimezoneSelect.svelte';
	import { formatEventTime } from '$lib/utils/datetime';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const createErrors = $derived(form?.create?.errors ?? null);
	const createValues = $derived(form?.create?.values ?? null);
</script>

<svelte:head>
	<title>Events - Mosi</title>
</svelte:head>

<div class="space-y-6">
	<h1 class="text-2xl font-bold text-ink">Events</h1>

	<section class="card">
		<h2 class="mb-4 text-lg font-semibold text-ink">Create event</h2>
		<form
			method="POST"
			action="?/create"
			use:enhance
			class="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-start"
		>
			{#if data.templates.length > 0}
				<div class="sm:col-span-full">
					<label class="label" for="create-template">Base on template (optional)</label>
					<select id="create-template" name="template" class="input sm:max-w-sm">
						<option value="">- Blank event -</option>
						{#each data.templates as t (t.id)}
							<option value={t.id} selected={createValues?.template === t.id}>{t.title}</option>
						{/each}
					</select>
					{#if createErrors?.template}<p class="field-error">{createErrors.template}</p>{/if}
				</div>
			{/if}
			<div>
				<label class="label" for="create-title">Title <span class="text-red-600 dark:text-red-400">*</span></label>
				<input
					id="create-title"
					name="title"
					class="input"
					value={createValues?.title ?? ''}
					required
				/>
				{#if createErrors?.title}<p class="field-error">{createErrors.title}</p>{/if}
			</div>
			<div>
				<label class="label" for="create-starts">Starts <span class="text-red-600 dark:text-red-400">*</span></label>
				<input
					id="create-starts"
					type="datetime-local"
					name="starts_at"
					class="input"
					value={createValues?.starts_at ?? ''}
					required
				/>
				{#if createErrors?.starts_at}<p class="field-error">{createErrors.starts_at}</p>{/if}
			</div>
			<div>
				<label class="label" for="create-timezone">Timezone</label>
				<TimezoneSelect
					id="create-timezone"
					value={createValues?.timezone ?? data.defaultTimezone}
					timezones={data.timezones}
				/>
				{#if createErrors?.timezone}<p class="field-error">{createErrors.timezone}</p>{/if}
			</div>
			<button type="submit" class="btn-primary sm:mt-6">Create</button>
		</form>
	</section>

	{#if data.events.length === 0}
		<p class="card text-sm text-muted">No events yet - create your first one above.</p>
	{:else}
		<div class="card overflow-x-auto p-0">
			<table class="w-full text-left text-sm">
				<thead class="bg-surface text-xs uppercase tracking-wide text-muted">
					<tr>
						<th class="px-4 py-3">Event</th>
						<th class="px-4 py-3">Status</th>
						<th class="px-4 py-3">Starts</th>
						<th class="px-4 py-3">Going</th>
						<th class="px-4 py-3">Public link</th>
					</tr>
				</thead>
				<tbody>
					{#each data.events as event (event.id)}
						<tr class="border-t border-line">
							<td class="px-4 py-3">
								<a
									href="/admin/events/{event.id}"
									class="font-medium text-primary hover:underline"
								>
									{event.title}
								</a>
							</td>
							<td class="px-4 py-3"><EventStatusBadge status={event.status} /></td>
							<td class="px-4 py-3 text-muted">
								{formatEventTime(event.startsAt, event.timezone)}
							</td>
							<td class="px-4 py-3 text-muted">
								{event.yesHeadcount}{event.capacity !== null ? ` / ${event.capacity}` : ''}
							</td>
							<td class="px-4 py-3">
								<a href="/e/{event.slug}" target="_blank" class="text-primary hover:underline">
									/e/{event.slug}
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
