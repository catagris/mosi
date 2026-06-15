import { describe, it, expect } from 'vitest';
import { aggregateAllergies, type AllergyEntry } from '$lib/allergens';

describe('aggregateAllergies', () => {
	it('returns an empty digest for no guests', () => {
		expect(aggregateAllergies([])).toEqual([]);
	});

	it('counts one guest, one allergen', () => {
		expect(aggregateAllergies([[{ allergen: 'Peanuts', severity: 'allergy' }]])).toEqual([
			{ allergen: 'Peanuts', severity: 'allergy', count: 1 }
		]);
	});

	it('de-duplicates across guests and counts them', () => {
		const digest = aggregateAllergies([
			[{ allergen: 'Peanuts', severity: 'allergy' }],
			[{ allergen: 'Peanuts', severity: 'allergy' }]
		]);
		expect(digest).toEqual([{ allergen: 'Peanuts', severity: 'allergy', count: 2 }]);
	});

	it('keeps the most severe mention (and its wording) when severities differ', () => {
		const digest = aggregateAllergies([
			[{ allergen: 'peanuts', severity: 'intolerance' }],
			[{ allergen: 'Peanuts', severity: 'severe' }]
		]);
		expect(digest).toEqual([{ allergen: 'Peanuts', severity: 'severe', count: 2 }]);
	});

	it('counts each guest once even if they list the same allergen twice', () => {
		const digest = aggregateAllergies([
			[
				{ allergen: 'Dairy', severity: 'allergy' },
				{ allergen: 'dairy', severity: 'intolerance' }
			]
		]);
		expect(digest).toEqual([{ allergen: 'Dairy', severity: 'allergy', count: 1 }]);
	});

	it('sorts by severity, then alphabetically', () => {
		const perGuest: AllergyEntry[][] = [
			[{ allergen: 'Soy', severity: 'preference' }],
			[{ allergen: 'Shellfish', severity: 'severe' }],
			[{ allergen: 'Eggs', severity: 'allergy' }],
			[{ allergen: 'Almonds', severity: 'severe' }]
		];
		expect(aggregateAllergies(perGuest).map((d) => d.allergen)).toEqual([
			'Almonds', // severe, A before S
			'Shellfish', // severe
			'Eggs', // allergy
			'Soy' // preference
		]);
	});

	it('trims whitespace and skips blank allergens', () => {
		const digest = aggregateAllergies([
			[
				{ allergen: '  Fish  ', severity: 'allergy' },
				{ allergen: '   ', severity: 'severe' }
			]
		]);
		expect(digest).toEqual([{ allergen: 'Fish', severity: 'allergy', count: 1 }]);
	});
});
