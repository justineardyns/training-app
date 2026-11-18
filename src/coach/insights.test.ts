import { describe, expect, it } from 'vitest';
import { getExercise } from './catalog.ts';
import { addDays } from './dates.ts';
import { buildInsights } from './insights.ts';
import type { ExerciseLog, SessionLog } from './types.ts';

const TODAY = '2026-12-21'; // maandag
function ex(id: string, load: number, reps: number, planned = load): ExerciseLog {
  const e = getExercise(id);
  return {
    exerciseId: id, feel: 'good',
    prescription: { exerciseId: id, sets: 3, repRange: e.repRange, targetReps: e.repRange[0], load: planned, restSec: 90, stage: 0, change: 'same', note: '' },
    sets: [1, 2, 3].map(() => ({ load, reps, done: true })),
  };
}
const strength = (date: string, exercises: ExerciseLog[]): SessionLog => ({ id: `s-${date}`, date, kind: 'strength', source: 'app', location: 'gym', template: 'A', exercises });
const cycling = (date: string): SessionLog => ({ id: `c-${date}`, date, kind: 'class', source: 'app', location: 'gym', title: 'Indoor cycling', durationMin: 45, exercises: [] });

describe('sterke punten en werkpunten', () => {
  it('weinig gegevens: nog niets te zeggen', () => {
    const i = buildInsights({ today: TODAY, history: [], planned: [], strengthTarget: 2, cardioTarget: 2 });
    expect(i).toMatchObject({ strong: [], work: [], enoughData: false, avoidWeekdays: [] });
  });

  it('benen gaan vooruit, rug staat stil → rug is je werkpunt en komt eerst', () => {
    const dates = [-35, -31, -28, -24, -21, -17, -14, -10, -7, -3].map((n) => addDays(TODAY, n));
    const history = dates.map((d, i) =>
      strength(d, [ex('leg-press', 40 + i * 5, 12), ex('lat-pulldown', 30, 10), ex('chest-press', 20 + i * 2.5, 10)]),
    );
    const i = buildInsights({ today: TODAY, history, planned: dates, strengthTarget: 2, cardioTarget: 2 });
    expect(i.weakGroup).toBe('trekken');
    expect(i.strong.map((x) => x.text).join(' ')).toMatch(/Leg press: \+\d+% in \d weken/);
    expect(i.work.map((x) => x.text).join(' ')).toMatch(/Lat pulldown staat stil/);
    expect(i.work.find((x) => x.id === 'group-trekken')?.action).toMatch(/eerst/);
    expect(i.strong.some((x) => x.id === 'consistent')).toBe(true);
  });

  it('maandag valt vaak weg → de planner vermijdt maandag', () => {
    const mondays = [-28, -21, -14, -7].map((n) => addDays(TODAY, n));
    const thursdays = mondays.map((d) => addDays(d, 3));
    const history = [...thursdays.map((d) => strength(d, [ex('leg-press', 40, 12)])), strength(mondays[0]!, [ex('leg-press', 40, 12)])];
    const i = buildInsights({ today: TODAY, history, planned: [...mondays, ...thursdays], strengthTarget: 2, cardioTarget: 2 });
    expect(i.avoidWeekdays).toEqual([0]);
    expect(i.work.find((x) => x.id === 'missed-0')?.text).toBe('Op maandag valt je training vaak weg (3 van 4).');
  });

  it('neemt vaak meer dan voorgesteld → sterk punt; geen conditie in 2 weken → werkpunt', () => {
    const dates = [-12, -9, -5, -2].map((n) => addDays(TODAY, n));
    const history = dates.map((d) => strength(d, [ex('leg-press', 50, 12, 40), ex('chest-press', 25, 10, 20)]));
    const i = buildInsights({ today: TODAY, history, planned: dates, strengthTarget: 2, cardioTarget: 2 });
    expect(i.strong.find((x) => x.id === 'more')?.text).toMatch(/meer dan mijn voorstel/);
    expect(i.work.find((x) => x.id === 'cardio')?.text).toBe('Geen conditie in 2 weken.');
  });

  it('vaak moe → werkpunt; conditie op schema → sterk punt', () => {
    const history = [-13, -11, -6, -4, -1].map((n) => cycling(addDays(TODAY, n)));
    const checks = [-4, -3, -2, -1, 0].map((n, k) => ({ date: addDays(TODAY, n), level: (k < 3 ? 'orange' : 'green') as 'orange' | 'green' }));
    const i = buildInsights({ today: TODAY, history, planned: [], checks, strengthTarget: 2, cardioTarget: 2 });
    expect(i.work.find((x) => x.id === 'tired')?.text).toBe('Vaak moe: 3 van je laatste 5 dagvormtikken.');
    expect(i.strong.find((x) => x.id === 'cardio')).toBeDefined();
  });
});
