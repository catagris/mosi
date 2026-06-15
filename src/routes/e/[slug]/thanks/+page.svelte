<script lang="ts">
	import { themeStyle } from '$lib/theme';
	import AddToCalendar from '$lib/components/guest/AddToCalendar.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let copied = $state(false);
	let linkInput: HTMLInputElement | undefined = $state();

	const headline = $derived(
		!data.summary
			? 'Thanks for your RSVP!'
			: data.summary.waitlisted
				? "You're on the waitlist"
				: data.summary.response === 'yes'
					? "You're in - see you there!"
					: data.summary.response === 'maybe'
						? 'Thanks - hope you can make it!'
						: "Sorry you'll miss it - thanks for letting us know."
	);

	const responseLabel = $derived(
		data.summary?.response === 'yes' ? 'Yes' : data.summary?.response === 'maybe' ? 'Maybe' : 'No'
	);

	// "no" responders don't need the event details or calendar/directions actions.
	const attending = $derived(!data.summary || data.summary.response !== 'no');

	async function copyLink(): Promise<void> {
		if (!data.editUrl) return;
		try {
			await navigator.clipboard.writeText(data.editUrl);
			copied = true;
		} catch {
			// Fallback: select the readonly input and try the legacy copy command.
			linkInput?.focus();
			linkInput?.select();
			try {
				copied = document.execCommand('copy');
			} catch {
				copied = false;
			}
		}
		if (copied) {
			setTimeout(() => (copied = false), 2500);
		}
	}
</script>

<svelte:head>
	<title>Thanks - {data.eventTitle}</title>
</svelte:head>

<div class="min-h-screen bg-surface font-event" style={themeStyle(data.theme)}>
	<main class="mx-auto max-w-2xl px-4 py-12">
		<div class="card text-center">
			{#if data.summary?.waitlisted}
				<div
					class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-7 w-7"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="9" />
						<path d="M12 7v5l3 2" />
					</svg>
				</div>
			{:else}
				<div
					class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-7 w-7"
						aria-hidden="true"
					>
						<path d="M20 6 9 17l-5-5" />
					</svg>
				</div>
			{/if}

			<h1 class="mt-4 text-2xl font-bold text-ink">{headline}</h1>
			<p class="mt-1 text-muted">{data.eventTitle}</p>

			{#if attending}
				<div class="mt-4 space-y-1 text-sm text-muted">
					<p>{data.whenLabel}</p>
					{#if data.location}<p>{data.location}</p>{/if}
				</div>

				{#if !data.summary?.waitlisted}
					<div class="mt-5 flex flex-wrap justify-center gap-2">
						<AddToCalendar icsHref={data.calendar.icsHref} googleHref={data.calendar.googleHref} />
						{#if data.mapUrl}
							<a href={data.mapUrl} target="_blank" rel="noopener noreferrer" class="btn-secondary">
								Directions
							</a>
						{/if}
					</div>
				{/if}
			{/if}
		</div>

		{#if data.summary?.waitlisted}
			<div
				class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
			>
				This event is currently full, so you're on the <strong>waitlist</strong>. If a spot opens up
				we'll confirm you automatically{#if data.summary.hasEmail && data.emailEnabled}
					and email you{/if}. Keep your edit link below to check your status.
			</div>
		{/if}

		{#if data.summary}
			<div class="card mt-4">
				<h2 class="font-semibold text-ink">Your RSVP</h2>
				<dl class="mt-3 space-y-2 text-sm text-ink">
					<div class="flex justify-between gap-4">
						<dt class="text-muted">Name</dt>
						<dd class="text-right font-medium">{data.summary.guestName}</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt class="text-muted">Response</dt>
						<dd class="text-right font-medium">{responseLabel}</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt class="text-muted">Party size</dt>
						<dd class="text-right font-medium">
							{data.summary.partySize}
							{data.summary.partySize === 1 ? 'person' : 'people'}
						</dd>
					</div>
				</dl>
				{#if data.summary.dishes.length > 0}
					<h3 class="mt-4 text-sm font-semibold text-ink">Bringing</h3>
					<ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-ink marker:text-muted">
						{#each data.summary.dishes as dish, i (i)}
							<li>{dish.itemName}{dish.serves != null ? ` (serves ${dish.serves})` : ''}</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		{#if data.editUrl}
			<div class="mt-4 rounded-xl border-2 border-primary bg-primary/5 p-5">
				<h2 class="text-lg font-bold text-ink">Save this link to edit your RSVP later</h2>
				<p class="mt-1 text-sm text-muted">
					Anyone with this link can change your RSVP - keep it private.
				</p>
				<div class="mt-3 flex flex-col gap-2 sm:flex-row">
					<input
						type="text"
						class="input flex-1 font-mono text-xs"
						readonly
						value={data.editUrl}
						bind:this={linkInput}
						onclick={(e) => e.currentTarget.select()}
						aria-label="Your private edit link"
					/>
					<button type="button" class="btn-primary shrink-0" onclick={copyLink}>
						{copied ? 'Copied!' : 'Copy link'}
					</button>
				</div>
				{#if data.summary?.hasEmail && data.emailEnabled}
					<p class="mt-3 text-sm text-muted">We've also emailed this link to you.</p>
				{:else}
					<p class="mt-3 text-sm font-medium text-ink">
						This link won't be emailed to you - save it now so you don't lose access to your RSVP.
					</p>
				{/if}
			</div>
		{/if}

		<p class="mt-6 text-center">
			<a href={data.backUrl} class="btn-secondary">← Back to the event</a>
		</p>
	</main>
</div>
