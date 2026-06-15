<script lang="ts">
	import { enhance } from '$app/forms';
	import FieldRenderer from '$lib/components/FieldRenderer.svelte';
	import FieldDefinitionForm from '$lib/components/admin-events/FieldDefinitionForm.svelte';
	import { FIELD_TYPE_META } from '$lib/fields/registry';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const fieldForm = $derived(form?.fieldForm ?? null);
	const activeDefinitions = $derived(data.definitions.filter((d) => d.active));
</script>

<svelte:head>
	<title>{data.event.title} - Fields</title>
</svelte:head>

<div class="grid items-start gap-6 lg:grid-cols-2">
	<div class="space-y-6">
		<section class="card">
			<h2 class="mb-4 text-lg font-semibold text-ink">Add a field</h2>
			<FieldDefinitionForm
				action="?/create"
				errors={fieldForm && fieldForm.id === null ? fieldForm.errors : null}
				values={fieldForm && fieldForm.id === null ? fieldForm.values : null}
				submitLabel="Add field"
			/>
		</section>

		<section class="space-y-3">
			<h2 class="text-lg font-semibold text-ink">Fields</h2>
			{#if data.definitions.length === 0}
				<p class="card text-sm text-muted">
					No custom fields yet - guests will only be asked the basics (name, response, party,
					dishes).
				</p>
			{/if}
			{#each data.definitions as def, i (def.id)}
				<div class="card space-y-3 p-4">
					<div class="flex items-start justify-between gap-3">
						<div>
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-medium text-ink">{def.label}</span>
								{#if def.required}<span class="badge bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">required</span>{/if}
								{#if !def.active}<span class="badge bg-line text-muted">inactive</span>{/if}
							</div>
							<p class="text-xs text-muted">
								{FIELD_TYPE_META[def.type].label} · key: <code>{def.key}</code>
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-1">
							<form method="POST" action="?/move" use:enhance>
								<input type="hidden" name="id" value={def.id} />
								<input type="hidden" name="direction" value="up" />
								<button
									type="submit"
									class="btn-secondary px-2 py-1"
									disabled={i === 0}
									aria-label="Move {def.label} up"
								>
									▲
								</button>
							</form>
							<form method="POST" action="?/move" use:enhance>
								<input type="hidden" name="id" value={def.id} />
								<input type="hidden" name="direction" value="down" />
								<button
									type="submit"
									class="btn-secondary px-2 py-1"
									disabled={i === data.definitions.length - 1}
									aria-label="Move {def.label} down"
								>
									▼
								</button>
							</form>
							<form method="POST" action="?/toggleActive" use:enhance>
								<input type="hidden" name="id" value={def.id} />
								<button type="submit" class="btn-secondary px-2 py-1 text-xs">
									{def.active ? 'Deactivate' : 'Activate'}
								</button>
							</form>
						</div>
					</div>

					<details open={fieldForm?.id === def.id}>
						<summary class="cursor-pointer text-sm font-medium text-primary">Edit</summary>
						<div class="mt-3 border-t border-line pt-3">
							<FieldDefinitionForm
								action="?/update"
								definition={def}
								errors={fieldForm?.id === def.id ? fieldForm.errors : null}
								values={fieldForm?.id === def.id ? fieldForm.values : null}
								submitLabel="Save field"
							/>
						</div>
					</details>

					<form
						method="POST"
						action="?/delete"
						use:enhance
						class="flex items-center justify-between gap-3 border-t border-line pt-3"
					>
						<input type="hidden" name="id" value={def.id} />
						<p class="text-xs text-muted">
							Deleting removes the question; answers already submitted stay stored on old RSVPs.
						</p>
						<button type="submit" class="shrink-0 text-sm text-red-600 hover:underline dark:text-red-400">
							Delete field
						</button>
					</form>
				</div>
			{/each}
		</section>
	</div>

	<aside class="lg:sticky lg:top-6">
		<section class="card space-y-4">
			<h2 class="text-lg font-semibold text-ink">Guests will see:</h2>
			{#if activeDefinitions.length === 0}
				<p class="text-sm text-muted">
					No active fields - the RSVP form will only ask the basics.
				</p>
			{:else}
				{#each activeDefinitions as def (def.id)}
					<FieldRenderer definition={def} disabled={false} />
				{/each}
			{/if}
		</section>
	</aside>
</div>
