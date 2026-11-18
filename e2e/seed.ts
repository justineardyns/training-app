// Realistische testdata (8 weken) om het rapport en de meldingen te controleren.
import { addDays, isoWeek, weekStart } from '../src/coach/dates.ts';
import { getExercise } from '../src/coach/catalog.ts';
import type { ExerciseLog, HealthDay, SessionLog } from '../src/coach/types.ts';
import { defaultProfile } from '../src/data/store.ts';

function ex(id: string, load: number, reps: number[]): ExerciseLog {
  const e = getExercise(id);
  return {
    exerciseId: id,
    feel: 'good',
    prescription: { exerciseId: id, sets: reps.length, repRange: e.repRange, targetReps: e.repRange[0], load, restSec: 90, stage: 0, change: 'same', note: '' },
    sets: reps.map((r) => ({ load, reps: r, done: true })),
  };
}

export function seedFiles(today: string): { path: string; content: unknown; dirty: boolean; updatedAt: number }[] {
  const thisMonday = weekStart(today);
  const logs = new Map<string, SessionLog[]>();
  const add = (s: SessionLog) => logs.set(isoWeek(s.date), [...(logs.get(isoWeek(s.date)) ?? []), s]);
  for (let w = 7; w >= 0; w--) {
    const mon = addDays(thisMonday, -7 * w);
    const k = 7 - w; // progressie per week
    if (mon <= today) {
      add({ id: `a${w}`, date: mon, kind: 'strength', template: 'A', location: 'gym', source: 'app', exercises: [ex('leg-press', 60 + 5 * k, [12, 12, 11]), ex('db-bench', 10 + 2 * Math.floor(k / 2), [10, 10, 9]), ex('lat-pulldown', 30 + 2.5 * k, [10, 10, 10]), ex('rdl-db', 10 + 2 * Math.floor(k / 2), [10, 10, 10])] });
    }
    const wed = addDays(mon, 2);
    if (wed < today && w !== 3) {
      add({ id: `b${w}`, date: wed, kind: 'strength', template: 'B', location: 'gym', source: 'app', exercises: [ex('hip-thrust', 40 + 5 * k, [10, 10, 10]), ex('seated-cable-row', 30 + 2.5 * k, [10, 10, 10]), ex('reverse-lunge', 6 + 2 * Math.floor(k / 3), [10, 10, 10])] });
    }
    const fri = addDays(mon, 4);
    if (fri < today) add({ id: `c${w}`, date: fri, kind: 'class', source: 'watch', title: 'Indoor fietsen', workoutType: 'Indoor fietsen', durationMin: 45, avgHr: 138, exercises: [] });
  }
  const health: HealthDay[] = [];
  for (let i = 40; i >= 0; i--) {
    const d = addDays(today, -i);
    const wobble = Math.sin(i * 1.3);
    health.push({ date: d, sleepHours: Math.round((7.2 + wobble * 0.6) * 10) / 10, hrvMs: Math.round(55 + wobble * 6 + (i < 7 ? 4 : 0)), restingHr: Math.round(56 - wobble * 2), steps: Math.round(8000 + wobble * 2500) });
  }
  const months = new Map<string, HealthDay[]>();
  for (const h of health) months.set(h.date.slice(0, 7), [...(months.get(h.date.slice(0, 7)) ?? []), h]);
  const now = Date.now();
  const files: { path: string; content: unknown; dirty: boolean; updatedAt: number }[] = [
    { path: 'data/profile.json', content: { ...defaultProfile(), setupDone: true }, dirty: false, updatedAt: now },
    ...[...logs].map(([week, sessions]) => ({ path: `data/log/${week}.json`, content: { week, sessions, checks: [], postponed: [], light: [] }, dirty: false, updatedAt: now })),
    ...[...months].map(([month, days]) => ({ path: `data/health/${month}.json`, content: { month, days, workouts: [] }, dirty: false, updatedAt: now })),
    {
      path: `reports/${isoWeek(thisMonday)}.md`,
      content: `# Weekrapport ${isoWeek(thisMonday)}\n\n> Sterke week. Je leg press gaat vlot omhoog; je bovenlichaam volgt.\n\n## Wat ik aanpas\n\n- **Dumbbell bench press**: bereik 6–10 voor meer kracht\n- Volgende week 3 sessies, zondag vrij\n\n## Focus\n\nSlaap vóór 23u op trainingsdagen.\n`,
      dirty: false,
      updatedAt: now,
    },
  ];
  return files;
}
