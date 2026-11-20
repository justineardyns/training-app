import { describe, expect, it } from 'vitest';
import { getExercise } from './catalog.ts';
import { DEFAULT_HOME } from './loads.ts';
import { cardioLoad, eventFromSession, recoveryAt, recoveryHours, sessionLoad, strengthFocus, type LoadEvent } from './recovery.ts';
import { applyFocus, buildStrengthSession, groupOf } from './session.ts';
import type { ExerciseLog, SessionLog } from './types.ts';

function log(id: string, sets: number, feel: ExerciseLog['feel'] = 'good'): ExerciseLog {
  const ex = getExercise(id);
  return {
    exerciseId: id, feel,
    prescription: { exerciseId: id, sets, repRange: ex.repRange, targetReps: ex.repRange[0], load: 20, restSec: 90, stage: 0, change: 'same', note: '' },
    sets: Array.from({ length: sets }, () => ({ load: 20, reps: 10, done: true })),
  };
}
const strength = (date: string, exercises: ExerciseLog[]): SessionLog => ({ id: date, date, kind: 'strength', source: 'app', location: 'gym', template: 'A', exercises });

describe('herstel per spiergroep', () => {
  it('hersteltijd groeit met de belasting', () => {
    expect(recoveryHours(0)).toBe(0);
    expect(recoveryHours(2)).toBe(24);
    expect(recoveryHours(6)).toBe(48);
    expect(recoveryHours(9)).toBe(72);
  });

  it('kracht belast vooral de hoofdspier; tennis ook schouders en romp; fietsen de benen', () => {
    const l = sessionLoad(strength('2026-11-23', [log('leg-press', 3), log('db-bench', 3)]));
    expect(l.benen).toBe(3);
    expect(l.duwen).toBe(3);
    expect(cardioLoad('Tennis', 120).duwen).toBeCloseTo(2.4);
    expect(cardioLoad('Tennis', 60).benen).toBe(3);
    expect(cardioLoad('Indoor cycling', 45)).toEqual({ benen: 5, core: 1 });
  });

  it('na indoor cycling op zaterdagochtend zijn je benen maandagavond weer fris', () => {
    const ev: LoadEvent[] = [{ date: '2026-11-21', slot: 'day', label: 'indoor cycling za', load: cardioLoad('cycling', 45) }];
    expect(recoveryAt({ date: '2026-11-22', slot: 'day' }, ev).benen.state).toBe('herstelt');
    expect(recoveryAt({ date: '2026-11-23', slot: 'evening' }, ev).benen.state).toBe('fris');
  });

  it('na tennis in gradaties: 1u = de dag erna licht stijf (herstelt), 2u = moe; je bovenlijf blijft fris', () => {
    const one: LoadEvent[] = [{ date: '2026-11-26', slot: 'evening', label: 'tennis do', load: cardioLoad('tennis', 60) }];
    const fri = recoveryAt({ date: '2026-11-27', slot: 'evening' }, one);
    expect(fri.benen).toMatchObject({ state: 'herstelt', cause: 'tennis do' });
    expect(fri.duwen.state).toBe('fris');
    expect(recoveryAt({ date: '2026-11-28', slot: 'day' }, one).benen.state).toBe('fris');
    const two: LoadEvent[] = [{ date: '2026-11-26', slot: 'evening', label: 'tennis (2u) do', load: cardioLoad('tennis', 120) }];
    expect(recoveryAt({ date: '2026-11-27', slot: 'evening' }, two).benen.state).toBe('moe');
  });

  it('jouw spierpijn telt altijd: die groep is moe', () => {
    expect(recoveryAt({ date: '2026-11-23' }, [], ['benen']).benen).toMatchObject({ state: 'moe', cause: 'spierpijn' });
  });

  it('zwaar gevoeld of nieuw voor je spieren → meer belasting', () => {
    const s = strength('2026-11-23', [log('leg-press', 3, 'hard')]);
    expect(eventFromSession(s, true).load.benen).toBeCloseTo(3 * 1.25 * 1.25);
  });
});

describe('focus van een krachttraining', () => {
  const fresh = recoveryAt({ date: '2026-11-23' }, []);

  it('alles fris: enkel je werkpunt eerst', () => {
    const f = strengthFocus(fresh, 'trekken');
    expect(f).toMatchObject({ reduce: [], later: [], first: 'trekken' });
    expect(f.why).toMatch(/Rug & armen is je werkpunt/);
    expect(strengthFocus(fresh).why).toBeUndefined();
  });

  it('benen moe: bovenlichaam eerst, benen 1 set minder en niet zwaarder', () => {
    const rec = recoveryAt({ date: '2026-11-23' }, [], ['benen']);
    const f = strengthFocus(rec);
    expect(f.reduce).toEqual(['benen']);
    expect(f.why).toMatch(/Benen nog moe \(spierpijn\): eerst borst & schouders en rug & armen, benen 1 set minder/);
    const s = buildStrengthSession({ date: '2026-11-23', template: 'A', location: 'gym', minutes: 45, history: [], equipment: DEFAULT_HOME, focus: f });
    const mains = s.exercises.filter((e) => e.role === 'main');
    expect(groupOf(mains[0]!.exercise)).not.toBe('benen');
    expect(groupOf(mains.at(-1)!.exercise)).toBe('benen');
    const legPress = s.exercises.find((e) => e.exercise.id === 'leg-press')!;
    expect(legPress.prescription.sets).toBe(2);
    expect(legPress.recoveryNote).toMatch(/1 set minder/);
    expect(s.notes[0]).toBe(f.why);
  });

  it('herstel houdt een geplande gewichtsverhoging tegen', () => {
    const planned = [
      { exercise: getExercise('leg-press'), role: 'main' as const, options: [50, 55, 60, 65, 70],
        prescription: { exerciseId: 'leg-press', sets: 3, repRange: [10, 15] as [number, number], targetReps: 10, load: 65, restSec: 90, stage: 0, change: 'load_up' as const, note: '' } },
    ];
    const hist = [strength('2026-11-20', [{ ...log('leg-press', 3), sets: [1, 2, 3].map(() => ({ load: 60, reps: 15, done: true })) }])];
    applyFocus(planned, { reduce: ['benen'], later: [] }, hist);
    expect(planned[0]!.prescription).toMatchObject({ sets: 2, load: 60, targetReps: 11 });
  });
});
