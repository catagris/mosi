/**
 * Apply Drizzle SQL migrations from ./drizzle.
 * Plain JS so it runs in the slim production container with prod deps only.
 * Retries while Postgres finishes booting (compose healthcheck races).
 */
import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const MAX_ATTEMPTS = 15;
const RETRY_DELAY_MS = 2000;

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is required');
	process.exit(1);
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
	const pool = new pg.Pool({ connectionString: url, max: 1 });
	try {
		await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
		console.log('Migrations applied.');
		await pool.end();
		process.exit(0);
	} catch (err) {
		await pool.end().catch(() => {});
		if (attempt === MAX_ATTEMPTS) {
			console.error('Migration failed:', err);
			process.exit(1);
		}
		console.log(`Database not ready (attempt ${attempt}/${MAX_ATTEMPTS}): ${err.message}`);
		await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
	}
}
