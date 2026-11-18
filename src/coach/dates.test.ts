import { describe, expect, it } from 'vitest';
import { addDays, dayIndex, diffDays, isoWeek, mondayOfIsoWeek, todayIn, weekDays, weekStart } from './dates.ts';

describe('dates', () => {
  it('telt dagen op over maand- en jaargrenzen en zomeruur', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // zomeruur in België
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26'); // winteruur
    expect(diffDays('2027-01-02', '2026-12-30')).toBe(3);
  });

  it('maandag is dag 0, zondag dag 6', () => {
    expect(dayIndex('2026-11-16')).toBe(0); // maandag
    expect(dayIndex('2026-11-22')).toBe(6); // zondag
    expect(weekStart('2026-11-22')).toBe('2026-11-16');
    expect(weekDays('2026-11-16')).toHaveLength(7);
  });

  it('berekent ISO-weken correct, ook rond nieuwjaar', () => {
    expect(isoWeek('2026-11-18')).toBe('2026-W47');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
    expect(isoWeek('2026-01-01')).toBe('2026-W01');
    expect(mondayOfIsoWeek('2026-W47')).toBe('2026-11-16');
    expect(mondayOfIsoWeek('2026-W53')).toBe('2026-12-28');
  });

  it('bepaalt vandaag in Brussel', () => {
    // 23:30 UTC op 18/11 = 00:30 op 19/11 in Brussel
    expect(todayIn('Europe/Brussels', new Date('2026-11-18T23:30:00Z'))).toBe('2026-11-19');
  });
});
