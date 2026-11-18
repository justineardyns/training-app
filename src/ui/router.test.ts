import { describe, expect, it } from 'vitest';
import { parseHash } from './router.ts';

describe('parseHash', () => {
  it('valt terug op vandaag', () => {
    expect(parseHash('')).toEqual({ route: 'vandaag', params: [] });
    expect(parseHash('#/')).toEqual({ route: 'vandaag', params: [] });
  });
  it('leest route en parameters', () => {
    expect(parseHash('#/training/abc%20d/2')).toEqual({ route: 'training', params: ['abc d', '2'] });
  });
});
