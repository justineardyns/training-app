import { describe, expect, it } from 'vitest';
import { EXERCISES, getExercise } from './catalog.ts';
import { acceptableFor, currentSeverity, injuryDecision, referral, relevantInjuries } from './injury.ts';
import type { Injury, SessionLog } from './types.ts';

const getEx = (id: string) => EXERCISES.get(id);
const knee = (over: Partial<Injury> = {}): Injury => ({ id: 'k', zone: 'knie', severity: 2, startedOn: '2026-11-10', updates: [], ...over });

function legSession(date: string): SessionLog {
  return {
    id: date, date, kind: 'strength', source: 'app',
    exercises: [{ exerciseId: 'leg-press', prescription: {} as never, sets: [{ load: 60, reps: 10, done: true }] }],
  };
}

describe('blessure-aanpassingen', () => {
  it('matig: sterk belastende oefening wordt vervangen', () => {
    expect(injuryDecision(getExercise('bulgarian-split-squat'), [knee()], [], getEx).action).toBe('replace');
    expect(injuryDecision(getExercise('leg-press'), [knee()], [], getEx).action).toBe('replace');
  });

  it('matig: licht belastende oefening wordt 70%', () => {
    const d = injuryDecision(getExercise('leg-curl'), [knee()], [], getEx);
    expect(d.action).toBe('lighter');
    expect(d.factor).toBe(0.7);
  });

  it('licht: enkel de zwaarste vervangen, matig belastend 80%', () => {
    const light = knee({ severity: 1 });
    expect(injuryDecision(getExercise('hack-squat'), [light], [], getEx).action).toBe('replace');
    const d = injuryDecision(getExercise('leg-press'), [light], [], getEx);
    expect(d.action).toBe('lighter');
    expect(d.factor).toBe(0.8);
  });

  it('hevig: alles wat de zone raakt wordt vervangen', () => {
    expect(injuryDecision(getExercise('leg-curl'), [knee({ severity: 3 })], [], getEx).action).toBe('replace');
  });

  it('andere zones blijven ongemoeid', () => {
    expect(injuryDecision(getExercise('db-bench'), [knee()], [], getEx)).toMatchObject({ action: 'ok', factor: 1 });
  });

  it('erger worden telt als een stap zwaarder', () => {
    expect(currentSeverity(knee({ updates: [{ date: '2026-11-12', trend: 'erger' }] }))).toBe(3);
    expect(currentSeverity(knee({ updates: [{ date: '2026-11-12', trend: 'beter', severity: 1 }] }))).toBe(1);
  });

  it('opbouw na herstel: 60% → 80% → 100%', () => {
    const healed = knee({ resolvedOn: '2026-11-15' });
    expect(injuryDecision(getExercise('leg-press'), [healed], [], getEx).factor).toBe(0.6);
    expect(injuryDecision(getExercise('leg-press'), [healed], [legSession('2026-11-16')], getEx).factor).toBe(0.8);
    const after2 = [legSession('2026-11-16'), legSession('2026-11-18')];
    expect(injuryDecision(getExercise('leg-press'), [healed], after2, getEx).factor).toBe(1);
    expect(relevantInjuries([healed], after2, getEx)).toHaveLength(0);
    expect(relevantInjuries([healed], [], getEx)).toHaveLength(1);
  });

  it('vervangers moeten de zone sparen', () => {
    expect(acceptableFor(getExercise('leg-curl'), [knee()])).toBe(true);
    expect(acceptableFor(getExercise('leg-press'), [knee()])).toBe(false);
    expect(acceptableFor(getExercise('leg-curl'), [knee({ severity: 3 })])).toBe(false);
  });
});

describe('doorverwijzing', () => {
  it('scherpe, hevige, erger wordende of aanhoudende pijn → arts/kinesist', () => {
    expect(referral(knee({ sharp: true }), '2026-11-11').refer).toBe(true);
    expect(referral(knee({ severity: 3 }), '2026-11-11').refer).toBe(true);
    expect(referral(knee({ updates: [{ date: '2026-11-12', trend: 'erger' }] }), '2026-11-13').refer).toBe(true);
    const r = referral(knee(), '2026-11-30');
    expect(r.refer).toBe(true);
    expect(r.message).toMatch(/arts of kinesist/);
  });

  it('matige, recente pijn die beter wordt → nog geen doorverwijzing', () => {
    expect(referral(knee({ updates: [{ date: '2026-11-12', trend: 'beter' }] }), '2026-11-13').refer).toBe(false);
  });
});
