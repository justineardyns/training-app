import { EXERCISES } from './catalog.ts';
import { DAY_SHORT, dayIndex, diffDays } from './dates.ts';
import type { ISODate, Muscle, SessionLog, Slot } from './types.ts';

// Herstel per spiergroep. Een coach plant nooit dezelfde spieren zwaar als ze nog niet hersteld zijn.
// Model (bewust eenvoudig en uitlegbaar): elke sessie laat een "belasting" na per groep, die lineair
// afneemt over 24, 48 of 72 uur, afhankelijk van hoe zwaar ze was. Je eigen tik "spierpijn" weegt mee.

export type Group = 'benen' | 'duwen' | 'trekken' | 'core';
export const GROUPS: Group[] = ['benen', 'duwen', 'trekken', 'core'];
export const GROUP_LABEL: Record<Group, string> = {
  benen: 'Benen',
  duwen: 'Borst & schouders',
  trekken: 'Rug & armen',
  core: 'Romp',
};

export const MUSCLE_GROUP: Record<Muscle, Group> = {
  quadriceps: 'benen',
  hamstrings: 'benen',
  bilspieren: 'benen',
  kuiten: 'benen',
  borst: 'duwen',
  schouders: 'duwen',
  triceps: 'duwen',
  rug: 'trekken',
  biceps: 'trekken',
  core: 'core',
};

export type RecoveryState = 'fris' | 'herstelt' | 'moe';

export interface GroupRecovery {
  group: Group;
  state: RecoveryState;
  /** Resterende belasting (≈ harde sets). */
  residual: number;
  /** Wat het meest doorweegt, bv. "tennis (2u) do". */
  cause?: string;
}

/** Een (gedane of geplande) sessie zoals het herstelmodel ze ziet. */
export interface LoadEvent {
  date: ISODate;
  slot?: Slot;
  /** Precies tijdstip als je het weet (ISO), anders uit het moment van de dag. */
  at?: string;
  label: string;
  load: Partial<Record<Group, number>>;
}

const HOUR = { day: 11, evening: 19 } as const;

function hoursAt(e: { date: ISODate; slot?: Slot; at?: string }): number {
  // Uren sinds een vaste referentie; enkel verschillen tellen.
  const base = diffDays(e.date, '2020-01-06') * 24;
  if (e.at) {
    const d = new Date(e.at);
    if (!Number.isNaN(d.getTime())) {
      const local = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Brussels' }).format(d));
      if (Number.isFinite(local)) return base + local;
    }
  }
  return base + HOUR[e.slot ?? (dayIndex(e.date) >= 5 ? 'day' : 'evening')];
}

/** Hoe lang een groep nodig heeft om van deze belasting te herstellen. */
export function recoveryHours(load: number): number {
  if (load <= 0) return 0;
  if (load < 3) return 24;
  if (load <= 7) return 48;
  return 72;
}

const add = (into: Partial<Record<Group, number>>, g: Group, v: number) => {
  into[g] = (into[g] ?? 0) + v;
};

/** Conditiesessie: welke spieren werken? (tennis = benen/bilspieren, licht voor schouders en romp; fietsen = zwaar voor de benen) */
export function cardioLoad(title: string, minutes: number): Partial<Record<Group, number>> {
  const t = title.toLowerCase();
  const f = Math.max(0.5, minutes / 45);
  if (t.includes('tennis')) {
    const h = Math.max(0.5, minutes / 60);
    // Ontspannen voor je bovenlijf; je bilspieren voelen het de dag erna een beetje (1u: licht, 2u: meer).
    return { benen: 3 * h, duwen: 1.2 * h, core: 1 * h, trekken: 0.5 * h };
  }
  if (t.includes('roei')) return { benen: 3 * f, trekken: 3 * f, core: 1 * f };
  if (t.includes('rustig') || t.includes('zone 2')) return { benen: 2 * f };
  return { benen: 5 * f, core: 1 * f };
}

/** Wat een gedane sessie achterlaat. Zwaar gevoeld of nieuw voor je spieren → iets meer. */
export function sessionLoad(s: SessionLog, opts: { novice?: boolean } = {}): Partial<Record<Group, number>> {
  if (s.kind === 'light') return {};
  if (s.kind !== 'strength') return cardioLoad(`${s.title ?? ''} ${s.workoutType ?? ''}`, s.durationMin ?? 45);
  const load: Partial<Record<Group, number>> = {};
  for (const e of s.exercises) {
    const ex = EXERCISES.get(e.exerciseId);
    if (!ex) continue;
    const sets = e.sets.filter((x) => x.done && x.reps > 0).length;
    if (!sets) continue;
    const f = (e.feel === 'hard' ? 1.25 : 1) * (opts.novice ? 1.25 : 1);
    const seen = new Set<Group>();
    ex.muscles.forEach((m, i) => {
      const g = MUSCLE_GROUP[m];
      if (seen.has(g)) return;
      seen.add(g);
      add(load, g, sets * (i === 0 ? 1 : 0.5) * f);
    });
  }
  return load;
}

/** Een geplande full body-sessie (schatting, ±3 sets per hoofdoefening). */
export const PLANNED_STRENGTH: Partial<Record<Group, number>> = { benen: 6, duwen: 5, trekken: 4, core: 2 };

function shortDay(date: ISODate): string {
  return DAY_SHORT[dayIndex(date)]!;
}

export function eventFromSession(s: SessionLog, novice = false): LoadEvent {
  const label =
    s.kind === 'strength'
      ? 'kracht'
      : (s.title ?? s.workoutType ?? '').toLowerCase().includes('tennis')
        ? `tennis${s.durationMin && s.durationMin >= 90 ? ' (2u)' : ''}`
        : s.kind === 'class'
          ? (s.title ?? 'groepsles').toLowerCase()
          : 'cardio';
  return { date: s.date, at: s.startedAt, label: `${label} ${shortDay(s.date)}`, load: sessionLoad(s, { novice }) };
}

/**
 * Herstel per groep op een moment. `sore`: groepen waar je zelf spierpijn aangaf (die dag) → minstens "moe".
 */
export function recoveryAt(
  when: { date: ISODate; slot?: Slot },
  events: LoadEvent[],
  sore: Group[] = [],
): Record<Group, GroupRecovery> {
  const now = hoursAt(when);
  const out = {} as Record<Group, GroupRecovery>;
  for (const g of GROUPS) {
    let residual = 0;
    let top = 0;
    let cause: string | undefined;
    for (const e of events) {
      const v = e.load[g] ?? 0;
      const t = hoursAt(e);
      if (v <= 0 || t >= now) continue;
      const need = recoveryHours(v);
      const left = v * Math.max(0, 1 - (now - t) / need);
      residual += left;
      if (left > top) [top, cause] = [left, e.label];
    }
    let state: RecoveryState = residual >= 3 ? 'moe' : residual >= 1 ? 'herstelt' : 'fris';
    if (sore.includes(g)) {
      state = 'moe';
      cause = 'spierpijn';
    }
    out[g] = { group: g, state, residual: Math.round(residual * 10) / 10, cause: state === 'fris' ? undefined : cause };
  }
  return out;
}

export interface StrengthFocus {
  /** Groepen die vandaag 1 set minder krijgen en niet zwaarder gaan. */
  reduce: Group[];
  /** Groepen die nog herstellen: komen later in de training. */
  later: Group[];
  /** Groep die eerst komt (je werkpunt), als die fris is. */
  first?: Group;
  why?: string;
}

const lower = (g: Group) => GROUP_LABEL[g].toLowerCase();
const list = (gs: Group[]) => gs.map(lower).join(' en ');

/** Focus voor een krachttraining, op basis van herstel (en je werkpunt). `groups`: wat deze training traint. */
export function strengthFocus(rec: Record<Group, GroupRecovery>, weakGroup?: Group, groups: Group[] = ['benen', 'duwen', 'trekken']): StrengthFocus {
  const active = GROUPS.filter((g) => g !== 'core' && groups.includes(g));
  const reduce = active.filter((g) => rec[g].state === 'moe');
  const later = active.filter((g) => rec[g].state === 'herstelt');
  const fresh = active.filter((g) => rec[g].state === 'fris');
  const first = weakGroup && active.includes(weakGroup) && rec[weakGroup].state === 'fris' ? weakGroup : undefined;
  let why: string | undefined;
  if (reduce.length) {
    const cause = rec[reduce[0]!].cause;
    why = `${GROUP_LABEL[reduce[0]!]}${reduce.length > 1 ? ` en ${lower(reduce[1]!)}` : ''} nog moe${cause ? ` (${cause})` : ''}: ${
      fresh.length ? `eerst ${list(fresh)}, ` : ''
    }${list(reduce)} 1 set minder en niet zwaarder.`;
  } else if (later.length && fresh.length) {
    const cause = rec[later[0]!].cause;
    why = `${GROUP_LABEL[later[0]!]} nog niet helemaal hersteld${cause ? ` (${cause})` : ''}: je start met ${list(fresh)}.`;
  } else if (later.length) {
    why = 'Nog niet helemaal hersteld: bouw rustig op en ga niet zwaarder dan je voelt.';
  } else if (first) {
    why = `${GROUP_LABEL[first]} is je werkpunt: daar begin je mee.`;
  }
  return { reduce, later, first, why };
}

export const STATE_LABEL: Record<RecoveryState, string> = { fris: 'fris', herstelt: 'herstelt', moe: 'moe' };
