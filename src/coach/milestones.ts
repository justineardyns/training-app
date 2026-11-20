import { EXERCISES } from './catalog.ts';
import { addDays, isoWeek, weekStart } from './dates.ts';
import { SWEAT_KINDS } from './planner.ts';
import { e1rm } from './progression.ts';
import type { ISODate, SessionLog } from './types.ts';

// Mijlpalen: kleine felicitaties onderweg. Pure functie van je logs (en je krachtchecks).

export interface Milestone {
  id: string;
  icon: string;
  title: string;
  text: string;
  /** Wanneer je hem haalde. */
  date: ISODate;
}

export interface NextMilestone {
  title: string;
  /** Hoeveel nog te gaan, bv. "nog 3 trainingen". */
  left: string;
}

const TRAININGS = [1, 5, 10, 25, 50, 75, 100, 150, 200, 300];
const CLASSES = [1, 5, 10, 25, 50, 100];
const STREAKS = [2, 4, 8, 12, 26, 52];
const RECORDS = [1, 10, 25, 50, 100];

const isTennis = (s: SessionLog) => /tennis/i.test(`${s.title ?? ''} ${s.workoutType ?? ''}`);

/** Datum waarop de n-de (1-gebaseerd) uit een gesorteerde lijst gehaald werd. */
const nth = <T extends { date: ISODate }>(list: T[], n: number) => list[n - 1]?.date;

/** Alle sessies waarin je een record zette (beter dan alles daarvoor op die oefening). */
export function recordDates(history: SessionLog[]): ISODate[] {
  const best = new Map<string, number>();
  const out: ISODate[] = [];
  for (const s of [...history].filter((x) => x.kind === 'strength').sort((a, b) => (a.date < b.date ? -1 : 1))) {
    for (const e of s.exercises) {
      const v = Math.max(0, ...e.sets.filter((x) => x.done && x.reps > 0).map((x) => e1rm(x.load, x.reps)));
      if (v <= 0) continue;
      const prev = best.get(e.exerciseId);
      if (prev !== undefined && v > prev + 1e-9) out.push(s.date);
      if (prev === undefined || v > prev) best.set(e.exerciseId, v);
    }
  }
  return out;
}

/** Weken op rij (tot en met de week van `date`) met minstens 3 trainingen. */
function streakAt(weeks: Map<string, number>, monday: ISODate): number {
  let n = 0;
  for (let m = monday; (weeks.get(isoWeek(m)) ?? 0) >= 3; m = addDays(m, -7)) n++;
  return n;
}

export function milestones(history: SessionLog[], extra: Milestone[] = []): Milestone[] {
  const sweat = history.filter((s) => SWEAT_KINDS.has(s.kind)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: Milestone[] = [];

  for (const n of TRAININGS) {
    const date = nth(sweat, n);
    if (!date) break;
    out.push({
      id: `trainingen-${n}`,
      icon: n === 1 ? '🚀' : '🎉',
      title: n === 1 ? 'Je eerste training!' : `${n} trainingen`,
      text: n === 1 ? 'De moeilijkste is gedaan: begonnen. Zo bouw je het op.' : `Al ${n} keer gegaan. Zo bouw je resultaat op.`,
      date,
    });
  }

  const classes = sweat.filter((s) => s.kind === 'class');
  for (const n of CLASSES) {
    const date = nth(classes, n);
    if (!date) break;
    out.push({ id: `lessen-${n}`, icon: '🚴', title: n === 1 ? 'Je eerste les indoor cycling' : `${n} lessen indoor cycling`, text: 'Je conditie gaat erop vooruit.', date });
  }

  const tennis = sweat.filter(isTennis);
  if (tennis.length >= 10) out.push({ id: 'tennis-10', icon: '🎾', title: '10 keer tennis', text: 'Tennis en kracht samen: sterke combinatie.', date: tennis[9]!.date });

  const records = recordDates(history);
  for (const n of RECORDS) {
    const date = records[n - 1];
    if (!date) break;
    out.push({
      id: `records-${n}`,
      icon: '🏆',
      title: n === 1 ? 'Je eerste record' : `${n} records`,
      text: n === 1 ? 'Sterker dan ooit op een oefening. Daar train je voor.' : `${n} keer sterker dan ooit op een oefening.`,
      date,
    });
  }

  // Weken op rij met minstens 3 trainingen.
  const perWeek = new Map<string, number>();
  for (const s of sweat) perWeek.set(isoWeek(s.date), (perWeek.get(isoWeek(s.date)) ?? 0) + 1);
  const mondays = [...new Set(sweat.map((s) => weekStart(s.date)))].sort();
  const reached = new Set<number>();
  for (const m of mondays) {
    const k = streakAt(perWeek, m);
    for (const n of STREAKS) {
      if (k >= n && !reached.has(n)) {
        reached.add(n);
        const date = sweat.filter((s) => weekStart(s.date) === m)[2]!.date;
        out.push({ id: `reeks-${n}`, icon: '🔥', title: `${n} weken op rij`, text: `${n} weken na elkaar minstens 3 trainingen. Consequent!`, date });
      }
    }
  }

  return [...out, ...extra].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** De eerstvolgende mijlpaal (om naartoe te werken). */
export function nextMilestone(history: SessionLog[]): NextMilestone | undefined {
  const n = history.filter((s) => SWEAT_KINDS.has(s.kind)).length;
  const goal = TRAININGS.find((t) => t > n);
  if (!goal) return undefined;
  const left = goal - n;
  return { title: goal === 1 ? 'Je eerste training' : `${goal} trainingen`, left: `nog ${left} ${left === 1 ? 'training' : 'trainingen'}` };
}

export function exerciseName(id: string): string {
  return EXERCISES.get(id)?.name ?? id;
}
