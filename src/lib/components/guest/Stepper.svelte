<script lang="ts">
	let {
		steps,
		current
	}: {
		/** Short labels for each visible step, in order. */
		steps: string[];
		/** Zero-based index of the active step. */
		current: number;
	} = $props();

	const total = $derived(steps.length);
	const pct = $derived(total <= 1 ? 100 : Math.round((current / (total - 1)) * 100));
</script>

<div class="mb-6">
	<div class="mb-2 flex items-center justify-between" aria-live="polite" aria-atomic="true">
		<p class="text-sm font-semibold text-ink">
			Step {Math.min(current + 1, total)} of {total}
		</p>
		<p class="text-sm text-muted">{steps[current] ?? ''}</p>
	</div>

	<div
		class="h-1.5 w-full overflow-hidden rounded-full bg-line"
		role="progressbar"
		aria-label="RSVP progress"
		aria-valuemin={1}
		aria-valuemax={total}
		aria-valuenow={current + 1}
	>
		<div
			class="h-full rounded-full bg-primary transition-all duration-300 ease-out"
			style={`width: ${pct}%`}
		></div>
	</div>

	<ol class="mt-3 flex items-center justify-between gap-1">
		{#each steps as label, i (label + i)}
			<li class="flex min-w-0 flex-1 flex-col items-center gap-1">
				<span
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition
						{i < current
						? 'bg-primary text-primary-fg'
						: i === current
							? 'bg-primary text-primary-fg ring-4 ring-primary/20'
							: 'bg-line text-muted'}"
					aria-current={i === current ? 'step' : undefined}
				>
					{#if i < current}✓{:else}{i + 1}{/if}
				</span>
				<span
					class="hidden truncate text-center text-[11px] leading-tight sm:block
						{i === current ? 'font-semibold text-ink' : 'text-muted'}"
				>
					{label}
				</span>
			</li>
		{/each}
	</ol>
</div>
