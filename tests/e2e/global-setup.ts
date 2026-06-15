import { spawnSync } from 'node:child_process';
import pg from 'pg';

/** Reset the test database to a blank, fully-migrated state. */
export default async function globalSetup(): Promise<void> {
	const databaseUrl = process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5433/mosi';

	const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
	try {
		await pool.query('DROP SCHEMA public CASCADE');
		await pool.query('CREATE SCHEMA public');
		// Drizzle tracks applied migrations in its own schema - drop it too,
		// otherwise the migrator believes the (now empty) DB is up to date.
		await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
	} finally {
		await pool.end();
	}

	const result = spawnSync('node', ['scripts/migrate.mjs'], {
		stdio: 'inherit',
		env: { ...process.env, DATABASE_URL: databaseUrl }
	});
	if (result.status !== 0) {
		throw new Error(`Migrations failed during E2E global setup (exit ${result.status})`);
	}
}
