<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, untrack } from 'svelte';
	import FieldRenderer from '$lib/components/FieldRenderer.svelte';
	import Stepper from '$lib/components/guest/Stepper.svelte';
	import AllergyNotice from '$lib/components/guest/AllergyNotice.svelte';
	import type { DishCategory, Event, FieldDefinition } from '$lib/server/db/schema';
	import {
		KNOWN_ALLERGENS,
		ALLERGEN_OTHER,
		ALLERGY_SEVERITIES,
		MAX_ALLERGY_ROWS,
		type AllergyDigest
	} from '$lib/allergens';

	type EventConfig = Pick<
		Event,
		| 'requireEmail'
		| 'allowMaybe'
		| 'maxPlusOnes'
		| 'trackKids'
		| 'showDishListPublic'
		| 'collectDishes'
		| 'dishShowCategory'
		| 'dishShowServes'
		| 'dishShowNote'
		| 'itemNounSingular'
		| 'itemNounPlural'
		| 'collectAllergies'
	>;
	type PrefillValue = string | number | boolean | string[] | null | undefined;

	let {
		event,
		fieldDefinitions,
		categories,
		values = {},
		errors = undefined,
		submitLabel,
		formStartedAt = undefined,
		publicToken = null,
		action,
		maxDishRows = 10,
		allergyDigest = [],
		yesDisabled = false,
		emailHint = false
	}: {
		event: EventConfig;
		fieldDefinitions: FieldDefinition[];
		categories: DishCategory[];
		/** Prefill: raw form echoes or stored RSVP values, keyed by input name (cf_*, dish_*_i …). */
		values?: Record<string, PrefillValue>;
		errors?: Record<string, string>;
		submitLabel: string;
		/** Render the form_started_at bot-timing field only when provided. */
		formStartedAt?: number;
		publicToken?: string | null;
		action: string;
		maxDishRows?: number;
		/** Aggregated allergies/dietary needs to surface while choosing what to bring. */
		allergyDigest?: AllergyDigest[];
		yesDisabled?: boolean;
		/** Whether the instance can email edit links (shows the email help text). */
		emailHint?: boolean;
	} = $props();

	function str(key: string): string {
		const v: PrefillValue = values[key];
		if (v === null || v === undefined || typeof v === 'boolean') return '';
		if (Array.isArray(v)) return v[0] ?? '';
		return String(v);
	}

	function strs(key: string): string[] {
		const v: PrefillValue = values[key];
		if (Array.isArray(v)) return v.map(String);
		if (typeof v === 'string' && v !== '') return [v];
		return [];
	}

	function bool(key: string): boolean {
		const v: PrefillValue = values[key];
		return v === true || v === 'on' || v === 'true' || v === '1';
	}

	// ── Live form state ──────────────────────────────────────────────────────
	let response = $state(untrack(() => str('response') || (yesDisabled ? '' : 'yes')));
	let guestName = $state(str('guestName'));
	let guestEmail = $state(str('guestEmail'));
	let plusOnesAdults = $state(Number(str('plusOnesAdults')) || 0);
	let plusOnesKids = $state(Number(str('plusOnesKids')) || 0);
	let note = $state(str('note'));
	let submitting = $state(false);
	let extraDishRows = $state(0);

	// Live mirror of dish-row item names so the review summary stays accurate.
	let dishItems = $state<string[]>(
		untrack(() => Array.from({ length: maxDishRows }, (_, i) => str(`dish_item_${i}`)))
	);

	// Allergy rows: live mirror of the allergen <select> (toggles the "Other"
	// text input) and the "Other" text (keeps the review summary accurate).
	let extraAllergyRows = $state(0);
	let allergenSel = $state<string[]>(
		Array.from({ length: MAX_ALLERGY_ROWS }, (_, i) => str(`allergen_${i}`))
	);
	let allergenOther = $state<string[]>(
		Array.from({ length: MAX_ALLERGY_ROWS }, (_, i) => str(`allergen_other_${i}`))
	);

	// ── Wizard gating: only collapse to one-step-at-a-time once JS is live. ──
	let jsEnabled = $state(false);
	let stepIndex = $state(0);

	const hideExtras = $derived(response === 'no');

	const prefilledDishRows = $derived.by(() => {
		let count = 0;
		for (let i = 0; i < maxDishRows; i++) {
			if (str(`dish_item_${i}`) !== '') count = i + 1;
		}
		return count;
	});
	// Wizard starts lean (1 row); without JS it falls back to the original 3+.
	const minDishRows = $derived(jsEnabled ? 1 : 3);
	const visibleDishRows = $derived(
		Math.min(maxDishRows, Math.max(minDishRows, prefilledDishRows) + extraDishRows)
	);

	// Allergy step appears only when the host collects allergies for this event.
	const allergyStepRelevant = $derived(event.collectAllergies);
	const prefilledAllergyRows = $derived.by(() => {
		let count = 0;
		for (let i = 0; i < MAX_ALLERGY_ROWS; i++) {
			if (str(`allergen_${i}`) !== '') count = i + 1;
		}
		return count;
	});
	const minAllergyRows = $derived(jsEnabled ? 1 : 2);
	const visibleAllergyRows = $derived(
		Math.min(MAX_ALLERGY_ROWS, Math.max(minAllergyRows, prefilledAllergyRows) + extraAllergyRows)
	);

	// The dish step appears only when the host is collecting contributions.
	const dishStepRelevant = $derived(event.collectDishes);
	const showCategoryField = $derived(categories.length > 0 && event.dishShowCategory);
	// Host-defined noun ("dish"/"supply"/…), so the list isn't food-specific.
	const nounSingular = $derived(event.itemNounSingular);
	const nounPlural = $derived(event.itemNounPlural);
	const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
	const dishHeading = $derived(
		categories.length > 0 ? cap(nounPlural) : `Bringing a ${nounSingular}?`
	);

	// ── Step sequence (computed from event config + live response). ──────────
	type StepKey = 'response' | 'about' | 'allergies' | 'dish' | 'details' | 'review';

	const steps = $derived.by<{ key: StepKey; label: string }[]>(() => {
		const attending = response !== 'no';
		const list: { key: StepKey; label: string }[] = [
			{ key: 'response', label: 'RSVP' },
			{ key: 'about', label: 'About you' }
		];
		if (attending && allergyStepRelevant) list.push({ key: 'allergies', label: 'Allergies' });
		if (attending && dishStepRelevant) list.push({ key: 'dish', label: 'Dishes' });
		if (attending && fieldDefinitions.length > 0) list.push({ key: 'details', label: 'Details' });
		list.push({ key: 'review', label: 'Review' });
		return list;
	});

	const stepLabels = $derived(steps.map((s) => s.label));
	// Clamp the active index whenever the visible sequence shrinks (e.g. → "no").
	const safeIndex = $derived(Math.min(stepIndex, steps.length - 1));
	const activeKey = $derived(steps[safeIndex]?.key ?? 'response');
	const isLastStep = $derived(safeIndex >= steps.length - 1);

	// With JS we collapse to one step at a time; without JS every step is shown
	// stacked (and stays in the form so it submits - constraint #3 & #4).
	function visible(key: StepKey): boolean {
		return !jsEnabled || activeKey === key;
	}
	function hiddenFor(key: StepKey): boolean {
		return jsEnabled && activeKey !== key;
	}

	// ── Soft client-side gating for the Next button. ─────────────────────────
	const canAdvance = $derived.by(() => {
		switch (activeKey) {
			case 'response':
				return response !== '';
			case 'about':
				if (guestName.trim() === '') return false;
				if (event.requireEmail && guestEmail.trim() === '') return false;
				return true;
			default:
				return true;
		}
	});

	function goNext() {
		if (safeIndex < steps.length - 1) stepIndex = safeIndex + 1;
	}
	function goBack() {
		if (safeIndex > 0) stepIndex = safeIndex - 1;
	}

	function prefersReducedMotion(): boolean {
		return (
			typeof window !== 'undefined' &&
			window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
		);
	}

	// Auto-advance from the response card selection after a short beat.
	let autoAdvanceTimer: ReturnType<typeof setTimeout> | undefined;
	function pickResponse(value: string) {
		response = value;
		if (!jsEnabled) return;
		// Don't shift the view out from under someone who asked for reduced motion;
		// they advance with the Next button instead.
		if (prefersReducedMotion()) return;
		clearTimeout(autoAdvanceTimer);
		autoAdvanceTimer = setTimeout(() => {
			if (activeKey === 'response') goNext();
		}, 350);
	}

	// ── Focus management: move focus to the active step's heading on change so
	//    screen-reader and keyboard users land in the new step (not stranded on a
	//    now-hidden control). Skip the initial settle so we don't grab focus on load.
	let formEl = $state<HTMLFormElement>();
	let lastFocusedStep = -1;
	$effect(() => {
		const idx = safeIndex; // track step changes
		if (!jsEnabled || !formEl) return;
		if (lastFocusedStep === -1) {
			lastFocusedStep = idx; // establish baseline without stealing focus
			return;
		}
		if (idx === lastFocusedStep) return;
		lastFocusedStep = idx;
		const heading = formEl.querySelector<HTMLElement>(
			'.wizard-step:not(.hidden) h2, .wizard-step:not(.hidden) legend'
		);
		if (heading) {
			heading.tabIndex = -1;
			heading.focus();
		}
	});

	// ── Plus-one stepper buttons (mutate the bound numeric values). ──────────
	function clampPlus(n: number): number {
		return Math.max(0, Math.min(event.maxPlusOnes, n));
	}
	const plusTotal = $derived(plusOnesAdults + (event.trackKids ? plusOnesKids : 0));

	// ── On mount: enable wizard + jump to the first errored step. ────────────
	onMount(() => {
		jsEnabled = true;
		if (errors) {
			const errKeys = Object.keys(errors);
			const stepHasError = (key: StepKey): boolean => {
				switch (key) {
					case 'response':
						return errKeys.includes('response') || errKeys.includes('form');
					case 'about':
						return ['guestName', 'guestEmail', 'plusOnesAdults', 'plusOnesKids'].some((k) =>
							errKeys.includes(k)
						);
					case 'allergies':
						return errKeys.some((k) => k.startsWith('allergen_') || k.startsWith('severity_'));
					case 'dish':
						return errKeys.some((k) => k.startsWith('dish_'));
					case 'details':
						return errKeys.some((k) => k.startsWith('cf_'));
					case 'review':
						return errKeys.includes('note');
				}
			};
			const idx = steps.findIndex((s) => stepHasError(s.key));
			if (idx >= 0) stepIndex = idx;
		}
	});

	// Labels for the review summary.
	const responseSummary = $derived(
		response === 'yes' ? 'Yes' : response === 'maybe' ? 'Maybe' : response === 'no' ? 'No' : '-'
	);
	const partySummary = $derived(1 + plusTotal);
	const filledDishes = $derived(
		dishItems.filter((name, i) => i < visibleDishRows && name.trim() !== '')
	);
	const filledAllergies = $derived.by(() => {
		const out: string[] = [];
		for (let i = 0; i < visibleAllergyRows; i++) {
			const sel = allergenSel[i] ?? '';
			if (!sel) continue;
			const label = sel === ALLERGEN_OTHER ? (allergenOther[i] ?? '').trim() : sel;
			if (label) out.push(label);
		}
		return out;
	});

	const radioCard =
		'group relative flex w-full cursor-pointer items-center gap-4 rounded-2xl border-2 border-line bg-card p-5 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md dark:shadow-none dark:hover:shadow-none has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:shadow-md dark:has-[:checked]:shadow-none has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2';
</script>

<form
	bind:this={formEl}
	method="POST"
	{action}
	class="mx-auto max-w-xl"
	novalidate={jsEnabled}
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			submitting = false;
			await update({ reset: false });
		};
	}}
>
	{#if publicToken}
		<input type="hidden" name="t" value={publicToken} />
	{/if}
	{#if formStartedAt !== undefined}
		<input type="hidden" name="form_started_at" value={formStartedAt} />
	{/if}

	<!-- Honeypot: invisible to humans, irresistible to bots. -->
	<div class="hidden" aria-hidden="true">
		<label for="rsvp-website">Website</label>
		<input type="text" id="rsvp-website" name="website" tabindex="-1" autocomplete="off" value="" />
	</div>

	{#if errors?.form}
		<div
			class="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
			role="alert"
		>
			{errors.form}
		</div>
	{/if}

	{#if jsEnabled}
		<Stepper steps={stepLabels} current={safeIndex} />
	{/if}

	<!-- ═══ STEP: response ═══════════════════════════════════════════════
	     Every step stays mounted so its inputs always submit (constraint #3);
	     `class:hidden` only toggles display. -->
	<section class="wizard-step" class:hidden={hiddenFor('response')}>
		<fieldset>
			<legend class="mb-1 text-xl font-bold text-ink"> Will you be there? </legend>
			<p class="mb-4 text-sm text-muted">Pick the one that fits.</p>
			<div class="space-y-3">
				<label class={radioCard}>
					<input
						type="radio"
						name="response"
						value="yes"
						checked={response === 'yes'}
						onchange={() => pickResponse('yes')}
						required
						disabled={yesDisabled}
						class="h-5 w-5 shrink-0 border-line text-primary focus:ring-primary"
					/>
					<span class="min-w-0 flex-1">
						<span class="block font-semibold text-ink">
							Yes{yesDisabled ? ' (full)' : ''}
						</span>
						<span class="block text-sm text-muted">Count me in</span>
					</span>
				</label>

				{#if event.allowMaybe}
					<label class={radioCard}>
						<input
							type="radio"
							name="response"
							value="maybe"
							checked={response === 'maybe'}
							onchange={() => pickResponse('maybe')}
							required
							class="h-5 w-5 shrink-0 border-line text-primary focus:ring-primary"
						/>
						<span class="min-w-0 flex-1">
							<span class="block font-semibold text-ink">Maybe</span>
							<span class="block text-sm text-muted">Not sure yet</span>
						</span>
					</label>
				{/if}

				<label class={radioCard}>
					<input
						type="radio"
						name="response"
						value="no"
						checked={response === 'no'}
						onchange={() => pickResponse('no')}
						required
						class="h-5 w-5 shrink-0 border-line text-primary focus:ring-primary"
					/>
					<span class="min-w-0 flex-1">
						<span class="block font-semibold text-ink">No</span>
						<span class="block text-sm text-muted">Can't make it</span>
					</span>
				</label>
			</div>
			{#if yesDisabled}
				<p class="mt-3 text-sm text-muted">
					This event is at capacity - you can still answer no{event.allowMaybe ? ' or maybe' : ''}.
				</p>
			{/if}
			{#if errors?.response}<p class="field-error">{errors.response}</p>{/if}
		</fieldset>
	</section>

	<!-- ═══ STEP: about (name, email, plus-ones) ═════════════════════════ -->
	<section class="wizard-step space-y-6" class:hidden={hiddenFor('about')}>
		{#if jsEnabled}
			<h2 class="text-xl font-bold text-ink">Tell us about you</h2>
		{/if}

		<div>
			<label class="label" for="rsvp-guest-name">
				Your name <span class="text-red-600">*</span>
			</label>
			<input
				type="text"
				id="rsvp-guest-name"
				name="guestName"
				class="input"
				required
				maxlength="200"
				autocomplete="name"
				bind:value={guestName}
			/>
			{#if errors?.guestName}<p class="field-error">{errors.guestName}</p>{/if}
		</div>

		<div>
			<label class="label" for="rsvp-guest-email">
				Email{#if event.requireEmail}<span class="text-red-600"> *</span>{:else}
					<span class="font-normal text-muted">(optional)</span>{/if}
			</label>
			{#if emailHint}
				<p class="mb-1 text-sm text-muted">We'll email you a private link to edit your RSVP.</p>
			{/if}
			<input
				type="email"
				id="rsvp-guest-email"
				name="guestEmail"
				class="input"
				required={event.requireEmail}
				maxlength="254"
				autocomplete="email"
				bind:value={guestEmail}
			/>
			{#if errors?.guestEmail}<p class="field-error">{errors.guestEmail}</p>{/if}
		</div>

		{#if event.maxPlusOnes > 0}
			<fieldset>
				<legend class="label">Bringing anyone?</legend>
				<p class="mb-3 text-sm text-muted">
					Besides you - up to {event.maxPlusOnes} extra guest{event.maxPlusOnes === 1 ? '' : 's'}.
				</p>

				{#if event.trackKids}
					<div class="grid grid-cols-2 gap-3">
						<div>
							<span class="label">Additional adults</span>
							<div class="flex items-center gap-2">
								<button
									type="button"
									class="btn-secondary h-10 w-10 shrink-0 px-0 text-lg"
									aria-label="One fewer adult"
									onclick={() => (plusOnesAdults = clampPlus(plusOnesAdults - 1))}
									disabled={plusOnesAdults <= 0}
								>
									-
								</button>
								<input
									type="number"
									id="rsvp-plus-adults"
									name="plusOnesAdults"
									class="input text-center"
									min="0"
									max={event.maxPlusOnes}
									bind:value={plusOnesAdults}
								/>
								<button
									type="button"
									class="btn-secondary h-10 w-10 shrink-0 px-0 text-lg"
									aria-label="One more adult"
									onclick={() => (plusOnesAdults = clampPlus(plusOnesAdults + 1))}
									disabled={plusTotal >= event.maxPlusOnes}
								>
									+
								</button>
							</div>
							{#if errors?.plusOnesAdults}<p class="field-error">{errors.plusOnesAdults}</p>{/if}
						</div>
						<div>
							<span class="label">Kids</span>
							<div class="flex items-center gap-2">
								<button
									type="button"
									class="btn-secondary h-10 w-10 shrink-0 px-0 text-lg"
									aria-label="One fewer kid"
									onclick={() => (plusOnesKids = clampPlus(plusOnesKids - 1))}
									disabled={plusOnesKids <= 0}
								>
									-
								</button>
								<input
									type="number"
									id="rsvp-plus-kids"
									name="plusOnesKids"
									class="input text-center"
									min="0"
									max={event.maxPlusOnes}
									bind:value={plusOnesKids}
								/>
								<button
									type="button"
									class="btn-secondary h-10 w-10 shrink-0 px-0 text-lg"
									aria-label="One more kid"
									onclick={() => (plusOnesKids = clampPlus(plusOnesKids + 1))}
									disabled={plusTotal >= event.maxPlusOnes}
								>
									+
								</button>
							</div>
							{#if errors?.plusOnesKids}<p class="field-error">{errors.plusOnesKids}</p>{/if}
						</div>
					</div>
				{:else}
					<label class="label" for="rsvp-plus-adults">
						Additional guests
						<span class="font-normal text-muted">(max {event.maxPlusOnes})</span>
					</label>
					<div class="flex items-center gap-2">
						<button
							type="button"
							class="btn-secondary h-10 w-10 shrink-0 px-0 text-lg"
							aria-label="One fewer guest"
							onclick={() => (plusOnesAdults = clampPlus(plusOnesAdults - 1))}
							disabled={plusOnesAdults <= 0}
						>
							-
						</button>
						<input
							type="number"
							id="rsvp-plus-adults"
							name="plusOnesAdults"
							class="input text-center"
							min="0"
							max={event.maxPlusOnes}
							bind:value={plusOnesAdults}
						/>
						<button
							type="button"
							class="btn-secondary h-10 w-10 shrink-0 px-0 text-lg"
							aria-label="One more guest"
							onclick={() => (plusOnesAdults = clampPlus(plusOnesAdults + 1))}
							disabled={plusOnesAdults >= event.maxPlusOnes}
						>
							+
						</button>
					</div>
					{#if errors?.plusOnesAdults}<p class="field-error">{errors.plusOnesAdults}</p>{/if}
				{/if}
			</fieldset>
		{:else}
			<!-- Keep plusOnesAdults present in DOM even when no plus-ones UI shows so
				     the server always parses a value (mirrors original: it defaults to 0). -->
			<input type="hidden" name="plusOnesAdults" value={plusOnesAdults} />
		{/if}
	</section>

	<!-- ═══ STEP: allergies ══════════════════════════════════════════════
	     Guests declare what THEY need others to avoid; surfaced back to new
	     sign-ups as the "what to avoid" digest in the dish step. Inputs stay
	     mounted so they submit without JS; validation drops them for "no". -->
	{#if event.collectAllergies}
		<section
			class="wizard-step space-y-4"
			class:hidden={jsEnabled ? !visible('allergies') : hideExtras}
		>
			<div>
				<h2 class="text-xl font-bold text-ink">Allergies &amp; dietary needs</h2>
				<p class="text-sm text-muted">
					Tell us what to avoid so everyone can plan around it - leave blank if none.
				</p>
			</div>

			{#each Array.from({ length: visibleAllergyRows }, (_, i) => i) as i (i)}
				<div class="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2">
					<div>
						<label class="mb-1 block text-xs font-medium text-muted" for={`allergen-${i}`}>
							Allergen / restriction
						</label>
						<select
							id={`allergen-${i}`}
							name={`allergen_${i}`}
							class="input"
							bind:value={allergenSel[i]}
						>
							<option value="">- None -</option>
							{#each KNOWN_ALLERGENS as a (a)}
								<option value={a}>{a}</option>
							{/each}
							<option value={ALLERGEN_OTHER}>Other…</option>
						</select>
						<!-- Always in the DOM (no-JS submits it); shown only for "Other" with JS. -->
						<input
							type="text"
							name={`allergen_other_${i}`}
							class="input mt-2"
							class:hidden={jsEnabled && allergenSel[i] !== ALLERGEN_OTHER}
							maxlength="100"
							placeholder="e.g. no pork (halal)"
							aria-label="Other allergen or restriction"
							bind:value={allergenOther[i]}
						/>
						{#if errors?.[`allergen_other_${i}`]}
							<p class="field-error">{errors[`allergen_other_${i}`]}</p>
						{/if}
					</div>
					<div>
						<label class="mb-1 block text-xs font-medium text-muted" for={`severity-${i}`}>
							How serious?
						</label>
						<select id={`severity-${i}`} name={`severity_${i}`} class="input">
							{#each ALLERGY_SEVERITIES as s (s.value)}
								<option value={s.value} selected={(str(`severity_${i}`) || 'allergy') === s.value}>
									{s.label}
								</option>
							{/each}
						</select>
					</div>
				</div>
			{/each}

			{#if visibleAllergyRows < MAX_ALLERGY_ROWS}
				<button type="button" class="btn-secondary" onclick={() => (extraAllergyRows += 1)}>
					+ Add another
				</button>
			{/if}
		</section>
	{/if}

	<!-- ═══ STEP: dish ═══════════════════════════════════════════════════
	     Only rendered when the host collects dishes for this event. Each
	     sub-field (category / serves / note) is independently configurable.
	     Inputs stay in the DOM even when this step isn't in the wizard
	     sequence (e.g. response = "no"); we hide via display only. -->
	{#if event.collectDishes}
		<section class="wizard-step space-y-4" class:hidden={jsEnabled ? !visible('dish') : hideExtras}>
			<div>
				<h2 class="text-xl font-bold text-ink">{dishHeading}</h2>
				<p class="text-sm text-muted">
					Let everyone know what you're bringing - leave blank if you're not sure yet.
				</p>
			</div>

			<!-- Surface the group's allergies right where bringers choose. -->
			<AllergyNotice digest={allergyDigest} title="Heads up - please avoid these:" />

			{#each Array.from({ length: visibleDishRows }, (_, i) => i) as i (i)}
				<div class="space-y-3 rounded-2xl border border-line bg-surface p-4">
					<div class="grid gap-3 {showCategoryField ? 'sm:grid-cols-2' : ''}">
						<div>
							<label class="mb-1 block text-xs font-medium text-muted" for={`dish-item-${i}`}>
								{cap(nounSingular)}
							</label>
							<input
								type="text"
								id={`dish-item-${i}`}
								name={`dish_item_${i}`}
								class="input"
								maxlength="200"
								placeholder={nounSingular === 'dish'
									? 'e.g. Potato salad'
									: 'What are you bringing?'}
								bind:value={dishItems[i]}
							/>
							{#if errors?.[`dish_item_${i}`]}
								<p class="field-error">{errors[`dish_item_${i}`]}</p>
							{/if}
						</div>
						{#if showCategoryField}
							<div>
								<label class="mb-1 block text-xs font-medium text-muted" for={`dish-category-${i}`}>
									Category (optional)
								</label>
								<select id={`dish-category-${i}`} name={`dish_category_${i}`} class="input">
									{#each categories as category (category.id)}
										<option
											value={category.id}
											selected={str(`dish_category_${i}`) === category.id}
										>
											{category.name}
										</option>
									{/each}
									<option value="" selected={str(`dish_category_${i}`) === ''}>Other</option>
								</select>
							</div>
						{/if}
					</div>

					{#if event.dishShowServes || event.dishShowNote}
						<div
							class="grid gap-3 {event.dishShowServes && event.dishShowNote
								? 'sm:grid-cols-[8rem_1fr]'
								: ''}"
						>
							{#if event.dishShowServes}
								<div>
									<label class="mb-1 block text-xs font-medium text-muted" for={`dish-serves-${i}`}>
										Serves (optional)
									</label>
									<input
										type="number"
										id={`dish-serves-${i}`}
										name={`dish_serves_${i}`}
										class="input"
										min="1"
										max="1000"
										value={str(`dish_serves_${i}`)}
									/>
									{#if errors?.[`dish_serves_${i}`]}
										<p class="field-error">{errors[`dish_serves_${i}`]}</p>
									{/if}
								</div>
							{/if}
							{#if event.dishShowNote}
								<div>
									<label class="mb-1 block text-xs font-medium text-muted" for={`dish-note-${i}`}>
										Note (optional)
									</label>
									<input
										type="text"
										id={`dish-note-${i}`}
										name={`dish_note_${i}`}
										class="input"
										maxlength="500"
										placeholder="e.g. vegan, contains nuts"
										value={str(`dish_note_${i}`)}
									/>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}

			{#if visibleDishRows < maxDishRows}
				<button type="button" class="btn-secondary" onclick={() => (extraDishRows += 1)}>
					+ Add another {nounSingular}
				</button>
			{/if}
		</section>
	{/if}

	<!-- ═══ STEP: details (custom fields) ════════════════════════════════
	     Disabled when not attending so the server skips them; mirrors the
	     original (hidden + natively disabled). -->
	{#if fieldDefinitions.length > 0}
		<fieldset
			class="wizard-step space-y-5"
			class:hidden={jsEnabled ? !visible('details') : hideExtras}
			disabled={hideExtras}
		>
			<legend class="text-xl font-bold text-ink">A few details</legend>
			{#each fieldDefinitions as def (def.id)}
				<FieldRenderer
					definition={def}
					value={str(`cf_${def.key}`)}
					values={strs(`cf_${def.key}`)}
					checked={bool(`cf_${def.key}`)}
					error={errors?.[`cf_${def.key}`]}
				/>
			{/each}
		</fieldset>
	{/if}

	<!-- ═══ STEP: review (summary + note + submit) ═══════════════════════ -->
	<section class="wizard-step space-y-6" class:hidden={hiddenFor('review')}>
		{#if jsEnabled}
			<h2 class="text-xl font-bold text-ink">Review &amp; send</h2>

			<dl class="space-y-3 rounded-2xl border border-line bg-surface p-5 text-sm">
				<div class="flex items-baseline justify-between gap-4">
					<dt class="text-muted">Response</dt>
					<dd class="text-right font-semibold text-ink">{responseSummary}</dd>
				</div>
				<div class="flex items-baseline justify-between gap-4">
					<dt class="text-muted">Name</dt>
					<dd class="text-right font-medium text-ink">{guestName || '-'}</dd>
				</div>
				{#if guestEmail}
					<div class="flex items-baseline justify-between gap-4">
						<dt class="text-muted">Email</dt>
						<dd class="break-all text-right font-medium text-ink">{guestEmail}</dd>
					</div>
				{/if}
				{#if response !== 'no' && event.maxPlusOnes > 0}
					<div class="flex items-baseline justify-between gap-4">
						<dt class="text-muted">Party size</dt>
						<dd class="text-right font-medium text-ink">
							{partySummary}
							{partySummary === 1 ? 'person' : 'people'}
						</dd>
					</div>
				{/if}
				{#if response !== 'no' && filledDishes.length > 0}
					<div class="flex items-baseline justify-between gap-4">
						<dt class="text-muted">Bringing</dt>
						<dd class="text-right font-medium text-ink">
							{filledDishes.join(', ')}
						</dd>
					</div>
				{/if}
				{#if response !== 'no' && filledAllergies.length > 0}
					<div class="flex items-baseline justify-between gap-4">
						<dt class="text-muted">Allergies</dt>
						<dd class="text-right font-medium text-ink">
							{filledAllergies.join(', ')}
						</dd>
					</div>
				{/if}
			</dl>
		{/if}

		<div>
			<label class="label" for="rsvp-note">
				Note to the host <span class="font-normal text-muted">(optional)</span>
			</label>
			<textarea id="rsvp-note" name="note" rows="3" class="input" maxlength="2000" bind:value={note}
			></textarea>
			{#if errors?.note}<p class="field-error">{errors.note}</p>{/if}
		</div>
	</section>

	<!-- ═══ Navigation ═══════════════════════════════════════════════════ -->
	{#if jsEnabled}
		<div class="mt-8 flex items-center gap-3">
			{#if safeIndex > 0}
				<button type="button" class="btn-secondary px-6 py-3" onclick={goBack}>← Back</button>
			{/if}
			{#if isLastStep}
				<button type="submit" class="btn-primary flex-1 py-3 text-base" disabled={submitting}>
					{submitting ? 'Sending…' : submitLabel}
				</button>
			{:else}
				<button
					type="button"
					class="btn-primary flex-1 py-3 text-base"
					onclick={goNext}
					disabled={!canAdvance}
				>
					Next →
				</button>
			{/if}
		</div>
	{:else}
		<!-- No-JS: single always-present submit at the very bottom. -->
		<button type="submit" class="btn-primary mt-8 w-full py-3 text-base" disabled={submitting}>
			{submitting ? 'Sending…' : submitLabel}
		</button>
	{/if}
</form>

<style>
	/* All steps stay mounted (so every input always submits). When a step
	   flips from display:none → visible the entrance animation replays,
	   giving the wizard a subtle slide/fade between steps without ever
	   removing form fields from the DOM. */
	.wizard-step {
		animation: wizard-step-in 0.22s ease-out;
	}

	@keyframes wizard-step-in {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.wizard-step {
			animation: none;
		}
	}
</style>
