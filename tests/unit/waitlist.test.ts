import { describe, it, expect } from 'vitest';
import { selectPromotions } from '$lib/server/services/rsvps';

const entry = (id: string, partySize: number) => ({ id, partySize });

describe('selectPromotions (waitlist FIFO-with-skip)', () => {
	it('promotes nothing when no capacity is available', () => {
		expect(selectPromotions(0, [entry('a', 1)])).toEqual([]);
		expect(selectPromotions(-3, [entry('a', 1)])).toEqual([]);
	});

	it('promotes oldest-first while parties fit', () => {
		const picked = selectPromotions(5, [entry('a', 2), entry('b', 2), entry('c', 2)]);
		expect(picked.map((p) => p.id)).toEqual(['a', 'b']); // 2 + 2 = 4 ≤ 5, third would be 6
	});

	it('skips a party that does not fit so a smaller later one can be promoted', () => {
		const picked = selectPromotions(3, [entry('big', 5), entry('small', 2), entry('tiny', 1)]);
		expect(picked.map((p) => p.id)).toEqual(['small', 'tiny']); // big (5) skipped; 2 + 1 = 3
	});

	it('stops once capacity is exhausted', () => {
		const picked = selectPromotions(4, [entry('a', 4), entry('b', 1)]);
		expect(picked.map((p) => p.id)).toEqual(['a']);
	});

	it('promotes everyone when capacity is ample', () => {
		const picked = selectPromotions(100, [entry('a', 3), entry('b', 1), entry('c', 2)]);
		expect(picked.map((p) => p.id)).toEqual(['a', 'b', 'c']);
	});
});
