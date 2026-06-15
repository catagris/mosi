<script lang="ts">
	import { enhance } from '$app/forms';
	import { themeStyle } from '$lib/theme';
	import { formatEventTime } from '$lib/utils/datetime';
	import RsvpForm from '$lib/components/guest/RsvpForm.svelte';
	import AddToCalendar from '$lib/components/guest/AddToCalendar.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const event = $derived(data.event);
	const responseLabel = $derived(
		data.rsvp.response === 'yes' ? 'Yes' : data.rsvp.response === 'maybe' ? 'Maybe' : 'No'
	);

	let withdrawing = $state(false);
</script>

<svelte:head>
	<title>Edit RSVP - {event.title}</title>
</svelte:head>

<div class="min-h-screen bg-surface font-event" style={themeStyle(event.theme)}>
	<main class="mx-auto max-w-2xl px-4 py-8 sm:py-12">
		<header class="mb-8 text-center">
			<h1 class="text-3xl font-bold text-ink">Edit your RSVP</h1>
			<p class="mt-2 text-lg font-semibold text-ink">{event.title}</p>
			<div class="mt-1 space-y-1 text-sm text-muted">
				<p>
					{formatEventTime(event.startsAt, event.timezone)}{event.endsAt
						? ` - ${formatEventTime(event.endsAt, event.timezone)}`
						: ''}
				</p>
				{#if event.location}
					<p>{event.location}</p>
				{/if}
			</div>
			<div class="mt-4 flex justify-center">
				<AddToCalendar icsHref={data.calendar.icsHref} googleHref={data.calendar.googleHref} />
			</div>
		</header>

		{#if form?.saved}
			<div
				class="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300"
				role="status"
			>
				Your RSVP has been updated. Thanks for keeping us posted!
			</div>
		{/if}

		{#if data.rsvp.status === 'waitlisted'}
			<div
				class="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
				role="status"
			>
				<p class="font-semibold">You're on the waitlist.</p>
				<p class="mt-1">
					This event is full. We'll move you off the waitlist automatically if a spot opens up.
				</p>
			</div>
		{/if}

		{#if data.rsvp.status === 'withdrawn'}
			<div
				class="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
				role="status"
			>
				<p class="font-semibold">You've withdrawn this RSVP.</p>
				{#if data.windowState === 'open'}
					<p class="mt-1">
						Changed your mind? Update the form below and save to re-join the party.
					</p>
				{/if}
			</div>
		{/if}

		{#if data.windowState === 'open'}
			<section class="card">
				<RsvpForm
					{event}
					fieldDefinitions={data.fieldDefinitions}
					categories={data.categories}
					values={form?.values ?? data.values}
					errors={form?.errors}
					submitLabel="Save changes"
					action="?/update"
					maxDishRows={data.maxDishRows}
					emailHint={data.emailEnabled}
				/>

				{#if data.rsvp.status === 'active'}
					<form
						method="POST"
						action="?/withdraw"
						class="mt-6 border-t border-line pt-4 text-center"
						use:enhance={({ cancel }) => {
							if (!confirm('Withdraw your RSVP? You can re-join later from this same link.')) {
								cancel();
								return;
							}
							withdrawing = true;
							return async ({ update }) => {
								withdrawing = false;
								await update();
							};
						}}
					>
						<button type="submit" class="btn-danger" disabled={withdrawing}>
							{withdrawing ? 'Withdrawing…' : 'Withdraw my RSVP'}
						</button>
						<p class="mt-2 text-xs text-muted">
							Withdrawing frees up your spot - you can re-join later from this same link.
						</p>
					</form>
				{/if}
			</section>
		{:else}
			<section class="card">
				<h2 class="font-semibold text-ink">Your RSVP</h2>
				<dl class="mt-3 space-y-2 text-sm text-ink">
					<div class="flex justify-between gap-4">
						<dt class="text-muted">Name</dt>
						<dd class="text-right font-medium">{data.rsvp.guestName}</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt class="text-muted">Response</dt>
						<dd class="text-right font-medium">{responseLabel}</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt class="text-muted">Party size</dt>
						<dd class="text-right font-medium">
							{data.rsvp.partySize}
							{data.rsvp.partySize === 1 ? 'person' : 'people'}
						</dd>
					</div>
					{#each data.fieldDefinitions as def (def.id)}
						{@const value = data.values[`cf_${def.key}`]}
						{#if value !== undefined && value !== ''}
							<div class="flex justify-between gap-4">
								<dt class="text-muted">{def.label}</dt>
								<dd class="text-right font-medium">
									{Array.isArray(value)
										? value.join(', ')
										: def.type === 'checkbox'
											? 'Yes'
											: value}
								</dd>
							</div>
						{/if}
					{/each}
					{#if data.rsvp.note}
						<div class="flex justify-between gap-4">
							<dt class="text-muted">Note</dt>
							<dd class="text-right">{data.rsvp.note}</dd>
						</div>
					{/if}
				</dl>
				{#if data.dishes.length > 0}
					<h3 class="mt-4 text-sm font-semibold text-ink">Bringing</h3>
					<ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-ink marker:text-muted">
						{#each data.dishes as dish, i (i)}
							<li>{dish.itemName}{dish.serves != null ? ` (serves ${dish.serves})` : ''}</li>
						{/each}
					</ul>
				{/if}
				<p class="mt-4 rounded-lg bg-surface p-3 text-sm text-muted">
					RSVP changes are closed for this event. Contact your host if something needs to change.
				</p>
			</section>
		{/if}
	</main>
</div>
