import { describe, expect, it } from 'vitest';
import { defaultDay } from './availability.ts';
import { illnessState, type Illness } from './illness.ts';
import { DEFAULT_PREFS, planTwoWeeks, planWeek } from './planner.ts';
import type { SessionLog } from './types.ts';

const MON = '2026-11-23';
const ill = (over: Partial<Illness> = {}): Illness => ({ id: 'x', kind: 'verkouden', startedOn: MON, updates: [], ...over });
const done = (date: string): SessionLog => ({ id: date, date, kind: 'strength', template: 'A', source: 'app', exercises: [], location: 'gym' });
const plan = (illness = illnessState([], MON), extra: Partial<Parameters<typeof planWeek>[0]> = {}) =>
  planWeek({ today: MON, availability: (d) => defaultDay(d, 45), history: [], prefs: { ...DEFAULT_PREFS, experience: 'returning' }, illness, ...extra });

describe('ziek zijn (nekregel)', () => {
  it('verkouden = enkel boven de nek: lichter trainen mag', () => {
    const st = illnessState([ill()], MON);
    expect(st.status).toBe('light');
    const p = plan(st);
    const trainings = p.days.filter((d) => d.sweat);
    expect(trainings.length).toBeGreaterThan(0);
    expect(trainings.every((d) => d.lighter)).toBe(true);
    expect(p.days.some((d) => d.groupClass)).toBe(false); // geen les met intervallen
    expect(trainings.find((d) => d.type === 'cardio')!.title).toMatch(/Rustige cardio \(zone 2\)/);
    expect(p.messages[0]).toMatch(/^Verkouden \(enkel boven de nek\)/);
    expect(p.violations).toEqual([]);
  });

  it('griep, koorts of maag-darm: rust, geen enkele training (ook geen tennis)', () => {
    for (const kind of ['griep', 'koorts', 'maag'] as const) {
      const st = illnessState([ill({ kind })], MON);
      expect(st.status).toBe('rest');
      const p = plan(st, { availability: (d) => (d === '2026-11-26' ? { ...defaultDay(d, 45), tennis: 60 } : defaultDay(d, 45)) });
      expect(p.days.every((d) => !d.sweat)).toBe(true);
      expect(p.days.every((d) => d.light?.id === 'rust')).toBe(true);
      expect(p.days[0]!.title).toBe('Rust en herstel');
      expect(p.messages.join(' ')).toMatch(/rust\. Geen training tot je beter bent/);
      // Ook de week erna blijft voorlopig rust tot je "Genezen" tikt.
      const two = planTwoWeeks({ today: MON, availability: (d) => defaultDay(d, 45), history: [], prefs: DEFAULT_PREFS, illness: st });
      expect(two.second.days.every((d) => !d.sweat)).toBe(true);
    }
  });

  it('erger, lang ziek of 3 dagen koorts → huisarts', () => {
    expect(illnessState([ill({ kind: 'koorts', startedOn: '2026-11-20' })], MON)).toMatchObject({ refer: true, referMessage: expect.stringMatching(/huisarts \(al 3 dagen koorts\)/) });
    expect(illnessState([ill({ startedOn: '2026-11-14' })], MON).refer).toBe(true);
    expect(illnessState([ill({ updates: [{ date: MON, trend: 'erger' }] })], MON).referMessage).toMatch(/het wordt erger/);
    expect(illnessState([ill()], MON).refer).toBe(false);
  });

  it('van verkouden naar koorts: meteen rust', () => {
    expect(illnessState([ill({ updates: [{ date: MON, trend: 'erger', kind: 'koorts' }] })], MON).status).toBe('rest');
  });

  it('genezen: de eerste 2 trainingen lichter, daarna gewoon', () => {
    const healed = ill({ kind: 'griep', startedOn: '2026-11-18', resolvedOn: '2026-11-22' });
    const st = illnessState([healed], MON);
    expect(st.status).toBe('return');
    const p = plan(st);
    const trainings = p.days.filter((d) => d.status === 'planned' && d.sweat);
    expect(trainings.slice(0, 2).every((d) => d.lighter)).toBe(true);
    expect(trainings.slice(2).every((d) => !d.lighter)).toBe(true);
    expect(trainings[0]!.why).toMatch(/^Terug na ziekte/);
    // Na 2 trainingen of na een week: gewoon.
    expect(illnessState([healed], MON, [done('2026-11-22'), done('2026-11-22')]).status).toBe('none');
    expect(illnessState([healed], '2026-12-01').status).toBe('none');
  });

  it('niet ziek → niets verandert', () => {
    const p = plan();
    expect(p.days.some((d) => d.lighter)).toBe(false);
    expect(illnessState([], MON).status).toBe('none');
  });
});
