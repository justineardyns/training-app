import { templateTitle, type PlannedExercise, type Role, type StrengthSession } from '../coach/session.ts';
import type { Feel, ISODate, Location, Minutes, Prescription, ReadinessLevel, SessionLog, SetLog, Template } from '../coach/types.ts';

// Status van een lopende training. Pure functies: makkelijk te testen en te bewaren (crash-proof).

export interface WorkoutItem {
  exerciseId: string;
  role: Role;
  superset?: string;
  options: number[];
  prescription: Prescription;
  sets: SetLog[];
  feel?: Feel;
  swappedFrom?: string;
  injuryNote?: string;
}

export interface RestState {
  startedAt: number;
  until: number;
}

export interface WorkoutState {
  id: string;
  date: ISODate;
  template: Template;
  location: Location;
  minutes: Minutes;
  startedAt: string;
  readiness?: ReadinessLevel;
  deload: boolean;
  items: WorkoutItem[];
  /** Index van het huidige item (bij een superset: het eerste van het paar). */
  index: number;
  rest?: RestState;
  /** Afsluiter na de laatste oefening (enkel bij 60 min, groen). */
  finisher?: { title: string; steps: string[] };
  /** Opwarming gedaan of overgeslagen. */
  warmupDone?: boolean;
}

export function itemFromPlanned(p: PlannedExercise): WorkoutItem {
  return {
    exerciseId: p.exercise.id,
    role: p.role,
    superset: p.superset,
    options: p.options,
    prescription: p.prescription,
    sets: Array.from({ length: p.prescription.sets }, () => ({ load: p.prescription.load, reps: p.prescription.targetReps, done: false })),
    swappedFrom: p.replacedFrom,
    injuryNote: p.injuryNote,
  };
}

export function startWorkout(s: StrengthSession, meta: { id: string; now: Date; readiness?: ReadinessLevel }): WorkoutState {
  return {
    id: meta.id,
    date: s.date,
    template: s.template,
    location: s.location,
    minutes: s.minutes,
    startedAt: meta.now.toISOString(),
    readiness: meta.readiness,
    deload: s.deload,
    items: s.exercises.map(itemFromPlanned),
    index: 0,
    finisher: s.finisher,
  };
}

/** Items die samen op het scherm staan (superset-paar of één oefening). */
export function currentGroup(w: WorkoutState): number[] {
  const first = w.items[w.index];
  if (!first) return [];
  const group = first.superset?.slice(0, 1);
  if (!group) return [w.index];
  const out: number[] = [];
  for (let i = w.index; i < w.items.length && w.items[i]!.superset?.slice(0, 1) === group; i++) out.push(i);
  return out;
}

const update = (w: WorkoutState, i: number, fn: (it: WorkoutItem) => WorkoutItem): WorkoutState => ({
  ...w,
  items: w.items.map((it, j) => (j === i ? fn(it) : it)),
});

/** Gewicht kiezen: geldt voor deze set en de volgende sets die nog niet gedaan zijn. */
export function setLoad(w: WorkoutState, i: number, setIdx: number, load: number): WorkoutState {
  return update(w, i, (it) => ({
    ...it,
    sets: it.sets.map((s, k) => (k === setIdx || (k > setIdx && !s.done) ? { ...s, load } : s)),
  }));
}

/** Hetzelfde gewicht voor alle sets van deze oefening (ook de gedane: je zegt achteraf wat je nam). */
export function setItemLoad(w: WorkoutState, i: number, load: number): WorkoutState {
  return update(w, i, (it) => ({ ...it, sets: it.sets.map((s) => ({ ...s, load })) }));
}

/**
 * Oefening afsluiten met één tik: "gelukt" (voorgesteld gewicht), of je nam meer/minder (gewicht erbij).
 * Bij een ander gewicht telt dat als "goed" op dat gewicht: de volgende keer start je daar.
 */
export function finishItem(w: WorkoutState, i: number, feel: Feel, load?: number): WorkoutState {
  let next = load === undefined ? w : setItemLoad(w, i, load);
  next = setFeel(next, i, feel);
  const ready = groupDone(next) && currentGroup(next).every((g) => next.items[g]!.feel);
  return ready ? nextGroup(next) : next;
}

export function adjustReps(w: WorkoutState, i: number, setIdx: number, delta: number): WorkoutState {
  return update(w, i, (it) => ({
    ...it,
    sets: it.sets.map((s, k) => (k === setIdx ? { ...s, reps: Math.max(0, Math.min(99, s.reps + delta)) } : s)),
  }));
}

export function addSet(w: WorkoutState, i: number): WorkoutState {
  return update(w, i, (it) => {
    const last = it.sets.at(-1) ?? { load: it.prescription.load, reps: it.prescription.targetReps, done: false };
    return { ...it, sets: [...it.sets, { load: last.load, reps: it.prescription.targetReps, done: false }] };
  });
}

/**
 * Set afvinken. Rust start automatisch, behalve tussen de twee oefeningen van een superset
 * (dan meteen door naar de partner).
 */
export function completeSet(w: WorkoutState, i: number, setIdx: number, now: number): WorkoutState {
  let next = update(w, i, (it) => ({ ...it, sets: it.sets.map((s, k) => (k === setIdx ? { ...s, done: true } : s)) }));
  const item = next.items[i]!;
  const group = currentGroup(next);
  const pos = group.indexOf(i);
  const partner = pos >= 0 && pos < group.length - 1 ? next.items[group[pos + 1]!] : undefined;
  const partnerPending = partner && partner.sets[setIdx] && !partner.sets[setIdx]!.done;
  const allDone = group.every((g) => next.items[g]!.sets.every((s) => s.done));
  if (!partnerPending && !allDone) {
    next = { ...next, rest: { startedAt: now, until: now + item.prescription.restSec * 1000 } };
  } else if (allDone) {
    next = { ...next, rest: undefined };
  }
  return next;
}

export function undoSet(w: WorkoutState, i: number, setIdx: number): WorkoutState {
  return update(w, i, (it) => ({ ...it, sets: it.sets.map((s, k) => (k === setIdx ? { ...s, done: false } : s)) }));
}

export function setFeel(w: WorkoutState, i: number, feel: Feel): WorkoutState {
  return update(w, i, (it) => ({ ...it, feel }));
}

export function extendRest(w: WorkoutState, seconds: number): WorkoutState {
  return w.rest ? { ...w, rest: { ...w.rest, until: w.rest.until + seconds * 1000 } } : w;
}

export function skipRest(w: WorkoutState): WorkoutState {
  return { ...w, rest: undefined };
}

export function groupDone(w: WorkoutState): boolean {
  return currentGroup(w).every((i) => w.items[i]!.sets.every((s) => s.done));
}

export function groupNeedsFeel(w: WorkoutState): number[] {
  return currentGroup(w).filter((i) => !w.items[i]!.feel && w.items[i]!.sets.some((s) => s.done));
}

export function nextGroup(w: WorkoutState): WorkoutState {
  const g = currentGroup(w);
  return { ...w, index: Math.min(w.items.length, (g.at(-1) ?? w.index) + 1), rest: undefined };
}

export function prevGroup(w: WorkoutState): WorkoutState {
  if (w.index === 0) return w;
  const prevItem = w.items[w.index - 1]!;
  const group = prevItem.superset?.slice(0, 1);
  let idx = w.index - 1;
  while (group && idx > 0 && w.items[idx - 1]!.superset?.slice(0, 1) === group) idx--;
  return { ...w, index: idx, rest: undefined };
}

export function isFinished(w: WorkoutState): boolean {
  return w.index >= w.items.length;
}

/**
 * "Toestel bezet": wissel naar een alternatief. Al gedane sets blijven bij de oorspronkelijke
 * oefening; de resterende sets gaan naar het alternatief.
 */
export function swapItem(w: WorkoutState, i: number, alt: PlannedExercise): WorkoutState {
  const it = w.items[i]!;
  const doneSets = it.sets.filter((s) => s.done);
  const remaining = it.sets.length - doneSets.length;
  const replacement: WorkoutItem = {
    ...itemFromPlanned(alt),
    superset: it.superset,
    swappedFrom: it.exerciseId,
  };
  replacement.sets = Array.from({ length: Math.max(1, remaining) }, () => ({
    load: alt.prescription.load,
    reps: alt.prescription.targetReps,
    done: false,
  }));
  replacement.prescription = { ...replacement.prescription, sets: replacement.sets.length };
  const items = [...w.items];
  if (doneSets.length === 0) items.splice(i, 1, replacement);
  else items.splice(i, 1, { ...it, sets: doneSets, feel: it.feel ?? 'good', superset: undefined }, replacement);
  return { ...w, items, index: doneSets.length === 0 ? w.index : i + 1, rest: undefined };
}

export function toSessionLog(w: WorkoutState, endedAt: Date): SessionLog {
  return {
    id: w.id,
    date: w.date,
    kind: 'strength',
    template: w.template,
    location: w.location,
    startedAt: w.startedAt,
    endedAt: endedAt.toISOString(),
    deload: w.deload,
    readiness: w.readiness,
    source: 'app',
    title: templateTitle(w.template),
    durationMin: Math.round((endedAt.getTime() - new Date(w.startedAt).getTime()) / 60000),
    exercises: w.items
      .filter((it) => it.sets.some((s) => s.done))
      .map((it) => ({
        exerciseId: it.exerciseId,
        prescription: it.prescription,
        sets: it.sets,
        feel: it.feel,
        swappedFrom: it.swappedFrom,
      })),
  };
}

export function summary(w: WorkoutState): { sets: number; volume: number; exercises: number } {
  const done = w.items.flatMap((it) => it.sets.filter((s) => s.done).map((s) => ({ ...s, pair: it.prescription })));
  return {
    sets: done.length,
    volume: Math.round(done.reduce((a, s) => a + s.load * s.reps, 0)),
    exercises: w.items.filter((it) => it.sets.some((s) => s.done)).length,
  };
}
