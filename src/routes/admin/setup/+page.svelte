<script lang="ts">
	import { enhance } from '$app/forms';
	import RecoveryCodes from '$lib/components/admin/RecoveryCodes.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const steps = ['Create owner', 'Scan QR', 'Save recovery codes'];
	const currentStep = $derived(form?.recoveryCodes ? 3 : data.step === 'enroll' ? 2 : 1);
</script>

<svelte:head>
	<title>Setup - {data.orgName}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-surface px-4 py-8">
	<div class="w-full max-w-lg">
		<div class="mb-6 text-center">
			<p class="text-4xl" aria-hidden="true">🎉</p>
			<h1 class="mt-2 text-2xl font-bold text-ink">Welcome to {data.orgName}</h1>
			<p class="mt-1 text-sm text-muted">Let’s set up your admin account.</p>
		</div>

		{#if data.step !== 'login-required'}
			<ol class="mb-6 flex items-center justify-center gap-2 text-xs font-medium sm:gap-4">
				{#each steps as label, i (label)}
					{@const step = i + 1}
					<li class="flex items-center gap-2">
						<span
							class="flex h-6 w-6 items-center justify-center rounded-full {step < currentStep
								? 'bg-green-500 text-white dark:bg-green-500/80'
								: step === currentStep
									? 'bg-primary text-primary-fg'
									: 'bg-line text-muted'}"
						>
							{step < currentStep ? '✓' : step}
						</span>
						<span class={step === currentStep ? 'text-ink' : 'text-muted'}>{label}</span>
						{#if step < steps.length}
							<span class="hidden text-muted sm:inline" aria-hidden="true">→</span>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}

		<div class="card">
			{#if form?.recoveryCodes}
				<RecoveryCodes
					codes={form.recoveryCodes}
					continueHref="/admin"
					continueLabel="Finish - go to dashboard"
				/>
			{:else if data.step === 'login-required'}
				<div class="space-y-4 text-center">
					<h2 class="text-lg font-semibold text-ink">Setup was already started</h2>
					<p class="text-sm text-muted">
						An admin account exists but two-factor enrollment isn’t finished. Sign in to pick up
						where you left off.
					</p>
					<a href="/admin/login" class="btn-primary">Sign in to finish setup</a>
				</div>
			{:else if data.step === 'done'}
				<div class="space-y-4 text-center">
					<h2 class="text-lg font-semibold text-ink">Setup is complete</h2>
					<p class="text-sm text-muted">This instance is already configured and ready to go.</p>
					<a href="/admin" class="btn-primary">Go to dashboard</a>
				</div>
			{:else if data.step === 'enroll'}
				<form method="POST" action="?/enroll" use:enhance class="space-y-4">
					{#if form?.error}
						<p class="field-error" role="alert">{form.error}</p>
					{/if}

					<h2 class="text-lg font-semibold text-ink">Protect your account</h2>
					<p class="text-sm text-muted">
						Scan this QR code with an authenticator app (Google Authenticator, 1Password, Authy,
						…), then enter the 6-digit code it shows.
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
			{:else}
				<form method="POST" action="?/create" use:enhance class="space-y-4">
					{#if form?.error}
						<p class="field-error" role="alert">{form.error}</p>
					{/if}

					<h2 class="text-lg font-semibold text-ink">Create the owner account</h2>

					<div>
						<label class="label" for="orgName">Organization / household name (optional)</label>
						<input
							id="orgName"
							name="orgName"
							class="input"
							placeholder="Mosi"
							maxlength="100"
							value={form?.orgName ?? ''}
						/>
					</div>

					<div>
						<label class="label" for="username">Username</label>
						<input
							id="username"
							name="username"
							class="input"
							required
							minlength="3"
							maxlength="50"
							autocomplete="username"
							autocapitalize="none"
							spellcheck="false"
							value={form?.username ?? ''}
						/>
						<p class="mt-1 text-xs text-muted">
							Lowercase letters, digits, “.”, “_” or “-”.
						</p>
					</div>

					<div>
						<label class="label" for="password">Password</label>
						<input
							id="password"
							name="password"
							type="password"
							class="input"
							required
							minlength="10"
							autocomplete="new-password"
						/>
						<p class="mt-1 text-xs text-muted">At least 10 characters.</p>
					</div>

					<div>
						<label class="label" for="confirm">Confirm password</label>
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

					{#if data.needsBootstrapToken}
						<div>
							<label class="label" for="bootstrapToken">Bootstrap token</label>
							<input
								id="bootstrapToken"
								name="bootstrapToken"
								class="input"
								required
								autocomplete="off"
							/>
							<p class="mt-1 text-xs text-muted">
								The BOOTSTRAP_TOKEN value from this deployment’s environment.
							</p>
						</div>
					{/if}

					<button type="submit" class="btn-primary w-full">Create owner account</button>
				</form>
			{/if}
		</div>
	</div>
</div>
