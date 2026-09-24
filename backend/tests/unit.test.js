import { describe, expect, it } from 'vitest';
import { buildTrendBuckets } from '../src/utils/dates.js';
import { calculatePurchasePoints, getLoyaltyTier } from '../src/utils/loyalty.js';
import { normalizeIndianMobile } from '../src/utils/mobile.js';

describe('normalizeIndianMobile', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['+919876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['098765-43210', '+919876543210'],
    [9876543210, '+919876543210'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeIndianMobile(input)).toBe(expected);
  });

  it.each(['12345', '5876543210', '98765432101', '+1 9876543210', 'abcdefghij', '', null, undefined, '98765 4321O'])(
    'rejects %s',
    (input) => {
      expect(normalizeIndianMobile(input)).toBeNull();
    }
  );
});

describe('calculatePurchasePoints', () => {
  it.each([
    [124999, 1, 1249],
    [124999, 1.5, 1874],
    [100, 1, 1],
    [99.99, 1, 0],
    [0, 1, 0],
    [-500, 1, 0],
    [1000, 0, 0],
    [30000.3, 0.1, 30], // no floating point drift
  ])('₹%s at %s pt/₹100 → %s points', (amount, rate, expected) => {
    expect(calculatePurchasePoints(amount, rate)).toBe(expected);
  });
});

describe('getLoyaltyTier', () => {
  it.each([
    [0, 'bronze'],
    [999, 'bronze'],
    [1000, 'silver'],
    [2500, 'gold'],
    [3699, 'gold'],
    [10000, 'platinum'],
  ])('%s points → %s', (points, key) => {
    expect(getLoyaltyTier(points).key).toBe(key);
  });
});

describe('buildTrendBuckets', () => {
  const now = new Date('2026-09-24T10:00:00+05:30');

  it('builds 6 IST calendar months ending with the current one', () => {
    const buckets = buildTrendBuckets('6m', now);
    expect(buckets.map((b) => b.label)).toEqual(['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']);
    expect(buckets[5].start.toISOString()).toBe('2026-08-31T18:30:00.000Z'); // 1 Sep 00:00 IST
  });

  it('builds 4 quarters and 4 weeks', () => {
    expect(buildTrendBuckets('1y', now).map((b) => b.label)).toEqual(["Q4 '25", "Q1 '26", "Q2 '26", "Q3 '26"]);
    const weeks = buildTrendBuckets('30d', now);
    expect(weeks).toHaveLength(4);
    expect(weeks[3].end.getTime() - weeks[0].start.getTime()).toBe(28 * 86400000);
  });
});
