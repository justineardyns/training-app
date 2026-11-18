import { classSlotOn, DEFAULT_CLASS_SLOTS, defaultDay, resolveDay } from './availability.ts';
import { addDays, dayIndex, dayName, diffDays, weekStart } from './dates.ts';
import { decideDeload, type DeloadDecision } from './deload.ts';
import { lightFor, LIGHT, type LightActivity } from './light.ts';
import { clampTarget, MAX_PER_WEEK, NORMAL_MIN, validateRolling, type Violation } from './rules.ts';
import type {
  CoachAdjustments,
  DayAvailability,
  ISODate,
  Location,
  Minutes,
  Prefs,
  ReadinessLevel,
  SessionLog,
  Slot,
  Template,
} from './types.ts';

// Planner over een ROLLEND venster: de komende 7 dagen vanaf vandaag (geen vaste kalenderweek).
// Pure functie: zelfde input → zelfde plan, in de app, in de meldingen en in /coach.

export type DayType = 'strength' | 'cardio' | 'tennis' | 'light';
export type DayStatus = 'done' | 'planned' | 'moved' | 'free';

export interface PlannedDay {
  date: ISODate;
  type: DayType;
  sweat: boolean;
  status: DayStatus;
  title: string;
  template?: Template;
  location?: Location;
  minutes?: Minutes;
  slot?: Slot;
  /** Conditie als groepsles (bv. indoor cycling). */
  groupClass?: boolean;
  light?: LightActivity;
  /** Oranje dagvorm vandaag: lichtere versie. */
  lighter?: boolean;
  deload?: boolean;
  sessions?: SessionLog[];
  note?: string;
}

export interface WeekPlan {
  /** Eerste dag van het venster (meestal vandaag). */
  start: ISODate;
  days: PlannedDay[];
  target: number;
  /** Sessies vandaag al gedaan. */
  done: number;
  /** Geplande zweetsessies in het venster (incl. tennis). */
  planned: number;
  deload: DeloadDecision;
  messages: string[];
  violations: Violation[];
}

export interface PlanInput {
  today: ISODate;
  /** Eerste dag van het venster; standaard vandaag. */
  start?: ISODate;
  horizon?: number;
  /** Beschikbaarheid per dag (al opgelost: aangevinkt, patroon of standaard). */
  availability: (date: ISODate) => DayAvailability;
  /** Heb je die dag zelf aangevinkt? (voor de herinnering) */
  explicit?: (date: ISODate) => boolean;
  history: SessionLog[];
  prefs: Prefs;
  adjustments?: CoachAdjustments;
  readinessToday?: ReadinessLevel;
  readinessLog?: { date: ISODate; level: ReadinessLevel }[];
  /** Dagen die je zelf verplaatste ("vandaag niet"). */
  postponed?: ISODate[];
  /** Eerder geplande dagen (voor stabiliteit en "gemist"). */
  originalPlan?: ISODate[];
}

export const SWEAT_KINDS = new Set(['strength', 'cardio', 'class']);

export const DEFAULT_PREFS: Prefs = {
  targetPerWeek: 4,
  strengthPerWeek: 2,
  deloadEvery: 6,
  experience: 'beginner',
  className: 'Indoor cycling',
  classSlots: DEFAULT_CLASS_SLOTS,
  tennisDays: [3],
  minutes: 45,
  trainAtHome: false,
};

/** Oude of onvolledige voorkeuren aanvullen. */
export function normalizePrefs(p: (Partial<Prefs> & { thirdSession?: string }) | undefined): Prefs {
  const out = { ...DEFAULT_PREFS, ...(p ?? {}) } as Prefs & { thirdSession?: string };
  if (p && p.strengthPerWeek === undefined && p.thirdSession) out.strengthPerWeek = p.thirdSession === 'strength' ? 3 : 2;
  delete out.thirdSession;
  out.targetPerWeek = clampTarget(out.targetPerWeek);
  out.strengthPerWeek = Math.max(1, Math.min(out.targetPerWeek, Math.round(out.strengthPerWeek)));
  return out;
}

/** Geldt deze bijsturing al? */
export function activeAdjustments(adj: CoachAdjustments | undefined, date: ISODate): CoachAdjustments | undefined {
  if (!adj) return undefined;
  if (adj.validFrom && adj.validFrom > date) return undefined;
  return adj;
}

function subsets<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [head, ...rest] = items as [T, ...T[]];
  return [...subsets(rest, k - 1).map((s) => [head, ...s]), ...subsets(rest, k)];
}

const LOC = { gym: 'Jims', home: 'thuis' } as const;

export function cardioTitle(loc: Location, min: Minutes, lighter: boolean, groupClass?: string): string {
  if (lighter) return `Rustige cardio (zone 2) · ${LOC[loc]} · ${min} min`;
  if (groupClass) return `${groupClass} (groepsles) · Jims`;
  if (loc === 'home') return `Conditie thuis: kettlebell-circuit · ${min} min`;
  return `Conditie: fiets of roeier · Jims · ${min} min`;
}

function sessionTitle(s: SessionLog): string {
  if (s.title) return s.title;
  if (s.kind === 'strength') return `Full body ${s.template ?? ''}`.trim();
  if (s.kind === 'class') return s.workoutType ? `Groepsles: ${s.workoutType}` : 'Groepsles';
  return s.workoutType ? `Cardio: ${s.workoutType}` : 'Cardio';
}

type Kind = 'strength' | 'cardio';

export function planWeek(input: PlanInput): WeekPlan {
  const { today } = input;
  const start = input.start && input.start > today ? input.start : today;
  const horizon = input.horizon ?? 7;
  const days = Array.from({ length: horizon }, (_, i) => addDays(start, i));
  const prefs = normalizePrefs(input.prefs);
  const adj = activeAdjustments(input.adjustments, start);
  const target = clampTarget(adj?.targetSessions ?? prefs.targetPerWeek);
  const strengthPerWeek = Math.max(0, Math.min(target, adj?.strengthSessions ?? prefs.strengthPerWeek));
  const cardioPerWeek = Math.max(0, target - strengthPerWeek);
  const postponed = new Set(input.postponed ?? []);
  const original = new Set(input.originalPlan ?? []);
  const av = new Map(days.map((d) => [d, input.availability(d)]));

  // Gedane zweetsessies (ook vóór het venster: nodig voor "nooit 2 dagen na elkaar" en max 4 per 7 dagen).
  const sweat = input.history.filter((s) => SWEAT_KINDS.has(s.kind));
  const doneOn = new Map<ISODate, SessionLog[]>();
  for (const s of sweat) doneOn.set(s.date, [...(doneOn.get(s.date) ?? []), s]);
  const kindOf = (s: SessionLog): Kind => (s.kind === 'strength' ? 'strength' : 'cardio');

  // Tennis: jouw vaste afspraak (telt als conditie), zolang die dag nog niets gedaan is.
  const tennis = days.filter((d) => (av.get(d)!.tennis ?? 0) > 0 && !doneOn.has(d) && !postponed.has(d));

  // Vaste zweetdagen: gedaan + tennis.
  const fixedCount = new Map<ISODate, number>();
  for (const [d, l] of doneOn) fixedCount.set(d, l.length);
  for (const d of tennis) fixedCount.set(d, (fixedCount.get(d) ?? 0) + 1);
  const fixedDates = new Set(fixedCount.keys());
  const countIn = (from: ISODate, to: ISODate, extra: ISODate[]) =>
    [...fixedCount].reduce((n, [d, c]) => n + (d >= from && d <= to ? c : 0), 0) + extra.filter((d) => d >= from && d <= to).length;

  const doneTodayCount = start === today ? (doneOn.get(today)?.length ?? 0) : 0;
  const want = Math.max(0, target - tennis.length - doneTodayCount);

  const candidates = days.filter((d) => {
    const r = resolveDay(av.get(d)!, prefs.trainAtHome);
    return (
      r.available &&
      !fixedDates.has(d) &&
      !fixedDates.has(addDays(d, -1)) &&
      !fixedDates.has(addDays(d, 1)) &&
      !postponed.has(d) &&
      !(d === today && input.readinessToday === 'red')
    );
  });

  const validSet = (set: ISODate[]) => {
    for (let i = 1; i < set.length; i++) if (diffDays(set[i]!, set[i - 1]!) < 2) return false;
    for (const p of set) {
      for (let k = 0; k < 7; k++) {
        const from = addDays(p, -k);
        if (countIn(from, addDays(from, 6), set) > MAX_PER_WEEK) return false;
      }
    }
    return true;
  };

  /**
   * Soort per gekozen dag. Per dag kijken we naar de 6 dagen ervoor (rollend) en naar tennis die nog komt:
   * wat ontbreekt er nog aan kracht en conditie? Is beide nodig, dan afwisselen.
   * We proberen te starten met kracht én met conditie en houden de versie met de meeste groepslessen.
   */
  const assignWith = (set: ISODate[], first: Kind): Map<ISODate, Kind> => {
    const kinds = new Map<ISODate, Kind>();
    const typed: [ISODate, Kind][] = [...sweat.map((s) => [s.date, kindOf(s)] as [ISODate, Kind]), ...tennis.map((d) => [d, 'cardio'] as [ISODate, Kind])];
    set.forEach((d, i) => {
      const from = addDays(d, -6);
      const before = [...typed, ...kinds].filter(([x]) => x >= from && x < d).sort((a, b) => (a[0] < b[0] ? -1 : 1));
      const sIn = before.filter(([, k]) => k === 'strength').length;
      const cIn = before.filter(([, k]) => k === 'cardio').length;
      const cAhead = tennis.filter((t) => t > d && t <= addDays(d, 6)).length;
      const needS = strengthPerWeek - sIn;
      const needC = cardioPerWeek - cIn - cAhead;
      const left = set.length - i;
      let k: Kind;
      if (needS > 0 && needC > 0) {
        const last = before.at(-1)?.[1];
        if (needS >= left) k = 'strength';
        else if (needC >= left) k = 'cardio';
        else if (last) k = last === 'strength' ? 'cardio' : 'strength';
        else k = first;
      } else if (needS > 0) k = 'strength';
      else if (needC > 0) k = 'cardio';
      else k = sIn <= cIn ? 'strength' : 'cardio';
      kinds.set(d, k);
    });
    return kinds;
  };
  const classFit = (kinds: Map<ISODate, Kind>) =>
    [...kinds].reduce((n, [d, k]) => n + (k === 'cardio' ? (classSlotOn(av.get(d)!, prefs.classSlots, prefs.trainAtHome) ? 1 : -1) : 0), 0);
  const assign = (set: ISODate[]) => {
    const a = assignWith(set, 'strength');
    const b = assignWith(set, 'cardio');
    return classFit(b) > classFit(a) ? b : a;
  };

  const score = (set: ISODate[]) => {
    const kinds = assign(set);
    const all = [...new Set([...fixedDates, ...set])].filter((d) => d >= addDays(start, -3)).sort();
    let minGap = 7;
    for (let i = 1; i < all.length; i++) minGap = Math.min(minGap, diffDays(all[i]!, all[i - 1]!));
    return (
      set.reduce((s, d) => {
        const a = av.get(d)!;
        const r = resolveDay(a, prefs.trainAtHome);
        const k = kinds.get(d)!;
        const cls = classSlotOn(a, prefs.classSlots, prefs.trainAtHome);
        return (
          s +
          a.minutes / 15 +
          (k === 'strength' && r.location === 'gym' ? 1 : 0) +
          (k === 'cardio' ? (cls ? 3 : -1) : 0) +
          (original.has(d) ? 4 : 0) -
          0.15 * diffDays(d, start)
        );
      }, 0) +
      2 * minGap
    );
  };

  let chosen: ISODate[] = [];
  for (let k = Math.min(want, candidates.length); k > 0 && chosen.length === 0; k--) {
    let best = -Infinity;
    for (const set of subsets(candidates, k)) {
      if (!validSet(set)) continue;
      const sc = score(set);
      if (sc > best + 1e-9) [best, chosen] = [sc, set];
    }
  }
  const kinds = assign(chosen);

  const deload = decideDeload({
    monday: weekStart(start),
    history: input.history,
    readiness: input.readinessLog ?? [],
    prefs,
    adjustments: adj,
  });

  // A/B wisselen op basis van de laatste krachtsessie.
  let lastTemplate: Template | undefined = input.history
    .filter((s) => s.kind === 'strength' && s.template && s.date < start)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .at(-1)?.template;

  const result: PlannedDay[] = [];
  for (const d of days) {
    const prev = result.at(-1);
    const prevStrength = prev?.type === 'strength' || (prev === undefined && sweat.some((s) => s.date === addDays(d, -1) && s.kind === 'strength'));
    const a = av.get(d)!;
    const done = doneOn.get(d);
    if (done) {
      const strengthLog = done.find((s) => s.kind === 'strength');
      if (strengthLog?.template) lastTemplate = strengthLog.template;
      result.push({
        date: d, type: strengthLog ? 'strength' : 'cardio', sweat: true, status: 'done', title: done.map(sessionTitle).join(' + '),
        template: strengthLog?.template, location: strengthLog?.location, sessions: done,
      });
      continue;
    }
    if (tennis.includes(d)) {
      const min = a.tennis!;
      result.push({
        date: d, type: 'tennis', sweat: true, status: 'planned', minutes: Math.min(60, min) as Minutes, note: 'Telt als conditiesessie.',
        title: `Tennis · ${min >= 60 ? `${Math.round(min / 60)}u` : `${min} min`}`,
      });
      continue;
    }
    if (chosen.includes(d)) {
      const r = resolveDay(a, prefs.trainAtHome);
      const lighter = d === today && input.readinessToday === 'orange';
      if (kinds.get(d) === 'strength') {
        const t: Template = lastTemplate === 'A' ? 'B' : 'A';
        lastTemplate = t;
        result.push({
          date: d, type: 'strength', sweat: true, status: 'planned', template: t, location: r.location, minutes: a.minutes, slot: r.slot,
          title: `Full body ${t} · ${LOC[r.location]} · ${a.minutes} min${deload.deload ? ' · deload' : ''}`, lighter, deload: deload.deload,
        });
      } else {
        const cls = classSlotOn(a, prefs.classSlots, prefs.trainAtHome);
        const location: Location = cls ? 'gym' : r.location;
        result.push({
          date: d, type: 'cardio', sweat: true, status: 'planned', location, minutes: a.minutes, slot: cls ?? r.slot, groupClass: !!cls && !lighter,
          title: cardioTitle(location, a.minutes, lighter, cls ? prefs.className : undefined), lighter,
        });
      }
      continue;
    }
    const moved = (postponed.has(d) || (d === today && input.readinessToday === 'red')) && original.has(d);
    const light = moved ? LIGHT.mobiliteit : lightFor(prevStrength, dayIndex(d));
    result.push({
      date: d, type: 'light', sweat: false, status: moved ? 'moved' : 'free', title: `${light.title} (${light.minutes} min, zweetvrij)`, light,
      note: moved ? 'Verplaatst: vandaag herstel.' : undefined,
    });
  }

  // Boodschappen: kort en eerlijk.
  const messages: string[] = [];
  const unticked = input.explicit ? days.filter((d) => d > today && !input.explicit!(d)).length : 0;
  if (unticked >= 3) messages.push(`${unticked} van de komende dagen heb je nog niet aangevinkt. Ik ging uit van je vaste patroon. Tik op Week om aan te passen.`);
  if (deload.deload) messages.push(deload.message);
  const missed = [...original].filter((d) => d < today && d >= addDays(today, -3) && !doneOn.has(d));
  if (missed.length) messages.push(`Je miste ${missed.length === 1 ? 'een sessie' : `${missed.length} sessies`}. Geen inhaalrace: we stapelen niet, het plan schuift op.`);
  if (input.readinessToday === 'red' && original.has(today)) {
    const next = result.find((r) => r.status === 'planned' && r.date > today);
    messages.push(next ? `Rood vandaag: je sessie schuift naar ${dayName(next.date)}.` : 'Rood vandaag. Er is geen plek meer zonder de regels te breken: herstel gaat voor.');
  }
  for (const t of tennis) {
    if (doneOn.has(addDays(t, -1))) messages.push(`Tennis op ${dayName(t)} komt meteen na een training: twee zweetdagen na elkaar. Speel rustig of sla een van beide over.`);
  }
  const total = chosen.length + tennis.length + doneTodayCount;
  if (total < target) {
    const why = `In de komende 7 dagen passen ${total} van de ${target} sessies binnen je beschikbaarheid en de regels (max ${MAX_PER_WEEK} per 7 dagen, nooit 2 dagen na elkaar).`;
    messages.push(total < NORMAL_MIN ? `${why} Kan je ergens een extra avond vrijmaken?` : why);
  }
  if (adj?.focus) messages.push(`Coach: ${adj.focus}`);

  const violations = validateRolling({
    sessions: [
      ...sweat.map((s) => ({ date: s.date, planned: false })),
      ...tennis.map((date) => ({ date, planned: false })),
      ...chosen.map((date) => ({ date, planned: true })),
    ],
    available: (d) => resolveDay(av.get(d) ?? defaultDay(d, prefs.minutes), prefs.trainAtHome).available,
  });

  return { start, days: result, target, done: doneTodayCount, planned: chosen.length + tennis.length, deload, messages, violations };
}
