import { EXERCISES, getExercise } from './catalog.ts';
import { addDays, weekStart } from './dates.ts';
import { bestE1rm, e1rm, exposures, workingLoad } from './progression.ts';
import type { ExerciseLog, ISODate, SessionLog } from './types.ts';

// Doelen: je weekdoel (bv. 3× per week minstens een half uur in Jims) en persoonlijke doelen per oefening
// (bv. leg press 60 kg × 10). De coach stelt ze voor: één tik, niets typen.

export interface WeekGoal {
  sessions: number;
  minutes: number;
}
export const DEFAULT_WEEK_GOAL: WeekGoal = { sessions: 3, minutes: 30 };

export interface Goal {
  id: string;
  exerciseId: string;
  /** 0 bij lichaamsgewicht. */
  load: number;
  reps: number;
  createdOn: ISODate;
}

const SWEAT = new Set(['strength', 'cardio', 'class']);
const isTennis = (s: SessionLog) => /tennis/i.test(`${s.title ?? ''} ${s.workoutType ?? ''}`);

/** Minuten van een sessie (gelogde duur, of uit start/einde). */
function minutesOf(s: SessionLog): number | undefined {
  if (s.durationMin !== undefined) return s.durationMin;
  if (s.startedAt && s.endedAt) return Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 60000);
  return s.kind === 'class' ? 60 : undefined;
}

/** Telt mee voor je weekdoel: een training in Jims van (bijna) de gevraagde duur (5 min marge). */
export function countsForWeekGoal(s: SessionLog, goal: WeekGoal): boolean {
  if (!SWEAT.has(s.kind) || isTennis(s)) return false;
  if (s.location && s.location !== 'gym') return false;
  const min = minutesOf(s);
  return min === undefined || min >= goal.minutes - 5;
}

export interface WeekGoalProgress {
  done: number;
  target: number;
  reached: boolean;
}

/** Deze kalenderweek (ma–zo) tot en met vandaag. Eén training per dag telt. */
export function weekGoalProgress(history: SessionLog[], today: ISODate, goal: WeekGoal = DEFAULT_WEEK_GOAL): WeekGoalProgress {
  const monday = weekStart(today);
  const days = new Set(history.filter((s) => s.date >= monday && s.date <= today && countsForWeekGoal(s, goal)).map((s) => s.date));
  return { done: days.size, target: goal.sessions, reached: days.size >= goal.sessions };
}

/** Hoeveel weken op rij je weekdoel haalde (deze week telt mee zodra hij gehaald is). */
export function weekGoalStreak(history: SessionLog[], today: ISODate, goal: WeekGoal = DEFAULT_WEEK_GOAL): number {
  let n = weekGoalProgress(history, today, goal).reached ? 1 : 0;
  for (let m = addDays(weekStart(today), -7); ; m = addDays(m, -7)) {
    if (!weekGoalProgress(history, addDays(m, 6), goal).reached) break;
    n++;
  }
  return n;
}

const doneSets = (l: ExerciseLog) => l.sets.filter((x) => x.done && x.reps > 0);

/** Wanneer je een doel haalde: een gedane set met minstens dat gewicht en die reps (na het kiezen). */
export function goalReachedOn(goal: Goal, history: SessionLog[]): ISODate | undefined {
  for (const e of exposures(history, goal.exerciseId)) {
    if (e.date < goal.createdOn) continue;
    if (doneSets(e.log).some((x) => x.load >= goal.load - 1e-9 && x.reps >= goal.reps)) return e.date;
  }
  return undefined;
}

/** Hoe dicht je bij een doel zit (0–1), op basis van je beste set. */
export function goalProgress(goal: Goal, history: SessionLog[]): number {
  const best = Math.max(0, ...exposures(history, goal.exerciseId).map((e) => bestE1rm(e.log)));
  const target = e1rm(goal.load, goal.reps);
  return target > 0 ? Math.max(0, Math.min(1, best / target)) : 0;
}

/** Mooi rond doelgewicht boven je werkgewicht: +±20%, afgerond naar boven (5 kg toestel/stang, 2 kg dumbbell). */
function niceTarget(load: number, kind: string): number {
  const step = kind === 'db_pair' || kind === 'db_single' || kind === 'kb' ? 2 : 5;
  return Math.max(load + step, Math.ceil((load * 1.2) / step) * step);
}

/** Tot 3 voorstellen: je meest gedane oefeningen zonder lopend doel. */
export function suggestGoals(history: SessionLog[], active: Goal[], today: ISODate): Omit<Goal, 'id'>[] {
  const taken = new Set(active.map((g) => g.exerciseId));
  const count = new Map<string, number>();
  for (const s of history) if (s.kind === 'strength') for (const e of s.exercises) if (doneSets(e).length) count.set(e.exerciseId, (count.get(e.exerciseId) ?? 0) + 1);
  return [...count]
    .filter(([id, n]) => n >= 2 && !taken.has(id) && EXERCISES.has(id) && !getExercise(id).prehab && !getExercise(id).timed)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => {
      const ex = getExercise(id);
      const last = exposures(history, id).at(-1)!.log;
      if (ex.load === 'bodyweight') {
        const best = Math.max(...doneSets(last).map((x) => x.reps));
        return { exerciseId: id, load: 0, reps: Math.ceil((best + 3) / 5) * 5, createdOn: today };
      }
      return { exerciseId: id, load: niceTarget(workingLoad(last), ex.load), reps: ex.repRange[0] + 2, createdOn: today };
    });
}

/** Nieuw record: beter dan elke vorige keer op deze oefening (de eerste keer telt niet). */
export function isRecord(log: Pick<ExerciseLog, 'exerciseId' | 'sets'>, history: SessionLog[]): boolean {
  const prev = exposures(history, log.exerciseId);
  if (!prev.length) return false;
  const best = Math.max(...prev.map((e) => bestE1rm(e.log)));
  return bestE1rm(log as ExerciseLog) > best + 1e-9;
}
