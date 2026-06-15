<script lang="ts">
	let {
		icsHref = null,
		googleHref,
		compact = false
	}: { icsHref?: string | null; googleHref: string; compact?: boolean } = $props();
</script>

<div class="flex flex-wrap items-center gap-2 {compact ? 'text-sm' : ''}">
	{#if icsHref}
		<a
			href={icsHref}
			download
			class="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-sm font-medium text-ink shadow-sm transition hover:bg-surface dark:shadow-none"
		>
			Add to calendar
		</a>
	{/if}
	<a
		href={googleHref}
		target="_blank"
		rel="noopener noreferrer"
		class="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-sm font-medium text-ink shadow-sm transition hover:bg-surface dark:shadow-none"
	>
		Google Calendar
	</a>
</div>
