<script lang="ts">
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
	import { pushSupported, enablePush } from '$lib/push-client';

	let {
		vapidPublicKey,
		onresult
	}: { vapidPublicKey: string; onresult: (ok: boolean, reason?: string) => void } = $props();

	const DISMISS_KEY = 'pp-push-prompt-dismissed';

	let visible = $state(false);
	let busy = $state(false);

	onMount(() => {
		try {
			if (
				pushSupported() &&
				Notification.permission === 'default' &&
				!localStorage.getItem(DISMISS_KEY)
			) {
				visible = true;
			}
		} catch {
			// Notification / localStorage unavailable - keep the banner hidden
		}
	});

	async function enable(): Promise<void> {
		busy = true;
		const result = await enablePush(vapidPublicKey, dev);
		busy = false;
		if (result.ok) {
			visible = false;
			onresult(true);
		} else {
			if (result.reason === 'denied') visible = false;
			onresult(false, result.reason);
		}
	}

	function dismiss(): void {
		visible = false;
		try {
			localStorage.setItem(DISMISS_KEY, '1');
		} catch {
			// private browsing - dismissal just won't persist
		}
	}
</script>

{#if visible}
	<div class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card p-4 shadow-sm dark:shadow-none">
		<div class="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
			<div class="flex items-center gap-3">
				<span class="text-2xl" aria-hidden="true">🔔</span>
				<div>
					<p class="text-sm font-semibold text-ink">Get RSVP alerts on this device</p>
					<p class="text-sm text-muted">
						We'll send a notification whenever a guest responds.
					</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<button type="button" class="btn-primary" onclick={enable} disabled={busy}>
					{busy ? 'Enabling…' : 'Enable'}
				</button>
				<button type="button" class="btn-secondary" onclick={dismiss}>Not now</button>
			</div>
		</div>
	</div>
{/if}
