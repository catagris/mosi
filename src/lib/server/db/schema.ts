import { sql } from 'drizzle-orm';
import {
	pgTable,
	pgEnum,
	uuid,
	text,
	boolean,
	integer,
	timestamp,
	jsonb,
	index,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import type { AllergyEntry } from '$lib/allergens';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const adminRole = pgEnum('admin_role', ['owner', 'admin']);
export const eventStatus = pgEnum('event_status', ['draft', 'published', 'closed', 'archived']);
export const rsvpResponse = pgEnum('rsvp_response', ['yes', 'no', 'maybe']);
export const rsvpStatus = pgEnum('rsvp_status', ['active', 'withdrawn', 'waitlisted']);
export const fieldType = pgEnum('field_type', [
	'text',
	'textarea',
	'number',
	'select',
	'multiselect',
	'checkbox',
	'date',
	'phone',
	'email'
]);
export const webhookFormat = pgEnum('webhook_format', ['ntfy', 'json', 'telegram']);
export const notificationType = pgEnum('notification_type', [
	'rsvp.created',
	'rsvp.updated',
	'rsvp.withdrawn'
]);

// ---------------------------------------------------------------------------
// Shared JSON shapes
// ---------------------------------------------------------------------------

export type EventTheme = {
	primaryColor?: string;
	accent?: string;
	bannerImageUrl?: string;
	font?: string;
};

export type FieldValidation = {
	min?: number;
	max?: number;
	maxLength?: number;
	pattern?: string;
	patternMessage?: string;
};

export type FieldValue = string | number | boolean | string[] | null;
export type FieldValues = Record<string, FieldValue>;

export type NotificationPayload = {
	rsvpId: string;
	eventId: string;
	eventTitle: string;
	eventSlug: string;
	guestName: string;
	response: 'yes' | 'no' | 'maybe';
	partySize: number;
	note?: string | null;
	dishes?: string[];
};

// ---------------------------------------------------------------------------
// Admin / auth
// ---------------------------------------------------------------------------

export const adminUsers = pgTable('admin_users', {
	id: uuid('id').primaryKey().defaultRandom(),
	username: text('username').notNull().unique(),
	email: text('email'),
	passwordHash: text('password_hash').notNull(),
	totpSecret: text('totp_secret'),
	totpEnabled: boolean('totp_enabled').notNull().default(false),
	recoveryCodes: jsonb('recovery_codes').$type<string[]>().notNull().default([]),
	/** Highest TOTP step (counter) already accepted, to reject replays within the drift window. */
	lastTotpStep: integer('last_totp_step'),
	role: adminRole('role').notNull().default('admin'),
	failedLoginCount: integer('failed_login_count').notNull().default(0),
	lockedUntil: timestamp('locked_until', { withTimezone: true }),
	lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const adminSessions = pgTable('admin_sessions', {
	id: text('id').primaryKey(),
	userId: uuid('user_id')
		.notNull()
		.references(() => adminUsers.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	/** Authentication methods satisfied, e.g. ["pwd"] (half-auth) or ["pwd","totp"]. */
	amr: jsonb('amr').$type<string[]>().notNull().default([]),
	ip: text('ip'),
	userAgent: text('user_agent'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const pushSubscriptions = pgTable(
	'push_subscriptions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => adminUsers.id, { onDelete: 'cascade' }),
		endpoint: text('endpoint').notNull().unique(),
		p256dh: text('p256dh').notNull(),
		auth: text('auth').notNull(),
		userAgent: text('user_agent'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		lastUsedAt: timestamp('last_used_at', { withTimezone: true })
	},
	(t) => [index('push_subscriptions_user_id_idx').on(t.userId)]
);

// ---------------------------------------------------------------------------
// Events & configuration
// ---------------------------------------------------------------------------

export const events = pgTable(
	'events',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		slug: text('slug').notNull().unique(),
		publicToken: text('public_token'),
		/** A reusable template (true) vs a real, publishable event (false). */
		isTemplate: boolean('is_template').notNull().default(false),
		title: text('title').notNull(),
		description: text('description').notNull().default(''),
		location: text('location').notNull().default(''),
		/** Optional host-pasted map/directions link (Naver/Kakao/Google place URL). */
		mapUrl: text('map_url').notNull().default(''),
		startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
		endsAt: timestamp('ends_at', { withTimezone: true }),
		timezone: text('timezone').notNull().default('UTC'),
		status: eventStatus('status').notNull().default('draft'),
		rsvpOpensAt: timestamp('rsvp_opens_at', { withTimezone: true }),
		rsvpClosesAt: timestamp('rsvp_closes_at', { withTimezone: true }),
		capacity: integer('capacity'),
		maxPlusOnes: integer('max_plus_ones').notNull().default(0),
		trackKids: boolean('track_kids').notNull().default(false),
		allowMaybe: boolean('allow_maybe').notNull().default(true),
		enableWaitlist: boolean('enable_waitlist').notNull().default(false),
		requireEmail: boolean('require_email').notNull().default(false),
		showDishListPublic: boolean('show_dish_list_public').notNull().default(true),
		showDishContributorNames: boolean('show_dish_contributor_names').notNull().default(false),
		// Guest sign-up ("what to bring") form configuration.
		collectDishes: boolean('collect_dishes').notNull().default(true),
		dishShowCategory: boolean('dish_show_category').notNull().default(true),
		dishShowServes: boolean('dish_show_serves').notNull().default(true),
		dishShowNote: boolean('dish_show_note').notNull().default(true),
		/** What the host calls a contribution, so the list works for food, supplies, or a mix. */
		itemNounSingular: text('item_noun_singular').notNull().default('dish'),
		itemNounPlural: text('item_noun_plural').notNull().default('dishes'),
		/** Collect guests' allergies/dietary needs and surface them to new sign-ups. */
		collectAllergies: boolean('collect_allergies').notNull().default(true),
		theme: jsonb('theme').$type<EventTheme>().notNull().default({}),
		createdBy: uuid('created_by').references(() => adminUsers.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('events_status_idx').on(t.status)]
);

export const fieldDefinitions = pgTable(
	'field_definitions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		eventId: uuid('event_id')
			.notNull()
			.references(() => events.id, { onDelete: 'cascade' }),
		key: text('key').notNull(),
		label: text('label').notNull(),
		helpText: text('help_text'),
		type: fieldType('type').notNull(),
		options: jsonb('options').$type<string[]>(),
		required: boolean('required').notNull().default(false),
		validation: jsonb('validation').$type<FieldValidation>(),
		sortOrder: integer('sort_order').notNull().default(0),
		active: boolean('active').notNull().default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('field_definitions_event_key_idx').on(t.eventId, t.key)]
);

export const dishCategories = pgTable(
	'dish_categories',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		eventId: uuid('event_id')
			.notNull()
			.references(() => events.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		description: text('description'),
		targetCount: integer('target_count'),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('dish_categories_event_id_idx').on(t.eventId)]
);

// ---------------------------------------------------------------------------
// RSVPs & contributions
// ---------------------------------------------------------------------------

export const rsvps = pgTable(
	'rsvps',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		eventId: uuid('event_id')
			.notNull()
			.references(() => events.id, { onDelete: 'cascade' }),
		editToken: text('edit_token').notNull().unique(),
		response: rsvpResponse('response').notNull(),
		guestName: text('guest_name').notNull(),
		/** Encrypted at rest (enc:v1:…) when ENCRYPTION_KEY is set; plaintext otherwise. */
		guestEmail: text('guest_email'),
		/** Keyed HMAC of the normalized email, for equality lookups on ciphertext. */
		guestEmailHash: text('guest_email_hash'),
		plusOnesAdults: integer('plus_ones_adults').notNull().default(0),
		plusOnesKids: integer('plus_ones_kids').notNull().default(0),
		/** Denormalized: 1 + plus_ones_adults + plus_ones_kids. Written only by the RSVP service. */
		partySize: integer('party_size').notNull().default(1),
		fieldValues: jsonb('field_values').$type<FieldValues>().notNull().default({}),
		/** Guest's declared allergies / dietary needs (built-in; see $lib/allergens). */
		allergies: jsonb('allergies').$type<AllergyEntry[]>().notNull().default([]),
		note: text('note'),
		status: rsvpStatus('status').notNull().default('active'),
		ipHash: text('ip_hash'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('rsvps_event_created_idx').on(t.eventId, t.createdAt),
		index('rsvps_guest_email_hash_idx').on(t.guestEmailHash),
		// Plaintext-mode "resend my link" lookup is `lower(guest_email) = …`; the hash
		// index above only helps when encryption is on. This functional index keeps the
		// plaintext path off a full table scan.
		index('rsvps_guest_email_lower_idx').on(sql`lower(${t.guestEmail})`)
	]
);

export const dishContributions = pgTable(
	'dish_contributions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		rsvpId: uuid('rsvp_id')
			.notNull()
			.references(() => rsvps.id, { onDelete: 'cascade' }),
		categoryId: uuid('category_id').references(() => dishCategories.id, { onDelete: 'set null' }),
		itemName: text('item_name').notNull(),
		serves: integer('serves'),
		note: text('note'),
		visible: boolean('visible').notNull().default(true),
		editedByAdmin: boolean('edited_by_admin').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('dish_contributions_rsvp_id_idx').on(t.rsvpId)]
);

// ---------------------------------------------------------------------------
// Notifications & webhooks
// ---------------------------------------------------------------------------

export const notifications = pgTable(
	'notifications',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
		type: notificationType('type').notNull(),
		payload: jsonb('payload').$type<NotificationPayload>().notNull(),
		readAt: timestamp('read_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('notifications_read_created_idx').on(t.readAt, t.createdAt)]
);

export const webhookEndpoints = pgTable('webhook_endpoints', {
	id: uuid('id').primaryKey().defaultRandom(),
	label: text('label').notNull(),
	url: text('url').notNull(),
	format: webhookFormat('format').notNull().default('json'),
	secret: text('secret'),
	eventTypes: jsonb('event_types')
		.$type<string[]>()
		.notNull()
		.default(['rsvp.created', 'rsvp.updated', 'rsvp.withdrawn']),
	eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
	active: boolean('active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// ---------------------------------------------------------------------------
// Instance settings (singleton row, id = 1)
// ---------------------------------------------------------------------------

export const settings = pgTable('settings', {
	id: integer('id').primaryKey().default(1),
	orgName: text('org_name').notNull().default('Mosi'),
	logoUrl: text('logo_url'),
	defaultTimezone: text('default_timezone').notNull().default('UTC'),
	primaryColor: text('primary_color').notNull().default('#7c3aed'),
	emailEnabled: boolean('email_enabled').notNull().default(false),
	pushEnabled: boolean('push_enabled').notNull().default(false),
	bootstrapCompleted: boolean('bootstrap_completed').notNull().default(false),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// ---------------------------------------------------------------------------
// Inferred row types
// ---------------------------------------------------------------------------

export type AdminUser = typeof adminUsers.$inferSelect;
export type NewAdminUser = typeof adminUsers.$inferInsert;
export type AdminSession = typeof adminSessions.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type FieldDefinition = typeof fieldDefinitions.$inferSelect;
export type NewFieldDefinition = typeof fieldDefinitions.$inferInsert;
export type DishCategory = typeof dishCategories.$inferSelect;
export type Rsvp = typeof rsvps.$inferSelect;
export type NewRsvp = typeof rsvps.$inferInsert;
export type DishContribution = typeof dishContributions.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type Settings = typeof settings.$inferSelect;
