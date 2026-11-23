import { describe, expect, it } from 'vitest';
import { defaultDay } from './availability.ts';
import { alternativesFor, getExercise } from './catalog.ts';
import { CHECK_NOTE, strengthChecks } from './check.ts';
import { addDays } from './dates.ts';
import { DEFAULT_HOME } from './loads.ts';
import { milestones, nextMilestone, recordDates } from './milestones.ts';
import { DEFAULT_PREFS, planWeek } from './planner.ts';
import { recoveryAt } from './recovery.ts';
import { buildStrengthSession, warmupFor, type SessionContext } from './session.ts';
import type { ExerciseLog, SessionLog, Template } from './types.ts';

const MON = '2026-11-23';
function log(id: string, load: number, reps: number[], test = false): ExerciseLog {
  const ex = getExercise(id);
  return {
    exerciseId: id, feel: 'good',
    prescription: { exerciseId: id, sets: reps.length, repRange: ex.repRange, targetReps: ex.repRange[0], load, restSec: 90, stage: 0, change: 'same', note: '', ...(test ? { test: true } : {}) },
    sets: reps.map((r) => ({ load, reps: r, done: true })),
  };
}
const strength = (date: string, exercises: ExerciseLog[], template: Template = 'A'): SessionLog => ({ id: `${date}-s`, date, kind: 'strength', template, source: 'app', location: 'gym', exercises });
const cls = (date: string): SessionLog => ({ id: `${date}-c`, date, kind: 'class', title: 'Indoor cycling', source: 'app', exercises: [] });
const ctx = (over: Partial<SessionContext> = {}): SessionContext => ({ date: MON, template: 'U', location: 'gym', minutes: 45, history: [], equipment: DEFAULT_HOME, ...over });

describe('spierpijn in gradaties', () => {
  it('een beetje = herstelt, echt = moe', () => {
    const r = recoveryAt({ date: MON }, [], ['duwen'], ['benen']);
    expect(r.benen).toMatchObject({ state: 'herstelt', cause: 'een beetje stijf' });
    expect(r.duwen).toMatchObject({ state: 'moe', cause: 'spierpijn' });
    expect(r.trekken.state).toBe('fris');
  });

  it('een beetje stijve benen vandaag: benen later in de training, niet minder', () => {
    const p = planWeek({ today: MON, availability: (d) => (d === MON ? { ...defaultDay(d, 45), want: 'strength' } : defaultDay(d, 45)), history: [], prefs: DEFAULT_PREFS, soreLightToday: ['benen'] });
    const f = p.days[0]!.focus!;
    if (p.days[0]!.split !== 'upper') {
      expect(f.later).toContain('benen');
      expect(f.reduce).toEqual([]);
    }
  });
});

describe('mijlpalen', () => {
  it('trainingen, lessen, records en weken op rij, nieuwste eerst', () => {
    const history: SessionLog[] = [];
    // 4 weken met elk 3 trainingen (2 kracht, 1 les); de leg press gaat elke keer omhoog.
    for (let w = 0; w < 4; w++) {
      const mon = addDays(MON, 7 * w);
      history.push(strength(mon, [log('leg-press', 40 + 10 * w, [12, 12])]), cls(addDays(mon, 2)), strength(addDays(mon, 4), [log('chest-press', 20, [10])]));
    }
    const m = milestones(history);
    const ids = m.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['trainingen-1', 'trainingen-5', 'trainingen-10', 'lessen-1', 'records-1', 'reeks-2', 'reeks-4']));
    expect(m.find((x) => x.id === 'trainingen-10')!.date).toBe(addDays(MON, 7 * 3));
    expect(m.find((x) => x.id === 'reeks-4')!.title).toBe('4 weken op rij');
    expect(m[0]!.date >= m.at(-1)!.date).toBe(true);
    expect(recordDates(history)).toHaveLength(3);
    expect(nextMilestone(history)).toEqual({ title: '25 trainingen', left: 'nog 13 trainingen' });
    expect(milestones([])).toEqual([]);
  });
});

describe('krachtcheck', () => {
  it('meet je laatste set en vergelijkt met de vorige check', () => {
    const history = [
      strength('2026-10-12', [log('leg-press', 50, [12, 15], true), log('chest-press', 20, [10, 12], true)]),
      strength('2026-11-23', [log('leg-press', 60, [12, 14], true), log('chest-press', 20, [10, 12], true)]),
    ];
    const [last, first] = strengthChecks(history);
    expect(first!.items[0]).toMatchObject({ exerciseId: 'leg-press', load: 50, reps: 15 });
    expect(first!.change).toBeUndefined();
    expect(last!.items.find((i) => i.exerciseId === 'leg-press')!.change).toBeGreaterThan(0.1);
    expect(last!.items.find((i) => i.exerciseId === 'chest-press')!.change).toBe(0);
    expect(last!.change).toBeGreaterThan(0);
  });

  it('check-week net voor de lichtere week; enkel hoofdoefeningen die je al minstens 2× deed', () => {
    // 4 bouwweken met kracht → week 5 = krachtcheck (deload elke 6e week).
    // (Gewichten stijgen elke week, anders ziet de coach stilstand en plant hij eerst een lichtere week.)
    const history = [0, 1, 2, 3].flatMap((w) => [
      strength(addDays('2026-10-26', 7 * w), [log('leg-press', 40 + 5 * w, [12, 12]), log('chest-press', 20 + 2.5 * w, [10, 10]), log('lat-pulldown', 25 + 2.5 * w, [10, 10])], w % 2 ? 'B' : 'A'),
    ]);
    const p = planWeek({ today: MON, availability: (d) => defaultDay(d, 45), history, prefs: { ...DEFAULT_PREFS, experience: 'returning' } });
    const checks = p.days.filter((d) => d.check);
    expect(checks.length).toBeGreaterThan(0);
    expect(checks[0]!.why).toMatch(/^💪 Krachtcheck/);
    expect(p.messages.join(' ')).toMatch(/Krachtcheck deze week/);
    const s = buildStrengthSession({ ...ctx({ template: 'A', history }), check: true });
    const tested = s.exercises.filter((e) => e.prescription.test).map((e) => e.exercise.id);
    expect(tested).toEqual(expect.arrayContaining(['leg-press', 'lat-pulldown']));
    expect(tested).not.toContain('db-bench'); // nog nooit gedaan: eerst leren
    expect(s.exercises.find((e) => e.exercise.id === 'leg-press')!.prescription.note).toBe(CHECK_NOTE);
    expect(s.exercises.filter((e) => e.role !== 'main').every((e) => !e.prescription.test)).toBe(true);
    // Nog geen 2 keer gedaan: geen test.
    expect(buildStrengthSession({ ...ctx({ template: 'A' }), check: true }).exercises.some((e) => e.prescription.test)).toBe(false);
  });
});

describe('tennis-extra', () => {
  it('bovenlichaam: face pull + externe rotatie; benen: woodchop', () => {
    const u = buildStrengthSession({ ...ctx({ template: 'U' }), tennisExtra: true });
    expect(u.exercises.filter((e) => e.tennis).map((e) => e.exercise.id)).toEqual(['face-pull', 'cable-external-rotation']);
    expect(u.exercises.find((e) => e.exercise.id === 'face-pull')!.prescription.note).toMatch(/^🎾 Tennis-extra/);
    const l = buildStrengthSession({ ...ctx({ template: 'L' }), tennisExtra: true });
    expect(l.exercises.filter((e) => e.tennis).map((e) => e.exercise.id)).toEqual(['cable-woodchop']);
    expect(buildStrengthSession(ctx()).exercises.some((e) => e.tennis)).toBe(false);
    expect(u.estimatedMinutes).toBeLessThanOrEqual(47);
  });

  it('±1× per week, liefst in een bovenlichaamtraining; niet als je geen tennisdagen hebt', () => {
    const p = planWeek({ today: MON, availability: (d) => defaultDay(d, 45), history: [], prefs: { ...DEFAULT_PREFS, experience: 'returning' } });
    const extra = p.days.filter((d) => d.tennisExtra);
    expect(extra).toHaveLength(1);
    expect(extra[0]!.why).toMatch(/tennis-extra/);
    const none = planWeek({ today: MON, availability: (d) => defaultDay(d, 45), history: [], prefs: { ...DEFAULT_PREFS, tennisDays: [] } });
    expect(none.days.some((d) => d.tennisExtra)).toBe(false);
  });

  it('nooit als vervanger bij "Toestel bezet"', () => {
    expect(alternativesFor('seated-cable-row', 'gym').map((e) => e.id)).not.toContain('face-pull');
    expect(alternativesFor('face-pull', 'gym').length).toBeGreaterThan(0);
  });
});

describe('opwarming', () => {
  it('±4–5 min, afgestemd op de training', () => {
    for (const t of ['A', 'B', 'U', 'L'] as const) {
      const total = warmupFor(t).reduce((n, x) => n + x.seconds, 0);
      expect(total, t).toBeGreaterThanOrEqual(240);
      expect(total, t).toBeLessThanOrEqual(300);
    }
    expect(warmupFor('U')[0]!.title).toMatch(/Roeier/);
    expect(warmupFor('L')[0]!.title).toMatch(/Fiets/);
  });
});
