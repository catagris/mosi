<script lang="ts">
	import { onMount } from 'svelte';
	import { currentMode, toggleMode, type Mode } from '$lib/theme/mode';

	let mode = $state<Mode>('light');

	onMount(() => {
		mode = currentMode();
		// Keep in sync if the OS preference changes and there's no explicit choice.
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const onChange = () => {
			if (!localStorage.getItem('theme')) mode = currentMode();
		};
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

	function toggle() {
		mode = toggleMode();
	}
</script>

<button
	type="button"
	onclick={toggle}
	class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
	aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
	title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
>
	{#if mode === 'dark'}
		<!-- sun -->
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
		</svg>
	{:else}
		<!-- moon -->
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
		</svg>
	{/if}
</button>
