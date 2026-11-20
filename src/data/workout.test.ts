import { describe, expect, it } from 'vitest';
import { getExercise } from '../coach/catalog.ts';
import { DEFAULT_HOME } from '../coach/loads.ts';
import { buildPrescription, buildStrengthSession, type SessionContext } from '../coach/session.ts';
import {
  adjustReps,
  allGroups,
  completeSet,
  currentGroup,
  finishItem,
  finishWorkout,
  groupDone,
  itemMs,
  itemStatus,
  isFinished,
  nextGroup,
  setFeel,
  setLoad,
  startItem,
  startWorkout,
  stopItem,
  swapItem,
  toSessionLog,
} from './workout.ts';

const ctx = (over: Partial<SessionContext> = {}): SessionContext => ({
  date: '2026-11-23', template: 'A', location: 'gym', minutes: 45, history: [], equipment: DEFAULT_HOME, ...over,
});
const start = (over: Partial<SessionContext> = {}) =>
  startWorkout(buildStrengthSession(ctx(over)), { id: 'w1', now: new Date('2026-11-23T18:00:00Z') });

describe('lopende training', () => {
  it('sets staan vooraf ingevuld met doelgewicht en reps', () => {
    const w = start();
    const first = w.items[0]!;
    expect(first.sets).toHaveLength(first.prescription.sets);
    expect(first.sets.every((s) => s.load === first.prescription.load && s.reps === first.prescription.targetReps && !s.done)).toBe(true);
  });

  it('✓ start automatisch de rusttimer', () => {
    const w = completeSet(start(), 0, 0, 1000);
    expect(w.items[0]!.sets[0]!.done).toBe(true);
    expect(w.rest).toEqual({ startedAt: 1000, until: 1000 + w.items[0]!.prescription.restSec * 1000 });
  });

  it('gewicht kiezen geldt voor deze en volgende open sets', () => {
    let w = completeSet(start(), 0, 0, 0);
    w = setLoad(w, 0, 1, 80);
    expect(w.items[0]!.sets.map((s) => s.load)).toEqual([60, 80, 80]);
  });

  it('reps aanpassen met +/−', () => {
    const w = adjustReps(adjustReps(start(), 0, 0, -2), 0, 0, 1);
    expect(w.items[0]!.sets[0]!.reps).toBe(w.items[0]!.prescription.targetReps - 1);
  });

  it('na alle sets: geen rust meer, gevoel vragen en verder', () => {
    let w = start();
    for (let k = 0; k < w.items[0]!.sets.length; k++) w = completeSet(w, 0, k, k);
    expect(groupDone(w)).toBe(true);
    expect(w.rest).toBeUndefined();
    w = nextGroup(setFeel(w, 0, 'good'));
    expect(w.index).toBe(1);
  });

  it('superset: geen rust tussen A1 en A2, wel na A2', () => {
    let w = start({ minutes: 30 });
    expect(currentGroup(w)).toEqual([0, 1]);
    w = completeSet(w, 0, 0, 0);
    expect(w.rest).toBeUndefined();
    w = completeSet(w, 1, 0, 0);
    expect(w.rest).toBeDefined();
  });

  it('toestel bezet vóór de eerste set: oefening wordt vervangen', () => {
    const w = start();
    const alt = buildPrescription(getExercise('hack-squat'), 'main', ctx());
    const s = swapItem(w, 0, { ...alt, role: 'main' });
    expect(s.items[0]!.exerciseId).toBe('hack-squat');
    expect(s.items[0]!.swappedFrom).toBe('leg-press');
    expect(s.items).toHaveLength(w.items.length);
  });

  it('toestel bezet na 1 set: gedane set blijft, rest naar het alternatief', () => {
    const w = completeSet(start(), 0, 0, 0);
    const alt = buildPrescription(getExercise('hack-squat'), 'main', ctx());
    const s = swapItem(w, 0, { ...alt, role: 'main' });
    expect(s.items[0]!.exerciseId).toBe('leg-press');
    expect(s.items[0]!.sets).toHaveLength(1);
    expect(s.items[1]!.exerciseId).toBe('hack-squat');
    expect(s.items[1]!.sets).toHaveLength(2);
    expect(s.index).toBe(1);
  });

  it('na de oefening: gelukt / ik nam meer / ik nam minder', () => {
    let w = start();
    for (let k = 0; k < w.items[0]!.sets.length; k++) w = completeSet(w, 0, k, k);
    const ok = finishItem(w, 0, 'good');
    expect(ok.items[0]!.feel).toBe('good');
    expect(ok.open).toBe(false);
    const more = finishItem(w, 0, 'good', 45);
    expect(more.items[0]!.sets.every((s) => s.load === 45)).toBe(true);
  });

  it('wordt een sessielog met enkel gedane oefeningen', () => {
    let w = start();
    w = setFeel(completeSet(w, 0, 0, 0), 0, 'hard');
    while (!isFinished(w)) w = nextGroup(w);
    const log = toSessionLog(w, new Date('2026-11-23T18:47:00Z'));
    expect(log).toMatchObject({ kind: 'strength', template: 'A', location: 'gym', durationMin: 47, source: 'app' });
    expect(log.exercises).toHaveLength(1);
    expect(log.exercises[0]!.feel).toBe('hard');
  });

  it('▶ Start / ■ Stop per oefening, in de volgorde die jij kiest', () => {
    const t0 = Date.parse('2026-11-23T18:05:00Z');
    let w = start();
    expect(w.open).toBeFalsy();
    // Toestel bezet? Begin gewoon met de derde oefening.
    w = startItem(w, 2, t0);
    expect(w).toMatchObject({ index: 2, open: true, warmupDone: true });
    expect(itemMs(w.items[2]!, t0 + 90_000)).toBe(90_000);
    // Toch eerst iets anders: de klok van de derde stopt.
    w = startItem(w, 0, t0 + 120_000);
    expect(w.index).toBe(0);
    expect(itemMs(w.items[2]!, t0 + 999_000)).toBe(120_000);
    // Alle sets + "gelukt": klok stopt, oefening dicht.
    for (let k = 0; k < w.items[0]!.sets.length; k++) w = completeSet(w, 0, k, t0 + 130_000 + k);
    w = finishItem(w, 0, 'good', undefined, t0 + 420_000);
    expect(w.open).toBe(false);
    expect(itemStatus(w.items[0]!)).toBe('klaar');
    expect(itemMs(w.items[0]!, t0 + 999_000)).toBe(300_000);
    expect(itemStatus(w.items[2]!)).toBe('todo');
  });

  it('■ Stop zonder sets: dicht; na 1 set: meteen "hoe ging het?"', () => {
    const t0 = 1_000_000;
    let w = stopItem(startItem(start(), 1, t0), 1, t0 + 5_000);
    expect(w.open).toBe(false);
    expect(itemStatus(w.items[1]!)).toBe('todo');
    w = completeSet(startItem(w, 1, t0 + 10_000), 1, 0, t0 + 20_000);
    w = stopItem(w, 1, t0 + 30_000);
    expect(w.open).toBe(true);
    expect(w.items[1]!.stopped).toBe(true);
    expect(w.rest).toBeUndefined();
    w = finishItem(w, 1, 'good', undefined, t0 + 40_000);
    expect(w.open).toBe(false);
    expect(itemStatus(w.items[1]!)).toBe('klaar');
    expect(w.items[1]!.sets.filter((s) => s.done)).toHaveLength(1);
  });

  it('superset: ▶ Start opent het paar; dicht pas als beide klaar zijn', () => {
    let w = start({ minutes: 30 });
    const groups = allGroups(w);
    expect(groups[0]).toEqual([0, 1]);
    w = startItem(w, 1, 0);
    expect(w.index).toBe(0);
    expect(currentGroup(w)).toEqual([0, 1]);
    for (const i of [0, 1]) for (let k = 0; k < w.items[i]!.sets.length; k++) w = completeSet(w, i, k, k);
    w = finishItem(w, 0, 'good', undefined, 100);
    expect(w.open).toBe(true);
    w = finishItem(w, 1, 'good', undefined, 200);
    expect(w.open).toBe(false);
  });

  it('afronden: wat je niet deed, telt niet mee', () => {
    let w = completeSet(startItem(start(), 0, 0), 0, 0, 1_000);
    w = finishWorkout(w, 60_000);
    expect(isFinished(w)).toBe(true);
    expect(w.items[0]!.clock).toEqual({ ms: 60_000 });
    expect(toSessionLog(w, new Date('2026-11-23T18:30:00Z')).exercises).toHaveLength(1);
  });
});
