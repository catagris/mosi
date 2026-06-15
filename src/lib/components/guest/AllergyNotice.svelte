<script lang="ts">
	import { severityMeta, type AllergyDigest } from '$lib/allergens';

	let {
		digest,
		title = 'Please plan around these allergies & dietary needs'
	}: { digest: AllergyDigest[]; title?: string } = $props();
</script>

{#if digest.length > 0}
	<div
		class="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10"
		role="note"
	>
		<div class="flex items-center gap-2">
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
				aria-hidden="true"
			>
				<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
				<path d="M12 9v4" />
				<path d="M12 17h.01" />
			</svg>
			<h3 class="text-sm font-semibold text-amber-900 dark:text-amber-200">{title}</h3>
		</div>
		<ul class="mt-3 flex flex-wrap gap-2">
			{#each digest as entry (entry.allergen + entry.severity)}
				{@const meta = severityMeta(entry.severity)}
				<li
					class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium {meta.chip}"
				>
					<span>{entry.allergen}</span>
					<span class="opacity-70">· {meta.short}</span>
					{#if entry.count > 1}
						<span class="opacity-70">×{entry.count}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}
