<script lang="ts">
	import { enhance } from '$app/forms';
	import { themeStyle } from '$lib/theme';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let submitting = $state(false);
</script>

<svelte:head>
	<title>Resend edit link - {data.eventTitle}</title>
</svelte:head>

<div class="min-h-screen bg-surface font-event" style={themeStyle(data.theme)}>
	<main class="mx-auto max-w-md px-4 py-12">
		<div class="card">
			<h1 class="text-2xl font-bold text-ink">Resend your edit link</h1>
			<p class="mt-1 text-sm text-muted">{data.eventTitle}</p>

			{#if !data.emailEnabled}
				<p class="mt-6 rounded-xl bg-surface p-4 text-sm text-muted">
					This event doesn't have email set up, so links can't be resent automatically. Ask your
					host to send you your edit link.
				</p>
			{:else if form?.sent}
				<div
					class="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300"
					role="status"
				>
					If that email has an RSVP for this event, we've just sent the edit link to it. Check your
					inbox (and spam).
				</div>
			{:else}
				<p class="mt-4 text-sm text-muted">
					Enter the email you used to RSVP and we'll send your private edit link to it.
				</p>
				<form
					method="POST"
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							submitting = false;
							await update();
						};
					}}
					class="mt-4 space-y-4"
				>
					{#if form?.error}
						<p class="field-error" role="alert">{form.error}</p>
					{/if}
					<div>
						<label class="label" for="email">Email</label>
						<input
							type="email"
							id="email"
							name="email"
							class="input"
							required
							autocomplete="email"
							value={form && 'email' in form ? form.email : ''}
						/>
					</div>
					<button type="submit" class="btn-primary w-full" disabled={submitting}>
						{submitting ? 'Sending…' : 'Email me my link'}
					</button>
				</form>
			{/if}

			<p class="mt-6 text-center">
				<a href={data.backUrl} class="text-sm text-muted underline hover:text-ink">
					← Back to the event
				</a>
			</p>
		</div>
	</main>
</div>
