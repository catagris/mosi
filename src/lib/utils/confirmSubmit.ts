import type { SubmitFunction } from '@sveltejs/kit';

/**
 * `use:enhance` helper that asks the operator to confirm before a destructive form
 * submits. Cancelling aborts the request; confirming falls through to enhance's
 * default result handling. Runs client-side only (enhance never fires on the server).
 *
 *   <form method="POST" action="?/delete" use:enhance={confirmSubmit('Delete this user?')}>
 */
export function confirmSubmit(message: string): SubmitFunction {
	return ({ cancel }) => {
		if (!window.confirm(message)) cancel();
	};
}
