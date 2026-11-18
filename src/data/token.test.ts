import { describe, expect, it } from 'vitest';
import { daysLeft, parseExpiry } from './token.ts';

describe('token-vervaldatum', () => {
  it('leest het formaat van GitHub', () => {
    expect(parseExpiry('2027-11-01 10:00:00 UTC')?.toISOString()).toBe('2027-11-01T10:00:00.000Z');
    expect(parseExpiry(undefined)).toBeUndefined();
    expect(parseExpiry('onzin')).toBeUndefined();
  });
  it('telt de dagen die overblijven', () => {
    expect(daysLeft('2026-12-01 10:00:00 UTC', new Date('2026-11-23T10:00:00Z'))).toBe(8);
    expect(daysLeft(undefined)).toBeUndefined();
  });
});
