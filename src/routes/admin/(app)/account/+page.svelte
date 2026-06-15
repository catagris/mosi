<script lang="ts">
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { pushSupported, enablePush, disablePushOnThisDevice } from '$lib/push-client';
	import RecoveryCodes from '$lib/components/admin/RecoveryCodes.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// ------------------------------------------------------------------
	// Push on this device
	// ------------------------------------------------------------------
	let canPush = $state(false);
	let pushBusy = $state(false);
	let pushMessage = $state<string | null>(null);

	onMount(() => {
		canPush = pushSupported();
	});

	async function enableHere(): Promise<void> {
		if (!data.vapidPublicKey) return;
		pushBusy = true;
		pushMessage = null;
		const result = await enablePush(data.vapidPublicKey, dev);
		pushBusy = false;
		if (result.ok) {
			pushMessage = 'Push enabled on this device.';
			await invalidateAll();
		} else if (result.reason === 'denied') {
			pushMessage = 'Notifications are blocked - allow them in your browser settings.';
		} else {
			pushMessage = 'Could not enable push on this device.';
		}
	}

	async function disableHere(): Promise<void> {
		pushBusy = true;
		pushMessage = null;
		try {
			await disablePushOnThisDevice();
			pushMessage = 'Push disabled on this device.';
			await invalidateAll();
		} catch {
			pushMessage = 'Could not disable push on this device.';
		}
		pushBusy = false;
	}

	function deviceLabel(ua: string | null): string {
		if (!ua) return 'Unknown device';
		const os = /iPhone|iPad/.test(ua)
			? 'iOS'
			: /Android/.test(ua)
				? 'Android'
				: /Macintosh/.test(ua)
					? 'macOS'
					: /Windows/.test(ua)
						? 'Windows'
						: /Linux/.test(ua)
							? 'Linux'
							: 'Unknown OS';
		const browser = /Edg\//.test(ua)
			? 'Edge'
			: /Chrome\//.test(ua)
				? 'Chrome'
				: /Firefox\//.test(ua)
					? 'Firefox'
					: /Safari\//.test(ua)
						? 'Safari'
						: 'Browser';
		return `${browser} on ${os}`;
	}
</script>

<svelte:head>
	<title>Account - {data.orgName}</title>
</svelte:head>

<h1 class="text-2xl font-bold text-ink">Account</h1>
<p class="mt-1 text-sm text-muted">Signed in as <strong>{data.user.username}</strong></p>

<div class="mt-6 space-y-6">
	<!-- Password -->
	<section class="card">
		<h2 class="text-lg font-semibold text-ink">Change password</h2>
		<form method="POST" action="?/password" use:enhance class="mt-4 max-w-sm space-y-4">
			{#if form?.passwordError}
				<p class="field-error" role="alert">{form.passwordError}</p>
			{/if}
			{#if form?.passwordChanged}
				<p
					class="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-500/10 dark:text-green-300"
					role="status"
				>
					Password changed. Your other sessions have been signed out.
				</p>
			{/if}

			<div>
				<label class="label" for="currentPassword">Current password</label>
				<input
					id="currentPassword"
					name="currentPassword"
					type="password"
					class="input"
					required
					autocomplete="current-password"
				/>
			</div>
			<div>
				<label class="label" for="newPassword">New password</label>
				<input
					id="newPassword"
					name="newPassword"
					type="password"
					class="input"
					required
					minlength="10"
					autocomplete="new-password"
				/>
				<p class="mt-1 text-xs text-muted">At least 10 characters.</p>
			</div>
			<div>
				<label class="label" for="confirm">Confirm new password</label>
				<input
					id="confirm"
					name="confirm"
					type="password"
					class="input"
					required
					minlength="10"
					autocomplete="new-password"
				/>
			</div>
			<button type="submit" class="btn-primary">Change password</button>
		</form>
	</section>

	<!-- Two-factor -->
	<section class="card">
		<h2 class="text-lg font-semibold text-ink">Two-factor authentication</h2>

		{#if form?.recoveryCodes}
			<div class="mt-4">
				<RecoveryCodes codes={form.recoveryCodes} />
			</div>
		{:else if form?.totpDisabled}
			<p
				class="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-500/10 dark:text-green-300"
				role="status"
			>
				Two-factor authentication has been turned off.
			</p>
		{:else if data.totpEnabled}
			<p class="mt-2 text-sm text-ink">
				<span class="badge bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300"
					>✓ Enabled</span
				>
				<span class="ml-2"
					>{data.recoveryCodesRemaining} recovery code{data.recoveryCodesRemaining === 1
						? ''
						: 's'} remaining</span
				>
			</p>

			<form method="POST" action="?/regenerateCodes" use:enhance class="mt-4 max-w-sm space-y-4">
				{#if form?.regenerateError}
					<p class="field-error" role="alert">{form.regenerateError}</p>
				{/if}
				<p class="text-sm text-muted">
					Regenerating replaces all existing recovery codes. Confirm with a code from your
					authenticator app.
				</p>
				<div>
					<label class="label" for="regenCode">Authenticator code</label>
					<input
						id="regenCode"
						name="code"
						class="input"
						required
						inputmode="numeric"
						autocomplete="one-time-code"
						pattern="[0-9]*"
					/>
				</div>
				<button type="submit" class="btn-secondary">Regenerate recovery codes</button>
			</form>

			{#if !data.requireTotp}
				<details class="mt-4">
					<summary class="cursor-pointer text-sm text-muted hover:text-ink">
						Turn off two-factor
					</summary>
					<form method="POST" action="?/disableTotp" use:enhance class="mt-3 max-w-sm space-y-3">
						{#if form?.disableError}
							<p class="field-error" role="alert">{form.disableError}</p>
						{/if}
						<p class="text-sm text-muted">Confirm your password to disable two-factor.</p>
						<div>
							<label class="label" for="disablePassword">Password</label>
							<input
								id="disablePassword"
								name="password"
								type="password"
								class="input"
								required
								autocomplete="current-password"
							/>
						</div>
						<button type="submit" class="btn-danger">Disable two-factor</button>
					</form>
				</details>
			{/if}
		{:else}
			<!-- Not enrolled: offer voluntary setup -->
			<p class="mt-2 text-sm text-muted">
				{#if data.requireTotp}
					Required on this deployment - set it up below.
				{:else}
					Add an authenticator app for an extra layer of security (optional).
				{/if}
			</p>

			{#if data.totpSetup}
				<form method="POST" action="?/enableTotp" use:enhance class="mt-4 max-w-sm space-y-4">
					{#if form?.enrollError}
						<p class="field-error" role="alert">{form.enrollError}</p>
					{/if}
					<p class="text-sm text-muted">
						Scan this QR code with an authenticator app, then enter the 6-digit code it shows.
					</p>
					<div class="flex justify-center">
						<img src={data.totpSetup.qrDataUrl} alt="TOTP enrollment QR code" width="200" height="200" />
					</div>
					<p
						class="break-all rounded-lg bg-surface p-3 text-center font-mono text-xs text-ink"
					>
						Can’t scan? Enter this secret manually: {data.totpSetup.secret}
					</p>
					<div>
						<label class="label" for="enrollCode">6-digit code</label>
						<input
							id="enrollCode"
							name="code"
							class="input text-center text-lg tracking-widest"
							required
							inputmode="numeric"
							autocomplete="one-time-code"
							pattern="[0-9]*"
						/>
					</div>
					<button type="submit" class="btn-primary">Enable two-factor</button>
				</form>
			{/if}
		{/if}
	</section>

	<!-- Push devices -->
	<section class="card">
		<h2 class="text-lg font-semibold text-ink">Push notification devices</h2>

		{#if !data.pushEnabled}
			<p class="mt-2 text-sm text-muted">
				Web Push is not configured on this deployment (set the VAPID_* environment variables to
				enable it).
			</p>
		{:else}
			{#if form?.deviceRemoved}
				<p
					class="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-500/10 dark:text-green-300"
					role="status"
				>
					Device removed.
				</p>
			{/if}
			{#if form?.deviceError}
				<p class="field-error" role="alert">{form.deviceError}</p>
			{/if}

			{#if data.devices.length === 0}
				<p class="mt-2 text-sm text-muted">No devices registered for push alerts yet.</p>
			{:else}
				<ul class="mt-4 divide-y divide-line">
					{#each data.devices as device (device.id)}
						<li class="flex items-center justify-between gap-3 py-3">
							<div class="min-w-0">
								<p class="truncate text-sm font-medium text-ink">
									{deviceLabel(device.userAgent)}
								</p>
								<p class="text-xs text-muted">
									Added {device.createdAt.toLocaleDateString()}{device.lastUsedAt
										? ` · last used ${device.lastUsedAt.toLocaleDateString()}`
										: ''}
								</p>
							</div>
							<form method="POST" action="?/removeDevice" use:enhance>
								<input type="hidden" name="deviceId" value={device.id} />
								<button type="submit" class="btn-danger">Remove</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}

			{#if canPush}
				<div class="mt-4 flex flex-wrap items-center gap-3">
					<button type="button" class="btn-primary" onclick={enableHere} disabled={pushBusy}>
						{pushBusy ? 'Working…' : 'Enable on this device'}
					</button>
					<button type="button" class="btn-secondary" onclick={disableHere} disabled={pushBusy}>
						Disable on this device
					</button>
				</div>
			{:else}
				<p class="mt-4 text-xs text-muted">
					This browser doesn’t support Web Push (on iOS, add the app to your Home Screen first).
				</p>
			{/if}
			{#if pushMessage}
				<p class="mt-2 text-sm text-ink" role="status">{pushMessage}</p>
			{/if}
		{/if}
	</section>
</div>
