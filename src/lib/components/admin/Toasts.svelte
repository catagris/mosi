<script module lang="ts">
	export type Toast = {
		id: number;
		title: string;
		body: string;
		kind: 'info' | 'success';
	};
</script>

<script lang="ts">
	let { toasts, ondismiss }: { toasts: Toast[]; ondismiss: (id: number) => void } = $props();
</script>

<div
	class="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
	aria-live="polite"
>
	{#each toasts as toast (toast.id)}
		<div
			class="pointer-events-auto w-full max-w-sm rounded-xl border bg-card p-4 shadow-sm dark:shadow-none {toast.kind ===
			'success'
				? 'border-green-300 dark:border-green-500/30'
				: 'border-line'}"
			role="status"
		>
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="truncate text-sm font-semibold text-ink">{toast.title}</p>
					<p class="mt-0.5 text-sm text-muted">{toast.body}</p>
				</div>
				<button
					type="button"
					class="shrink-0 rounded p-1 text-muted hover:text-ink"
					onclick={() => ondismiss(toast.id)}
					aria-label="Dismiss notification"
				>
					✕
				</button>
			</div>
		</div>
	{/each}
</div>
