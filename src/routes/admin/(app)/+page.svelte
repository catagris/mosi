<script lang="ts">
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const STATUS_BADGE: Record<string, string> = {
		draft: 'bg-surface text-muted',
		published: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
		closed: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
		archived: 'bg-line text-muted'
	};

	const usedRecoveryCode = $derived(page.url.searchParams.get('recovery') === 'used');
</script>

<svelte:head>
	<title>Dashboard - {data.orgName}</title>
</svelte:head>

<div class="flex flex-wrap items-center justify-between gap-3">
	<h1 class="text-2xl font-bold text-ink">Dashboard</h1>
	<a href="/admin/events" class="btn-primary">+ New event</a>
</div>

{#if usedRecoveryCode}
	<div
		class="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
	>
		You signed in with a recovery code - it has now been used up. You can regenerate your codes
		under <a href="/admin/account" class="font-semibold underline">Account</a>.
	</div>
{/if}

{#if data.unreadCount > 0}
	<a
		href="/admin/notifications"
		class="mt-4 block rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-medium text-ink hover:bg-primary/10"
	>
		🔔 {data.unreadCount} unread alert{data.unreadCount === 1 ? '' : 's'} - view notifications →
	</a>
{/if}

{#if data.events.length === 0}
	<div class="card mt-6 text-center">
		<p class="text-4xl" aria-hidden="true">🎈</p>
		<h2 class="mt-2 text-lg font-semibold text-ink">No events yet</h2>
		<p class="mt-1 text-sm text-muted">
			Create your first party, then share the RSVP link with your guests.
		</p>
		<a href="/admin/events" class="btn-primary mt-4">Create your first event</a>
	</div>
{:else}
	<div class="mt-6 grid gap-4 sm:grid-cols-2">
		{#each data.events as event (event.id)}
			<a
				href={`/admin/events/${event.id}`}
				class="card block transition hover:border-primary/40 hover:shadow-sm dark:hover:shadow-none"
			>
				<div class="flex items-start justify-between gap-2">
					<h2 class="truncate font-semibold text-ink">{event.title}</h2>
					<span class="badge {STATUS_BADGE[event.status] ?? 'bg-surface text-muted'}">
						{event.status}
					</span>
				</div>
				<p class="mt-1 text-sm text-muted">{event.startsAt.toLocaleDateString()}</p>
				<p class="mt-2 text-sm font-medium text-ink">
					{event.headcount} going{event.capacity !== null ? ` / ${event.capacity}` : ''}
				</p>
			</a>
		{/each}
	</div>
{/if}
