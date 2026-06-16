import type { SubmitFunction } from '@sveltejs/kit';

/**
 * `use:enhance` helper that reloads data after a successful submit but does NOT
 * reset the <form>.
 *
 * SvelteKit's default enhance resets the form on success. Svelte binds inputs via
 * the `.value` *property*, while `form.reset()` reverts to the (empty) `value`
 * attribute — so controlled `value={…}` fields blank out on save and only
 * repopulate when the component remounts. Reloading without resetting keeps the
 * just-saved values on screen.
 */
export const enhanceKeepValues: SubmitFunction = () => {
	return async ({ update }) => {
		await update({ reset: false });
	};
};
