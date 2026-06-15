<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { TIMEZONE_COUNTRY } from '$lib/data/timezone-countries';

	let {
		name = 'timezone',
		id = name,
		value,
		timezones
	}: { name?: string; id?: string; value: string; timezones: string[] } = $props();

	// Always keep the stored value selectable, even if the runtime list omits it.
	const all = $derived(timezones.includes(value) ? timezones : [value, ...timezones]);

	type Zone = { tz: string; primary: string; search: string };

	function primaryOf(tz: string): string {
		const segs = tz.split('/');
		const city = (segs[segs.length - 1] ?? tz).replace(/_/g, ' ');
		const country = TIMEZONE_COUNTRY[tz] ?? '';
		return country ? `${city}, ${country}` : city;
	}

	const zones = $derived<Zone[]>(
		all.map((tz) => {
			const segs = tz.split('/');
			const city = (segs[segs.length - 1] ?? tz).replace(/_/g, ' ');
			const region = segs[0] ?? '';
			const country = TIMEZONE_COUNTRY[tz] ?? '';
			return {
				tz,
				primary: country ? `${city}, ${country}` : city,
				search: `${tz} ${city} ${region} ${country}`.toLowerCase().replace(/[/_]/g, ' ')
			};
		})
	);

	// Live UTC-offset label per zone (e.g. "GMT+9"), computed on demand and cached.
	const offsetCache = new Map<string, string>();
	function offsetOf(tz: string): string {
		let label = offsetCache.get(tz);
		if (label === undefined) {
			try {
				const parts = new Intl.DateTimeFormat('en-US', {
					timeZone: tz,
					timeZoneName: 'shortOffset'
				}).formatToParts(new Date());
				label = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
			} catch {
				label = '';
			}
			offsetCache.set(tz, label);
		}
		return label;
	}

	let jsReady = $state(false);
	onMount(() => (jsReady = true));

	// Seed local state from the initial prop only (the user drives it afterwards).
	let selected = $state(untrack(() => value));
	let query = $state(untrack(() => primaryOf(value)));
	let open = $state(false);
	let highlight = $state(0);
	let inputEl: HTMLInputElement | undefined = $state();
	let listEl: HTMLDivElement | undefined = $state();

	const MAX = 50;
	const selectedLabel = $derived(primaryOf(selected));

	const matches = $derived.by(() => {
		const q = query.trim().toLowerCase().replace(/[/_]/g, ' ');
		// Empty query - or the untouched selected label - shows the full list to browse.
		if (q === '' || q === selectedLabel.toLowerCase().replace(/[/_]/g, ' ')) return zones;
		return zones.filter((z) => z.search.includes(q));
	});
	const shown = $derived(matches.slice(0, MAX));
	const truncated = $derived(matches.length > MAX);

	function choose(tz: string): void {
		selected = tz;
		query = primaryOf(tz);
		open = false;
		highlight = 0;
	}

	function scrollActiveIntoView(): void {
		queueMicrotask(() =>
			listEl?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
		);
	}

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (!open) {
				open = true;
				return;
			}
			highlight = Math.min(highlight + 1, shown.length - 1);
			scrollActiveIntoView();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlight = Math.max(highlight - 1, 0);
			scrollActiveIntoView();
		} else if (e.key === 'Enter') {
			if (open && shown[highlight]) {
				e.preventDefault();
				choose(shown[highlight].tz);
			}
		} else if (e.key === 'Escape') {
			if (open) {
				e.preventDefault();
				open = false;
				query = selectedLabel;
			}
		}
	}
</script>

<div class="relative">
	<!-- Real form control: works without JS and still submits once enhanced (kept in
	     the DOM, visually hidden). The search combobox below drives its value. -->
	<select
		{name}
		id={jsReady ? undefined : id}
		bind:value={selected}
		class={jsReady ? 'sr-only' : 'input'}
		tabindex={jsReady ? -1 : undefined}
		aria-hidden={jsReady}
	>
		{#each all as tz (tz)}
			<option value={tz}>{primaryOf(tz)} - {tz}</option>
		{/each}
	</select>

	{#if jsReady}
		<input
			{id}
			type="text"
			class="input"
			role="combobox"
			aria-expanded={open}
			aria-controls="{id}-tz-listbox"
			aria-activedescendant={open && shown[highlight] ? `${id}-tz-opt-${highlight}` : undefined}
			aria-autocomplete="list"
			autocomplete="off"
			placeholder="Search city, country, or region…"
			bind:this={inputEl}
			bind:value={query}
			oninput={() => {
				open = true;
				highlight = 0;
			}}
			onfocus={() => {
				open = true;
				queueMicrotask(() => inputEl?.select());
			}}
			onblur={() => {
				open = false;
				query = selectedLabel;
			}}
			onkeydown={onKeydown}
		/>
		{#if open}
			<div
				id="{id}-tz-listbox"
				role="listbox"
				bind:this={listEl}
				class="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-card py-1 shadow-lg dark:shadow-none"
			>
				{#each shown as z, i (z.tz)}
					<button
						type="button"
						role="option"
						id="{id}-tz-opt-{i}"
						tabindex="-1"
						aria-selected={z.tz === selected}
						data-active={i === highlight}
						class="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left hover:bg-surface {i ===
						highlight
							? 'bg-surface'
							: ''}"
						onmousedown={(e) => e.preventDefault()}
						onclick={() => choose(z.tz)}
					>
						<span class="text-sm font-medium text-ink">{z.primary}</span>
						<span class="text-xs text-muted">{z.tz}{offsetOf(z.tz) ? ` · ${offsetOf(z.tz)}` : ''}</span>
					</button>
				{/each}
				{#if shown.length === 0}
					<p class="px-3 py-2 text-sm text-muted">No matching timezones</p>
				{/if}
				{#if truncated}
					<p class="px-3 py-1.5 text-xs text-muted">
						Showing the first {MAX} - keep typing to narrow it down.
					</p>
				{/if}
			</div>
		{/if}
	{/if}
</div>
