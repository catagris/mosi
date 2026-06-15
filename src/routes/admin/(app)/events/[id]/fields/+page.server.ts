import { error, fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards';
import { getEvent, listFieldDefinitions } from '$lib/server/services/events';
import {
	createFieldWithUniqueKey,
	deleteFieldDefinition,
	reorderFieldDefinitions,
	updateFieldDefinition
} from '$lib/server/services/fields';
import { FIELD_TYPES, FIELD_TYPE_META, type FieldTypeName } from '$lib/fields/registry';
import { checkPatternSafety } from '$lib/server/validation/fields';
import type { Event, FieldValidation } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	requireUser(locals);
	const { event } = await parent();
	return { definitions: await listFieldDefinitions(event.id) };
};

async function loadEvent(id: string): Promise<Event> {
	const event = await getEvent(id);
	if (!event) error(404, 'Event not found');
	return event;
}

type ParsedField = {
	values: Record<string, string>;
	errors: Record<string, string>;
	label: string;
	type: FieldTypeName;
	helpText: string | null;
	required: boolean;
	options: string[] | null;
	validation: FieldValidation | null;
};

function parseFieldForm(form: FormData): ParsedField {
	const text = (name: string) => {
		const value = form.get(name);
		return typeof value === 'string' ? value.trim() : '';
	};
	const values: Record<string, string> = {
		label: text('label'),
		type: text('type'),
		help_text: text('help_text'),
		required: form.get('required') === 'on' ? 'on' : '',
		options: typeof form.get('options') === 'string' ? String(form.get('options')) : '',
		min: text('min'),
		max: text('max'),
		max_length: text('max_length'),
		pattern: text('pattern'),
		pattern_message: text('pattern_message')
	};

	const errors: Record<string, string> = {};
	if (!values.label) errors.label = 'Label is required';
	const typeOk = (FIELD_TYPES as readonly string[]).includes(values.type);
	if (!typeOk) errors.type = 'Pick a field type';
	const type = (typeOk ? values.type : 'text') as FieldTypeName;
	const meta = FIELD_TYPE_META[type];

	const options = values.options
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	if (meta.hasOptions && options.length === 0) {
		errors.options = 'Provide at least one option (one per line)';
	}

	const validation: FieldValidation = {};
	if (meta.validations.includes('min') && values.min !== '') {
		const n = Number(values.min);
		if (Number.isFinite(n)) validation.min = n;
		else errors.min = 'Enter a number';
	}
	if (meta.validations.includes('max') && values.max !== '') {
		const n = Number(values.max);
		if (Number.isFinite(n)) validation.max = n;
		else errors.max = 'Enter a number';
	}
	if (
		validation.min !== undefined &&
		validation.max !== undefined &&
		validation.max < validation.min
	) {
		errors.max = 'Max must be at least the min';
	}
	if (meta.validations.includes('maxLength') && values.max_length !== '') {
		const n = Number(values.max_length);
		if (Number.isInteger(n) && n > 0) validation.maxLength = n;
		else errors.max_length = 'Enter a whole number greater than 0';
	}
	if (meta.validations.includes('pattern') && values.pattern !== '') {
		const patternError = checkPatternSafety(values.pattern);
		if (patternError) {
			errors.pattern = patternError;
		} else {
			validation.pattern = values.pattern;
			if (values.pattern_message) validation.patternMessage = values.pattern_message;
		}
	}

	return {
		values,
		errors,
		label: values.label,
		type,
		helpText: values.help_text || null,
		required: values.required === 'on',
		options: meta.hasOptions ? options : null,
		validation: Object.keys(validation).length > 0 ? validation : null
	};
}

export const actions: Actions = {
	create: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		const parsed = parseFieldForm(await request.formData());
		if (Object.keys(parsed.errors).length > 0) {
			return fail(400, { fieldForm: { id: null, errors: parsed.errors, values: parsed.values } });
		}
		const definitions = await listFieldDefinitions(event.id);
		await createFieldWithUniqueKey(event.id, parsed.label, {
			helpText: parsed.helpText,
			type: parsed.type,
			options: parsed.options,
			required: parsed.required,
			validation: parsed.validation,
			sortOrder: definitions.length
		});
		return { fieldSaved: true };
	},

	update: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		const form = await request.formData();
		const id = typeof form.get('id') === 'string' ? String(form.get('id')) : '';
		const parsed = parseFieldForm(form);
		if (!id || Object.keys(parsed.errors).length > 0) {
			return fail(400, {
				fieldForm: { id: id || null, errors: parsed.errors, values: parsed.values }
			});
		}
		// Key is intentionally never changed so stored RSVP answers stay aligned.
		const updated = await updateFieldDefinition(id, event.id, {
			label: parsed.label,
			helpText: parsed.helpText,
			type: parsed.type,
			options: parsed.options,
			required: parsed.required,
			validation: parsed.validation
		});
		if (!updated) {
			return fail(404, {
				fieldForm: { id, errors: { label: 'Field not found' }, values: parsed.values }
			});
		}
		return { fieldSaved: true };
	},

	toggleActive: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const definitions = await listFieldDefinitions(event.id);
		const definition = definitions.find((d) => d.id === id);
		if (!definition) return fail(404, { fieldForm: null });
		await updateFieldDefinition(id, event.id, { active: !definition.active });
		return { fieldSaved: true };
	},

	delete: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		await deleteFieldDefinition(id, event.id);
		return { fieldDeleted: true };
	},

	move: async ({ request, locals, params }) => {
		requireUser(locals);
		const event = await loadEvent(params.id);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const direction = String(form.get('direction') ?? '');
		const definitions = await listFieldDefinitions(event.id);
		const orderedIds = definitions.map((d) => d.id);
		const index = orderedIds.indexOf(id);
		if (index === -1) return fail(404, { fieldForm: null });
		const target = direction === 'up' ? index - 1 : index + 1;
		if (target < 0 || target >= orderedIds.length) return { fieldSaved: true };
		[orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];
		await reorderFieldDefinitions(event.id, orderedIds);
		return { fieldSaved: true };
	}
};
