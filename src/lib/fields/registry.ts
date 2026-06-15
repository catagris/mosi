/**
 * Field type registry - single source of truth for the custom field engine.
 * Shared by the admin form builder, the guest <FieldRenderer>, and the
 * server-side dynamic Zod validator.
 */

export const FIELD_TYPES = [
	'text',
	'textarea',
	'number',
	'select',
	'multiselect',
	'checkbox',
	'date',
	'phone',
	'email'
] as const;

export type FieldTypeName = (typeof FIELD_TYPES)[number];

export type FieldTypeMeta = {
	label: string;
	description: string;
	hasOptions: boolean;
	/** Which validation knobs the builder UI exposes for this type. */
	validations: ReadonlyArray<'min' | 'max' | 'maxLength' | 'pattern'>;
};

export const FIELD_TYPE_META: Record<FieldTypeName, FieldTypeMeta> = {
	text: {
		label: 'Short text',
		description: 'Single-line answer (e.g. license plate)',
		hasOptions: false,
		validations: ['maxLength', 'pattern']
	},
	textarea: {
		label: 'Long text',
		description: 'Multi-line answer (e.g. allergy notes)',
		hasOptions: false,
		validations: ['maxLength']
	},
	number: {
		label: 'Number',
		description: 'Numeric answer (e.g. parking spots needed)',
		hasOptions: false,
		validations: ['min', 'max']
	},
	select: {
		label: 'Dropdown',
		description: 'Pick one option',
		hasOptions: true,
		validations: []
	},
	multiselect: {
		label: 'Multi-select',
		description: 'Pick any number of options',
		hasOptions: true,
		validations: []
	},
	checkbox: {
		label: 'Checkbox',
		description: 'Yes/no toggle',
		hasOptions: false,
		validations: []
	},
	date: {
		label: 'Date',
		description: 'Calendar date answer',
		hasOptions: false,
		validations: []
	},
	phone: {
		label: 'Phone',
		description: 'Phone number',
		hasOptions: false,
		validations: []
	},
	email: {
		label: 'Email',
		description: 'Email address',
		hasOptions: false,
		validations: []
	}
};

/** Render a stored field value for read-only display (admin lists, CSV export). */
export function displayFieldValue(value: unknown): string {
	if (value === null || value === undefined || value === '') return '';
	if (Array.isArray(value)) return value.join(', ');
	if (typeof value === 'boolean') return value ? 'Yes' : 'No';
	return String(value);
}

/** Derive a stable machine key from a human label: "License plate(s)" → "license_plate_s". */
export function keyFromLabel(label: string): string {
	return (
		label
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '')
			.slice(0, 64) || 'field'
	);
}
