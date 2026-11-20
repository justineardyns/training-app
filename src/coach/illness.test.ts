import { describe, expect, it } from 'vitest';
import { defaultDay } from './availability.ts';
import { illnessState, type Illness } from './illness.ts';
import { DEFAULT_PREFS, planTwoWeeks, planWeek } from './planner.ts';
import type { SessionLog } from './types.ts';

const MON = '2026-11-23';
const ill = (over: Partial<Illness> = {}): Illness => ({ id: 'x', startedOn: MON, updates: [], ...over });
const done = (date: string): SessionLog => ({ id: date, date, kind: 'strength', template: 'A', source: 'app', exercises: [], location: 'gym' });
const plan = (illness = illnessState([], MON), extra: Partial<Parameters<typeof planWeek>[0]> = {}) =>
  planWeek({ today: MON, availability: (d) => defaultDay(d, 45), history: [], prefs: { ...DEFAULT_PREFS, experience: 'returning' }, illness, ...extra });

describe('ziek zijn: ziek is ziek', () => {
  it('ziek is ziek: rust, geen enkele training (ook geen tennis), ook de week erna voorlopig', () => {
    const st = illnessState([ill()], MON);
    expect(st.status).toBe('rest');
    const p = plan(st, { availability: (d) => (d === '2026-11-26' ? { ...defaultDay(d, 45), tennis: 60 } : defaultDay(d, 45)) });
    expect(p.days.every((d) => !d.sweat)).toBe(true);
    expect(p.days.every((d) => d.light?.id === 'rust')).toBe(true);
    expect(p.days[0]!.title).toBe('Rust en herstel');
    expect(p.messages.join(' ')).toMatch(/Ziek: rust\. Geen training tot je beter bent/);
    const two = planTwoWeeks({ today: MON, availability: (d) => defaultDay(d, 45), history: [], prefs: DEFAULT_PREFS, illness: st });
    expect(two.second.days.every((d) => !d.sweat)).toBe(true);
    // Oude meldingen (met een soort ziekte) zijn ook gewoon rust.
    expect(illnessState([ill({ kind: 'verkouden' })], MON).status).toBe('rest');
  });

  it('erger of lang ziek → huisarts', () => {
    expect(illnessState([ill({ startedOn: '2026-11-14' })], MON)).toMatchObject({ refer: true, referMessage: expect.stringMatching(/huisarts \(al meer dan 7 dagen ziek\)/) });
    expect(illnessState([ill({ updates: [{ date: MON, trend: 'erger' }] })], MON).referMessage).toMatch(/het wordt erger/);
    expect(illnessState([ill()], MON).refer).toBe(false);
  });

  it('genezen: de eerste 2 trainingen lichter, daarna gewoon', () => {
    const healed = ill({ startedOn: '2026-11-18', resolvedOn: '2026-11-22' });
    const st = illnessState([healed], MON);
    expect(st.status).toBe('return');
    const p = plan(st);
    const trainings = p.days.filter((d) => d.status === 'planned' && d.sweat);
    expect(trainings.slice(0, 2).every((d) => d.lighter)).toBe(true);
    expect(trainings.slice(2).every((d) => !d.lighter)).toBe(true);
    expect(trainings.slice(0, 2).every((d) => d.gentle)).toBe(true);
    // Zonder extra uitleg: geen boodschap en geen "terug na ziekte" in het waarom.
    expect(p.messages.join(' ')).not.toMatch(/ziekte/i);
    expect(trainings.map((d) => d.why).join(' ')).not.toMatch(/ziekte/i);
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
