<script lang="ts">
	import { page } from '$app/state';
	import EventStatusBadge from '$lib/components/admin-events/EventStatusBadge.svelte';
	import { formatEventTime } from '$lib/utils/datetime';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const isTemplate = $derived(data.event.isTemplate);
	const base = $derived(`/admin/events/${data.event.id}`);
	// Templates have no public page or RSVPs, so those tabs don't apply.
	const tabs = $derived(
		[
			{ label: 'Details', href: base, exact: true },
			{ label: 'Fields', href: `${base}/fields`, exact: false },
			{ label: 'Dishes', href: `${base}/dishes`, exact: false },
			{ label: 'RSVPs', href: `${base}/rsvps`, exact: false, eventOnly: true },
			{ label: 'Share', href: `${base}/share`, exact: false, eventOnly: true }
		].filter((tab) => !isTemplate || !tab.eventOnly)
	);

	function isActive(tab: { href: string; exact: boolean }): boolean {
		return tab.exact ? page.url.pathname === tab.href : page.url.pathname.startsWith(tab.href);
	}

	const publicPath = $derived(
		`/e/${data.event.slug}${data.event.publicToken ? `?t=${data.event.publicToken}` : ''}`
	);
</script>

<div class="space-y-6">
	<header class="space-y-1">
		{#if isTemplate}
			<a href="/admin/templates" class="text-sm text-muted hover:text-ink">← Templates</a>
		{/if}
		<div class="flex flex-wrap items-center gap-3">
			<h1 class="text-2xl font-bold text-ink">{data.event.title}</h1>
			{#if isTemplate}
				<span class="badge bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">Template</span>
			{:else}
				<EventStatusBadge status={data.event.status} />
			{/if}
		</div>
		{#if isTemplate}
			<p class="text-sm text-muted">
				Reusable template - create events from it on the Templates page.
			</p>
		{:else}
			<p class="text-sm text-muted">
				{formatEventTime(data.event.startsAt, data.event.timezone)}
				· Public link:
				<a href={publicPath} target="_blank" class="text-primary hover:underline">{publicPath}</a>
			</p>
		{/if}
	</header>

	<nav class="flex flex-wrap gap-1 border-b border-line" aria-label="Event sections">
		{#each tabs as tab (tab.href)}
			<a
				href={tab.href}
				class="-mb-px border-b-2 px-3 py-2 text-sm font-medium {isActive(tab)
					? 'border-primary text-primary'
					: 'border-transparent text-muted hover:border-line hover:text-ink'}"
				aria-current={isActive(tab) ? 'page' : undefined}
			>
				{tab.label}
			</a>
		{/each}
	</nav>

	{@render children()}
</div>
