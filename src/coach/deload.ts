import { addDays, isoWeek } from './dates.ts';
import { exposures, isStagnating } from './progression.ts';
import type { CoachAdjustments, ISODate, Prefs, ReadinessLevel, SessionLog } from './types.ts';

// Wanneer een deloadweek? Vast ritme, stagnatie, slechte dagvormtrend of op vraag van /coach.

export type DeloadReason = 'ritme' | 'stagnatie' | 'dagvorm' | 'coach';

export interface DeloadDecision {
  deload: boolean;
  reason?: DeloadReason;
  message: string;
  /** Trainingsweken sinds de vorige deload (exclusief deze week). */
  weeksSinceDeload: number;
}

export interface DeloadInput {
  monday: ISODate;
  history: SessionLog[];
  readiness: { date: ISODate; level: ReadinessLevel }[];
  prefs: Pick<Prefs, 'deloadEvery'>;
  adjustments?: CoachAdjustments;
}

/** Trainingsblok: hoeveel lichtere weken je al achter de rug hebt. */
export function trainingBlock(history: SessionLog[]): number {
  return new Set(history.filter((s) => s.deload).map((s) => isoWeek(s.date))).size;
}

const MESSAGES: Record<DeloadReason, string> = {
  ritme: 'Lichtere week na 5 weken opbouwen.',
  stagnatie: 'Lichtere week: je kracht stond even stil.',
  dagvorm: 'Lichtere week: je was vaak moe.',
  coach: 'Lichtere week op advies van je coach.',
};

export function decideDeload(input: DeloadInput): DeloadDecision {
  const before = input.history.filter((s) => s.date < input.monday);
  const strength = before.filter((s) => s.kind === 'strength');
  const deloadWeeks = strength.filter((s) => s.deload).map((s) => isoWeek(s.date)).sort();
  const lastDeload = deloadWeeks.at(-1);
  const buildWeeks = new Set(
    strength.filter((s) => !s.deload && (!lastDeload || isoWeek(s.date) > lastDeload)).map((s) => isoWeek(s.date)),
  );
  const weeksSinceDeload = buildWeeks.size;
  const yes = (reason: DeloadReason): DeloadDecision => ({ deload: true, reason, message: MESSAGES[reason], weeksSinceDeload });

  const adj = input.adjustments;
  if (adj?.forceDeload && (!adj.validFrom || adj.validFrom <= input.monday)) return yes('coach');

  // Nooit te snel na elkaar en niet in de eerste weken.
  if (weeksSinceDeload < 2) return { deload: false, message: '', weeksSinceDeload };

  if (weeksSinceDeload >= Math.max(3, input.prefs.deloadEvery - 1)) return yes('ritme');

  if (weeksSinceDeload >= 3) {
    const ids = new Set(strength.flatMap((s) => s.exercises.map((e) => e.exerciseId)));
    const stuck = [...ids].filter((id) => isStagnating(exposures(before, id)));
    if (stuck.length >= 2) return yes('stagnatie');
  }

  const lastWeek = input.readiness.filter((r) => r.date >= addDays(input.monday, -7) && r.date < input.monday);
  const reds = lastWeek.filter((r) => r.level === 'red').length;
  const bad = lastWeek.filter((r) => r.level !== 'green').length;
  if (reds >= 2 || bad >= 3) return yes('dagvorm');

  return { deload: false, message: '', weeksSinceDeload };
}
