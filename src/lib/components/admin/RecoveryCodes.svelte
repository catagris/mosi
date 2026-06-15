<script lang="ts">
	let {
		codes,
		continueHref,
		continueLabel = 'Continue to dashboard'
	}: { codes: string[]; continueHref?: string; continueLabel?: string } = $props();

	let copied = $state(false);

	async function copyAll(): Promise<void> {
		try {
			await navigator.clipboard.writeText(codes.join('\n'));
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// clipboard unavailable (insecure context) - user can copy manually
		}
	}
</script>

<div class="space-y-4">
	<div>
		<h2 class="text-lg font-bold text-ink">Save your recovery codes</h2>
		<p class="mt-1 text-sm text-muted">
			Each code can be used <strong>once</strong> to sign in if you lose access to your
			authenticator app.
		</p>
	</div>

	<div
		class="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
	>
		Store these somewhere safe - they will <strong>not</strong> be shown again.
	</div>

	<ul class="grid grid-cols-1 gap-2 rounded-lg bg-zinc-900 p-4 font-mono text-sm text-zinc-100 sm:grid-cols-2 dark:bg-black dark:border dark:border-line">
		{#each codes as code (code)}
			<li>{code}</li>
		{/each}
	</ul>

	<div class="flex flex-wrap items-center gap-3">
		<button type="button" class="btn-secondary" onclick={copyAll}>
			{copied ? 'Copied!' : 'Copy all codes'}
		</button>
		{#if continueHref}
			<a href={continueHref} class="btn-primary">{continueLabel}</a>
		{/if}
	</div>
</div>
