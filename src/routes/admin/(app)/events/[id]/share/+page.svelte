<script lang="ts">
	import { enhance } from '$app/forms';
	import { confirmSubmit } from '$lib/utils/confirmSubmit';
	import { formatEventTime } from '$lib/utils/datetime';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const event = $derived(data.event);

	const windowLabel: Record<string, string> = {
		open: 'RSVPs are open.',
		'not-yet-open': 'RSVPs are not open yet.',
		closed: 'RSVPs are closed.',
		'event-not-published': 'Guests cannot RSVP until the event is published.'
	};

	let copied = $state(false);
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(data.publicUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard unavailable - the readonly input still allows manual copy.
		}
	}
</script>

<svelte:head>
	<title>{event.title} - Share</title>
</svelte:head>

<div class="space-y-6">
	{#if form?.saved}
		<div class="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
			Changes saved.
		</div>
	{/if}

	<div class="grid items-start gap-6 lg:grid-cols-2">
		<section class="card space-y-4">
			<h2 class="text-lg font-semibold text-ink">Public link</h2>
			<div class="flex items-center gap-2">
				<input
					readonly
					class="input"
					value={data.publicUrl}
					onclick={(e) => e.currentTarget.select()}
				/>
				<button type="button" class="btn-secondary shrink-0" onclick={copyLink}>
					{copied ? 'Copied!' : 'Copy'}
				</button>
			</div>
			{#if event.publicToken}
				<p class="text-xs text-muted">
					This link includes the secret token - guests need it to view the page.
				</p>
			{/if}

			<div class="space-y-3 border-t border-line pt-4">
				{#if event.status === 'draft'}
					<div
						class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
					>
						Event is draft - publish it so guests can RSVP.
					</div>
					<form method="POST" action="?/publish" use:enhance>
						<button type="submit" class="btn-primary">Publish event</button>
					</form>
				{:else if event.status === 'published'}
					<p class="text-sm text-ink">
						<span class="font-medium">RSVP window:</span>
						{windowLabel[data.windowState]}
						{#if data.windowState === 'not-yet-open' && event.rsvpOpensAt}
							Opens {formatEventTime(event.rsvpOpensAt, event.timezone)}.
						{/if}
						{#if data.windowState === 'closed' && event.rsvpClosesAt}
							Closed {formatEventTime(event.rsvpClosesAt, event.timezone)}.
						{/if}
					</p>
					<div class="flex flex-wrap gap-2">
						{#if data.windowState === 'open'}
							<form method="POST" action="?/closeRsvps" use:enhance>
								<button type="submit" class="btn-secondary">Close RSVPs now</button>
							</form>
						{:else}
							<form method="POST" action="?/openRsvps" use:enhance>
								<button type="submit" class="btn-secondary">Open RSVPs now</button>
							</form>
						{/if}
						<form
							method="POST"
							action="?/close"
							use:enhance={confirmSubmit('Close this event? Its public page becomes read-only.')}
						>
							<button type="submit" class="btn-secondary">Close event</button>
						</form>
					</div>
				{:else if event.status === 'closed'}
					<p class="text-sm text-ink">
						This event is closed - the public page is read-only.
					</p>
					<form method="POST" action="?/reopen" use:enhance>
						<button type="submit" class="btn-primary">Reopen event</button>
					</form>
				{:else}
					<p class="text-sm text-ink">
						This event is archived. Change its status on the Details tab to bring it back.
					</p>
				{/if}
			</div>
		</section>

		<section class="card flex flex-col items-center gap-3">
			<h2 class="self-start text-lg font-semibold text-ink">QR code</h2>
			<img src={data.qrDataUrl} alt="QR code linking to {data.publicUrl}" width="280" height="280" />
			<p class="text-center text-xs text-muted">
				Print it or share a screenshot - it opens the public event page.
			</p>
		</section>
	</div>
</div>
