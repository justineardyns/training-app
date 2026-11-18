import { describe, expect, it } from 'vitest';
import { addDays } from './dates.ts';
import { defaultDay } from './availability.ts';
import { DEFAULT_PREFS, planWeek } from './planner.ts';
import { buildReport, coachMessage, reportMarkdown, streakWeeks } from './report.ts';
import type { ExerciseLog, SessionLog } from './types.ts';

const MON = '2026-11-16';

function ex(id: string, load: number, reps: number[]): ExerciseLog {
  return {
    exerciseId: id,
    prescription: { exerciseId: id, sets: reps.length, repRange: [8, 12], targetReps: 8, load, restSec: 90, stage: 0, change: 'same', note: '' },
    sets: reps.map((r) => ({ load, reps: r, done: true })),
  };
}
const strength = (date: string, exercises: ExerciseLog[], template: 'A' | 'B' = 'A'): SessionLog => ({ id: date, date, kind: 'strength', template, source: 'app', location: 'gym', exercises });
const klass = (date: string, min: number): SessionLog => ({ id: `c${date}`, date, kind: 'class', source: 'watch', workoutType: 'Indoor Cycling', durationMin: min, exercises: [] });

const history: SessionLog[] = [
  strength(addDays(MON, -14), [ex('db-bench', 10, [10, 10, 10])]),
  strength(addDays(MON, -12), [ex('leg-press', 60, [12, 12, 12])], 'B'),
  strength(addDays(MON, -7), [ex('db-bench', 10, [12, 12, 11])]),
  klass(addDays(MON, -5), 45),
  strength(MON, [ex('db-bench', 12, [9, 8, 8]), ex('rdl-db', 10, [10, 10, 10])]),
  klass(addDays(MON, 2), 50),
  strength(addDays(MON, 4), [ex('leg-press', 70, [12, 12, 12])], 'B'),
];

// Dagvorm-tikken: deze week 2× oranje → coach zegt iets over rust.
const checks = [
  { date: MON, level: 'green' as const },
  { date: addDays(MON, 2), level: 'orange' as const },
  { date: addDays(MON, 4), level: 'orange' as const },
  { date: addDays(MON, -5), level: 'red' as const },
];

describe('weekrapport', () => {
  const r = buildReport({ monday: MON, history, checks, planned: 3 });

  it('gepland vs gedaan', () => {
    expect(r).toMatchObject({ week: '2026-W47', planned: 3, done: 3, strength: 2, cardio: 1 });
  });

  it('vindt kracht-PR\'s t.o.v. alles daarvoor', () => {
    // db-bench: 12 kg × 9 → 1RM 15,6 > 10 kg × 12 → 14. rdl-db is nieuw (geen vergelijking) → geen PR.
    expect(r.prs.map((p) => p.exerciseId).sort()).toEqual(['db-bench', 'leg-press']);
    const bench = r.prs.find((p) => p.exerciseId === 'db-bench')!;
    expect(bench.value).toBeCloseTo(15.6, 1);
    expect(bench.previous).toBeCloseTo(14, 1);
  });

  it('volume per spiergroep (hoofdspier 1, rest 0,5)', () => {
    expect(r.volume.quadriceps).toBe(3);
    expect(r.volume.borst).toBe(3);
    expect(r.volume.hamstrings).toBe(3);
  });

  it('cardiominuten van lessen en cardio', () => {
    expect(r.cardioMinutes).toBe(50);
  });

  it('dagvorm van de week (jouw tikken), met een eerlijk woordje bij vaak moe', () => {
    expect(r.readiness).toEqual({ green: 1, orange: 2, red: 0 });
    expect(r.message).toMatch(/vaak moe/);
    expect(reportMarkdown(r)).toMatch(/Dagvorm: 1× groen · 2× oranje · 0× rood/);
  });

  it('streak: weken op rij met minstens 2 sessies', () => {
    expect(streakWeeks(history, MON)).toBe(3);
    expect(r.streak).toBe(3);
  });

  it('1RM-trend voor je meest gedane oefeningen', () => {
    const bench = r.trend.find((t) => t.exerciseId === 'db-bench')!;
    expect(bench.points.map((p) => p.week)).toEqual(['2026-W45', '2026-W46', '2026-W47']);
  });

  it('markdown bevat de kern', () => {
    const md = reportMarkdown(r);
    expect(md).toMatch(/^# Weekrapport 2026-W47/);
    expect(md).toMatch(/\*\*3\/3\*\* gedaan/);
    expect(md).toMatch(/Leg press/);
  });

  it('plan voor volgende week zit erbij', () => {
    const next = planWeek({ today: addDays(MON, 6), start: addDays(MON, 7), availability: (d) => defaultDay(d, 45), history, prefs: DEFAULT_PREFS });
    const withNext = buildReport({ monday: MON, history, checks, planned: 3, nextWeek: next });
    expect(withNext.nextWeek).toHaveLength(7);
    expect(reportMarkdown(withNext)).toMatch(/## Volgende week/);
  });
});

describe('coachboodschap', () => {
  it('tussenstand tijdens de week, geen oordeel', () => {
    const r = buildReport({ monday: MON, history, checks, planned: 3, today: addDays(MON, 4) });
    expect(r.inProgress).toBe(true);
    expect(r.message).toMatch(/^Weekdoel al gehaald|^Tussenstand/);
    const early = buildReport({ monday: MON, history: [], checks: [], planned: 3, today: addDays(MON, 1) });
    expect(early.message).toMatch(/Tussenstand: 0\/3\. Nog 3 sessies/);
  });

  const base = buildReport({ monday: MON, history: [], checks: [], planned: 3 });
  it('eerlijk bij te weinig', () => {
    expect(coachMessage({ ...base, done: 1, planned: 3 })).toMatch(/te weinig/);
    expect(coachMessage({ ...base, done: 2, planned: 3 })).toMatch(/net niet/);
  });
  it('positief bij alles gedaan', () => {
    expect(coachMessage({ ...base, done: 3, planned: 3 })).toMatch(/^Sterk/);
  });
  it('zonder plan', () => {
    expect(coachMessage({ ...base, done: 0, planned: 0 })).toMatch(/Agenda/);
  });
});
