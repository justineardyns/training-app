import { addDays, dayIndex, dayName, diffDays, weekDays } from './dates.ts';
import { decideDeload, type DeloadDecision } from './deload.ts';
import { lightFor, LIGHT, type LightActivity } from './light.ts';
import { clampTarget, MAX_PER_WEEK, NORMAL_MIN, validateWeek, type Violation } from './rules.ts';
import type {
  CoachAdjustments,
  DayAvailability,
  ISODate,
  Location,
  Minutes,
  Prefs,
  ReadinessLevel,
  SessionLog,
  Template,
} from './types.ts';

// Weekplanner: een pure functie. Zelfde input → zelfde plan, in de app, in de meldingen en in /coach.

export type DayType = 'strength' | 'cardio' | 'light' | 'rest';
export type DayStatus = 'done' | 'planned' | 'missed' | 'moved' | 'free';

export interface PlannedDay {
  date: ISODate;
  type: DayType;
  sweat: boolean;
  status: DayStatus;
  title: string;
  template?: Template;
  location?: Location;
  minutes?: Minutes;
  light?: LightActivity;
  /** Oranje dagvorm vandaag: lichtere versie. */
  lighter?: boolean;
  deload?: boolean;
  sessions?: SessionLog[];
  note?: string;
}

export interface WeekPlan {
  monday: ISODate;
  days: PlannedDay[];
  target: number;
  done: number;
  /** Nog geplande zweetsessies. */
  planned: number;
  deload: DeloadDecision;
  messages: string[];
  violations: Violation[];
  usedDefaultAvailability: boolean;
}

export interface PlanInput {
  monday: ISODate;
  today: ISODate;
  availability?: DayAvailability[];
  history: SessionLog[];
  prefs: Prefs;
  adjustments?: CoachAdjustments;
  readinessToday?: ReadinessLevel;
  readinessLog?: { date: ISODate; level: ReadinessLevel }[];
  /** Dagen die je zelf verplaatste ("vandaag niet"). */
  postponed?: ISODate[];
  /** Geplande zweetdagen buiten deze week (bv. deze zondag als je volgende week plant). */
  reservedSweat?: ISODate[];
  /** Momentopname van het plan bij de start van de week (voor "gemist"). */
  originalPlan?: ISODate[];
}

export const SWEAT_KINDS = new Set(['strength', 'cardio', 'class']);

export const DEFAULT_PREFS: Prefs = { targetPerWeek: 3, thirdSession: 'cardio', deloadEvery: 6 };

export function defaultAvailability(monday: ISODate): DayAvailability[] {
  return weekDays(monday).map((date) => ({ date, available: true, location: 'gym', minutes: 45 }));
}

/** Geldt deze bijsturing voor deze week? */
export function activeAdjustments(adj: CoachAdjustments | undefined, monday: ISODate): CoachAdjustments | undefined {
  if (!adj) return undefined;
  if (adj.validFrom && adj.validFrom > monday) return undefined;
  return adj;
}

function subsets<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [head, ...rest] = items as [T, ...T[]];
  return [...subsets(rest, k - 1).map((s) => [head, ...s]), ...subsets(rest, k)];
}

const LOC = { gym: 'Jims', home: 'thuis' } as const;

function strengthTitle(t: Template, loc: Location, min: Minutes, deload: boolean): string {
  return `Full body ${t} · ${LOC[loc]} · ${min} min${deload ? ' · deload' : ''}`;
}

export function cardioTitle(loc: Location, min: Minutes, lighter: boolean): string {
  if (lighter) return `Rustige cardio (zone 2) · ${LOC[loc]} · ${min} min`;
  if (loc === 'home') return `Conditie thuis: kettlebell-circuit · ${min} min`;
  return min >= 45 ? `Conditie: indoor cycling (groepsles) of fiets/roeier · ${min} min` : `Conditie: intervallen op fiets of roeier · ${min} min`;
}

function sessionTitle(s: SessionLog): string {
  if (s.title) return s.title;
  if (s.kind === 'strength') return `Full body ${s.template ?? ''}`.trim();
  if (s.kind === 'class') return s.workoutType ? `Groepsles: ${s.workoutType}` : 'Groepsles';
  return s.workoutType ? `Cardio: ${s.workoutType}` : 'Cardio';
}

export function planWeek(input: PlanInput): WeekPlan {
  const { monday, today } = input;
  const days = weekDays(monday);
  const adj = activeAdjustments(input.adjustments, monday);
  const usedDefaultAvailability = !input.availability || input.availability.length === 0;
  const availability = usedDefaultAvailability ? defaultAvailability(monday) : input.availability!;
  const availOf = (d: ISODate) => availability.find((a) => a.date === d);
  const postponed = new Set(input.postponed ?? []);
  const sweat = input.history.filter((s) => SWEAT_KINDS.has(s.kind));
  const inWeek = (d: ISODate) => d >= monday && d <= days[6]!;

  const doneByDate = new Map<ISODate, SessionLog[]>();
  for (const s of sweat.filter((x) => inWeek(x.date))) doneByDate.set(s.date, [...(doneByDate.get(s.date) ?? []), s]);
  const doneCount = [...doneByDate.values()].reduce((n, l) => n + l.length, 0);
  const neighbors = [
    ...sweat.filter((s) => s.date === addDays(monday, -1) || s.date === addDays(monday, 7)).map((s) => s.date),
    ...(input.reservedSweat ?? []).filter((d) => !inWeek(d)),
  ];

  const target = clampTarget(adj?.targetSessions ?? input.prefs.targetPerWeek);
  const want = Math.max(0, Math.min(target, MAX_PER_WEEK) - doneCount);

  // Kandidaten: vanaf vandaag, beschikbaar, nog niets gedaan, niet verplaatst, niet rood vandaag.
  const fixed = new Set<ISODate>([...doneByDate.keys(), ...neighbors]);
  const ok = (d: ISODate) => !fixed.has(addDays(d, -1)) && !fixed.has(addDays(d, 1));
  const candidates = days.filter(
    (d) =>
      d >= today &&
      availOf(d)?.available &&
      !doneByDate.has(d) &&
      !postponed.has(d) &&
      !(d === today && input.readinessToday === 'red') &&
      ok(d),
  );

  const original = new Set(input.originalPlan ?? []);
  const score = (set: ISODate[]) => {
    const all = [...new Set([...doneByDate.keys(), ...set])].sort();
    let minGap = 7;
    for (let i = 1; i < all.length; i++) minGap = Math.min(minGap, diffDays(all[i]!, all[i - 1]!));
    return set.reduce((s, d) => {
      const a = availOf(d)!;
      // Stabiliteit: een al gepland dag blijft liefst gepland (bv. "vandaag toch thuis").
      return s + a.minutes / 15 + (a.location === 'gym' ? 1 : 0) - (dayIndex(d) === 6 ? 3 : 0) - 0.1 * dayIndex(d) + (original.has(d) ? 4 : 0);
    }, 0) + 2 * minGap;
  };

  let chosen: ISODate[] = [];
  for (let k = Math.min(want, candidates.length); k > 0 && chosen.length === 0; k--) {
    let best = -Infinity;
    for (const set of subsets(candidates, k)) {
      const valid = set.every((d, i) => i === 0 || diffDays(d, set[i - 1]!) >= 2);
      if (!valid) continue;
      const sc = score(set);
      if (sc > best + 1e-9) [best, chosen] = [sc, set];
    }
  }

  // Types: eerst kracht (2, of 3 als je dat verkiest), daarna conditie.
  const third = adj?.thirdSession ?? input.prefs.thirdSession;
  const desiredStrength = Math.min(target, third === 'strength' ? 3 : 2);
  const doneSessions = [...doneByDate.values()].flat();
  const strengthDone = doneSessions.filter((s) => s.kind === 'strength').length;
  const strengthNeeded = Math.max(0, desiredStrength - strengthDone);
  // Eerst kracht, conditie later in de week: voorspelbaar en stabiel als je iets wijzigt.
  const strengthDays = new Set([...chosen].sort().slice(0, strengthNeeded));

  const deload = decideDeload({
    monday,
    history: input.history,
    readiness: input.readinessLog ?? [],
    prefs: input.prefs,
    adjustments: adj,
  });

  // A/B wisselen op basis van de laatste krachtsessie vóór elke dag.
  const strengthHistory = input.history.filter((s) => s.kind === 'strength' && s.template).sort((a, b) => (a.date < b.date ? -1 : 1));
  let lastTemplate: Template | undefined = strengthHistory.filter((s) => s.date < monday).at(-1)?.template;

  const messages: string[] = [];
  const result: PlannedDay[] = [];
  let missed = 0;

  for (const d of days) {
    const prev = result.at(-1);
    const prevStrength = prev?.type === 'strength' || (prev === undefined && sweat.some((s) => s.date === addDays(d, -1) && s.kind === 'strength'));
    const done = doneByDate.get(d);
    if (done) {
      const strengthLog = done.find((s) => s.kind === 'strength');
      if (strengthLog?.template) lastTemplate = strengthLog.template;
      result.push({
        date: d,
        type: strengthLog ? 'strength' : 'cardio',
        sweat: true,
        status: 'done',
        title: done.map(sessionTitle).join(' + '),
        template: strengthLog?.template,
        location: strengthLog?.location,
        sessions: done,
      });
      continue;
    }
    const a = availOf(d)!;
    if (chosen.includes(d)) {
      const lighter = d === today && input.readinessToday === 'orange';
      if (strengthDays.has(d)) {
        const t: Template = lastTemplate === 'A' ? 'B' : 'A';
        lastTemplate = t;
        result.push({
          date: d, type: 'strength', sweat: true, status: 'planned', template: t, location: a.location, minutes: a.minutes,
          title: strengthTitle(t, a.location, a.minutes, deload.deload), lighter, deload: deload.deload,
        });
      } else {
        result.push({
          date: d, type: 'cardio', sweat: true, status: 'planned', location: a.location, minutes: a.minutes,
          title: cardioTitle(a.location, a.minutes, lighter), lighter,
        });
      }
      continue;
    }
    if (d < today) {
      const wasPlanned = original.has(d);
      if (wasPlanned) missed++;
      result.push({ date: d, type: 'rest', sweat: false, status: wasPlanned ? 'missed' : 'free', title: wasPlanned ? 'Gemist' : 'Rust' });
      continue;
    }
    const moved = (postponed.has(d) || (d === today && input.readinessToday === 'red')) && original.has(d);
    const light = moved ? LIGHT.mobiliteit : lightFor(prevStrength, dayIndex(d));
    result.push({
      date: d,
      type: 'light',
      sweat: false,
      status: moved ? 'moved' : 'free',
      title: `${light.title} (${light.minutes} min, zweetvrij)`,
      light,
      note: moved ? 'Verplaatst: vandaag herstel.' : undefined,
    });
  }

  // Coachboodschappen: kort en eerlijk.
  if (usedDefaultAvailability) {
    messages.push('Je beschikbaarheid voor deze week ontbreekt. Ik ging uit van elke dag Jims, 45 min. Vul ze in bij Week.');
  }
  if (deload.deload) messages.push(deload.message);
  if (missed > 0) {
    messages.push(`Je miste ${missed === 1 ? 'een sessie' : `${missed} sessies`}. Geen inhaalrace: we stapelen niet, het plan schuift op.`);
  }
  const redToday = input.readinessToday === 'red' && original.has(today);
  if (redToday) {
    const next = result.find((r) => r.status === 'planned' && r.date > today);
    messages.push(next ? `Rood vandaag: je sessie schuift naar ${dayName(next.date)}.` : 'Rood vandaag. Deze week is er geen plek meer zonder de regels te breken: herstel gaat voor.');
  }
  const total = doneCount + chosen.length;
  if (doneCount >= target) {
    messages.push(`Weekdoel gehaald (${doneCount}/${target}). Nu herstellen en zweetvrij bewegen.`);
  } else if (total < target) {
    const why = `Deze week passen maar ${total} van de ${target} sessies binnen je beschikbaarheid en de regels.`;
    messages.push(total < NORMAL_MIN ? `${why} Dat is minder dan je normale 2–3. Kan je ergens een extra dag vrijmaken?` : why);
  }
  if (adj?.focus) messages.push(`Coach: ${adj.focus}`);

  const violations = validateWeek({
    monday,
    sessions: [...doneSessions.map((s) => ({ date: s.date, planned: false })), ...chosen.map((date) => ({ date, planned: true }))],
    neighbors,
    availability,
  });

  return {
    monday,
    days: result,
    target,
    done: doneCount,
    planned: chosen.length,
    deload,
    messages,
    violations,
    usedDefaultAvailability,
  };
}
