<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { WebhookEndpoint } from '$lib/server/db/schema';

	const EVENT_TYPES = ['rsvp.created', 'rsvp.updated', 'rsvp.withdrawn'];
	const FORMAT_HELP: Record<string, string> = {
		ntfy: 'Topic URL, e.g. https://ntfy.sh/my-topic',
		json: 'Any endpoint receiving JSON: {type, title, message, payload}',
		telegram: 'https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<ID>'
	};

	let {
		action,
		webhook = null,
		events,
		errors = null,
		values = null,
		submitLabel = 'Save notifier'
	}: {
		action: string;
		/**
		 * Existing endpoint when editing; null for the add form. The `secret` is
		 * never sent to the browser — only `hasSecret` indicates one is stored.
		 */
		webhook?: (Omit<WebhookEndpoint, 'secret'> & { hasSecret?: boolean }) | null;
		events: { id: string; title: string }[];
		errors?: Record<string, string> | null;
		/** Sticky raw values from a failed submit (no-JS reloads). */
		values?: Record<string, string> | null;
		submitLabel?: string;
	} = $props();

	// One-time snapshot to seed the (uncontrolled) form inputs; intentionally not
	// reactive, so a parent data refresh won't wipe a half-filled form. untrack
	// declares that intent and silences the state_referenced_locally hints.
	const initial = untrack(() => ({
		label: values?.label ?? webhook?.label ?? '',
		url: values?.url ?? webhook?.url ?? '',
		format: values?.format ?? webhook?.format ?? 'ntfy',
		eventTypes: values
			? (values.event_types ?? '').split(',').filter(Boolean)
			: (webhook?.eventTypes ?? [...EVENT_TYPES]),
		eventId: values?.event_id ?? webhook?.eventId ?? '',
		active: values ? values.active === 'on' : (webhook?.active ?? true)
	}));

	let format = $state(initial.format);
	const uid = untrack(() => webhook?.id ?? 'new');
</script>

<form method="POST" {action} use:enhance class="space-y-3">
	{#if webhook}
		<input type="hidden" name="id" value={webhook.id} />
	{/if}

	<div class="grid gap-3 sm:grid-cols-2">
		<div>
			<label class="label" for="wh-label-{uid}"
				>Label <span class="text-red-600 dark:text-red-400">*</span></label
			>
			<input id="wh-label-{uid}" name="label" class="input" value={initial.label} required />
			{#if errors?.label}<p class="field-error">{errors.label}</p>{/if}
		</div>
		<div>
			<label class="label" for="wh-format-{uid}">Format</label>
			<select id="wh-format-{uid}" name="format" class="input" bind:value={format}>
				<option value="ntfy">ntfy</option>
				<option value="json">Generic JSON</option>
				<option value="telegram">Telegram bot</option>
			</select>
			<p class="mt-1 text-xs text-muted">{FORMAT_HELP[format]}</p>
		</div>
	</div>

	<div>
		<label class="label" for="wh-url-{uid}"
			>URL <span class="text-red-600 dark:text-red-400">*</span></label
		>
		<input id="wh-url-{uid}" type="url" name="url" class="input" value={initial.url} required />
		{#if errors?.url}<p class="field-error">{errors.url}</p>{/if}
	</div>

	<div>
		<label class="label" for="wh-secret-{uid}">Secret (optional)</label>
		<input
			id="wh-secret-{uid}"
			type="password"
			name="secret"
			class="input"
			autocomplete="new-password"
			placeholder={webhook?.hasSecret ? 'Leave blank to keep current secret' : ''}
		/>
		<p class="mt-1 text-xs text-muted">
			Sent as a bearer token (ntfy/JSON); for Telegram it's the chat_id fallback.{#if webhook?.hasSecret}
				A secret is already set — leave this blank to keep it.{/if}
		</p>
	</div>

	<fieldset>
		<legend class="label">Send on</legend>
		<div class="flex flex-wrap gap-4">
			{#each EVENT_TYPES as t (t)}
				<label class="flex items-center gap-2 text-sm text-ink">
					<input
						type="checkbox"
						name="event_types"
						value={t}
						checked={initial.eventTypes.includes(t)}
						class="h-4 w-4 rounded border-line text-primary focus:ring-primary"
					/>
					{t}
				</label>
			{/each}
		</div>
		<p class="mt-1 text-xs text-muted">Leave all unchecked to send everything.</p>
	</fieldset>

	<div class="grid gap-3 sm:grid-cols-2">
		<div>
			<label class="label" for="wh-event-{uid}">Event scope</label>
			<select id="wh-event-{uid}" name="event_id" class="input">
				<option value="" selected={!initial.eventId}>All events</option>
				{#each events as event (event.id)}
					<option value={event.id} selected={event.id === initial.eventId}>{event.title}</option>
				{/each}
			</select>
		</div>
		<label class="flex items-center gap-2 self-end pb-2 text-sm font-medium text-ink">
			<input
				type="checkbox"
				name="active"
				checked={initial.active}
				class="h-4 w-4 rounded border-line text-primary focus:ring-primary"
			/>
			Active
		</label>
	</div>

	<button type="submit" class="btn-primary">{submitLabel}</button>
</form>
