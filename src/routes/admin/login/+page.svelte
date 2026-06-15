<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Sign in - {data.orgName}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-surface px-4">
	<div class="w-full max-w-sm">
		<div class="mb-6 flex flex-col items-center gap-2">
			{#if data.logoUrl}
				<img src={data.logoUrl} alt="" class="h-12 w-12 rounded-xl object-cover" />
			{/if}
			<h1 class="text-xl font-bold text-ink">{data.orgName}</h1>
			<p class="text-sm text-muted">Sign in to the admin panel</p>
		</div>

		<div class="card">
			<form method="POST" use:enhance class="space-y-4">
				{#if form?.error}
					<p class="field-error" role="alert">{form.error}</p>
				{/if}

				<div>
					<label class="label" for="username">Username</label>
					<input
						id="username"
						name="username"
						class="input"
						required
						autocomplete="username"
						autocapitalize="none"
						spellcheck="false"
						value={form?.username ?? ''}
					/>
				</div>

				<div>
					<label class="label" for="password">Password</label>
					<input
						id="password"
						name="password"
						type="password"
						class="input"
						required
						autocomplete="current-password"
					/>
				</div>

				<button type="submit" class="btn-primary w-full">Sign in</button>
			</form>
		</div>
	</div>
</div>
