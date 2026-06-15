import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { env } from '$lib/server/env';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

let pool: pg.Pool | undefined;
let database: Database | undefined;

/** Lazily-initialized shared connection pool + Drizzle client. */
export function getDb(): Database {
	if (!database) {
		pool = new pg.Pool({ connectionString: env.databaseUrl, max: 10 });
		database = drizzle(pool, { schema });
	}
	return database;
}

/** Liveness probe used by /healthz. */
export async function pingDb(): Promise<boolean> {
	try {
		await getDb().execute('select 1');
		return true;
	} catch {
		return false;
	}
}

export { schema };
