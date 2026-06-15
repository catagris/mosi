<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let submitting = $state(false);
</script>

<svelte:head>
	<title>{data.orgName}</title>
	<meta
		name="description"
		content="Party and event RSVPs, the simple way - hosts share a link, guests reply in seconds."
	/>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-10 px-6 py-16">
	<header class="text-center">
		<p class="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">RSVP</p>
		<h1 class="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">{data.orgName}</h1>
		<p class="mx-auto mt-4 max-w-md text-muted">
			Party and event RSVPs, the simple way. Hosts share a link; guests reply in seconds - no
			account, no app to install.
		</p>
	</header>

	{#if data.emailEnabled}
		<section class="card">
			{#if form?.sent}
				<div role="status">
					<h2 class="text-lg font-semibold text-ink">Check your inbox</h2>
					<p class="mt-2 text-sm text-muted">
						If that email has any upcoming RSVPs, we've just sent your links to it. Be sure to check
						spam.
					</p>
				</div>
			{:else}
				<h2 class="text-lg font-semibold text-ink">Find your RSVPs</h2>
				<p class="mt-1 text-sm text-muted">
					Enter your email and we'll send links to view or change your RSVP for any upcoming events.
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
						<label class="label" for="email">Email address</label>
						<input
							type="email"
							id="email"
							name="email"
							class="input"
							required
							autocomplete="email"
							placeholder="you@example.com"
							value={form && 'email' in form ? form.email : ''}
						/>
					</div>
					<button type="submit" class="btn-primary w-full" disabled={submitting}>
						{submitting ? 'Sending…' : 'Email me my links'}
					</button>
				</form>
			{/if}
		</section>
	{:else}
		<section class="card text-center">
			<h2 class="text-lg font-semibold text-ink">Have an invite link?</h2>
			<p class="mt-2 text-sm text-muted">
				Open the link your host shared to RSVP - no account needed. Lost your link? Ask your host to
				resend it.
			</p>
		</section>
	{/if}

	<p class="text-center text-xs text-muted">Powered by {data.orgName}</p>
</main>
