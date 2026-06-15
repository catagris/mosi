// Built-in allergy / dietary-need vocabulary, shared by the guest form, the
// server validation, and the public "what to avoid" digest. Pure constants and
// types only (no server deps) so both client and server can import it.

export type AllergySeverity = 'severe' | 'allergy' | 'intolerance' | 'preference' | 'religious';

export type AllergyEntry = {
	/** A KNOWN_ALLERGENS entry, or any free-text value the guest typed via "Other". */
	allergen: string;
	severity: AllergySeverity;
};

/** One row of the aggregated "what to avoid" digest shown to new sign-ups. */
export type AllergyDigest = {
	allergen: string;
	/** Most severe mention across guests. */
	severity: AllergySeverity;
	/** How many guests flagged it. */
	count: number;
};

/** Common food allergens offered in the dropdown. Guests can also pick "Other". */
export const KNOWN_ALLERGENS = [
	'Peanuts',
	'Tree nuts',
	'Milk / Dairy',
	'Eggs',
	'Wheat / Gluten',
	'Soy',
	'Fish',
	'Shellfish',
	'Sesame'
] as const;

/** Sentinel option value that reveals the free-text input in the form. */
export const ALLERGEN_OTHER = 'other';

/** Bounded, fixed-name allergy rows so the form works without JS. */
export const MAX_ALLERGY_ROWS = 10;

type SeverityMeta = {
	value: AllergySeverity;
	/** Long label for the form dropdown. */
	label: string;
	/** Compact label for the public chips. */
	short: string;
	/** Tailwind classes for the chip (light + dark). */
	chip: string;
};

/**
 * Severity scale, most to least medically serious. Array order is the source of
 * truth for "highest wins" de-duplication (index 0 = most severe).
 */
export const ALLERGY_SEVERITIES = [
	{
		value: 'severe',
		label: 'Severe - life-threatening',
		short: 'Severe',
		chip: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300'
	},
	{
		value: 'allergy',
		label: 'Allergy',
		short: 'Allergy',
		chip: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
	},
	{
		value: 'intolerance',
		label: 'Intolerance / sensitivity',
		short: 'Intolerance',
		chip: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300'
	},
	{
		value: 'preference',
		label: 'Dietary preference',
		short: 'Preference',
		chip: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300'
	},
	{
		value: 'religious',
		label: 'Religious',
		short: 'Religious',
		chip: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300'
	}
] as const satisfies ReadonlyArray<SeverityMeta>;

export const ALLERGY_SEVERITY_VALUES: readonly AllergySeverity[] = ALLERGY_SEVERITIES.map(
	(s) => s.value
);

/** Lower rank = more severe; used to keep the worst mention when de-duping. */
export function severityRank(severity: AllergySeverity): number {
	const i = ALLERGY_SEVERITIES.findIndex((s) => s.value === severity);
	return i === -1 ? ALLERGY_SEVERITIES.length : i;
}

export function severityMeta(severity: AllergySeverity): SeverityMeta {
	return ALLERGY_SEVERITIES.find((s) => s.value === severity) ?? ALLERGY_SEVERITIES[1];
}

/**
 * Pure aggregation: per-guest allergy lists → de-duplicated digest. Each guest
 * counts once per allergen (case-insensitive); the most severe mention wins and
 * keeps its wording. Sorted most-severe first, then alphabetically.
 */
export function aggregateAllergies(perGuest: AllergyEntry[][]): AllergyDigest[] {
	const byKey = new Map<string, AllergyDigest>();
	for (const entries of perGuest) {
		const seenThisGuest = new Set<string>();
		for (const entry of entries) {
			const allergen = entry.allergen.trim();
			if (!allergen) continue;
			const key = allergen.toLowerCase();
			if (seenThisGuest.has(key)) continue;
			seenThisGuest.add(key);

			const existing = byKey.get(key);
			if (!existing) {
				byKey.set(key, { allergen, severity: entry.severity, count: 1 });
			} else {
				existing.count += 1;
				if (severityRank(entry.severity) < severityRank(existing.severity)) {
					existing.severity = entry.severity;
					existing.allergen = allergen;
				}
			}
		}
	}
	return [...byKey.values()].sort(
		(a, b) =>
			severityRank(a.severity) - severityRank(b.severity) || a.allergen.localeCompare(b.allergen)
	);
}
