<script lang="ts">
	import { enhance } from '$app/forms';
	import TimezoneSelect from '$lib/components/admin-events/TimezoneSelect.svelte';
	import { utcToZonedLocal } from '$lib/utils/datetime';
	import { enhanceKeepValues } from '$lib/utils/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const event = $derived(data.event);
	const v = $derived(form?.update?.values ?? null);
	const errors = $derived(form?.update?.errors ?? null);

	function localValue(name: string, date: Date | null): string {
		if (v) return v[name] ?? '';
		return date ? utcToZonedLocal(date, event.timezone) : '';
	}

	function flag(name: string, fallback: boolean): boolean {
		return v ? v[name] === 'on' : fallback;
	}

	// Theme colors are edited locally (text field + native picker) yet must also
	// reflect the latest server round-trip: the submitted values after a failed
	// save, or the reloaded event after a successful one. A plain $state would
	// snapshot only the first render and leave the picker stale on a failed save,
	// so re-sync via an effect keyed on `form`/`data`.
	let themePrimary = $state('');
	let themeAccent = $state('');
	$effect(() => {
		themePrimary = form?.update?.values?.theme_primary ?? data.event.theme.primaryColor ?? '';
		themeAccent = form?.update?.values?.theme_accent ?? data.event.theme.accent ?? '';
	});
</script>

<svelte:head>
	<title>{event.title} - Details</title>
</svelte:head>

<div class="space-y-6">
	{#if form?.saved}
		<div
			class="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300"
		>
			Changes saved.
		</div>
	{/if}

	<form method="POST" action="?/update" use:enhance={enhanceKeepValues} class="space-y-6">
		<section class="card space-y-4">
			<h2 class="text-lg font-semibold text-ink">Basics</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class="label" for="ev-title"
						>Title <span class="text-red-600 dark:text-red-400">*</span></label
					>
					<input
						id="ev-title"
						name="title"
						class="input"
						value={v?.title ?? event.title}
						required
					/>
					{#if errors?.title}<p class="field-error">{errors.title}</p>{/if}
				</div>
				{#if !event.isTemplate}
					<div>
						<label class="label" for="ev-slug">Slug</label>
						<input id="ev-slug" name="slug" class="input" value={v?.slug ?? event.slug} />
						<p class="mt-1 text-xs text-muted">
							Public URL: /e/&lt;slug&gt; - it will be cleaned up and de-duplicated automatically.
						</p>
					</div>
				{/if}
			</div>
			<div>
				<label class="label" for="ev-description">Description</label>
				<textarea id="ev-description" name="description" rows="5" class="input"
					>{v?.description ?? event.description}</textarea
				>
				<p class="mt-1 text-xs text-muted">Markdown supported.</p>
			</div>
			<div>
				<label class="label" for="ev-location">Location</label>
				<input
					id="ev-location"
					name="location"
					class="input"
					value={v?.location ?? event.location}
				/>
				<p class="mt-1 text-xs text-muted">
					The venue address - shown to guests and used in the calendar invite.
				</p>
			</div>
			<div>
				<label class="label" for="ev-map-url">Map link</label>
				<input
					id="ev-map-url"
					name="map_url"
					type="url"
					inputmode="url"
					class="input"
					placeholder="https://naver.me/…"
					value={v?.map_url ?? event.mapUrl}
				/>
				<p class="mt-1 text-xs text-muted">
					Optional. Paste a Naver, Kakao, or Google map link - guests get a Directions button and
					it's added to the calendar invite.
				</p>
				{#if errors?.map_url}<p class="field-error">{errors.map_url}</p>{/if}
			</div>
		</section>

		<section class="card space-y-4">
			<h2 class="text-lg font-semibold text-ink">
				{event.isTemplate ? 'Defaults' : 'Schedule'}
			</h2>
			<div class="grid gap-4 sm:grid-cols-3">
				{#if !event.isTemplate}
					<div>
						<label class="label" for="ev-starts"
							>Starts <span class="text-red-600 dark:text-red-400">*</span></label
						>
						<input
							id="ev-starts"
							type="datetime-local"
							name="starts_at"
							class="input"
							value={localValue('starts_at', event.startsAt)}
							required
						/>
						{#if errors?.starts_at}<p class="field-error">{errors.starts_at}</p>{/if}
					</div>
					<div>
						<label class="label" for="ev-ends">Ends (optional)</label>
						<input
							id="ev-ends"
							type="datetime-local"
							name="ends_at"
							class="input"
							value={localValue('ends_at', event.endsAt)}
						/>
						{#if errors?.ends_at}<p class="field-error">{errors.ends_at}</p>{/if}
					</div>
				{/if}
				<div>
					<label class="label" for="ev-timezone">
						{event.isTemplate ? 'Default timezone' : 'Timezone'}
					</label>
					<TimezoneSelect
						id="ev-timezone"
						value={v?.timezone ?? event.timezone}
						timezones={data.timezones}
					/>
					{#if errors?.timezone}<p class="field-error">{errors.timezone}</p>{/if}
				</div>
			</div>
			{#if !event.isTemplate}
				<div class="grid gap-4 sm:grid-cols-3">
					<div>
						<label class="label" for="ev-status">Status</label>
						<select id="ev-status" name="status" class="input">
							{#each ['draft', 'published', 'closed', 'archived'] as status (status)}
								<option value={status} selected={(v?.status ?? event.status) === status}>
									{status}
								</option>
							{/each}
						</select>
						{#if errors?.status}<p class="field-error">{errors.status}</p>{/if}
					</div>
					<div>
						<label class="label" for="ev-rsvp-opens">RSVPs open (optional)</label>
						<input
							id="ev-rsvp-opens"
							type="datetime-local"
							name="rsvp_opens_at"
							class="input"
							value={localValue('rsvp_opens_at', event.rsvpOpensAt)}
						/>
						{#if errors?.rsvp_opens_at}<p class="field-error">{errors.rsvp_opens_at}</p>{/if}
					</div>
					<div>
						<label class="label" for="ev-rsvp-closes">RSVPs close (optional)</label>
						<input
							id="ev-rsvp-closes"
							type="datetime-local"
							name="rsvp_closes_at"
							class="input"
							value={localValue('rsvp_closes_at', event.rsvpClosesAt)}
						/>
						{#if errors?.rsvp_closes_at}<p class="field-error">{errors.rsvp_closes_at}</p>{/if}
					</div>
				</div>
			{/if}
		</section>

		<section class="card space-y-4">
			<h2 class="text-lg font-semibold text-ink">Capacity & party</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class="label" for="ev-capacity">Capacity (total headcount)</label>
					<input
						id="ev-capacity"
						type="number"
						min="0"
						name="capacity"
						class="input"
						value={v ? v.capacity : (event.capacity ?? '')}
						placeholder="Unlimited"
					/>
					{#if errors?.capacity}<p class="field-error">{errors.capacity}</p>{/if}
				</div>
				<div>
					<label class="label" for="ev-max-plus-ones">Max plus-ones per RSVP</label>
					<input
						id="ev-max-plus-ones"
						type="number"
						min="0"
						name="max_plus_ones"
						class="input"
						value={v ? v.max_plus_ones : event.maxPlusOnes}
					/>
					{#if errors?.max_plus_ones}<p class="field-error">{errors.max_plus_ones}</p>{/if}
				</div>
			</div>
			<div class="space-y-2">
				<label class="flex items-center gap-2 text-sm font-medium text-ink">
					<input
						type="checkbox"
						name="track_kids"
						checked={flag('track_kids', event.trackKids)}
						class="h-4 w-4 rounded border-line text-primary focus:ring-primary"
					/>
					Track kids separately (adults / kids split for plus-ones)
				</label>
				<label class="flex items-center gap-2 text-sm font-medium text-ink">
					<input
						type="checkbox"
						name="allow_maybe"
						checked={flag('allow_maybe', event.allowMaybe)}
						class="h-4 w-4 rounded border-line text-primary focus:ring-primary"
					/>
					Offer a "maybe" response
				</label>
				<label class="flex items-center gap-2 text-sm font-medium text-ink">
					<input
						type="checkbox"
						name="require_email"
						checked={flag('require_email', event.requireEmail)}
						class="h-4 w-4 rounded border-line text-primary focus:ring-primary"
					/>
					Require guest email
				</label>
				<label class="flex items-center gap-2 text-sm font-medium text-ink">
					<input
						type="checkbox"
						name="enable_waitlist"
						checked={flag('enable_waitlist', event.enableWaitlist)}
						class="h-4 w-4 rounded border-line text-primary focus:ring-primary"
					/>
					Waitlist when full
					<span class="text-xs font-normal text-muted">(needs a capacity)</span>
				</label>
				<p class="pl-6 text-xs text-muted">
					Once capacity is reached, extra “yes” RSVPs join a waitlist and are confirmed
					automatically (oldest first) when someone withdraws.
				</p>
			</div>
		</section>

		<section class="card space-y-4">
			<h2 class="text-lg font-semibold text-ink">Sign-up list (what to bring)</h2>

			<div class="space-y-2">
				<label class="flex items-center gap-2 text-sm font-medium text-ink">
					<input
						type="checkbox"
						name="collect_dishes"
						checked={flag('collect_dishes', event.collectDishes)}
						class="h-4 w-4 rounded border-line text-primary focus:ring-primary"
					/>
					Ask guests what they're bringing
				</label>
				<p class="pl-6 text-xs text-muted">
					Turn this off for events with nothing to bring - guests won't see a sign-up list.
				</p>

				<!-- What a contribution is called - drives all the guest-facing wording, so
				     the list works for food, supplies, or a mix of both. -->
				<div class="grid gap-3 border-l-2 border-line pl-6 pt-1 sm:grid-cols-2">
					<div>
						<label class="label" for="ev-noun-singular">What's one contribution called?</label>
						<input
							id="ev-noun-singular"
							name="item_noun_singular"
							class="input"
							maxlength="30"
							placeholder="dish"
							value={v?.item_noun_singular ?? event.itemNounSingular}
						/>
						<p class="mt-1 text-xs text-muted">Singular - e.g. dish, side, supply, drink.</p>
					</div>
					<div>
						<label class="label" for="ev-noun-plural">…and many of them?</label>
						<input
							id="ev-noun-plural"
							name="item_noun_plural"
							class="input"
							maxlength="30"
							placeholder="dishes"
							value={v?.item_noun_plural ?? event.itemNounPlural}
						/>
						<p class="mt-1 text-xs text-muted">Plural - e.g. dishes, sides, supplies, drinks.</p>
					</div>
				</div>

				<!-- Per-field toggles for the sign-up form. -->
				<div class="space-y-2 border-l-2 border-line pl-6 pt-1">
					<label class="flex items-center gap-2 text-sm text-ink">
						<input
							type="checkbox"
							name="dish_show_category"
							checked={flag('dish_show_category', event.dishShowCategory)}
							class="h-4 w-4 rounded border-line text-primary focus:ring-primary"
						/>
						Show the category picker
						<span class="text-xs text-muted">(only when categories exist)</span>
					</label>
					<label class="flex items-center gap-2 text-sm text-ink">
						<input
							type="checkbox"
							name="dish_show_serves"
							checked={flag('dish_show_serves', event.dishShowServes)}
							class="h-4 w-4 rounded border-line text-primary focus:ring-primary"
						/>
						Show the “serves how many?” field
					</label>
					<label class="flex items-center gap-2 text-sm text-ink">
						<input
							type="checkbox"
							name="dish_show_note"
							checked={flag('dish_show_note', event.dishShowNote)}
							class="h-4 w-4 rounded border-line text-primary focus:ring-primary"
						/>
						Show the note field
						<span class="text-xs text-muted">(allergies, details)</span>
					</label>
				</div>
			</div>

			<hr class="border-line" />

			<div class="space-y-2">
				<p class="text-sm font-medium text-ink">Public list</p>
				<label class="flex items-center gap-2 text-sm text-ink">
					<input
						type="checkbox"
						name="show_dish_list_public"
						checked={flag('show_dish_list_public', event.showDishListPublic)}
						class="h-4 w-4 rounded border-line text-primary focus:ring-primary"
					/>
					Show what's being brought on the public page
				</label>
				<label class="flex items-center gap-2 text-sm text-ink">
					<input
						type="checkbox"
						name="show_dish_contributor_names"
						checked={flag('show_dish_contributor_names', event.showDishContributorNames)}
						class="h-4 w-4 rounded border-line text-primary focus:ring-primary"
					/>
					Show contributor names next to contributions
				</label>
			</div>
		</section>

		<section class="card space-y-4">
			<h2 class="text-lg font-semibold text-ink">Allergies &amp; dietary needs</h2>
			<label class="flex items-center gap-2 text-sm font-medium text-ink">
				<input
					type="checkbox"
					name="collect_allergies"
					checked={flag('collect_allergies', event.collectAllergies)}
					class="h-4 w-4 rounded border-line text-primary focus:ring-primary"
				/>
				Ask guests about allergies &amp; dietary needs
			</label>
			<p class="pl-6 text-xs text-muted">
				Guests pick from common allergens (or add their own) with a severity. New sign-ups then see
				a combined “please avoid” summary while choosing what to bring.
			</p>
		</section>

		<section class="card space-y-4">
			<h2 class="text-lg font-semibold text-ink">Theme</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class="label" for="ev-theme-primary">Primary color</label>
					<div class="flex items-center gap-2">
						<input
							type="color"
							aria-label="Pick primary color"
							value={themePrimary || '#7c3aed'}
							oninput={(e) => (themePrimary = e.currentTarget.value)}
							class="h-9 w-12 cursor-pointer rounded border border-line"
						/>
						<input
							id="ev-theme-primary"
							name="theme_primary"
							class="input"
							bind:value={themePrimary}
							placeholder="Instance default"
						/>
					</div>
				</div>
				<div>
					<label class="label" for="ev-theme-accent">Accent color</label>
					<div class="flex items-center gap-2">
						<input
							type="color"
							aria-label="Pick accent color"
							value={themeAccent || '#f59e0b'}
							oninput={(e) => (themeAccent = e.currentTarget.value)}
							class="h-9 w-12 cursor-pointer rounded border border-line"
						/>
						<input
							id="ev-theme-accent"
							name="theme_accent"
							class="input"
							bind:value={themeAccent}
							placeholder="Instance default"
						/>
					</div>
				</div>
				<div>
					<label class="label" for="ev-theme-banner">Banner image URL (optional)</label>
					<input
						id="ev-theme-banner"
						type="url"
						name="theme_banner"
						class="input"
						value={v ? v.theme_banner : (event.theme.bannerImageUrl ?? '')}
					/>
					{#if errors?.theme_banner}<p class="field-error">{errors.theme_banner}</p>{/if}
				</div>
				<div>
					<label class="label" for="ev-theme-font">Font (optional)</label>
					<input
						id="ev-theme-font"
						name="theme_font"
						class="input"
						value={v ? v.theme_font : (event.theme.font ?? '')}
						placeholder="e.g. Georgia, serif"
					/>
				</div>
			</div>
		</section>

		<button type="submit" class="btn-primary">Save changes</button>
	</form>

	{#if !event.isTemplate}
		<section class="card flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="text-lg font-semibold text-ink">Reuse this event</h2>
				<p class="text-sm text-muted">
					Save its current setup (fields, dish categories, options, theme) as a reusable template.
				</p>
			</div>
			<form method="POST" action="?/saveAsTemplate" use:enhance>
				<button type="submit" class="btn-secondary">Save as template</button>
			</form>
		</section>

		<section class="card space-y-3">
			<h2 class="text-lg font-semibold text-ink">Public link privacy</h2>
			{#if event.publicToken}
				<p class="text-sm text-muted">
					The public link currently requires a secret token: guests must use
					<code class="rounded bg-surface px-1">/e/{event.slug}?t={event.publicToken}</code>.
				</p>
				<form method="POST" action="?/togglePublicToken" use:enhance>
					<button type="submit" class="btn-secondary">Remove token (open link)</button>
				</form>
			{:else}
				<p class="text-sm text-muted">
					Anyone who knows the link can view this event. Add a secret token to make the link
					unguessable.
				</p>
				<form method="POST" action="?/togglePublicToken" use:enhance>
					<button type="submit" class="btn-secondary">Require a secret token</button>
				</form>
			{/if}
		</section>
	{/if}

	<details class="card border-red-200 dark:border-red-500/30" open={Boolean(form?.danger)}>
		<summary class="cursor-pointer font-semibold text-red-700 dark:text-red-400"
			>Danger zone</summary
		>
		<form method="POST" action="?/delete" use:enhance class="mt-4 space-y-3">
			<p class="text-sm text-muted">
				Deleting permanently removes this {event.isTemplate
					? 'template'
					: 'event with all its RSVPs and dish contributions'}. Type
				<strong>{event.title}</strong> to confirm.
			</p>
			<input
				name="confirm"
				class="input max-w-md"
				placeholder={event.title}
				autocomplete="off"
				required
			/>
			{#if form?.danger?.error}<p class="field-error">{form.danger.error}</p>{/if}
			<button type="submit" class="btn-danger"
				>Delete {event.isTemplate ? 'template' : 'event'}</button
			>
		</form>
	</details>
</div>
