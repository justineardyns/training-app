import { describe, expect, it } from 'vitest';
import { classifyWorkout, integrateWorkouts, mergeDays, parseDate, parseInbox, parseNumber, summarize } from './health.ts';
import type { SessionLog } from './types.ts';

// Wat de Opdracht "Training Sync" uploadt (ISO-datums, zoals in de handleiding).
const INBOX = `
#SLAAP_WAARDE
In bed
Kern
Diep
REM
Wakker
Kern
#SLAAP_START
2026-11-22T23:05:00+01:00
2026-11-22T23:20:00+01:00
2026-11-23T01:00:00+01:00
2026-11-23T03:00:00+01:00
2026-11-23T04:00:00+01:00
2026-11-23T04:10:00+01:00
#SLAAP_EINDE
2026-11-23T07:00:00+01:00
2026-11-23T01:00:00+01:00
2026-11-23T03:00:00+01:00
2026-11-23T04:00:00+01:00
2026-11-23T04:10:00+01:00
2026-11-23T06:50:00+01:00
#HRV_WAARDE
52
48,5
70
#HRV_START
2026-11-23T02:00:00+01:00
2026-11-23T05:00:00+01:00
2026-11-23T15:00:00+01:00
#RUST_WAARDE
54
#RUST_START
2026-11-23T00:00:00+01:00
#STAPPEN_WAARDE
1.200
800
1500
#STAPPEN_START
2026-11-23T09:00:00+01:00
2026-11-23T12:00:00+01:00
2026-11-23T09:00:00+01:00
#STAPPEN_BRON
iPhone van Jij
iPhone van Jij
Apple Watch van Jij
#HARTSLAG_WAARDE
95
140
150
70
#HARTSLAG_START
2026-11-23T18:05:00+01:00
2026-11-23T18:20:00+01:00
2026-11-23T18:40:00+01:00
2026-11-23T20:00:00+01:00
#WORKOUT_TYPE
Indoor fietsen
Wandelen
#WORKOUT_START
2026-11-23T18:00:00+01:00
2026-11-23T12:00:00+01:00
#WORKOUT_EINDE
2026-11-23T18:45:00+01:00
2026-11-23T12:40:00+01:00
`;

describe('Health-export inlezen', () => {
  it('getallen met komma, punt en eenheden', () => {
    expect(parseNumber('48,5')).toBe(48.5);
    expect(parseNumber('45 ms')).toBe(45);
    expect(parseNumber('1.234')).toBe(1234);
    expect(parseNumber('62.5')).toBe(62.5);
    expect(parseNumber('abc')).toBeUndefined();
  });

  it('datums in ISO en in de iOS-notatie (NL/EN)', () => {
    expect(parseDate('2026-11-23T07:00:00+01:00')?.toISOString()).toBe('2026-11-23T06:00:00.000Z');
    const nl = parseDate('23 nov. 2026 om 07:05')!;
    expect([nl.getFullYear(), nl.getMonth(), nl.getDate(), nl.getHours(), nl.getMinutes()]).toEqual([2026, 10, 23, 7, 5]);
    const en = parseDate('Nov 23, 2026 at 12:15 PM')!;
    expect([en.getMonth(), en.getHours()]).toEqual([10, 12]);
    const short = parseDate('23/11/2026 07:05')!;
    expect([short.getDate(), short.getMonth(), short.getHours()]).toEqual([23, 10, 7]);
    expect(parseDate('morgen')).toBeUndefined();
  });

  it('leest alle secties', () => {
    const d = parseInbox(INBOX);
    expect(d.sleep).toHaveLength(6);
    expect(d.hrv.map((x) => x.value)).toEqual([52, 48.5, 70]);
    expect(d.workouts.map((w) => w.type)).toEqual(['Indoor fietsen', 'Wandelen']);
    expect(d.skipped).toBe(0);
  });
});

describe('samenvatten per dag', () => {
  const { days, workouts } = summarize(parseInbox(INBOX));
  const day = days.find((d) => d.date === '2026-11-23')!;

  it('slaap = enkel slapend, overlap niet dubbel, wakker eruit', () => {
    // 23:20–04:00 (4u40) + 04:10–06:50 (2u40) = 7u20
    expect(day.sleepHours).toBe(7.3);
  });

  it('HRV = gemiddelde van de nachtmetingen', () => {
    expect(day.hrvMs).toBe(50.3);
  });

  it('rusthartslag en stappen (hoogste bron, niet dubbel)', () => {
    expect(day.restingHr).toBe(54);
    expect(day.steps).toBe(2000);
  });

  it('workouts met duur en hartslag tijdens de workout', () => {
    const bike = workouts.find((w) => w.type === 'Indoor fietsen')!;
    expect(bike).toMatchObject({ durationMin: 45, avgHr: 128, maxHr: 150 });
  });

  it('stappen worden nooit verlaagd door een gedeeltelijke export', () => {
    expect(mergeDays([{ date: '2026-11-22', steps: 9000 }], [{ date: '2026-11-22', steps: 3000 }])[0]!.steps).toBe(9000);
  });

  it('nieuwere waarden vullen aan', () => {
    const merged = mergeDays([{ date: '2026-11-23', steps: 500, sleepHours: 7 }], [{ date: '2026-11-23', steps: 6000 }]);
    expect(merged).toEqual([{ date: '2026-11-23', steps: 6000, sleepHours: 7 }]);
  });
});

describe('Watch-workouts als sessies', () => {
  const { workouts } = summarize(parseInbox(INBOX));

  it('herkent soorten (NL en EN)', () => {
    expect(classifyWorkout('Indoor fietsen')).toBe('class');
    expect(classifyWorkout('Indoor Cycling')).toBe('class');
    expect(classifyWorkout('Traditionele krachttraining')).toBe('strength');
    expect(classifyWorkout('Functional Strength Training')).toBe('strength');
    expect(classifyWorkout('Wandelen')).toBe('light');
    expect(classifyWorkout('Hardlopen')).toBe('cardio');
  });

  it('groepsles telt automatisch, wandeling niet', () => {
    const out = integrateWorkouts([], workouts);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: '2026-11-23', kind: 'class', source: 'watch', durationMin: 45, avgHr: 128 });
  });

  it('idempotent: twee keer verwerken geeft geen dubbele sessie', () => {
    const once = integrateWorkouts([], workouts);
    expect(integrateWorkouts(once, workouts)).toHaveLength(1);
  });

  it('vult een snel gelogde groepsles aan in plaats van te verdubbelen', () => {
    const manual: SessionLog = { id: 'm', date: '2026-11-23', kind: 'class', source: 'app', title: 'Groepsles', durationMin: 45, exercises: [] };
    const out = integrateWorkouts([manual], workouts);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'm', avgHr: 128, workoutType: 'Indoor fietsen' });
  });

  it('krachttraining op de Watch koppelt duur en hartslag aan je app-sessie', () => {
    const app: SessionLog = { id: 'a', date: '2026-11-23', kind: 'strength', source: 'app', startedAt: '2026-11-23T17:02:00Z', exercises: [] };
    const w = [{ id: 'x', type: 'Traditionele krachttraining', start: '2026-11-23T17:00:00Z', end: '2026-11-23T17:50:00Z', durationMin: 50, avgHr: 118, maxHr: 160 }];
    const out = integrateWorkouts([app], w);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'a', durationMin: 50, avgHr: 118, maxHr: 160, workoutId: 'x' });
  });

  it('krachttraining enkel op de Watch telt ook', () => {
    const w = [{ id: 'y', type: 'Functional Strength Training', start: '2026-11-24T17:00:00Z', end: '2026-11-24T17:40:00Z', durationMin: 40 }];
    expect(integrateWorkouts([], w)[0]).toMatchObject({ kind: 'strength', source: 'watch', date: '2026-11-24' });
  });

  it('te korte workouts tellen niet', () => {
    const w = [{ id: 'z', type: 'Hardlopen', start: '2026-11-24T17:00:00Z', end: '2026-11-24T17:08:00Z', durationMin: 8 }];
    expect(integrateWorkouts([], w)).toHaveLength(0);
  });
});
