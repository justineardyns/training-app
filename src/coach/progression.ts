import { EXERCISES, getExercise } from './catalog.ts';
import { formatLoad, round, snapLoad, stepLoad } from './loads.ts';
import type { Exercise, ExerciseLog, ISODate, Location, Prescription, SessionLog } from './types.ts';

// Dubbele progressie: eerst reps omhoog binnen het bereik, dan gewicht omhoog en reps terug naar onder.
// Thuis, als zwaarder niet kan: extra reps → trager tempo → pauze → kortere rust → zwaardere variant.

export interface Exposure {
  date: ISODate;
  location?: Location;
  deload: boolean;
  log: ExerciseLog;
}

/** Alle keren dat je deze oefening deed, oud → nieuw. */
export function exposures(history: SessionLog[], exerciseId: string): Exposure[] {
  return history
    .filter((s) => s.kind === 'strength')
    .flatMap((s) =>
      s.exercises
        .filter((e) => e.exerciseId === exerciseId && e.sets.some((x) => x.done))
        .map((log) => ({ date: s.date, location: s.location, deload: !!s.deload, log })),
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Geschatte 1RM (Epley). Bij lichaamsgewicht: aantal reps als maat. */
export function e1rm(load: number, reps: number): number {
  if (reps <= 0) return 0;
  if (load <= 0) return reps;
  return round(load * (1 + reps / 30));
}

export function bestE1rm(log: ExerciseLog): number {
  return Math.max(0, ...log.sets.filter((s) => s.done).map((s) => e1rm(s.load, s.reps)));
}

/** Werkgewicht: zwaarste gewicht waarmee je minstens de ondergrens haalde (anders het lichtste). */
export function workingLoad(log: ExerciseLog): number {
  const done = log.sets.filter((s) => s.done);
  if (done.length === 0) return log.prescription.load;
  const lo = log.prescription.repRange[0];
  const ok = done.filter((s) => s.reps >= lo);
  return ok.length ? Math.max(...ok.map((s) => s.load)) : Math.min(...done.map((s) => s.load));
}

/** Thuisladder: wat elke stap betekent. */
export const LADDER = [
  'gewoon',
  'extra reps',
  'trager zakken (3 tellen)',
  'pauze onderaan (2 tellen)',
  'kortere rust',
] as const;
const EXTRA_REPS = 5;

export interface ProgressionInput {
  exercise: Exercise;
  /** Geldige gewichten op deze locatie. */
  options: number[];
  /** Eerdere keren voor deze oefening (oud → nieuw). */
  history: Exposure[];
  sets: number;
  restSec: number;
  repRange?: [number, number];
  /** Absolute beginner: lichter starten en eerst de beweging leren. */
  beginner?: boolean;
}

/** Absolute beginners starten op ±60% van het gewone startgewicht. */
export const BEGINNER_START = 0.6;

export interface ProgressionResult extends Prescription {
  /** Overstappen naar een zwaardere (of lichtere) variant. */
  switchTo?: string;
}

function rangeFor(stage: number, base: [number, number]): [number, number] {
  return stage === 1 ? [base[0], base[1] + EXTRA_REPS] : base;
}

function stageFields(stage: number, restSec: number): Pick<Prescription, 'tempo' | 'pauseSec' | 'restSec'> {
  return {
    tempo: stage >= 2 ? '3-1-1' : undefined,
    pauseSec: stage >= 3 ? 2 : undefined,
    restSec: stage >= 4 ? Math.max(45, restSec - 30) : restSec,
  };
}

/** Lichtere variant (de oefening die naar deze verwijst als zwaardere). */
export function easierVariant(id: string): string | undefined {
  return [...EXERCISES.values()].find((e) => e.harder === id)?.id;
}

export function nextPrescription(input: ProgressionInput): ProgressionResult {
  const { exercise: ex, options, sets } = input;
  const base: [number, number] = input.repRange ?? ex.repRange;
  const [lo, hi] = base;
  const unit = ex.timed ? 's' : ' reps';
  const all = input.history;
  const real = all.filter((h) => !h.deload);
  const last = real.at(-1) ?? all.at(-1);

  const make = (p: Partial<ProgressionResult> & Pick<Prescription, 'load' | 'targetReps' | 'change' | 'note'>): ProgressionResult => {
    const stage = p.stage ?? 0;
    return {
      exerciseId: ex.id,
      sets,
      repRange: rangeFor(stage, base),
      stage,
      ...stageFields(stage, input.restSec),
      ...p,
    };
  };

  // Eerste keer: voorzichtig starten, jij kalibreert met het draaiwiel.
  if (!last) {
    const load = ex.load === 'bodyweight' ? 0 : snapLoad(ex.start * (input.beginner ? BEGINNER_START : 1), options, input.beginner ? 'down' : 'nearest');
    const keep = input.beginner ? 3 : 2;
    // Op tijd (plank…): niet "reps over" maar stoppen voor de techniek wegvalt.
    const spare = (n: number) => (ex.timed ? 'stop voor je techniek wegvalt' : `hou ${n} reps over`);
    return make({
      load,
      targetReps: lo + 2,
      change: 'new',
      note: input.beginner
        ? ex.load === 'bodyweight'
          ? `Leer de beweging rustig: ${lo + 2}${unit}, ${spare(keep)}. Bekijk eerst de foto's.`
          : `Leer de beweging rustig en hou ${keep} reps over.`
        : ex.load === 'bodyweight'
          ? `${lo + 2}${unit} met goede techniek, ${spare(2)}.`
          : `${lo + 2}${unit} met goede techniek, hou 2 reps over.`,
    });
  }

  const prev = last.log.prescription;
  const prevStage = prev.exerciseId === ex.id ? prev.stage ?? 0 : 0;
  const [, hiEff] = rangeFor(prevStage, base);
  const done = last.log.sets.filter((s) => s.done);
  const wl = snapLoad(workingLoad(last.log), options, 'down');
  const capped = workingLoad(last.log) > wl + 1e-9; // vorig gewicht bestaat hier niet (bv. thuis lichter)
  const atLoad = done.filter((s) => Math.abs(s.load - workingLoad(last.log)) < 1e-9);
  const minReps = atLoad.length ? Math.min(...atLoad.map((s) => s.reps)) : 0;
  const allSetsDone = done.length >= prev.sets;
  const feel = last.log.feel;
  const firstTime = real.length <= 1;
  const prevReal = real.at(-2);

  const loadUp = (steps: number, why: string): ProgressionResult | null => {
    const up = stepLoad(wl, options, steps) ?? (steps > 1 ? stepLoad(wl, options, 1) : null);
    if (up === null || up <= wl) return null;
    return make({
      load: up,
      targetReps: lo,
      change: 'load_up',
      note: `${why} Gewicht omhoog: ${formatLoad(ex, wl)} → ${formatLoad(ex, up)}. Start op ${lo}${unit}.`,
    });
  };

  // Kalibratie na de eerste keer: snel naar het juiste gewicht.
  if (firstTime && feel === 'light' && ex.load !== 'bodyweight') {
    const r = loadUp(minReps >= hi ? 2 : 1, 'Vorige keer te licht.');
    if (r) return r;
  }

  // Te zwaar en onder de ondergrens.
  if (feel === 'hard' && minReps < lo) {
    const twiceHard =
      firstTime ||
      (prevReal?.log.feel === 'hard' && prevReal.log.sets.filter((s) => s.done).some((s) => s.reps < lo));
    if (twiceHard) {
      const down = stepLoad(wl, options, -1);
      if (ex.load !== 'bodyweight' && down !== null) {
        return make({
          load: down,
          targetReps: lo,
          change: 'load_down',
          note: `Twee keer te zwaar: even terug naar ${formatLoad(ex, down)}. Techniek eerst, dan bouwen we weer op.`,
        });
      }
      const easier = easierVariant(ex.id);
      if (easier) {
        return make({
          load: 0,
          targetReps: lo,
          change: 'load_down',
          switchTo: easier,
          note: `Nog te zwaar: we nemen de lichtere variant (${getExercise(easier).name}) en bouwen terug op.`,
        });
      }
    }
    return make({
      load: wl,
      targetReps: lo,
      stage: prevStage,
      change: 'same',
      note: `Zelfde gewicht, mik op ${lo}${unit} per set met strakke techniek.`,
    });
  }

  const reachedTop = allSetsDone && minReps >= hiEff && feel !== 'hard';

  if (reachedTop) {
    const next = stepLoad(wl, options, 1);
    const jump = next === null ? Infinity : (next - wl) / Math.max(wl, 1);
    // Grote sprong (bv. 6 → 8 kg = +33%)? Eerst nog 2 reps extra.
    const bigJump = next !== null && jump > 0.25 && wl > 0;
    if (next !== null && !capped && (!bigJump || minReps >= hiEff + 2)) {
      const steps = feel === 'light' && minReps >= hiEff + 3 && !bigJump ? 2 : 1;
      const r = loadUp(steps, `Alle sets op ${hiEff}${unit}: sterk.`);
      if (r) return r;
    }
    if (bigJump && !capped && minReps < hiEff + 2) {
      return make({
        load: wl,
        targetReps: Math.min(hiEff + 2, minReps + 1),
        repRange: [lo, hiEff + 2],
        stage: prevStage,
        change: 'reps_up',
        note: `De volgende stap is een grote sprong, dus eerst ${hiEff + 2}${unit} halen, dan gaat het gewicht omhoog.`,
      });
    }
    // Zwaarder kan niet (thuis of lichaamsgewicht): naar de volgende stap op de ladder.
    if (prevStage < LADDER.length - 1) {
      const stage = prevStage + 1;
      const range = rangeFor(stage, base);
      return make({
        load: wl,
        stage,
        targetReps: stage === 1 ? Math.min(range[1], minReps + 1) : lo,
        change: stage === 1 ? 'reps_up' : stage === 2 ? 'tempo' : stage === 3 ? 'pause' : 'rest_down',
        note: `Zwaarder gaat hier niet, dus maken we het moeilijker: ${LADDER[stage]}.`,
      });
    }
    if (ex.harder) {
      return make({
        load: 0,
        targetReps: lo,
        change: 'variant_up',
        switchTo: ex.harder,
        note: `Ladder voltooid! Je gaat naar een zwaardere variant: ${getExercise(ex.harder).name}.`,
      });
    }
    return make({
      load: wl,
      stage: prevStage,
      targetReps: Math.min(hiEff + 3, minReps + 1),
      change: 'reps_up',
      note: 'Je zit aan het maximum van je materiaal. Een extra paar schijven zou je verder helpen; tot dan: meer reps.',
    });
  }

  // Makkelijk gevoeld en alle sets minstens halfweg het bereik: het gewicht mag al omhoog (geen grote sprong).
  if (feel === 'light' && allSetsDone && ex.load !== 'bodyweight' && !capped && minReps >= Math.ceil((lo + hiEff) / 2)) {
    const next = stepLoad(wl, options, 1);
    if (next !== null && (next - wl) / Math.max(wl, 1) <= 0.25) {
      const r = loadUp(1, 'Vorige keer makkelijk.');
      if (r) return r;
    }
  }

  // Binnen het bereik: één rep meer per set (twee als het makkelijk was, vasthouden als het zwaar was).
  const target = feel === 'hard' ? Math.max(lo, minReps) : Math.min(hiEff, Math.max(lo, minReps + (feel === 'light' ? 2 : 1)));
  return make({
    load: wl,
    stage: prevStage,
    targetReps: target,
    change: target > minReps ? 'reps_up' : 'same',
    note:
      feel === 'hard'
        ? `Zelfde gewicht en reps. Vorige keer was zwaar, maak ze nu proper.`
        : capped
          ? `Hier is ${formatLoad(ex, wl)} het zwaarst mogelijk: mik op ${target}${unit}.`
          : `Mik op ${target}${unit} per set. Op ${hiEff}${unit} in alle sets gaat het gewicht omhoog.`,
  });
}

/**
 * Opwarmsets op maat voor een hoofdoefening: 8 reps aan ±50% en 4 reps aan ±75% van je werkgewicht
 * (enkel gewichten die bestaan, en niet als het werkgewicht al heel licht is).
 */
export function rampSets(load: number, options: number[]): { load: number; reps: number }[] {
  if (load <= 0 || options.length === 0 || load * 0.5 < options[0]! - 1e-9) return [];
  const out: { load: number; reps: number }[] = [];
  for (const [f, reps] of [[0.5, 8], [0.75, 4]] as const) {
    const l = snapLoad(load * f, options, 'down');
    if (l > 0 && l < load - 1e-9 && !out.some((x) => x.load === l)) out.push({ load: l, reps });
  }
  return out;
}

/** Deload-versie: helft van de sets, ±10% lichter, geen progressie. */
export function deloadPrescription(p: Prescription, options: number[]): Prescription {
  const load = p.load > 0 ? snapLoad(p.load * 0.9, options, 'down') : 0;
  return {
    ...p,
    sets: Math.max(1, Math.ceil(p.sets / 2)),
    load,
    targetReps: p.repRange[0],
    tempo: undefined,
    pauseSec: undefined,
    change: 'deload',
    note: 'Deloadweek: minder sets, iets lichter. Je lichaam bouwt nu op. Niet forceren.',
  };
}

/** Oranje dagvorm: 1 set minder en geen zwaarder gewicht dan vorige keer. */
export function lighterPrescription(p: Prescription, previousLoad: number | undefined): Prescription {
  const load = p.change === 'load_up' && previousLoad !== undefined ? previousLoad : p.load;
  return {
    ...p,
    sets: Math.max(1, p.sets - 1),
    load,
    targetReps: p.change === 'load_up' ? p.repRange[0] + 1 : p.targetReps,
    change: 'lighter',
    note: `Dagvorm oranje: 1 set minder, geen zwaarder gewicht. ${p.change === 'load_up' ? 'Het gewicht gaat volgende keer omhoog.' : ''}`.trim(),
  };
}

/**
 * Stagnatie: in de laatste 3 echte trainingen geen betere geschatte 1RM dan daarvoor,
 * en ook geen stap hoger op de ladder.
 */
export function isStagnating(history: Exposure[]): boolean {
  const real = history.filter((h) => !h.deload);
  if (real.length < 4) return false;
  const before = real.slice(0, -3);
  const recent = real.slice(-3);
  const bestBefore = Math.max(...before.map((h) => bestE1rm(h.log)));
  const bestRecent = Math.max(...recent.map((h) => bestE1rm(h.log)));
  const stageBefore = Math.max(...before.map((h) => h.log.prescription.stage ?? 0));
  const stageRecent = Math.max(...recent.map((h) => h.log.prescription.stage ?? 0));
  return bestRecent <= bestBefore && stageRecent <= stageBefore;
}
