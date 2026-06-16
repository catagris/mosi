<script lang="ts">
	import { onMount } from 'svelte';
	import {
		detectGuestOs,
		orderedCalendarOptions,
		type GuestOs
	} from '$lib/calendar-options';

	let {
		icsHref = null,
		googleHref,
		compact = false
	}: { icsHref?: string | null; googleHref: string; compact?: boolean } = $props();

	// SSR renders the neutral 'other' ordering; on mount we refine to the real OS
	// (initial markup matches, so no hydration mismatch — just a post-mount reorder).
	let os = $state<GuestOs>('other');
	onMount(() => {
		os = detectGuestOs(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
	});

	const options = $derived(orderedCalendarOptions(os, icsHref, googleHref));
</script>

<div class="flex flex-wrap items-center gap-2 {compact ? 'text-sm' : ''}">
	{#each options as opt, i (opt.key)}
		<a
			href={opt.href}
			download={opt.download || undefined}
			target={opt.external ? '_blank' : undefined}
			rel={opt.external ? 'noopener noreferrer' : undefined}
			class={i === 0
				? 'inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90'
				: 'inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-sm font-medium text-ink shadow-sm transition hover:bg-surface dark:shadow-none'}
		>
			{#if i === 0}
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-4 w-4"
					aria-hidden="true"
				>
					<rect x="3" y="4" width="18" height="18" rx="2" />
					<path d="M16 2v4M8 2v4M3 10h18" />
				</svg>
			{/if}
			{opt.label}
		</a>
	{/each}
</div>
