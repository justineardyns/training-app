import { describe, expect, it } from 'vitest';
import { niceTicks } from './charts.tsx';

describe('as-ticks', () => {
  it('omvatten altijd het minimum en het maximum', () => {
    for (const [lo, hi] of [[8.3, 23.2], [0, 1], [55, 61], [120, 133], [1.5, 7.5]] as const) {
      const t = niceTicks(lo, hi);
      expect(t[0]!).toBeLessThanOrEqual(lo);
      expect(t.at(-1)!).toBeGreaterThanOrEqual(hi);
      expect(t.length).toBeLessThanOrEqual(6);
    }
  });
});
