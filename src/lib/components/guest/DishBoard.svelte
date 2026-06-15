<script lang="ts">
	import type { DishBoardCategory } from '$lib/server/services/dishes';

	let {
		board,
		showItems,
		nounSingular = 'dish',
		nounPlural = 'dishes'
	}: {
		board: DishBoardCategory[];
		showItems: boolean;
		nounSingular?: string;
		nounPlural?: string;
	} = $props();

	let activeIndex = $state(0);
	// Clamp in case the board shrinks between renders.
	const safeIndex = $derived(Math.min(activeIndex, Math.max(0, board.length - 1)));
	const active = $derived(board[safeIndex]);

	let tabEls: HTMLButtonElement[] = $state([]);

	function name(entry: DishBoardCategory): string {
		return entry.category?.name ?? 'Other';
	}
	function needed(entry: DishBoardCategory): number {
		return entry.target != null ? Math.max(0, entry.target - entry.claimed) : 0;
	}
	function done(entry: DishBoardCategory): boolean {
		return entry.target != null && needed(entry) === 0;
	}
	function pct(claimed: number, target: number): number {
		return Math.max(0, Math.min(100, Math.round((claimed / Math.max(1, target)) * 100)));
	}

	// Roving-tabindex keyboard nav for the tablist (WAI-ARIA tabs pattern).
	function onTabKeydown(event: KeyboardEvent, index: number) {
		const last = board.length - 1;
		let next: number;
		switch (event.key) {
			case 'ArrowRight':
				next = index === last ? 0 : index + 1;
				break;
			case 'ArrowLeft':
				next = index === 0 ? last : index - 1;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = last;
				break;
			default:
				return;
		}
		event.preventDefault();
		activeIndex = next;
		tabEls[next]?.focus();
	}
</script>

{#if board.length === 0}
	<div class="rounded-2xl border border-dashed border-line bg-card/60 p-8 text-center">
		<p class="text-sm text-muted">Nothing here yet - be the first to bring something!</p>
	</div>
{:else}
	<div class="overflow-hidden rounded-2xl border border-line bg-card shadow-sm dark:shadow-none">
		<!-- ── Category tabs ─────────────────────────────────────────────── -->
		{#if board.length > 1}
			<div
				role="tablist"
				aria-label="Categories"
				class="flex gap-1 overflow-x-auto border-b border-line px-2 pt-2"
			>
				{#each board as entry, i (entry.category?.id ?? 'other')}
					{@const selected = i === safeIndex}
					<button
						bind:this={tabEls[i]}
						type="button"
						role="tab"
						id={`dishtab-${i}`}
						aria-selected={selected}
						aria-controls={`dishpanel-${i}`}
						tabindex={selected ? 0 : -1}
						onclick={() => (activeIndex = i)}
						onkeydown={(e) => onTabKeydown(e, i)}
						class="flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-medium transition
							{selected
							? 'border-primary text-ink'
							: 'border-transparent text-muted hover:text-ink'}"
					>
						<span class="whitespace-nowrap">{name(entry)}</span>
						<span
							class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums
								{done(entry)
								? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300'
								: selected
									? 'bg-primary/15 text-ink'
									: 'bg-line text-muted'}"
						>
							{#if entry.target != null}
								{done(entry) ? '✓' : `${entry.claimed}/${entry.target}`}
							{:else}
								{entry.claimed}
							{/if}
						</span>
					</button>
				{/each}
			</div>
		{/if}

		<!-- ── Active category panel ─────────────────────────────────────── -->
		{#if active}
			<div
				id={`dishpanel-${safeIndex}`}
				role={board.length > 1 ? 'tabpanel' : undefined}
				aria-labelledby={board.length > 1 ? `dishtab-${safeIndex}` : undefined}
				class="p-5"
			>
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<h3 class="font-semibold text-ink">{name(active)}</h3>
						{#if active.category?.description}
							<p class="mt-0.5 text-sm text-muted">{active.category.description}</p>
						{/if}
					</div>
					{#if active.target != null}
						{#if needed(active) > 0}
							<span class="badge shrink-0 bg-accent/15 text-ink">Need {needed(active)} more</span>
						{:else}
							<span
								class="badge shrink-0 bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
								>All set ✓</span
							>
						{/if}
					{/if}
				</div>

				{#if active.target != null}
					<div class="mt-3">
						<div class="mb-1 flex items-baseline justify-between text-sm">
							<span class="font-medium text-ink">{active.claimed} of {active.target} committed</span>
							<span class="text-muted">{pct(active.claimed, active.target)}%</span>
						</div>
						<div
							class="h-2.5 w-full overflow-hidden rounded-full bg-line"
							role="progressbar"
							aria-label={`${name(active)} committed`}
							aria-valuemin={0}
							aria-valuemax={active.target}
							aria-valuenow={Math.min(active.claimed, active.target)}
						>
							<div
								class="h-full rounded-full transition-all duration-500 {done(active)
									? 'bg-green-500'
									: 'bg-primary'}"
								style={`width: ${pct(active.claimed, active.target)}%`}
							></div>
						</div>
					</div>
				{:else}
					<p class="mt-3 text-sm text-muted">
						{active.claimed}
						{active.claimed === 1 ? nounSingular : nounPlural} brought
					</p>
				{/if}

				{#if showItems}
					{#if active.items.length > 0}
						<ul class="mt-4 divide-y divide-line border-t border-line">
							{#each active.items as item (item.id)}
								<li class="py-3 first:pt-4">
									<div class="flex items-baseline justify-between gap-3">
										<span class="min-w-0 font-medium text-ink">{item.itemName}</span>
										{#if item.contributorName}
											<span class="shrink-0 text-sm text-muted">{item.contributorName}</span>
										{/if}
									</div>
									{#if item.serves != null || item.note}
										<div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
											{#if item.serves != null}
												<span class="text-muted">Serves {item.serves}</span>
											{/if}
											{#if item.note}
												<span
													class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
												>
													<svg
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round"
														class="h-3 w-3 shrink-0"
														aria-hidden="true"
													>
														<path d="M12 9v4" />
														<path d="M12 17h.01" />
														<path
															d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
														/>
													</svg>
													<span class="min-w-0">{item.note}</span>
												</span>
											{/if}
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					{:else}
						<p class="mt-4 border-t border-line pt-4 text-sm italic text-muted">
							Nothing claimed yet - it could be you!
						</p>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
{/if}
