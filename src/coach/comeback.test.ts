import { describe, expect, it } from 'vitest';
import { comebackLeft } from './comeback.ts';
import type { SessionLog } from './types.ts';

const s = (date: string, kind: SessionLog['kind'] = 'strength'): SessionLog => ({ id: date, date, kind, source: 'app', exercises: [] });

describe('terug na een pauze', () => {
  it('geen geschiedenis of geen pauze: gewoon', () => {
    expect(comebackLeft([], '2026-11-23')).toBe(0);
    expect(comebackLeft([s('2026-11-16'), s('2026-11-19')], '2026-11-23')).toBe(0);
  });

  it('10+ dagen geen kracht: je volgende 2 trainingen zijn lichter, daarna weer gewoon', () => {
    const before = [s('2026-11-02'), s('2026-11-05')];
    expect(comebackLeft(before, '2026-11-15')).toBe(2);
    expect(comebackLeft([...before, s('2026-11-16')], '2026-11-18')).toBe(1);
    expect(comebackLeft([...before, s('2026-11-16'), s('2026-11-18')], '2026-11-20')).toBe(0);
  });

  it('enkel kracht telt (lessen tijdens je pauze tellen niet als krachttraining)', () => {
    expect(comebackLeft([s('2026-11-02'), s('2026-11-10', 'class')], '2026-11-14')).toBe(2);
  });
});

describe('terug na een pauze in je plan en je training', () => {
  it('de eerste 2 krachttrainingen na 10+ dagen zijn ±10% lichter', async () => {
    const { planWeek, DEFAULT_PREFS } = await import('./planner.ts');
    const { defaultDay } = await import('./availability.ts');
    const { buildStrengthSession } = await import('./session.ts');
    const { DEFAULT_HOME } = await import('./loads.ts');
    const log = (date: string): SessionLog => ({
      id: date, date, kind: 'strength', template: 'A', location: 'gym', source: 'app',
      exercises: [{ exerciseId: 'leg-press', feel: 'good', prescription: { exerciseId: 'leg-press', sets: 3, repRange: [10, 15], targetReps: 12, load: 60, restSec: 90, stage: 0, change: 'same', note: '' }, sets: [12, 12, 12].map((r) => ({ load: 60, reps: r, done: true })) }],
    });
    const history = [log('2026-10-26'), log('2026-10-29'), log('2026-11-02')];
    const p = planWeek({ today: '2026-11-23', availability: (d) => defaultDay(d, 45), history, prefs: { ...DEFAULT_PREFS, experience: 'returning' } });
    const strength = p.days.filter((d) => d.type === 'strength');
    expect(strength.slice(0, 2).every((d) => d.comeback)).toBe(true);
    expect(strength.slice(2).some((d) => d.comeback)).toBe(false);
    const s = buildStrengthSession({ date: '2026-11-23', template: 'A', location: 'gym', minutes: 45, history, equipment: DEFAULT_HOME, comeback: true });
    const lp = s.exercises.find((e) => e.exercise.id === 'leg-press')!;
    expect(lp.prescription.load).toBeLessThanOrEqual(54);
    expect(lp.prescription.note).toMatch(/Terug na je pauze/);
  });
});
