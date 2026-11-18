import { describe, expect, it } from 'vitest';
import { addDays } from './dates.ts';
import { decideDeload } from './deload.ts';
import type { SessionLog } from './types.ts';

const MON = '2026-11-23';
const prefs = { deloadEvery: 6 };

/** Eén krachtsessie per week, `weeks` weken terug tot vorige week. */
function weeks(n: number, opts: { deloadAgo?: number } = {}): SessionLog[] {
  return Array.from({ length: n }, (_, i) => {
    const ago = n - i; // weken geleden
    return {
      id: `w${ago}`, date: addDays(MON, -7 * ago + 2), kind: 'strength' as const, source: 'app' as const,
      deload: opts.deloadAgo === ago, exercises: [],
    };
  });
}

describe('deload', () => {
  it('niet in de eerste weken', () => {
    expect(decideDeload({ monday: MON, history: weeks(1), readiness: [], prefs }).deload).toBe(false);
  });

  it('vast ritme: na 5 opbouwweken een deloadweek', () => {
    expect(decideDeload({ monday: MON, history: weeks(4), readiness: [], prefs }).deload).toBe(false);
    const d = decideDeload({ monday: MON, history: weeks(5), readiness: [], prefs });
    expect(d).toMatchObject({ deload: true, reason: 'ritme', weeksSinceDeload: 5 });
  });

  it('telt opnieuw vanaf de vorige deload', () => {
    const d = decideDeload({ monday: MON, history: weeks(8, { deloadAgo: 3 }), readiness: [], prefs });
    expect(d.weeksSinceDeload).toBe(2);
    expect(d.deload).toBe(false);
  });

  it('slechte dagvormtrend → deload', () => {
    const readiness = [-6, -4, -2].map((n) => ({ date: addDays(MON, n), level: 'orange' as const }));
    const d = decideDeload({ monday: MON, history: weeks(3), readiness, prefs });
    expect(d).toMatchObject({ deload: true, reason: 'dagvorm' });
    const twoRed = [-5, -2].map((n) => ({ date: addDays(MON, n), level: 'red' as const }));
    expect(decideDeload({ monday: MON, history: weeks(3), readiness: twoRed, prefs }).reason).toBe('dagvorm');
  });

  it('stagnatie op 2 oefeningen → deload', () => {
    const ex = (id: string, reps: number) => ({
      exerciseId: id,
      prescription: { exerciseId: id, sets: 1, repRange: [8, 12] as [number, number], targetReps: 8, load: 20, restSec: 90, stage: 0, change: 'same' as const, note: '' },
      sets: [{ load: 20, reps, done: true }],
    });
    const reps = [10, 9, 9, 8];
    const history: SessionLog[] = reps.map((r, i) => ({
      id: `s${i}`, date: addDays(MON, -28 + i * 7), kind: 'strength', source: 'app', exercises: [ex('db-bench', r), ex('leg-press', r)],
    }));
    expect(decideDeload({ monday: MON, history, readiness: [], prefs }).reason).toBe('stagnatie');
  });

  it('op vraag van /coach', () => {
    const d = decideDeload({ monday: MON, history: [], readiness: [], prefs, adjustments: { version: 1, forceDeload: true } });
    expect(d).toMatchObject({ deload: true, reason: 'coach' });
  });
});
