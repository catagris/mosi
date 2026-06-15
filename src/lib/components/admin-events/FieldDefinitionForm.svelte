<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { FIELD_TYPES, FIELD_TYPE_META, type FieldTypeName } from '$lib/fields/registry';
	import type { FieldDefinition } from '$lib/server/db/schema';

	let {
		action,
		definition = null,
		errors = null,
		values = null,
		submitLabel = 'Save field'
	}: {
		action: string;
		/** Existing definition when editing; null for the add form. */
		definition?: FieldDefinition | null;
		/** Field-level errors from a failed submit. */
		errors?: Record<string, string> | null;
		/** Sticky raw values from a failed submit (no-JS reloads). */
		values?: Record<string, string> | null;
		submitLabel?: string;
	} = $props();

	function num(n: number | undefined): string {
		return n === undefined ? '' : String(n);
	}

	// One-time snapshot to seed the (uncontrolled) form inputs; intentionally not
	// reactive, so a parent data refresh won't wipe a half-filled form. untrack
	// declares that intent and silences the state_referenced_locally hints.
	const initial = untrack(() => ({
		label: values?.label ?? definition?.label ?? '',
		type: (values?.type ?? definition?.type ?? 'text') as FieldTypeName,
		helpText: values?.help_text ?? definition?.helpText ?? '',
		required: values ? values.required === 'on' : (definition?.required ?? false),
		options: values?.options ?? definition?.options?.join('\n') ?? '',
		min: values?.min ?? num(definition?.validation?.min),
		max: values?.max ?? num(definition?.validation?.max),
		maxLength: values?.max_length ?? num(definition?.validation?.maxLength),
		pattern: values?.pattern ?? definition?.validation?.pattern ?? '',
		patternMessage: values?.pattern_message ?? definition?.validation?.patternMessage ?? ''
	}));

	let type = $state(initial.type);
	const meta = $derived(FIELD_TYPE_META[type]);
	const uid = untrack(() => definition?.id ?? 'new');
</script>

<form method="POST" {action} use:enhance class="space-y-3">
	{#if definition}
		<input type="hidden" name="id" value={definition.id} />
	{/if}

	<div>
		<label class="label" for="field-label-{uid}"
			>Label <span class="text-red-600 dark:text-red-400">*</span></label
		>
		<input id="field-label-{uid}" name="label" class="input" value={initial.label} required />
		{#if errors?.label}<p class="field-error">{errors.label}</p>{/if}
	</div>

	<div>
		<label class="label" for="field-type-{uid}">Type</label>
		<select id="field-type-{uid}" name="type" class="input" bind:value={type}>
			{#each FIELD_TYPES as t (t)}
				<option value={t}>{FIELD_TYPE_META[t].label} - {FIELD_TYPE_META[t].description}</option>
			{/each}
		</select>
		{#if errors?.type}<p class="field-error">{errors.type}</p>{/if}
	</div>

	<div>
		<label class="label" for="field-help-{uid}">Help text</label>
		<input id="field-help-{uid}" name="help_text" class="input" value={initial.helpText} />
	</div>

	<label class="flex items-center gap-2 text-sm font-medium text-ink">
		<input
			type="checkbox"
			name="required"
			checked={initial.required}
			class="h-4 w-4 rounded border-line text-primary focus:ring-primary"
		/>
		Required
	</label>

	{#if meta.hasOptions}
		<div>
			<label class="label" for="field-options-{uid}">
				Options (one per line) <span class="text-red-600 dark:text-red-400">*</span>
			</label>
			<textarea id="field-options-{uid}" name="options" rows="4" class="input"
				>{initial.options}</textarea
			>
			{#if errors?.options}<p class="field-error">{errors.options}</p>{/if}
		</div>
	{/if}

	{#if meta.validations.length > 0}
		<fieldset>
			<legend class="label">Validation</legend>
			<div class="grid grid-cols-2 gap-3">
				{#if meta.validations.includes('min')}
					<div>
						<label class="label" for="field-min-{uid}">Min</label>
						<input
							id="field-min-{uid}"
							type="number"
							step="any"
							name="min"
							class="input"
							value={initial.min}
						/>
						{#if errors?.min}<p class="field-error">{errors.min}</p>{/if}
					</div>
				{/if}
				{#if meta.validations.includes('max')}
					<div>
						<label class="label" for="field-max-{uid}">Max</label>
						<input
							id="field-max-{uid}"
							type="number"
							step="any"
							name="max"
							class="input"
							value={initial.max}
						/>
						{#if errors?.max}<p class="field-error">{errors.max}</p>{/if}
					</div>
				{/if}
				{#if meta.validations.includes('maxLength')}
					<div>
						<label class="label" for="field-maxlength-{uid}">Max length</label>
						<input
							id="field-maxlength-{uid}"
							type="number"
							min="1"
							name="max_length"
							class="input"
							value={initial.maxLength}
						/>
						{#if errors?.max_length}<p class="field-error">{errors.max_length}</p>{/if}
					</div>
				{/if}
				{#if meta.validations.includes('pattern')}
					<div class="col-span-2">
						<label class="label" for="field-pattern-{uid}">Pattern (regular expression)</label>
						<input id="field-pattern-{uid}" name="pattern" class="input" value={initial.pattern} />
						{#if errors?.pattern}<p class="field-error">{errors.pattern}</p>{/if}
					</div>
					<div class="col-span-2">
						<label class="label" for="field-pattern-message-{uid}">Pattern error message</label>
						<input
							id="field-pattern-message-{uid}"
							name="pattern_message"
							class="input"
							value={initial.patternMessage}
							placeholder="Shown when the answer doesn't match"
						/>
					</div>
				{/if}
			</div>
		</fieldset>
	{/if}

	<button type="submit" class="btn-primary">{submitLabel}</button>
</form>
