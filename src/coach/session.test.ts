import { describe, expect, it } from 'vitest';
import { getExercise } from './catalog.ts';
import { DEFAULT_HOME, loadOptions } from './loads.ts';
import { buildCardioSession, buildStrengthSession, estimateSeconds, ladderOf, type SessionContext } from './session.ts';
import type { ExerciseLog, Injury, SessionLog } from './types.ts';

const ctx = (over: Partial<SessionContext> = {}): SessionContext => ({
  date: '2026-11-23', template: 'A', location: 'gym', minutes: 45, history: [], equipment: DEFAULT_HOME, ...over,
});

function log(id: string, load: number, reps: number[], feel: ExerciseLog['feel'] = 'good', over: Partial<ExerciseLog['prescription']> = {}): ExerciseLog {
  const ex = getExercise(id);
  return {
    exerciseId: id,
    feel,
    prescription: { exerciseId: id, sets: reps.length, repRange: ex.repRange, targetReps: ex.repRange[0], load, restSec: 90, stage: 0, change: 'same', note: '', ...over },
    sets: reps.map((r) => ({ load, reps: r, done: true })),
  };
}
const session = (date: string, location: 'gym' | 'home', exercises: ExerciseLog[]): SessionLog => ({ id: date, date, kind: 'strength', source: 'app', location, template: 'A', exercises });

describe('krachtsessie', () => {
  it('A in Jims, 45 min: 6 oefeningen, past in de tijd', () => {
    const s = buildStrengthSession(ctx());
    expect(s.exercises.map((e) => e.exercise.id)).toEqual(['leg-press', 'db-bench', 'lat-pulldown', 'rdl-db', 'db-shoulder-press', 'dead-bug']);
    expect(s.estimatedMinutes).toBeLessThanOrEqual(47);
    expect(s.exercises.every((e) => e.prescription.note.length > 0)).toBe(true);
  });

  it('elke duur blijft binnen het tijdsbudget', () => {
    for (const minutes of [30, 45, 60] as const)
      for (const template of ['A', 'B'] as const)
        for (const location of ['gym', 'home'] as const) {
          const s = buildStrengthSession(ctx({ minutes, template, location }));
          expect(s.estimatedMinutes, `${template} ${location} ${minutes}`).toBeLessThanOrEqual(minutes + 2);
          expect(s.exercises.length).toBeGreaterThanOrEqual(4);
        }
  });

  it('30 min: supersets A1/A2, B1/B2', () => {
    const s = buildStrengthSession(ctx({ minutes: 30 }));
    expect(s.exercises.slice(0, 4).map((e) => e.superset)).toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  it('60 min groen: met afsluiter; deload of oranje: zonder', () => {
    expect(buildStrengthSession(ctx({ minutes: 60 })).finisher).toBeDefined();
    expect(buildStrengthSession(ctx({ minutes: 60, deload: true })).finisher).toBeUndefined();
    expect(buildStrengthSession(ctx({ minutes: 60, readiness: 'orange' })).finisher).toBeUndefined();
  });

  it('thuis: enkel oefeningen en gewichten die met jouw materiaal kunnen', () => {
    const s = buildStrengthSession(ctx({ location: 'home' }));
    for (const p of s.exercises) {
      expect(p.exercise.locations).toContain('home');
      expect(loadOptions(p.exercise, 'home', DEFAULT_HOME)).toContain(p.prescription.load);
    }
  });

  it('gebruikt je historiek voor progressie', () => {
    const history = [session('2026-11-19', 'gym', [log('db-bench', 12, [12, 12, 12])])];
    const s = buildStrengthSession(ctx({ history }));
    const bench = s.exercises.find((e) => e.exercise.id === 'db-bench')!;
    expect(bench.prescription.load).toBe(14);
    expect(bench.prescription.change).toBe('load_up');
  });

  it('oranje: 1 set minder en geen gewicht omhoog', () => {
    const history = [session('2026-11-19', 'gym', [log('db-bench', 12, [12, 12, 12])])];
    const bench = buildStrengthSession(ctx({ history, readiness: 'orange' })).exercises.find((e) => e.exercise.id === 'db-bench')!;
    expect(bench.prescription.load).toBe(12);
    expect(bench.prescription.sets).toBe(2);
  });

  it('deload: helft van de sets', () => {
    const s = buildStrengthSession(ctx({ deload: true }));
    expect(s.exercises[0]!.prescription.sets).toBe(2);
    expect(s.notes[0]).toMatch(/Deload/);
  });

  it('blessure aan de knie: leg press wordt vervangen door iets kniesparends', () => {
    const knee: Injury = { id: 'k', zone: 'knie', severity: 2, startedOn: '2026-11-20', updates: [] };
    const s = buildStrengthSession(ctx({ injuries: [knee] }));
    const first = s.exercises[0]!;
    expect(first.replacedFrom).toBe('leg-press');
    expect((first.exercise.stress.knie ?? 0)).toBeLessThanOrEqual(1);
    expect(s.exercises.some((e) => e.exercise.id === 'leg-press')).toBe(false);
  });

  it('blessure aan de schouder: schouderpress valt weg of wordt vervangen', () => {
    const sh: Injury = { id: 's', zone: 'schouder', severity: 3, startedOn: '2026-11-20', updates: [] };
    const s = buildStrengthSession(ctx({ injuries: [sh] }));
    for (const p of s.exercises) expect(p.exercise.stress.schouder ?? 0).toBe(0);
  });

  it('thuisladder: na de laatste ladderstap de zwaardere variant, en die blijft', () => {
    const maxed = loadOptions(getExercise('goblet-squat'), 'home', DEFAULT_HOME).at(-1)!;
    const history = [session('2026-11-19', 'home', [log('goblet-squat', maxed, [12, 12, 12], 'good', { stage: 4 })])];
    const s = buildStrengthSession(ctx({ location: 'home', history }));
    expect(s.exercises[0]!.exercise.id).toBe('bulgarian-split-squat');
    const later = [...history, session('2026-11-21', 'home', [log('bulgarian-split-squat', 7, [8, 8, 8])])];
    expect(buildStrengthSession(ctx({ location: 'home', history: later, date: '2026-11-25' })).exercises[0]!.exercise.id).toBe('bulgarian-split-squat');
  });

  it('wissel van /coach wordt toegepast', () => {
    const s = buildStrengthSession(ctx({ adjustments: { version: 1, swaps: [{ from: 'leg-press', to: 'hack-squat' }] } }));
    expect(s.exercises[0]!.exercise.id).toBe('hack-squat');
  });

  it('ladder van push-ups loopt van makkelijk naar moeilijk', () => {
    expect(ladderOf('push-up')).toEqual(['incline-push-up', 'push-up', 'feet-elevated-push-up']);
  });

  it('schatting houdt rekening met eenzijdig en tempo', () => {
    const s = buildStrengthSession(ctx());
    const base = estimateSeconds(s.exercises, false);
    const slow = s.exercises.map((p) => ({ ...p, prescription: { ...p.prescription, tempo: '3-1-1' } }));
    expect(estimateSeconds(slow, false)).toBeGreaterThan(base);
  });
});

describe('conditiesessie', () => {
  it('Jims 45 min: groepsles of intervallen', () => {
    const c = buildCardioSession({ date: '2026-11-25', location: 'gym', minutes: 45, equipment: DEFAULT_HOME });
    expect(c.options.map((o) => o.title)).toEqual(['Indoor cycling (groepsles)', 'Intervallen op fiets of roeier']);
  });
  it('oranje: geen intervallen', () => {
    const c = buildCardioSession({ date: '2026-11-25', location: 'gym', minutes: 45, readiness: 'orange', equipment: DEFAULT_HOME });
    expect(c.options[0]!.title).toMatch(/zone 2/);
    expect(JSON.stringify(c.options)).not.toMatch(/stevig/);
  });
  it('thuis zonder kettlebell: geen swings', () => {
    const c = buildCardioSession({ date: '2026-11-25', location: 'home', minutes: 30, equipment: { ...DEFAULT_HOME, kettlebellsKg: [] } });
    expect(JSON.stringify(c.options)).not.toMatch(/swings/);
  });
});
