<script lang="ts">
	import { enhance } from '$app/forms';
	import RecoveryCodes from '$lib/components/admin/RecoveryCodes.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Two-factor - {data.orgName}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-surface px-4 py-8">
	<div class="w-full max-w-md">
		<div class="mb-6 text-center">
			<h1 class="text-xl font-bold text-ink">{data.orgName}</h1>
			<p class="mt-1 text-sm text-muted">
				{#if form?.recoveryCodes}
					Two-factor is set up for <strong>{data.username}</strong>
				{:else if data.mode === 'verify'}
					Two-step verification for <strong>{data.username}</strong>
				{:else}
					Set up two-factor authentication for <strong>{data.username}</strong>
				{/if}
			</p>
		</div>

		<div class="card">
			{#if form?.recoveryCodes}
				<RecoveryCodes codes={form.recoveryCodes} continueHref="/admin" />
			{:else if data.mode === 'verify'}
				<form method="POST" action="?/verify" use:enhance class="space-y-4">
					{#if form?.error}
						<p class="field-error" role="alert">{form.error}</p>
					{/if}

					<p class="text-sm text-muted">
						Enter the 6-digit code from your authenticator app (Google Authenticator, 1Password,
						Authy, …).
					</p>

					<div>
						<label class="label" for="code">Authentication code</label>
						<input
							id="code"
							name="code"
							class="input text-center text-lg tracking-widest"
							required
							autocomplete="one-time-code"
							autocapitalize="characters"
							spellcheck="false"
						/>
						<p class="mt-1 text-xs text-muted">…or enter one of your recovery codes.</p>
					</div>

					<button type="submit" class="btn-primary w-full">Verify</button>
				</form>
			{:else}
				<form method="POST" action="?/enroll" use:enhance class="space-y-4">
					{#if form?.error}
						<p class="field-error" role="alert">{form.error}</p>
					{/if}

					<p class="text-sm text-muted">
						Scan this QR code with an authenticator app (Google Authenticator, 1Password, Authy,
						…), then enter the 6-digit code it shows to finish setup.
					</p>

					<div class="flex justify-center">
						<img src={data.qrDataUrl} alt="TOTP enrollment QR code" width="240" height="240" />
					</div>

					<p class="break-all rounded-lg bg-surface p-3 text-center font-mono text-xs text-ink">
						Can’t scan? Enter this secret manually: {data.secret}
					</p>

					<div>
						<label class="label" for="code">6-digit code</label>
						<input
							id="code"
							name="code"
							class="input text-center text-lg tracking-widest"
							required
							inputmode="numeric"
							autocomplete="one-time-code"
							pattern="[0-9]*"
						/>
					</div>

					<button type="submit" class="btn-primary w-full">Activate two-factor</button>
				</form>
			{/if}
		</div>

		{#if !form?.recoveryCodes}
			<form method="POST" action="/admin/logout" class="mt-4 text-center">
				<button type="submit" class="text-sm text-muted underline hover:text-ink">
					Cancel and sign out
				</button>
			</form>
		{/if}
	</div>
</div>
