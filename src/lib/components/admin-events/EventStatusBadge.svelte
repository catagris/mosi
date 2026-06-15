<script lang="ts">
	let { status }: { status: 'draft' | 'published' | 'closed' | 'archived' } = $props();

	const classes: Record<string, string> = {
		draft: 'bg-line text-muted',
		published: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
		closed: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
		archived: 'bg-line text-muted'
	};
</script>

<span class="badge {classes[status]}">{status}</span>
