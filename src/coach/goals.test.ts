import { describe, expect, it } from 'vitest';
import { countsForWeekGoal, goalProgress, goalReachedOn, isRecord, suggestGoals, weekGoalProgress, weekGoalStreak, type Goal } from './goals.ts';
import type { SessionLog } from './types.ts';

const gym = (date: string, kind: SessionLog['kind'], durationMin?: number, title?: string, location: SessionLog['location'] = 'gym'): SessionLog => ({
  id: `${date}-${kind}-${title}`, date, kind, source: 'app', exercises: [], location, durationMin, title,
});
const lift = (date: string, id: string, load: number, reps: number[]): SessionLog => ({
  id: `${date}-${id}`, date, kind: 'strength', source: 'app', location: 'gym', durationMin: 40,
  exercises: [{ exerciseId: id, prescription: { exerciseId: id, sets: reps.length, repRange: [10, 15], targetReps: 10, load, restSec: 90, stage: 0, change: 'same', note: '' }, sets: reps.map((r) => ({ load, reps: r, done: true })), feel: 'good' }],
});

describe('weekdoel: 3× per week minstens een half uur in Jims', () => {
  it('telt trainingen in Jims van ±30 min; tennis en buiten lopen niet', () => {
    const goal = { sessions: 3, minutes: 30 };
    expect(countsForWeekGoal(gym('2026-11-23', 'strength', 32), goal)).toBe(true);
    expect(countsForWeekGoal(gym('2026-11-23', 'strength', 26), goal)).toBe(true);
    expect(countsForWeekGoal(gym('2026-11-23', 'strength', 20), goal)).toBe(false);
    expect(countsForWeekGoal(gym('2026-11-23', 'class', 60, 'Indoor cycling'), goal)).toBe(true);
    expect(countsForWeekGoal(gym('2026-11-26', 'cardio', 60, 'Tennis'), goal)).toBe(false);
    expect(countsForWeekGoal(gym('2026-11-26', 'cardio', 40, 'Lopen', 'home'), goal)).toBe(false);
  });

  it('per kalenderweek, één per dag, en weken op rij', () => {
    const h = [gym('2026-11-16', 'strength', 40), gym('2026-11-18', 'class', 60), gym('2026-11-21', 'strength', 35), gym('2026-11-23', 'strength', 45), gym('2026-11-23', 'class', 60)];
    expect(weekGoalProgress(h, '2026-11-24')).toEqual({ done: 1, target: 3, reached: false });
    expect(weekGoalProgress(h, '2026-11-22')).toMatchObject({ done: 3, reached: true });
    expect(weekGoalStreak(h, '2026-11-24')).toBe(1);
  });
});

describe('persoonlijke doelen', () => {
  const h = [lift('2026-11-02', 'leg-press', 40, [12, 12]), lift('2026-11-05', 'leg-press', 45, [12, 11]), lift('2026-11-09', 'db-bench', 10, [10, 10]), lift('2026-11-12', 'db-bench', 10, [11, 10])];

  it('de coach stelt een rond, haalbaar doel voor (één tik)', () => {
    const s = suggestGoals(h, [], '2026-11-23');
    expect(s.find((g) => g.exerciseId === 'leg-press')).toMatchObject({ load: 55, reps: 12 });
    expect(s.find((g) => g.exerciseId === 'db-bench')).toMatchObject({ load: 12 });
    expect(suggestGoals(h, [{ id: 'g', exerciseId: 'leg-press', load: 55, reps: 12, createdOn: '2026-11-23' }], '2026-11-23').map((g) => g.exerciseId)).toEqual(['db-bench']);
  });

  it('voortgang en gehaald', () => {
    const goal: Goal = { id: 'g', exerciseId: 'leg-press', load: 55, reps: 12, createdOn: '2026-11-20' };
    expect(goalProgress(goal, h)).toBeGreaterThan(0.7);
    expect(goalReachedOn(goal, h)).toBeUndefined();
    expect(goalReachedOn(goal, [...h, lift('2026-11-30', 'leg-press', 55, [12, 12])])).toBe('2026-11-30');
  });

  it('record: beter dan elke vorige keer, de eerste keer telt niet', () => {
    expect(isRecord({ exerciseId: 'leg-press', sets: [{ load: 50, reps: 12, done: true }] }, h)).toBe(true);
    expect(isRecord({ exerciseId: 'leg-press', sets: [{ load: 45, reps: 10, done: true }] }, h)).toBe(false);
    expect(isRecord({ exerciseId: 'lat-pulldown', sets: [{ load: 30, reps: 10, done: true }] }, h)).toBe(false);
  });
});
