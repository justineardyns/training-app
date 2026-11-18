import { classSlotOn, DEFAULT_CLASS_SLOTS, defaultDay, resolveDay } from './availability.ts';
import { addDays, DAY_SHORT, dayIndex, dayName, diffDays, weekStart } from './dates.ts';
import { decideDeload, type DeloadDecision } from './deload.ts';
import { chooseLight, LIGHT, type LightActivity } from './light.ts';
import {
  cardioLoad,
  eventFromSession,
  GROUP_LABEL,
  PLANNED_STRENGTH,
  recoveryAt,
  strengthFocus,
  type Group,
  type LoadEvent,
  type StrengthFocus,
} from './recovery.ts';
import { walkAdvice, weatherIcon, weatherText, type DayWeather, type WalkAdvice } from './weather.ts';
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
  /** Waarom de coach dit zo plant (één zin). */
  why?: string;
  /** Krachttraining: wat er vandaag anders is voor je herstel (en je werkpunt). */
  focus?: StrengthFocus;
  /** Valt deze dag op een lesmoment (bv. indoor cycling)? */
  classSlot?: boolean;
  /** Jouw keuze voor die dag (kracht of conditie), als je die maakte. */
  want?: 'strength' | 'cardio';
  /** Weer, als je iPhone het kon ophalen. */
  weather?: { icon: string; text: string; tMax: number; tMin: number; precipProb: number };
  /** Zweetvrije dag: wandelen of binnen? */
  walk?: WalkAdvice;
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
  /** Weerbericht per dag (enkel op je iPhone; zonder weer plant de coach gewoon). */
  weather?: (date: ISODate) => DayWeather | undefined;
  /** Weekdagen waarop je training vaak wegvalt (uit je sterke/zwakke punten). */
  avoidWeekdays?: number[];
  /** Groep die het traagst vooruitgaat: komt eerst in je krachttraining. */
  weakGroup?: Group;
  /** Spierpijn die je vandaag aangaf. */
  soreToday?: Group[];
  /** Nog nieuw voor je spieren (eerste weken): iets meer hersteltijd. */
  novice?: boolean;
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
  const avoid = new Set(input.avoidWeekdays ?? []);
  const av = new Map(days.map((d) => [d, input.availability(d)]));
  const wish = (d: ISODate) => av.get(d)?.want;
  const short = (d: ISODate) => DAY_SHORT[dayIndex(d)]!;

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
  const wanted = Math.max(0, target - tennis.length - doneTodayCount);

  // Herstel: wat je spieren nog meedragen van gedane sessies en tennis.
  const novice = !!input.novice;
  const fixedEvents: LoadEvent[] = [
    ...sweat.filter((s) => s.date >= addDays(start, -4) && s.date <= addDays(start, horizon)).map((s) => eventFromSession(s, novice)),
    ...tennis.map((d) => {
      const min = av.get(d)!.tennis ?? 60;
      return { date: d, slot: 'evening' as Slot, label: `tennis${min >= 90 ? ' (2u)' : ''} ${short(d)}`, load: cardioLoad('tennis', min) };
    }),
  ];
  const soreOn = (d: ISODate) => (d === today ? (input.soreToday ?? []) : []);
  const slotFor = (d: ISODate, k: Kind): Slot | undefined => {
    const a = av.get(d)!;
    return (k === 'cardio' ? classSlotOn(a, prefs.classSlots, prefs.trainAtHome) : undefined) ?? resolveDay(a, prefs.trainAtHome).slot;
  };
  const plannedEvent = (d: ISODate, k: Kind): LoadEvent => {
    const a = av.get(d)!;
    const cls = classSlotOn(a, prefs.classSlots, prefs.trainAtHome);
    return k === 'strength'
      ? { date: d, slot: slotFor(d, k), label: `kracht ${short(d)}`, load: PLANNED_STRENGTH }
      : { date: d, slot: slotFor(d, k), label: `${cls ? prefs.className.toLowerCase() : 'cardio'} ${short(d)}`, load: cardioLoad(cls ? 'cycling' : 'fiets', a.minutes) };
  };

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
   * wat ontbreekt er nog aan kracht en conditie? Is beide nodig, dan afwisselen. Jouw keuze per dag gaat altijd voor.
   * We proberen te starten met kracht én met conditie en houden de versie met de meeste groepslessen.
   */
  const assignWith = (set: ISODate[], first: Kind): Map<ISODate, Kind> => {
    const kinds = new Map<ISODate, Kind>();
    const typed: [ISODate, Kind][] = [...sweat.map((s) => [s.date, kindOf(s)] as [ISODate, Kind]), ...tennis.map((d) => [d, 'cardio'] as [ISODate, Kind])];
    set.forEach((d, i) => {
      const own = wish(d);
      if (own) {
        kinds.set(d, own);
        return;
      }
      const from = addDays(d, -6);
      const before = [...typed, ...kinds].filter(([x]) => x >= from && x < d).sort((a, b) => (a[0] < b[0] ? -1 : 1));
      const sIn = before.filter(([, k]) => k === 'strength').length;
      const cIn = before.filter(([, k]) => k === 'cardio').length;
      const cAhead = tennis.filter((t) => t > d && t <= addDays(d, 6)).length;
      const ahead = set.slice(i + 1).filter((x) => x <= addDays(d, 6));
      const wS = ahead.filter((x) => wish(x) === 'strength').length;
      const wC = ahead.filter((x) => wish(x) === 'cardio').length;
      const needS = strengthPerWeek - sIn - wS;
      const needC = cardioPerWeek - cIn - cAhead - wC;
      const left = set.length - i - set.slice(i + 1).filter((x) => wish(x)).length;
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

  /** Hoe vermoeid zijn de spieren die je op die dagen nodig hebt? (kleine straf in de score) */
  const recoveryPenalty = (set: ISODate[], kinds: Map<ISODate, Kind>) => {
    const events = [...fixedEvents];
    let pen = 0;
    for (const d of set) {
      const k = kinds.get(d)!;
      const rec = recoveryAt({ date: d, slot: slotFor(d, k) }, events, soreOn(d));
      if (k === 'strength') {
        for (const g of ['benen', 'duwen', 'trekken'] as Group[]) pen += rec[g].state === 'moe' ? 1.5 : rec[g].state === 'herstelt' ? 0.5 : 0;
      } else pen += rec.benen.state === 'moe' ? 1 : rec.benen.state === 'herstelt' ? 0.3 : 0;
      events.push(plannedEvent(d, k));
    }
    return pen;
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
          (original.has(d) ? 4 : 0) +
          (a.want ? 6 : 0) -
          (avoid.has(dayIndex(d)) ? 4 : 0) -
          0.15 * diffDays(d, start)
        );
      }, 0) +
      2 * minGap -
      recoveryPenalty(set, kinds)
    );
  };

  let chosen: ISODate[] = [];
  for (let k = Math.min(wanted, candidates.length); k > 0 && chosen.length === 0; k--) {
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

  // Vorige zweetsessie vóór een dag (gedaan, tennis of gepland), voor de uitleg.
  const sweatDays = new Map<ISODate, string>();
  for (const s of sweat) sweatDays.set(s.date, s.kind === 'strength' ? 'kracht' : (s.title ?? s.workoutType ?? 'conditie').toLowerCase());
  for (const t of tennis) sweatDays.set(t, 'tennis');
  for (const d of chosen) sweatDays.set(d, kinds.get(d) === 'strength' ? 'kracht' : classSlotOn(av.get(d)!, prefs.classSlots, prefs.trainAtHome) ? prefs.className.toLowerCase() : 'cardio');
  const prevSweat = (d: ISODate) => {
    for (let k = 1; k <= 6; k++) {
      const x = addDays(d, -k);
      if (sweatDays.has(x)) return { date: x, label: sweatDays.get(x)!, gap: k };
    }
    return undefined;
  };
  const sinceText = (d: ISODate) => {
    const p = prevSweat(d);
    return p ? `${p.gap} dagen na ${p.label} (${short(p.date)}): je spieren zijn hersteld.` : 'Uitgerust aan de start.';
  };
  const tennisNear = (d: ISODate) => tennis.some((t) => Math.abs(diffDays(t, d)) <= 6);

  const timeline: LoadEvent[] = [...fixedEvents];
  const result: PlannedDay[] = [];
  for (const d of days) {
    const prev = result.at(-1);
    const prevStrength = prev?.type === 'strength' || (prev === undefined && sweat.some((s) => s.date === addDays(d, -1) && s.kind === 'strength'));
    const a = av.get(d)!;
    const wx = input.weather?.(d);
    const weather = wx ? { icon: weatherIcon(wx.code), text: weatherText(wx.code), tMax: wx.tMax, tMin: wx.tMin, precipProb: wx.precipProb } : undefined;
    const done = doneOn.get(d);
    if (done) {
      const strengthLog = done.find((s) => s.kind === 'strength');
      if (strengthLog?.template) lastTemplate = strengthLog.template;
      result.push({
        date: d, type: strengthLog ? 'strength' : 'cardio', sweat: true, status: 'done', title: done.map(sessionTitle).join(' + '),
        template: strengthLog?.template, location: strengthLog?.location, sessions: done, weather,
      });
      continue;
    }
    if (tennis.includes(d)) {
      const min = a.tennis!;
      result.push({
        date: d, type: 'tennis', sweat: true, status: 'planned', minutes: Math.min(60, min) as Minutes, note: 'Telt als conditiesessie.',
        title: `Tennis · ${min >= 60 ? `${Math.round(min / 60)}u` : `${min} min`}`, weather,
        why: 'Telt als je conditie. De dag ervoor en erna geen training: zo sta je fris op het veld.',
      });
      continue;
    }
    if (chosen.includes(d)) {
      const r = resolveDay(a, prefs.trainAtHome);
      const lighter = d === today && input.readinessToday === 'orange';
      const cls = classSlotOn(a, prefs.classSlots, prefs.trainAtHome);
      const k = kinds.get(d)!;
      const rec = recoveryAt({ date: d, slot: slotFor(d, k) }, timeline, soreOn(d));
      timeline.push(plannedEvent(d, k));
      if (k === 'strength') {
        const t: Template = lastTemplate === 'A' ? 'B' : 'A';
        lastTemplate = t;
        const focus = strengthFocus(rec, input.weakGroup);
        const kindWhy =
          a.want === 'strength'
            ? 'Jouw keuze: kracht.'
            : cls
              ? tennisNear(d)
                ? `Kracht gaat voor: tennis is al je conditie deze 7 dagen.`
                : 'Kracht gaat voor: de motor van je recompositie.'
              : '';
        result.push({
          date: d, type: 'strength', sweat: true, status: 'planned', template: t, location: r.location, minutes: a.minutes, slot: r.slot,
          title: `Full body ${t} · ${LOC[r.location]} · ${a.minutes} min${deload.deload ? ' · deload' : ''}`, lighter, deload: deload.deload,
          focus, classSlot: !!cls, want: a.want, weather,
          why: [kindWhy, focus.why ?? sinceText(d)].filter(Boolean).join(' '),
        });
      } else {
        const location: Location = cls ? 'gym' : r.location;
        const legs = rec.benen;
        const legWhy =
          legs.state === 'moe'
            ? `Benen nog moe${legs.cause ? ` (${legs.cause})` : ''}: draai rustig mee.`
            : legs.state === 'herstelt'
              ? 'Benen herstellen nog: neem de zware stukken rustig.'
              : sinceText(d);
        const kindWhy = lighter
          ? 'Dagvorm oranje: rustig tempo, geen intervallen.'
          : a.want === 'cardio'
            ? `Jouw keuze: ${cls ? prefs.className.toLowerCase() : 'conditie'}.`
            : cls
              ? `Lesmoment ${prefs.className.toLowerCase()}: je conditie voor deze 7 dagen.`
              : 'Conditie: geen lesmoment die dag, dus fiets of roeier.';
        result.push({
          date: d, type: 'cardio', sweat: true, status: 'planned', location, minutes: a.minutes, slot: cls ?? r.slot, groupClass: !!cls && !lighter,
          title: cardioTitle(location, a.minutes, lighter, cls ? prefs.className : undefined), lighter, classSlot: !!cls, want: a.want, weather,
          why: `${kindWhy} ${legWhy}`,
        });
      }
      continue;
    }
    const moved = (postponed.has(d) || (d === today && input.readinessToday === 'red')) && original.has(d);
    const walk = wx ? walkAdvice(wx) : undefined;
    const picked = moved ? { light: LIGHT.mobiliteit } : chooseLight(prevStrength, dayIndex(d), walk);
    const light = picked.light;
    const yesterday = sweatDays.get(addDays(d, -1));
    const tomorrow = sweatDays.get(addDays(d, 1));
    result.push({
      date: d, type: 'light', sweat: false, status: moved ? 'moved' : 'free', title: `${light.title} (${light.minutes} min, zweetvrij)`, light,
      note: moved ? 'Verplaatst: vandaag herstel.' : undefined, weather, walk,
      why: moved
        ? undefined
        : yesterday
          ? `Rustdag na ${yesterday} gisteren: je spieren bouwen nu op.`
          : tomorrow
            ? `Morgen ${tomorrow}: vandaag rustig.`
            : 'Zweetvrij tussen je trainingen.',
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
  // Groepsles: eerlijk zeggen waarom ze er niet staat, en hoe je ze toch krijgt.
  const strengthOnClass = result.filter((r) => r.status === 'planned' && r.type === 'strength' && r.classSlot && !r.want);
  if (prefs.className && !result.some((r) => r.groupClass) && strengthOnClass.length > 0) {
    messages.push(
      `${prefs.className} staat er deze 7 dagen niet in: ${tennis.length ? 'tennis is al je conditie en ' : ''}kracht gaat voor. Liever ${prefs.className.toLowerCase()} op ${dayName((strengthOnClass.find((r) => r.date !== today) ?? strengthOnClass[0]!).date)}? Tik op die dag hierboven.`,
    );
  }
  const strengthPlanned = result.filter((r) => r.type === 'strength' && r.status !== 'free').length;
  if (result.some((r) => r.want === 'cardio') && strengthPlanned < strengthPerWeek) {
    messages.push(`Door je keuze voor conditie staat er deze 7 dagen ${strengthPlanned}× kracht in plaats van ${strengthPerWeek}×. Prima af en toe; kracht is wel je motor.`);
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

export { GROUP_LABEL };
