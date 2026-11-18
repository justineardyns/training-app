import type { ISODate } from './types.ts';

// Datumrekenen op kalenderdagen (UTC-middag), zodat zomer-/winteruur nooit een dag verschuift.

const DAY = 86_400_000;

function toUtc(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, day, 12);
}

function fromUtc(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUtc(toUtc(d) + n * DAY);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUtc(a) - toUtc(b)) / DAY);
}

/** 0 = maandag … 6 = zondag. */
export function dayIndex(d: ISODate): number {
  return (new Date(toUtc(d)).getUTCDay() + 6) % 7;
}

export function weekStart(d: ISODate): ISODate {
  return addDays(d, -dayIndex(d));
}

export function weekDays(monday: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** ISO-weeknummer, bv. '2026-W47'. */
export function isoWeek(d: ISODate): string {
  const thursday = addDays(d, 3 - dayIndex(d));
  const year = Number(thursday.slice(0, 4));
  const jan4 = `${year}-01-04`;
  const week = 1 + Math.round(diffDays(weekStart(thursday), weekStart(jan4)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Maandag van een ISO-week ('2026-W47'). */
export function mondayOfIsoWeek(week: string): ISODate {
  const [y, w] = week.split('-W').map(Number) as [number, number];
  return addDays(weekStart(`${y}-01-04`), (w - 1) * 7);
}

/** Vandaag in een gegeven tijdzone (standaard Brussel). */
export function todayIn(timeZone = 'Europe/Brussels', now = new Date()): ISODate {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export const DAY_NAMES = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'] as const;
export const DAY_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'] as const;

export function dayName(d: ISODate): string {
  return DAY_NAMES[dayIndex(d)]!;
}
