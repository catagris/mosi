<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const ICON: Record<string, string> = {
		'rsvp.created': '🎉',
		'rsvp.updated': '✏️',
		'rsvp.withdrawn': '👋'
	};

	const VERB: Record<string, string> = {
		'rsvp.created': 'RSVP’d to',
		'rsvp.updated': 'updated their RSVP for',
		'rsvp.withdrawn': 'withdrew from'
	};

	const hasUnread = $derived(data.notifications.some((n) => !n.readAt));
</script>

<svelte:head>
	<title>Notifications - {data.orgName}</title>
</svelte:head>

<div class="flex flex-wrap items-center justify-between gap-3">
	<h1 class="text-2xl font-bold text-ink">Notifications</h1>
	{#if hasUnread}
		<form method="POST" action="?/markAllRead" use:enhance>
			<button type="submit" class="btn-secondary">Mark all read</button>
		</form>
	{/if}
</div>

{#if data.notifications.length === 0}
	<div class="card mt-6 text-center">
		<p class="text-4xl" aria-hidden="true">📭</p>
		<h2 class="mt-2 text-lg font-semibold text-ink">Nothing yet</h2>
		<p class="mt-1 text-sm text-muted">
			Guest RSVPs will show up here the moment they happen.
		</p>
	</div>
{:else}
	<ul class="mt-6 space-y-3">
		{#each data.notifications as n (n.id)}
			<li class="card {n.readAt ? '' : 'border-primary/30 bg-primary/5'}">
				<div class="flex items-start gap-3">
					<span class="text-2xl" aria-hidden="true">{ICON[n.type] ?? '🔔'}</span>
					<div class="min-w-0 flex-1">
						<p class="text-sm text-ink">
							<strong>{n.payload.guestName}</strong>
							{VERB[n.type] ?? 'updated'}
							<strong>{n.payload.eventTitle}</strong>
						</p>
						<p class="mt-1 text-xs text-muted">
							Party of {n.payload.partySize} · responded “{n.payload.response}”
						</p>
						{#if n.payload.dishes && n.payload.dishes.length > 0}
							<p class="mt-1 text-xs text-muted">Bringing: {n.payload.dishes.join(', ')}</p>
						{/if}
						{#if n.payload.note}
							<p class="mt-1 text-xs italic text-muted">“{n.payload.note}”</p>
						{/if}
						<div class="mt-2 flex flex-wrap items-center gap-3 text-xs">
							<span class="text-muted">{n.createdAt.toLocaleString()}</span>
							<a
								href={`/admin/events/${n.payload.eventId}/rsvps`}
								class="font-medium text-primary hover:underline"
							>
								View guest list →
							</a>
						</div>
					</div>
					{#if !n.readAt}
						<form method="POST" action="?/markRead" use:enhance>
							<input type="hidden" name="id" value={n.id} />
							<button
								type="submit"
								class="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface hover:text-ink"
							>
								Mark read
							</button>
						</form>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}
