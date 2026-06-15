<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { displayFieldValue } from '$lib/fields/registry';
	import { formatShort } from '$lib/utils/datetime';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const responseBadge: Record<string, string> = {
		yes: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
		no: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
		maybe: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
	};

	function editLink(token: string): string {
		return `${page.url.origin}/e/${data.event.slug}/edit/${token}`;
	}

	let copiedId: string | null = $state(null);
	async function copy(text: string, key: string) {
		try {
			await navigator.clipboard.writeText(text);
			copiedId = key;
			setTimeout(() => (copiedId = null), 2000);
		} catch {
			// Clipboard unavailable - the "Show link" fallback below still works.
		}
	}
</script>

<svelte:head>
	<title>{data.event.title} - RSVPs</title>
</svelte:head>

<div class="space-y-6">
	{#if form?.regenerated && form?.newToken}
		{@const regeneratedLink = editLink(form.newToken)}
		<div
			class="space-y-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300"
		>
			<p class="font-medium">Edit link regenerated - the old link no longer works.</p>
			<div class="flex items-center gap-2">
				<input
					readonly
					class="input bg-card"
					value={regeneratedLink}
					onclick={(e) => e.currentTarget.select()}
				/>
				<button
					type="button"
					class="btn-secondary shrink-0"
					onclick={() => copy(regeneratedLink, 'regenerated')}
				>
					{copiedId === 'regenerated' ? 'Copied!' : 'Copy'}
				</button>
			</div>
		</div>
	{/if}
	{#if form?.rowError}
		<div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
			{form.rowError}
		</div>
	{/if}

	<section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<div class="card p-4">
			<p class="text-xs uppercase tracking-wide text-muted">Going</p>
			<p class="text-2xl font-bold text-ink">{data.stats.yesHeadcount}</p>
			{#if data.event.trackKids}
				<p class="text-xs text-muted">
					{data.stats.yesAdults} adults · {data.stats.yesKids} kids
				</p>
			{/if}
		</div>
		<div class="card p-4">
			<p class="text-xs uppercase tracking-wide text-muted">Maybe</p>
			<p class="text-2xl font-bold text-ink">{data.stats.maybeHeadcount}</p>
		</div>
		<div class="card p-4">
			<p class="text-xs uppercase tracking-wide text-muted">Declined</p>
			<p class="text-2xl font-bold text-ink">{data.stats.noCount}</p>
		</div>
		<div class="card p-4">
			<p class="text-xs uppercase tracking-wide text-muted">Capacity</p>
			<p class="text-2xl font-bold text-ink">
				{#if data.event.capacity !== null}
					{data.stats.yesHeadcount} / {data.event.capacity}
				{:else}
					Unlimited
				{/if}
			</p>
			{#if data.stats.waitlistCount > 0}
				<p class="text-xs text-amber-700 dark:text-amber-300">
					🎟️ {data.stats.waitlistCount} waitlisted ({data.stats.waitlistHeadcount} guests)
				</p>
			{/if}
		</div>
	</section>

	{#if data.coverage.length > 0}
		<section class="card p-4">
			<h2 class="mb-2 text-sm font-semibold text-ink">Dish coverage</h2>
			<div class="flex flex-wrap gap-2">
				{#each data.coverage as entry (entry.name)}
					<span
						class="badge {entry.target !== null && entry.claimed < entry.target
							? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
							: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300'}"
					>
						{entry.name}: {entry.claimed}{entry.target !== null ? ` / ${entry.target}` : ''}
					</span>
				{/each}
			</div>
		</section>
	{/if}

	<section class="flex flex-wrap items-end justify-between gap-4">
		<form method="GET" class="flex flex-wrap items-end gap-3">
			<div>
				<label class="label" for="filter-response">Response</label>
				<select id="filter-response" name="response" class="input w-auto">
					{#each ['all', 'yes', 'no', 'maybe'] as option (option)}
						<option value={option} selected={data.filters.response === option}>{option}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class="label" for="filter-status">Status</label>
				<select id="filter-status" name="status" class="input w-auto">
					{#each ['active', 'waitlisted', 'withdrawn', 'all'] as option (option)}
						<option value={option} selected={data.filters.status === option}>{option}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class="label" for="filter-q">Search</label>
				<input
					id="filter-q"
					name="q"
					class="input w-48"
					value={data.filters.q}
					placeholder="Name or email"
				/>
			</div>
			<button type="submit" class="btn-secondary">Filter</button>
		</form>
		<a class="btn-secondary" href="/admin/events/{data.event.id}/rsvps/export.csv" download>
			Export CSV
		</a>
	</section>

	{#if data.rsvps.length === 0}
		<p class="card text-sm text-muted">No RSVPs match the current filters.</p>
	{:else}
		<div class="card overflow-x-auto p-0">
			<table class="w-full text-left text-sm">
				<thead class="bg-surface text-xs uppercase tracking-wide text-muted">
					<tr>
						<th class="px-4 py-3">Guest</th>
						<th class="px-4 py-3">Response</th>
						<th class="px-4 py-3">Party</th>
						<th class="px-4 py-3">Dishes</th>
						<th class="px-4 py-3">Note</th>
						<th class="px-4 py-3">Submitted</th>
						<th class="px-4 py-3">Answers</th>
						<th class="px-4 py-3">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.rsvps as r (r.id)}
						<tr class="border-t border-line align-top">
							<td class="px-4 py-3">
								<span class="font-medium text-ink">{r.guestName}</span>
								{#if r.status === 'withdrawn'}
									<span class="badge bg-line text-muted">withdrawn</span>
								{:else if r.status === 'waitlisted'}
									<span class="badge bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">waitlisted</span>
								{/if}
								{#if r.guestEmail}
									<div class="text-xs text-muted">{r.guestEmail}</div>
								{/if}
							</td>
							<td class="px-4 py-3">
								<span class="badge {responseBadge[r.response]}">{r.response}</span>
							</td>
							<td class="px-4 py-3 text-muted">
								{r.partySize}
								{#if data.event.trackKids && r.partySize > 1}
									<span class="block text-xs text-muted">
										{1 + r.plusOnesAdults} adult{1 + r.plusOnesAdults === 1 ? '' : 's'}
										{#if r.plusOnesKids > 0}
											+ {r.plusOnesKids} kid{r.plusOnesKids === 1 ? '' : 's'}
										{/if}
									</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-muted">
								{#if data.dishesByRsvp[r.id]?.length}
									{data.dishesByRsvp[r.id]
										.map((d) => (d.serves ? `${d.itemName} (${d.serves})` : d.itemName))
										.join(', ')}
								{:else}
									-
								{/if}
							</td>
							<td class="px-4 py-3 text-muted">
								{#if r.note}
									<span class="block max-w-[14rem] truncate" title={r.note}>{r.note}</span>
								{:else}
									-
								{/if}
							</td>
							<td class="px-4 py-3 text-muted">{formatShort(r.createdAt)}</td>
							<td class="px-4 py-3">
								{#if data.fieldDefinitions.length > 0}
									<details>
										<summary class="cursor-pointer text-xs font-medium text-primary">
											answers
										</summary>
										<dl class="mt-2 w-56 space-y-1 text-xs">
											{#each data.fieldDefinitions as def (def.id)}
												<div>
													<dt class="font-medium text-ink">{def.label}</dt>
													<dd class="text-muted">
														{displayFieldValue(r.fieldValues[def.key]) || '-'}
													</dd>
												</div>
											{/each}
										</dl>
									</details>
								{:else}
									-
								{/if}
							</td>
							<td class="px-4 py-3">
								<div class="flex flex-wrap items-center gap-2">
									<button
										type="button"
										class="btn-secondary px-2 py-1 text-xs"
										onclick={() => copy(editLink(r.editToken), r.id)}
									>
										{copiedId === r.id ? 'Copied!' : 'Copy edit link'}
									</button>
									<form method="POST" action="?/regenerate" use:enhance>
										<input type="hidden" name="rsvpId" value={r.id} />
										<button type="submit" class="btn-secondary px-2 py-1 text-xs">
											Regenerate link
										</button>
									</form>
									{#if r.status !== 'withdrawn'}
										<form method="POST" action="?/withdraw" use:enhance>
											<input type="hidden" name="rsvpId" value={r.id} />
											<button type="submit" class="text-xs text-red-600 hover:underline dark:text-red-400">
												{r.status === 'waitlisted' ? 'Remove' : 'Withdraw'}
											</button>
										</form>
									{/if}
								</div>
								<details class="mt-1">
									<summary class="cursor-pointer text-xs text-muted">Show link</summary>
									<input
										readonly
										class="input mt-1 w-56 text-xs"
										value={editLink(r.editToken)}
										onclick={(e) => e.currentTarget.select()}
									/>
								</details>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
