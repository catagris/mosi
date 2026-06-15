<script lang="ts">
	import type { FieldDefinition } from '$lib/server/db/schema';

	let {
		definition,
		value = '',
		values = [],
		checked = false,
		error = undefined,
		disabled = false
	}: {
		definition: Pick<
			FieldDefinition,
			'key' | 'label' | 'helpText' | 'type' | 'options' | 'required' | 'validation'
		>;
		/** Prefill for single-value inputs. */
		value?: string;
		/** Prefill for multiselect. */
		values?: string[];
		/** Prefill for checkbox. */
		checked?: boolean;
		error?: string;
		disabled?: boolean;
	} = $props();

	const name = $derived(`cf_${definition.key}`);
	const inputId = $derived(`field-${definition.key}`);
	const v = $derived(definition.validation ?? {});
</script>

<div>
	{#if definition.type === 'checkbox'}
		<label class="flex items-start gap-2 text-sm font-medium text-ink">
			<input
				type="checkbox"
				{name}
				id={inputId}
				{checked}
				{disabled}
				class="mt-0.5 h-4 w-4 rounded border-line text-primary focus:ring-primary"
			/>
			<span>
				{definition.label}{#if definition.required}<span class="text-red-600"> *</span>{/if}
				{#if definition.helpText}<span class="block font-normal text-muted">{definition.helpText}</span>{/if}
			</span>
		</label>
	{:else}
		<label class="label" for={inputId}>
			{definition.label}{#if definition.required}<span class="text-red-600"> *</span>{/if}
		</label>
		{#if definition.helpText}
			<p class="mb-1 text-sm text-muted">{definition.helpText}</p>
		{/if}

		{#if definition.type === 'textarea'}
			<textarea
				{name}
				id={inputId}
				rows="3"
				class="input"
				maxlength={v.maxLength}
				required={definition.required}
				{disabled}>{value}</textarea>
		{:else if definition.type === 'select'}
			<select {name} id={inputId} class="input" required={definition.required} {disabled}>
				<option value="" selected={!value}>- pick one -</option>
				{#each definition.options ?? [] as option (option)}
					<option value={option} selected={option === value}>{option}</option>
				{/each}
			</select>
		{:else if definition.type === 'multiselect'}
			<div class="space-y-1" id={inputId}>
				{#each definition.options ?? [] as option (option)}
					<label class="flex items-center gap-2 text-sm text-ink">
						<input
							type="checkbox"
							{name}
							value={option}
							checked={values.includes(option)}
							{disabled}
							class="h-4 w-4 rounded border-line text-primary focus:ring-primary"
						/>
						{option}
					</label>
				{/each}
			</div>
		{:else if definition.type === 'number'}
			<input
				type="number"
				{name}
				id={inputId}
				class="input"
				min={v.min}
				max={v.max}
				step="any"
				{value}
				required={definition.required}
				{disabled}
			/>
		{:else if definition.type === 'date'}
			<input type="date" {name} id={inputId} class="input" {value} required={definition.required} {disabled} />
		{:else if definition.type === 'phone'}
			<input type="tel" {name} id={inputId} class="input" {value} required={definition.required} {disabled} />
		{:else if definition.type === 'email'}
			<input type="email" {name} id={inputId} class="input" {value} required={definition.required} {disabled} />
		{:else}
			<input
				type="text"
				{name}
				id={inputId}
				class="input"
				maxlength={v.maxLength}
				{value}
				required={definition.required}
				{disabled}
			/>
		{/if}
	{/if}

	{#if error}
		<p class="field-error">{error}</p>
	{/if}
</div>
