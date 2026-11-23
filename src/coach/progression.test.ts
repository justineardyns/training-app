import { describe, expect, it } from 'vitest';
import { getExercise } from './catalog.ts';
import {
  deloadPrescription,
  e1rm,
  exposures,
  isStagnating,
  lighterPrescription,
  nextPrescription,
  type Exposure,
} from './progression.ts';
import type { Feel, Prescription, SessionLog } from './types.ts';

const gymDb = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
const homeDb = [2, 4.5, 7, 9.5];

function presc(id: string, load: number, over: Partial<Prescription> = {}): Prescription {
  const ex = getExercise(id);
  return {
    exerciseId: id, sets: 3, repRange: ex.repRange, targetReps: ex.repRange[0], load, restSec: 90,
    stage: 0, change: 'same', note: '', ...over,
  };
}

function exp(id: string, load: number, reps: number[], feel: Feel | undefined, over: Partial<Prescription> = {}, date = '2026-11-02', deload = false): Exposure {
  return {
    date, deload,
    log: { exerciseId: id, prescription: presc(id, load, { sets: reps.length, ...over }), sets: reps.map((r) => ({ load, reps: r, done: true })), feel },
  };
}

const run = (id: string, options: number[], history: Exposure[]) =>
  nextPrescription({ exercise: getExercise(id), options, history, sets: 3, restSec: 90 });

describe('eerste keer', () => {
  it('start voorzichtig op het dichtste geldige gewicht', () => {
    const p = run('db-bench', gymDb, []);
    expect(p.change).toBe('new');
    expect(p.load).toBe(10);
    expect(p.targetReps).toBe(10);
    expect(p.note).toMatch(/met goede techniek, hou 2 reps over/);
  });
  it('lichaamsgewicht start op 0 kg', () => {
    expect(run('push-up', [0], []).load).toBe(0);
  });
});

describe('dubbele progressie', () => {
  it('reps omhoog binnen het bereik', () => {
    const p = run('db-bench', gymDb, [exp('db-bench', 10, [9, 9, 8], 'good'), exp('db-bench', 10, [10, 10, 9], 'good')]);
    expect(p.change).toBe('reps_up');
    expect(p.load).toBe(10);
    expect(p.targetReps).toBe(10);
  });

  it('gewicht omhoog als alle sets de bovengrens halen', () => {
    const p = run('db-bench', gymDb, [exp('db-bench', 10, [11, 11, 10], 'good'), exp('db-bench', 10, [12, 12, 12], 'good')]);
    expect(p.change).toBe('load_up');
    expect(p.load).toBe(12);
    expect(p.targetReps).toBe(8);
  });

  it('geen gewicht omhoog als het zwaar voelde', () => {
    const p = run('db-bench', gymDb, [exp('db-bench', 10, [11, 11, 10], 'good'), exp('db-bench', 10, [12, 12, 12], 'hard')]);
    expect(p.change).not.toBe('load_up');
    expect(p.load).toBe(10);
  });

  it('niet alle sets gedaan → nog geen gewicht omhoog', () => {
    const p = run('db-bench', gymDb, [exp('db-bench', 10, [11], 'good'), exp('db-bench', 10, [12, 12], 'good', { sets: 3 })]);
    expect(p.change).not.toBe('load_up');
  });

  it('twee keer te zwaar onder de ondergrens → gewicht omlaag', () => {
    const p = run('db-bench', gymDb, [exp('db-bench', 12, [7, 6, 6], 'hard'), exp('db-bench', 12, [7, 6, 5], 'hard')]);
    expect(p.change).toBe('load_down');
    expect(p.load).toBe(10);
  });

  it('één keer te zwaar → zelfde gewicht, focus op techniek', () => {
    const p = run('db-bench', gymDb, [exp('db-bench', 10, [10, 10, 10], 'good'), exp('db-bench', 12, [7, 6, 6], 'hard')]);
    expect(p.change).toBe('same');
    expect(p.load).toBe(12);
    expect(p.targetReps).toBe(8);
  });

  it('kalibreert snel na de eerste keer als het te licht was', () => {
    const p = run('db-bench', gymDb, [exp('db-bench', 10, [12, 12, 12], 'light')]);
    expect(p.change).toBe('load_up');
    expect(p.load).toBe(14); // 2 stappen
  });

  it('deloadsessies tellen niet mee voor progressie', () => {
    const p = run('db-bench', gymDb, [exp('db-bench', 10, [10, 10, 10], 'good'), exp('db-bench', 8, [8], 'good', {}, '2026-11-09', true)]);
    expect(p.load).toBe(10);
    expect(p.targetReps).toBe(11);
  });

  it('bij een grote sprong (+33%) eerst 2 reps extra', () => {
    const small = [4, 6, 8];
    const p = run('db-bench', small, [exp('db-bench', 6, [11, 11, 11], 'good'), exp('db-bench', 6, [12, 12, 12], 'good')]);
    expect(p.change).toBe('reps_up');
    expect(p.load).toBe(6);
    expect(p.repRange[1]).toBe(14);
    const q = run('db-bench', small, [exp('db-bench', 6, [12, 12, 12], 'good'), exp('db-bench', 6, [14, 14, 14], 'good')]);
    expect(q.change).toBe('load_up');
    expect(q.load).toBe(8);
  });
});

describe('thuisladder bij beperkt gewicht', () => {
  it('max gewicht bereikt → extra reps', () => {
    const p = run('rdl-db', homeDb, [exp('rdl-db', 9.5, [12, 12, 12], 'good')]);
    expect(p.change).toBe('reps_up');
    expect(p.stage).toBe(1);
    expect(p.repRange).toEqual([8, 17]);
    expect(p.load).toBe(9.5);
  });

  it('extra reps gehaald → trager tempo', () => {
    const p = run('rdl-db', homeDb, [exp('rdl-db', 9.5, [12, 12, 12], 'good'), exp('rdl-db', 9.5, [17, 17, 17], 'good', { stage: 1, repRange: [8, 17] })]);
    expect(p.change).toBe('tempo');
    expect(p.stage).toBe(2);
    expect(p.tempo).toBe('3-1-1');
    expect(p.repRange).toEqual([8, 12]);
    expect(p.targetReps).toBe(8);
  });

  it('daarna pauze en kortere rust', () => {
    const h = [exp('rdl-db', 9.5, [12, 12, 12], 'good'), exp('rdl-db', 9.5, [12, 12, 12], 'good', { stage: 2 })];
    const p = run('rdl-db', homeDb, h);
    expect(p.change).toBe('pause');
    expect(p.pauseSec).toBe(2);
    const q = run('rdl-db', homeDb, [...h, exp('rdl-db', 9.5, [12, 12, 12], 'good', { stage: 3 })]);
    expect(q.change).toBe('rest_down');
    expect(q.restSec).toBe(60);
  });

  it('ladder af → zwaardere variant (eenzijdig)', () => {
    const p = run('rdl-db', homeDb, [exp('rdl-db', 9.5, [12, 12, 12], 'good', { stage: 4 })]);
    expect(p.change).toBe('variant_up');
    expect(p.switchTo).toBe('single-leg-rdl');
  });

  it('gymgewicht bestaat thuis niet → zwaarst mogelijke, verder met reps', () => {
    const p = run('rdl-db', homeDb, [exp('rdl-db', 14, [10, 10, 10], 'good')]);
    expect(p.load).toBe(9.5);
    expect(p.change).not.toBe('load_up');
  });

  it('lichaamsgewicht: na de bovengrens de ladder op', () => {
    const p = run('push-up', [0], [exp('push-up', 0, [15, 15, 15], 'good')]);
    expect(p.stage).toBe(1);
    expect(p.load).toBe(0);
  });

  it('te zwaar bij lichaamsgewicht → lichtere variant', () => {
    const p = run('push-up', [0], [exp('push-up', 0, [5, 4, 4], 'hard')]);
    expect(p.switchTo).toBe('incline-push-up');
  });
});

describe('deload en dagvorm', () => {
  it('deload: helft van de sets en ±10% lichter', () => {
    const d = deloadPrescription(presc('db-bench', 12, { sets: 3, targetReps: 11 }), gymDb);
    expect(d.sets).toBe(2);
    expect(d.load).toBe(10);
    expect(d.change).toBe('deload');
  });

  it('oranje: 1 set minder en geen gewicht omhoog', () => {
    const l = lighterPrescription(presc('db-bench', 12, { sets: 3, change: 'load_up' }), 10);
    expect(l.sets).toBe(2);
    expect(l.load).toBe(10);
    expect(l.change).toBe('lighter');
  });
});

describe('stagnatie', () => {
  it('3 trainingen zonder betere 1RM = stagnatie', () => {
    const h = [
      exp('db-bench', 12, [10, 10, 10], 'good', {}, '2026-10-01'),
      exp('db-bench', 12, [10, 9, 9], 'good', {}, '2026-10-05'),
      exp('db-bench', 12, [9, 9, 9], 'hard', {}, '2026-10-08'),
      exp('db-bench', 12, [10, 9, 8], 'hard', {}, '2026-10-12'),
    ];
    expect(isStagnating(h)).toBe(true);
    expect(isStagnating(h.slice(0, 3))).toBe(false);
  });

  it('een stap op de ladder is wel vooruitgang', () => {
    const h = [
      exp('rdl-db', 9.5, [12, 12, 12], 'good', {}, '2026-10-01'),
      exp('rdl-db', 9.5, [12, 12, 12], 'good', { stage: 1 }, '2026-10-05'),
      exp('rdl-db', 9.5, [12, 12, 12], 'good', { stage: 2 }, '2026-10-08'),
      exp('rdl-db', 9.5, [12, 12, 12], 'good', { stage: 2 }, '2026-10-12'),
    ];
    expect(isStagnating(h)).toBe(false);
  });

  it('e1RM volgens Epley', () => {
    expect(e1rm(100, 10)).toBeCloseTo(133.33, 1);
    expect(e1rm(0, 12)).toBe(12);
  });
});

describe('exposures', () => {
  it('haalt enkel krachtsessies met gedane sets op, gesorteerd', () => {
    const sessions: SessionLog[] = [
      { id: 'b', date: '2026-11-05', kind: 'strength', source: 'app', exercises: [exp('db-bench', 10, [10], 'good').log] },
      { id: 'a', date: '2026-11-02', kind: 'strength', source: 'app', exercises: [exp('db-bench', 8, [10], 'good').log] },
      { id: 'c', date: '2026-11-03', kind: 'cardio', source: 'watch', exercises: [] },
    ];
    expect(exposures(sessions, 'db-bench').map((e) => e.date)).toEqual(['2026-11-02', '2026-11-05']);
  });
});
