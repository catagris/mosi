import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { settings, type Settings } from '$lib/server/db/schema';
import { env } from '$lib/server/env';

/** Fetch the singleton settings row, creating it on first access. */
export async function getSettings(): Promise<Settings> {
	const db = getDb();
	const [existing] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
	if (existing) return syncDerivedFlags(existing);
	const [created] = await db
		.insert(settings)
		.values({ id: 1, emailEnabled: env.emailEnabled, pushEnabled: env.pushEnabled })
		.onConflictDoNothing()
		.returning();
	if (created) return created;
	const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
	return syncDerivedFlags(row);
}

/** email/push availability is derived from env; keep the row honest. */
async function syncDerivedFlags(row: Settings): Promise<Settings> {
	if (row.emailEnabled !== env.emailEnabled || row.pushEnabled !== env.pushEnabled) {
		const [updated] = await getDb()
			.update(settings)
			.set({ emailEnabled: env.emailEnabled, pushEnabled: env.pushEnabled, updatedAt: new Date() })
			.where(eq(settings.id, 1))
			.returning();
		return updated;
	}
	return row;
}

export async function updateSettings(
	patch: Partial<Pick<Settings, 'orgName' | 'logoUrl' | 'defaultTimezone' | 'primaryColor'>>
): Promise<Settings> {
	await getSettings(); // ensure row exists
	const [updated] = await getDb()
		.update(settings)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(settings.id, 1))
		.returning();
	return updated;
}

export async function markBootstrapCompleted(): Promise<void> {
	await getSettings();
	await getDb()
		.update(settings)
		.set({ bootstrapCompleted: true, updatedAt: new Date() })
		.where(eq(settings.id, 1));
}

export async function isBootstrapCompleted(): Promise<boolean> {
	const row = await getSettings();
	return row.bootstrapCompleted;
}
