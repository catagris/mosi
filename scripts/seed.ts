/**
 * Dev/demo seeder - `pnpm db:seed` (runs via tsx).
 *
 * Standalone on purpose: no imports from src/ ($lib aliases are not available
 * under tsx). Talks straight SQL to Postgres using the same snake_case
 * columns as drizzle/0000_*.sql.
 *
 * Behavior:
 *   1. Ensures the singleton settings row exists.
 *   2. If `events` is empty, inserts a published demo event with dish
 *      categories, custom fields, and two sample RSVPs.
 *   3. If SEED_ADMIN_USERNAME + SEED_ADMIN_PASSWORD are set and `admin_users`
 *      is empty, creates an owner account (TOTP enrollment happens at first
 *      login).
 */
import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { hash, Algorithm } from '@node-rs/argon2';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('DATABASE_URL is required. Set it in .env or the environment.');
	process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

/** 32-char base64url token, same entropy class as the app's edit tokens. */
function newEditToken(): string {
	return randomBytes(24).toString('base64url');
}

async function ensureSettings(): Promise<void> {
	await pool.query(
		`INSERT INTO settings (id, org_name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
		[1, 'Mosi Demo']
	);
	console.log('Settings row ensured (org_name "Mosi Demo").');
}

async function seedDemoEvent(): Promise<void> {
	const { rowCount } = await pool.query('SELECT 1 FROM events LIMIT 1');
	if ((rowCount ?? 0) > 0) {
		console.log('Events table is not empty - skipping demo event.');
		return;
	}

	const startsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
	startsAt.setUTCHours(18, 0, 0, 0);

	const eventId = randomUUID();
	const description = [
		'Join us for the annual **summer potluck** by the river!',
		'',
		'Bring a dish to share - drinks, ice, and tableware are covered.',
		'Kids and lawn games welcome.'
	].join('\n');

	const client = await pool.connect();
	try {
		await client.query('BEGIN');

		await client.query(
			`INSERT INTO events
				(id, slug, title, description, location, starts_at, timezone, status,
				 capacity, max_plus_ones, track_kids, allow_maybe, show_dish_list_public)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
			[
				eventId,
				'summer-potluck-2026',
				'Summer Potluck 2026',
				description,
				'Riverside Park, Pavilion B',
				startsAt,
				'America/Los_Angeles',
				'published',
				60,
				4,
				true,
				true,
				true
			]
		);

		const categories = [
			{ id: randomUUID(), name: 'Mains', target: 6, sort: 0 },
			{ id: randomUUID(), name: 'Sides & Salads', target: 8, sort: 1 },
			{ id: randomUUID(), name: 'Desserts', target: 5, sort: 2 }
		];
		for (const category of categories) {
			await client.query(
				`INSERT INTO dish_categories (id, event_id, name, target_count, sort_order)
				 VALUES ($1, $2, $3, $4, $5)`,
				[category.id, eventId, category.name, category.target, category.sort]
			);
		}

		const fields = [
			{
				key: 'license_plates',
				label: 'License plate(s) for parking',
				helpText: 'One per line',
				type: 'textarea',
				required: false,
				validation: null as string | null,
				sort: 0
			},
			{
				key: 'parking_spots',
				label: 'Parking spots needed',
				helpText: null,
				type: 'number',
				required: true,
				validation: JSON.stringify({ min: 0, max: 4 }),
				sort: 1
			}
			// Allergies are now a built-in feature (events.collect_allergies) - no
			// longer a custom field. See the per-guest `allergies` column below.
		];
		for (const field of fields) {
			await client.query(
				`INSERT INTO field_definitions
					(id, event_id, key, label, help_text, type, required, validation, sort_order)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
				[
					randomUUID(),
					eventId,
					field.key,
					field.label,
					field.helpText,
					field.type,
					field.required,
					field.validation,
					field.sort
				]
			);
		}

		const guests = [
			{
				id: randomUUID(),
				name: 'Sam Rivera',
				email: 'sam.rivera@example.com',
				plusOnesAdults: 1,
				plusOnesKids: 1,
				partySize: 3,
				fieldValues: JSON.stringify({
					license_plates: '8KJD421',
					parking_spots: 1
				}),
				allergies: JSON.stringify([{ allergen: 'Shellfish', severity: 'severe' }]),
				note: 'Can bring a folding table too if useful!',
				editToken: newEditToken(),
				dish: { categoryId: categories[0].id, itemName: 'Pulled pork sliders', serves: 10 }
			},
			{
				id: randomUUID(),
				name: 'Priya Shah',
				email: null,
				plusOnesAdults: 1,
				plusOnesKids: 0,
				partySize: 2,
				fieldValues: JSON.stringify({
					license_plates: '6TRX909\n7LMN240',
					parking_spots: 2
				}),
				allergies: JSON.stringify([
					{ allergen: 'Peanuts', severity: 'allergy' },
					{ allergen: 'no pork (halal)', severity: 'religious' }
				]),
				note: null,
				editToken: newEditToken(),
				dish: { categoryId: categories[2].id, itemName: 'Mango sticky rice', serves: 8 }
			}
		];
		for (const guest of guests) {
			// Dev-only: guest_email_hash is intentionally omitted (column is nullable).
			// Seeded guests therefore won't resolve via the encrypted "resend my link"
			// lookup when ENCRYPTION_KEY is set — fine for local demo data.
			await client.query(
				`INSERT INTO rsvps
					(id, event_id, edit_token, response, guest_name, guest_email,
					 plus_ones_adults, plus_ones_kids, party_size, field_values, note, status, allergies)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13::jsonb)`,
				[
					guest.id,
					eventId,
					guest.editToken,
					'yes',
					guest.name,
					guest.email,
					guest.plusOnesAdults,
					guest.plusOnesKids,
					guest.partySize,
					guest.fieldValues,
					guest.note,
					'active',
					guest.allergies
				]
			);
			await client.query(
				`INSERT INTO dish_contributions (id, rsvp_id, category_id, item_name, serves)
				 VALUES ($1, $2, $3, $4, $5)`,
				[randomUUID(), guest.id, guest.dish.categoryId, guest.dish.itemName, guest.dish.serves]
			);
		}

		await client.query('COMMIT');

		console.log('Demo event created: "Summer Potluck 2026" (/e/summer-potluck-2026)');
		console.log(`  - ${categories.length} dish categories: ${categories.map((c) => c.name).join(', ')}`);
		console.log(`  - ${fields.length} custom fields: ${fields.map((f) => f.key).join(', ')}`);
		for (const guest of guests) {
			console.log(
				`  - RSVP "${guest.name}" (party of ${guest.partySize}) - edit token: ${guest.editToken}`
			);
		}
	} catch (err) {
		await client.query('ROLLBACK').catch(() => {});
		throw err;
	} finally {
		client.release();
	}
}

async function seedAdmin(): Promise<void> {
	const username = process.env.SEED_ADMIN_USERNAME;
	const password = process.env.SEED_ADMIN_PASSWORD;
	if (!username || !password) {
		console.log('SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD not set - skipping admin seed.');
		return;
	}

	const { rowCount } = await pool.query('SELECT 1 FROM admin_users LIMIT 1');
	if ((rowCount ?? 0) > 0) {
		console.log('admin_users is not empty - skipping admin seed.');
		return;
	}

	const passwordHash = await hash(password, {
		algorithm: Algorithm.Argon2id,
		memoryCost: 19456,
		timeCost: 2,
		parallelism: 1
	});
	await pool.query(
		`INSERT INTO admin_users (id, username, password_hash, totp_enabled, recovery_codes, role)
		 VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
		[randomUUID(), username, passwordHash, false, JSON.stringify([]), 'owner']
	);
	console.log('Admin created - TOTP enrollment happens at first login');
}

async function main(): Promise<void> {
	await ensureSettings();
	await seedDemoEvent();
	await seedAdmin();
}

try {
	await main();
} catch (err) {
	console.error('Seed failed:', err);
	process.exitCode = 1;
} finally {
	await pool.end();
}
