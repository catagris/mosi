<script lang="ts">
	import { themeStyle } from '$lib/theme';
	import { formatEventTime } from '$lib/utils/datetime';
	import RsvpForm from '$lib/components/guest/RsvpForm.svelte';
	import DishBoard from '$lib/components/guest/DishBoard.svelte';
	import AllergyNotice from '$lib/components/guest/AllergyNotice.svelte';
	import AddToCalendar from '$lib/components/guest/AddToCalendar.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const event = $derived(data.event);
	const isFull = $derived(data.spotsLeft !== null && data.spotsLeft <= 0);
	const waitlistOpen = $derived(isFull && event.enableWaitlist);
	const resendHref = $derived(
		`/e/${event.slug}/resend${data.publicToken ? `?t=${encodeURIComponent(data.publicToken)}` : ''}`
	);

	const closedMessage = $derived(
		data.windowState === 'not-yet-open'
			? `RSVPs haven't opened yet${
					event.rsvpOpensAt
						? ` - check back ${formatEventTime(event.rsvpOpensAt, event.timezone)}`
						: ''
				}.`
			: data.windowState === 'closed'
				? 'The RSVP window has closed. Contact your host if you still need to respond.'
				: 'This event is no longer accepting RSVPs.'
	);
</script>

<svelte:head>
	<title>{event.title}</title>
</svelte:head>

<div class="min-h-screen bg-surface font-event" style={themeStyle(event.theme)}>
	<main class="mx-auto max-w-2xl px-4 py-8 sm:py-12">
		<!-- ── Hero ─────────────────────────────────────────────────────── -->
		<header class="mb-10">
			{#if event.theme.bannerImageUrl}
				<img
					src={event.theme.bannerImageUrl}
					alt=""
					class="mb-6 h-48 w-full rounded-3xl object-cover shadow-sm sm:h-72"
				/>
			{/if}

			<div class="text-center">
				<h1 class="text-3xl font-bold tracking-tight text-ink sm:text-5xl">
					{event.title}
				</h1>

				<div class="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm text-ink">
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-card/70 px-3 py-1.5 shadow-sm ring-1 ring-line dark:shadow-none"
					>
						{formatEventTime(event.startsAt, event.timezone)}{event.endsAt
							? ` - ${formatEventTime(event.endsAt, event.timezone)}`
							: ''}
					</span>
					{#if event.location}
						<span
							class="inline-flex items-center gap-1.5 rounded-full bg-card/70 px-3 py-1.5 shadow-sm ring-1 ring-line dark:shadow-none"
						>
							{event.location}
						</span>
					{/if}
					{#if data.spotsLeft !== null}
						{#if waitlistOpen}
							<span
								class="badge bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
								>Full - waitlist open</span
							>
						{:else if isFull}
							<span class="badge bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
								>Event is full</span
							>
						{:else}
							<span class="badge bg-primary/10 text-ink">
								{data.spotsLeft} spot{data.spotsLeft === 1 ? '' : 's'} left
							</span>
						{/if}
					{/if}
				</div>

				<div class="mt-4 flex justify-center">
					<AddToCalendar icsHref={data.calendar.icsHref} googleHref={data.calendar.googleHref} />
				</div>
			</div>

			{#if data.descriptionHtml}
				<section
					class="description mx-auto mt-6 max-w-xl rounded-2xl border border-line bg-card/80 p-6 text-ink shadow-sm dark:shadow-none"
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized server-side in renderMarkdown -->
					{@html data.descriptionHtml}
				</section>
			{/if}
		</header>

		<!-- ── RSVP wizard (the centerpiece) ────────────────────────────── -->
		<section class="rounded-3xl border border-line bg-card p-6 shadow-sm dark:shadow-none sm:p-8">
			{#if data.windowState === 'open'}
				{#if waitlistOpen}
					<div
						class="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
						role="status"
					>
						This event is full, but you can still RSVP <strong>yes</strong> to join the waitlist - we'll
						confirm you automatically if a spot opens up.
					</div>
				{/if}
				<RsvpForm
					{event}
					fieldDefinitions={data.fieldDefinitions}
					categories={data.categories}
					values={form?.values ?? {}}
					errors={form?.errors}
					submitLabel={waitlistOpen ? 'Join the waitlist' : 'Send my RSVP'}
					formStartedAt={data.now}
					publicToken={data.publicToken}
					action="?/rsvp"
					maxDishRows={data.maxDishRows}
					allergyDigest={data.allergyDigest}
					yesDisabled={isFull && !event.enableWaitlist}
					emailHint={data.emailEnabled}
				/>
			{:else}
				<h2 class="mb-2 text-xl font-semibold text-ink">RSVP</h2>
				<p class="rounded-xl bg-surface p-4 text-muted">{closedMessage}</p>
			{/if}
		</section>

		{#if data.emailEnabled}
			<p class="mt-4 text-center text-sm text-muted">
				Already RSVP'd and lost your edit link?
				<a href={resendHref} class="font-medium text-primary underline">Email it to me</a>.
			</p>
		{/if}

		<!-- ── Allergies & dietary needs (what to avoid) ────────────────── -->
		{#if data.allergyDigest.length > 0}
			<section class="mt-10">
				<AllergyNotice digest={data.allergyDigest} />
			</section>
		{/if}

		<!-- ── What people are bringing ─────────────────────────────────── -->
		{#if data.board.length > 0}
			<section class="mt-10">
				<h2 class="mb-1 text-xl font-semibold text-ink">What people are bringing</h2>
				<p class="mb-4 text-sm text-muted">See what's covered and what's still needed.</p>
				<DishBoard
					board={data.board}
					showItems={event.showDishListPublic}
					nounSingular={event.itemNounSingular}
					nounPlural={event.itemNounPlural}
				/>
			</section>
		{/if}
	</main>
</div>

<style>
	.description :global(p) {
		margin-bottom: 0.75rem;
	}
	.description :global(p:last-child) {
		margin-bottom: 0;
	}
	.description :global(h1),
	.description :global(h2),
	.description :global(h3),
	.description :global(h4) {
		font-weight: 700;
		margin-bottom: 0.5rem;
		margin-top: 1rem;
	}
	.description :global(h1) {
		font-size: 1.5rem;
	}
	.description :global(h2) {
		font-size: 1.25rem;
	}
	.description :global(h3) {
		font-size: 1.125rem;
	}
	.description :global(ul),
	.description :global(ol) {
		margin-bottom: 0.75rem;
		padding-left: 1.5rem;
	}
	.description :global(ul) {
		list-style: disc;
	}
	.description :global(ol) {
		list-style: decimal;
	}
	.description :global(a) {
		color: rgb(var(--color-primary));
		text-decoration: underline;
	}
	.description :global(blockquote) {
		border-left: 3px solid rgb(var(--color-primary) / 0.4);
		padding-left: 0.75rem;
		color: rgb(var(--muted));
		margin-bottom: 0.75rem;
	}
	.description :global(code) {
		background: rgb(var(--line));
		border-radius: 0.25rem;
		padding: 0.125rem 0.25rem;
		font-size: 0.875em;
	}
	.description :global(hr) {
		margin: 1rem 0;
		border-color: rgb(var(--line));
	}
</style>
