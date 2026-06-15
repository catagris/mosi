/**
 * One-time backfill: encrypt any plaintext email addresses already in the
 * database and populate the keyed lookup hash. Idempotent - rows already
 * stored as `enc:v1:…` are skipped. Run once after setting ENCRYPTION_KEY on an
 * instance that already has data:
 *
 *   ENCRYPTION_KEY=... pnpm db:encrypt-emails
 *
 * The crypto here MUST match src/lib/server/crypto/pii.ts exactly (prefix,
 * HKDF info strings, AES-256-GCM, 12-byte IV, 16-byte tag, HMAC of the
 * normalized email).
 */
import 'dotenv/config';
import pg from 'pg';
import { createHash, createHmac, createCipheriv, hkdfSync, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';

const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.ENCRYPTION_KEY;
if (!databaseUrl) {
	console.error('DATABASE_URL is required');
	process.exit(1);
}
if (!secret) {
	console.error('ENCRYPTION_KEY is required to encrypt existing emails');
	process.exit(1);
}

const master = createHash('sha256').update(secret).digest();
const encKey = Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'pp-email-enc-v1', 32));
const macKey = Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'pp-email-mac-v1', 32));

function encryptEmail(email) {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', encKey, iv);
	const ciphertext = Buffer.concat([cipher.update(email, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function emailHash(email) {
	return createHmac('sha256', macKey).update(email.trim().toLowerCase()).digest('hex');
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

async function backfillRsvps() {
	const { rows } = await pool.query(
		`SELECT id, guest_email FROM rsvps WHERE guest_email IS NOT NULL AND guest_email NOT LIKE '${PREFIX}%'`
	);
	for (const row of rows) {
		await pool.query('UPDATE rsvps SET guest_email = $1, guest_email_hash = $2 WHERE id = $3', [
			encryptEmail(row.guest_email),
			emailHash(row.guest_email),
			row.id
		]);
	}
	return rows.length;
}

async function backfillAdmins() {
	const { rows } = await pool.query(
		`SELECT id, email FROM admin_users WHERE email IS NOT NULL AND email NOT LIKE '${PREFIX}%'`
	);
	for (const row of rows) {
		await pool.query('UPDATE admin_users SET email = $1 WHERE id = $2', [
			encryptEmail(row.email),
			row.id
		]);
	}
	return rows.length;
}

try {
	const rsvps = await backfillRsvps();
	const admins = await backfillAdmins();
	console.log(`Encrypted ${rsvps} RSVP email(s) and ${admins} admin email(s).`);
} catch (err) {
	console.error('Backfill failed:', err);
	process.exitCode = 1;
} finally {
	await pool.end();
}
