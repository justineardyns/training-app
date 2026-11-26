import { describe, expect, it } from 'vitest';
import { rowTests } from './check.ts';
import { trainingBlock } from './deload.ts';
import { DEFAULT_HOME } from './loads.ts';
import { rampSets } from './progression.ts';
import { buildStrengthSession, type SessionContext } from './session.ts';
import type { SessionLog } from './types.ts';

const ctx = (over: Partial<SessionContext> = {}): SessionContext => ({
  date: '2026-11-23', template: 'U', location: 'gym', minutes: 60, history: [], equipment: DEFAULT_HOME, ...over,
});
const s = (date: string, over: Partial<SessionLog> = {}): SessionLog => ({ id: date, date, kind: 'strength', source: 'app', exercises: [], ...over });

describe('opwarmsets op maat', () => {
  it('8× ±50% en 4× ±75% van je werkgewicht, enkel bestaande gewichten', () => {
    const machine = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
    expect(rampSets(40, machine)).toEqual([{ load: 20, reps: 8 }, { load: 30, reps: 4 }]);
    expect(rampSets(35, machine)).toEqual([{ load: 15, reps: 8 }, { load: 25, reps: 4 }]);
  });
  it('geen opwarmsets bij heel lichte gewichten of lichaamsgewicht', () => {
    expect(rampSets(6, [4, 6, 8])).toEqual([]);
    expect(rampSets(0, [2, 4])).toEqual([]);
  });
});

describe('conditietest', () => {
  it('1 km roeien: verschil met de vorige keer', () => {
    const t = rowTests([s('2026-10-05', { rowTest: 300 }), s('2026-11-16', { rowTest: 288 })]);
    expect(t[0]).toEqual({ date: '2026-11-16', seconds: 288, faster: 12 });
    expect(t[1]).toEqual({ date: '2026-10-05', seconds: 300 });
  });
  it('in de krachtcheck-week vervangt de test de afsluiter', () => {
    const normal = buildStrengthSession(ctx());
    expect(normal.finisher).toBeDefined();
    const test = buildStrengthSession(ctx({ rowTest: true }));
    expect(test.finisher).toBeUndefined();
    expect(test.rowTest).toBe(true);
  });
});

describe('blokken van 6 weken', () => {
  it('trainingsblok = aantal lichtere weken achter de rug', () => {
    expect(trainingBlock([s('2026-10-05', { deload: true }), s('2026-10-07', { deload: true }), s('2026-11-16', { deload: true })])).toBe(2);
  });
  it('na de beginnersfase wisselen de hulpoefeningen per blok; hoofdoefeningen blijven', () => {
    const ids = (block: number) => buildStrengthSession(ctx({ block })).exercises.map((e) => ({ id: e.exercise.id, role: e.role }));
    const b0 = ids(0);
    const b1 = ids(1);
    const b2 = ids(2);
    const b3 = ids(3);
    expect(b1).toEqual(b0);
    const mains = (l: typeof b0) => l.filter((e) => e.role === 'main').map((e) => e.id);
    expect(mains(b2)).toEqual(mains(b0));
    expect(mains(b3)).toEqual(mains(b0));
    const acc = (l: typeof b0) => l.filter((e) => e.role !== 'main').map((e) => e.id).join(',');
    expect(acc(b3)).not.toEqual(acc(b2));
  });
});

describe('👎 oefening', () => {
  it('de coach stelt ze niet meer voor als er een alternatief is', () => {
    const base = buildStrengthSession(ctx({ template: 'A' })).exercises.map((e) => e.exercise.id);
    expect(base).toContain('leg-press');
    const s = buildStrengthSession(ctx({ template: 'A', dislikes: ['leg-press'] })).exercises.map((e) => e.exercise.id);
    expect(s).not.toContain('leg-press');
    expect(s.length).toBe(base.length);
  });
});
