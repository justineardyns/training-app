import { EXERCISES } from './catalog.ts';
import { isoWeek } from './dates.ts';
import { e1rm } from './progression.ts';
import type { ISODate, SessionLog } from './types.ts';

// Krachtcheck: elke 6 weken, net voor je lichtere week. Op je hoofdoefeningen doe je de laatste set
// zoveel mogelijk goede reps (1–2 reps over). Daaruit schatten we je kracht (1RM, Epley) en vergelijken
// we met de vorige check. Geen maximale pogingen: veilig voor een beginner.

export const CHECK_NOTE =
  '💪 Krachtcheck: doe je laatste set zoveel mogelijk goede reps (stop 1–2 reps voor je niet meer kan), met hetzelfde gewicht. Tik je reps in.';

export interface CheckItem {
  exerciseId: string;
  name: string;
  load: number;
  reps: number;
  e1rm: number;
  /** Vorige check van dezelfde oefening. */
  previous?: number;
  /** Verandering t.o.v. de vorige check (0.12 = +12%). */
  change?: number;
}

export interface StrengthCheck {
  week: string;
  date: ISODate;
  items: CheckItem[];
  /** Gemiddelde verandering over de oefeningen met een vorige meting. */
  change?: number;
}

/** Alle krachtchecks, nieuwste eerst. */
export function strengthChecks(history: SessionLog[]): StrengthCheck[] {
  const byWeek = new Map<string, StrengthCheck>();
  const last = new Map<string, number>();
  for (const s of [...history].filter((x) => x.kind === 'strength').sort((a, b) => (a.date < b.date ? -1 : 1))) {
    for (const e of s.exercises) {
      if (!e.prescription.test) continue;
      const set = [...e.sets].reverse().find((x) => x.done && x.reps > 0);
      if (!set || set.load <= 0) continue;
      const value = e1rm(set.load, set.reps);
      const previous = last.get(e.exerciseId);
      const week = isoWeek(s.date);
      const check = byWeek.get(week) ?? { week, date: s.date, items: [] };
      check.items.push({
        exerciseId: e.exerciseId,
        name: EXERCISES.get(e.exerciseId)?.name ?? e.exerciseId,
        load: set.load,
        reps: set.reps,
        e1rm: value,
        ...(previous !== undefined ? { previous, change: (value - previous) / previous } : {}),
      });
      byWeek.set(week, check);
      last.set(e.exerciseId, value);
    }
  }
  const out = [...byWeek.values()];
  for (const c of out) {
    const changes = c.items.map((i) => i.change).filter((x): x is number => x !== undefined);
    if (changes.length) c.change = changes.reduce((a, b) => a + b, 0) / changes.length;
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}
