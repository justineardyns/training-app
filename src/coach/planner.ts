import { classSlotFor, classSlotOn, DEFAULT_CLASS_SLOTS, defaultDay, resolveDay } from './availability.ts';
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
import {
  clampTarget,
  DEFAULT_TARGET,
  MAX_CARDIO,
  MAX_STRENGTH,
  NORMAL_MIN,
  validateRolling,
  type RuleSession,
  type Split,
  type Violation,
} from './rules.ts';
import { templateTitle } from './session.ts';
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
  /** Krachttraining: full body, bovenlichaam of benen & romp. */
  split?: Split;
  /** Uur van de groepsles (bv. '10:00'). */
  time?: string;
  /** Conditie = haarwasdag. */
  hair?: boolean;
  /** Weer, als je iPhone het kon ophalen. */
  weather?: { icon: string; text: string; tMax: number; tMin: number; precipProb: number };
  /** Zweetvrije dag: wandelen of binnen? */
  walk?: WalkAdvice;
}

export interface WeekPlan {
  /** Eerste dag van het venster (meestal vandaag). */
  start: ISODate;
  days: PlannedDay[];
  /** Hoeveel trainingen de coach deze 7 dagen wil (opbouw, dagvorm). */
  target: number;
  /** Jouw maximum (voorkeuren of /coach). */
  cap: number;
  /** Mix in het venster (gepland + vandaag gedaan, tennis = conditie). */
  strength: number;
  cardio: number;
  /** Sessies vandaag al gedaan. */
  done: number;
  /** Geplande trainingen in het venster (incl. tennis). */
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
  targetPerWeek: DEFAULT_TARGET,
  strengthPerWeek: 3,
  deloadEvery: 6,
  experience: 'beginner',
  className: 'Indoor cycling',
  classSlots: DEFAULT_CLASS_SLOTS,
  tennisDays: [3],
  minutes: 45,
  trainAtHome: false,
  rulesVersion: 2,
};

/** Oude of onvolledige voorkeuren aanvullen (en naar de regels van nu brengen). */
export function normalizePrefs(p: (Partial<Prefs> & { thirdSession?: string }) | undefined): Prefs {
  const out = { ...DEFAULT_PREFS, ...(p ?? {}) } as Prefs & { thirdSession?: string };
  if (p && p.strengthPerWeek === undefined && p.thirdSession) out.strengthPerWeek = p.thirdSession === 'strength' ? 3 : 2;
  delete out.thirdSession;
  // Regels v2: kracht en conditie apart (samen max 6), lessen ook donderdagavond, weekend om 10u.
  if (p && (p.rulesVersion ?? 1) < 2) {
    if ((p.targetPerWeek ?? 4) >= 4) out.targetPerWeek = DEFAULT_TARGET;
    const slots = (p.classSlots ?? DEFAULT_CLASS_SLOTS).map((c) => (c.slot === 'day' && !c.time ? { ...c, time: '10:00' } : c));
    if (!slots.some((c) => c.day === 3 && c.slot === 'evening')) slots.push({ day: 3, slot: 'evening' });
    out.classSlots = slots.sort((a, b) => a.day - b.day);
  }
  out.rulesVersion = 2;
  out.targetPerWeek = clampTarget(out.targetPerWeek);
  out.strengthPerWeek = Math.max(1, Math.min(MAX_STRENGTH, Math.round(out.strengthPerWeek)));
  return out;
}

/** Geldt deze bijsturing al? */
export function activeAdjustments(adj: CoachAdjustments | undefined, date: ISODate): CoachAdjustments | undefined {
  if (!adj) return undefined;
  if (adj.validFrom && adj.validFrom > date) return undefined;
  return adj;
}

const LOC = { gym: 'Jims', home: 'thuis' } as const;

/** '10:00' → '10u', '19:30' → '19u30'. */
export function hourText(t: string | undefined): string | undefined {
  if (!t) return undefined;
  const [h, m] = t.split(':');
  return m && m !== '00' ? `${Number(h)}u${m}` : `${Number(h)}u`;
}

export function cardioTitle(loc: Location, min: Minutes, lighter: boolean, groupClass?: string, time?: string): string {
  if (lighter) return `Rustige cardio (zone 2) · ${LOC[loc]} · ${min} min`;
  if (groupClass) return `${groupClass} (groepsles) · Jims${time ? ` · ${hourText(time)}` : ''}`;
  if (loc === 'home') return `Conditie thuis: kettlebell-circuit · ${min} min`;
  return `Conditie: fiets of roeier · Jims · ${min} min`;
}

function sessionTitle(s: SessionLog): string {
  if (s.title) return s.title;
  if (s.kind === 'strength') return templateTitle(s.template);
  if (s.kind === 'class') return s.workoutType ? `Groepsles: ${s.workoutType}` : 'Groepsles';
  return s.workoutType ? `Cardio: ${s.workoutType}` : 'Cardio';
}

const isTennis = (s: SessionLog) => `${s.title ?? ''} ${s.workoutType ?? ''}`.toLowerCase().includes('tennis');
export function splitOfTemplate(t: Template | undefined): Split {
  return t === 'U' ? 'upper' : t === 'L' ? 'lower' : 'full';
}
/** Een gedane sessie zoals de regels ze zien. */
export function ruleSession(s: SessionLog, planned = false): RuleSession {
  return s.kind === 'strength'
    ? { date: s.date, planned, kind: 'strength', split: splitOfTemplate(s.template) }
    : { date: s.date, planned, kind: 'cardio', legs: !isTennis(s) };
}

export interface CoachTarget {
  target: number;
  cap: number;
  note?: string;
}

/**
 * Hoeveel trainingen deze 7 dagen? Jouw maximum, maar een goede coach bouwt op:
 * absolute beginner eerst 4, dan 5, dan 6. Vaak moe → 1 minder. /coach kan het vastzetten.
 */
export function coachTarget(input: {
  prefs: Prefs;
  history: SessionLog[];
  today: ISODate;
  adjustments?: CoachAdjustments;
  readinessLog?: { date: ISODate; level: ReadinessLevel }[];
}): CoachTarget {
  const cap = clampTarget(input.adjustments?.targetSessions ?? input.prefs.targetPerWeek);
  if (input.adjustments?.targetSessions) return { target: cap, cap };
  let target = cap;
  let note: string | undefined;
  if (input.prefs.experience === 'beginner') {
    const n = input.history.filter((s) => SWEAT_KINDS.has(s.kind) && s.date < input.today).length;
    if (n < 8 && target > 4) {
      target = 4;
      note = 'Opbouw: de eerste weken 4 trainingen per 7 dagen, daarna 5 en dan 6. Zo raakt je lichaam eraan gewend.';
    } else if (n < 16 && target > 5) {
      target = 5;
      note = 'Opbouw: nu 5 trainingen per 7 dagen. Binnenkort 6.';
    }
  }
  const recent = (input.readinessLog ?? []).filter((r) => r.date < input.today && r.date >= addDays(input.today, -7));
  if (recent.filter((r) => r.level !== 'green').length >= 3 && target > 2) {
    target -= 1;
    note = `Je was de afgelopen dagen vaak moe: deze 7 dagen ${target} trainingen in plaats van ${target + 1}.`;
  }
  return { target, cap, note };
}

type Choice = 'rest' | 'S' | 'C';
const opposite = (s: Split): Split => (s === 'upper' ? 'lower' : 'upper');

export function planWeek(input: PlanInput): WeekPlan {
  const { today } = input;
  const start = input.start && input.start > today ? input.start : today;
  const horizon = input.horizon ?? 7;
  const days = Array.from({ length: horizon }, (_, i) => addDays(start, i));
  const prefs = normalizePrefs(input.prefs);
  const adj = activeAdjustments(input.adjustments, start);
  const ct = coachTarget({ prefs, history: input.history, today: start, adjustments: adj, readinessLog: input.readinessLog });
  const T = ct.target;
  const postponed = new Set(input.postponed ?? []);
  const original = new Set(input.originalPlan ?? []);
  const avoid = new Set(input.avoidWeekdays ?? []);
  const av = new Map(days.map((d) => [d, input.availability(d)]));
  const wish = (d: ISODate) => av.get(d)?.want;
  const short = (d: ISODate) => DAY_SHORT[dayIndex(d)]!;
  const idx = (d: ISODate) => diffDays(d, start);

  // Gedane trainingen (ook vóór het venster: nodig voor de regels over 7 dagen en "na elkaar").
  const sweat = input.history.filter((s) => SWEAT_KINDS.has(s.kind));
  const doneOn = new Map<ISODate, SessionLog[]>();
  for (const s of sweat) doneOn.set(s.date, [...(doneOn.get(s.date) ?? []), s]);

  // Tennis: jouw vaste afspraak (conditie, haarwasdag), zolang die dag nog niets gedaan is.
  const tennis = days.filter((d) => (av.get(d)!.tennis ?? 0) > 0 && !doneOn.has(d) && !postponed.has(d));
  const tennisSet = new Set(tennis);

  // Vaste trainingen per dag (gedaan + tennis), zoals de regels ze zien.
  const fixed = new Map<ISODate, RuleSession[]>();
  for (const s of sweat) fixed.set(s.date, [...(fixed.get(s.date) ?? []), ruleSession(s)]);
  for (const d of tennis) fixed.set(d, [{ date: d, planned: false, kind: 'cardio', legs: false }]);

  const doneTodayCount = start === today ? (doneOn.get(today)?.length ?? 0) : 0;

  // Mix: de coach kiest. Standaard iets meer kracht (recompositie); was het vorige week vooral
  // conditie, dan wat meer kracht, en omgekeerd. /coach kan het vastzetten.
  const prev7 = sweat.filter((s) => s.date >= addDays(start, -7) && s.date < start);
  const prevS = prev7.filter((s) => s.kind === 'strength').length;
  const prevC = prev7.length - prevS;
  let wantS = adj?.strengthSessions ?? (T <= 4 ? 2 : 3);
  let mixNote: string | undefined;
  if (adj?.strengthSessions === undefined && prev7.length >= 3) {
    if (prevC >= prevS + 2) {
      wantS += 1;
      mixNote = 'Deze keer wat meer kracht: de voorbije 7 dagen deed je vooral conditie.';
    } else if (prevS >= prevC + 2) {
      wantS -= 1;
      mixNote = 'Deze keer wat meer conditie: de voorbije 7 dagen deed je vooral kracht.';
    }
  }
  wantS = Math.max(Math.min(1, T), T - MAX_CARDIO, Math.min(wantS, MAX_STRENGTH, T));

  const novice = !!input.novice;

  // Welke keuzes per dag?
  const candidate = (d: ISODate) =>
    resolveDay(av.get(d)!, prefs.trainAtHome).available && !fixed.has(d) && !postponed.has(d) && !(d === today && input.readinessToday === 'red');
  const options: Choice[][] = days.map((d) => {
    if (!candidate(d)) return ['rest'];
    const w = wish(d);
    return w ? [w === 'strength' ? 'S' : 'C', 'rest'] : ['S', 'C', 'rest'];
  });

  // Zoektocht per dag (rust, kracht of conditie) over getallenreeksen: snel genoeg voor elke tik.
  // Index k = dag start + (k - OFF); OFF dagen terug voor de regels over 7 dagen en "na elkaar".
  const OFF = 8;
  const LEN = horizon + 2 * OFF;
  const dateAt = Array.from({ length: LEN }, (_, k) => addDays(start, k - OFF));
  const fN = new Int8Array(LEN);
  const fC = new Int8Array(LEN);
  const fLegsC = new Uint8Array(LEN);
  const fSplit: (Split | undefined)[] = new Array(LEN).fill(undefined);
  for (let k = 0; k < LEN; k++) {
    const list = fixed.get(dateAt[k]!) ?? [];
    fN[k] = list.length;
    fC[k] = list.filter((x) => x.kind === 'cardio').length;
    fLegsC[k] = list.some((x) => x.kind === 'cardio' && x.legs) ? 1 : 0;
    fSplit[k] = list.find((x) => x.kind === 'strength')?.split;
  }
  /** 0 = rust, 1 = kracht, 2 = conditie (enkel geplande dagen). */
  const A = new Int8Array(LEN);
  const nAt = (k: number) => fN[k]! + (A[k]! ? 1 : 0);
  const cAt = (k: number) => fC[k]! + (A[k] === 2 ? 1 : 0);
  const legsCAt = (k: number) => fLegsC[k] === 1 || A[k] === 2;
  const sPlanned = (k: number) => A[k] === 1;

  const windowOk = (k: number) => {
    for (let j = k - 6; j <= k; j++) {
      if (j < 0) continue;
      let n = 0;
      let c = 0;
      for (let q = j; q < j + 7 && q < LEN; q++) {
        n += nAt(q);
        c += cAt(q);
      }
      if (n > T || c > MAX_CARDIO || n - c > MAX_STRENGTH) return false;
    }
    return true;
  };

  /** Spieren per krachttraining, uit de buren: naast cycling bovenlichaam, twee dagen na elkaar afwisselen. */
  const SP: (Split | undefined)[] = new Array(LEN).fill(undefined);
  const deriveSplits = (): boolean => {
    for (let k = OFF; k < OFF + horizon; k++) SP[k] = undefined;
    const splitAt = (k: number) => SP[k] ?? fSplit[k];
    const blocked = (k: number) => legsCAt(k - 1) || legsCAt(k + 1);
    const legsRecent = (k: number) => {
      for (let q = k - 1; q >= k - 6; q--) {
        const sp = splitAt(q);
        if (sp) return sp !== 'upper';
      }
      return false;
    };
    const runOk = (k0: number, first: Split) => {
      let g = first;
      let k = k0;
      for (; sPlanned(k); k++) {
        if (g === 'lower' && blocked(k)) return false;
        g = opposite(g);
      }
      const fx = fSplit[k];
      return !(fx && (fx === 'full' || fx !== g));
    };
    for (let k = OFF; k < OFF + horizon; k++) {
      if (!sPlanned(k)) continue;
      const prev = splitAt(k - 1);
      const nextFixed = sPlanned(k + 1) ? undefined : fSplit[k + 1];
      let f: Split;
      if (prev) {
        if (prev === 'full') return false;
        f = opposite(prev);
      } else if (nextFixed) {
        if (nextFixed === 'full') return false;
        f = opposite(nextFixed);
      } else if (sPlanned(k + 1)) {
        const order: Split[] = legsRecent(k) ? ['upper', 'lower'] : ['lower', 'upper'];
        const ok = order.find((o) => runOk(k, o));
        if (!ok) return false;
        f = ok;
      } else f = blocked(k) ? 'upper' : 'full';
      if (f !== 'upper' && blocked(k)) return false;
      SP[k] = f;
    }
    return true;
  };

  // Vaste info per geplande dag (één keer berekend).
  const dayInfo = days.map((d, i) => {
    const a = av.get(d)!;
    return {
      base: 20 + a.minutes / 15 - 0.15 * i + (original.has(d) ? 3 : 0) + (a.want ? 6 : 0) - (avoid.has(dayIndex(d)) ? 4 : 0),
      cls: classSlotOn(a, prefs.classSlots, prefs.trainAtHome) ? 3 : -1.5,
      gym: resolveDay(a, prefs.trainAtHome).location === 'gym' ? 1 : 0,
    };
  });
  const tennisAt = new Uint8Array(LEN);
  const tennis2hAt = new Uint8Array(LEN);
  for (const t of tennis) {
    tennisAt[idx(t) + OFF] = 1;
    if ((av.get(t)?.tennis ?? 0) >= 90) tennis2hAt[idx(t) + OFF] = 1;
  }
  let doneS = 0;
  let doneC = 0;
  if (start === today) for (const s of doneOn.get(today) ?? []) s.kind === 'strength' ? doneS++ : doneC++;

  let best = -Infinity;
  const bestA = new Int8Array(LEN);
  const bestSP: (Split | undefined)[] = new Array(LEN).fill(undefined);
  const evaluate = () => {
    if (!deriveSplits()) return;
    let sc = 0;
    let nS = doneS;
    let lowerN = 0;
    let upperN = 0;
    for (let i = 0; i < horizon; i++) {
      const k = i + OFF;
      const c = A[k]!;
      if (!c) continue;
      const info = dayInfo[i]!;
      sc += info.base;
      if (c === 2) sc += info.cls;
      else {
        nS++;
        const sp = SP[k]!;
        if (sp !== 'upper') {
          lowerN++;
          // Benen: liefst 2 dagen weg van indoor cycling, en niet naast tennis.
          if (legsCAt(k - 2) || legsCAt(k + 2)) sc -= 1;
          if (tennisAt[k - 1] || tennisAt[k + 1]) sc -= 1;
        }
        if (sp !== 'lower') upperN++;
        sc += info.gym;
        if (tennis2hAt[k - 1]) sc -= 1;
      }
    }
    sc -= 3.5 * Math.abs(nS - wantS);
    // Een 5e en 6e training is mooi meegenomen, maar niet ten koste van de mix of je benen.
    let count = start === today ? doneS + doneC : 0;
    for (let i = 0; i < horizon; i++) if (A[i + OFF]) count++;
    count += tennis.length;
    if (count > 4) sc -= 12 * (count - 4);
    if (nS >= 2 && lowerN === 0) sc -= 6;
    if (nS >= 2 && upperN === 0) sc -= 6;
    if (nS >= 3 && (lowerN < 2 || upperN < 2)) sc -= 1;
    let run = nAt(OFF - 1) > 0 ? 1 : 0;
    for (let k = OFF; k < OFF + horizon; k++) {
      if (nAt(k) > 0) {
        run++;
        // Nieuw voor je spieren: liefst een rustdag ertussen.
        if (run >= 2) sc -= novice ? 2.5 : 1.2;
        if (run >= 3) sc -= novice ? 5 : 3;
      } else run = 0;
    }
    if (sc > best + 1e-9) {
      best = sc;
      bestA.set(A);
      for (let k = 0; k < LEN; k++) bestSP[k] = SP[k];
    }
  };
  const CODE: Record<Choice, number> = { rest: 0, S: 1, C: 2 };
  const dfs = (i: number) => {
    if (i === horizon) return evaluate();
    const k = i + OFF;
    for (const c of options[i]!) {
      A[k] = CODE[c];
      if (c === 'C' && (cAt(k - 1) > 0 || cAt(k + 1) > 0)) continue;
      // Geen indoor cycling naast een (gedane) benentraining.
      if (c === 'C' && ((fSplit[k - 1] && fSplit[k - 1] !== 'upper') || (fSplit[k + 1] && fSplit[k + 1] !== 'upper'))) continue;
      if (c === 'S' && fSplit[k - 1] === 'full') continue;
      if (c !== 'rest' && !windowOk(k)) continue;
      dfs(i + 1);
    }
    A[k] = 0;
  };
  dfs(0);
  A.set(bestA);
  const assign: Choice[] = days.map((_, i) => (A[i + OFF] === 1 ? 'S' : A[i + OFF] === 2 ? 'C' : 'rest'));
  const bestSplits = new Map<ISODate, Split>();
  days.forEach((d, i) => {
    const sp = bestSP[i + OFF];
    if (assign[i] === 'S' && sp) bestSplits.set(d, sp);
  });
  const legsCardio = (d: ISODate) => legsCAt(idx(d) + OFF);
  const chosen = days.filter((_, i) => assign[i] !== 'rest');
  const kindOf = (d: ISODate) => (assign[idx(d)] === 'S' ? 'strength' : 'cardio');

  const deload = decideDeload({
    monday: weekStart(start),
    history: input.history,
    readiness: input.readinessLog ?? [],
    prefs,
    adjustments: adj,
  });

  // Herstel: wat je spieren nog meedragen (voor de focus binnen een training en de uitleg).
  const timeline: LoadEvent[] = [
    ...sweat.filter((s) => s.date >= addDays(start, -4) && s.date <= addDays(start, horizon)).map((s) => eventFromSession(s, novice)),
    ...tennis.map((d) => {
      const min = av.get(d)!.tennis ?? 60;
      return { date: d, slot: 'evening' as Slot, label: `tennis${min >= 90 ? ' (2u)' : ''} ${short(d)}`, load: cardioLoad('tennis', min) };
    }),
  ];
  const soreOn = (d: ISODate) => (d === today ? (input.soreToday ?? []) : []);

  // A/B wisselen voor full body, op basis van de laatste full body.
  let lastFull: Template | undefined = input.history
    .filter((s) => s.kind === 'strength' && (s.template === 'A' || s.template === 'B') && s.date < start)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .at(-1)?.template;

  // Labels per dag (gedaan, tennis of gepland), voor de uitleg.
  const labelOn = new Map<ISODate, string>();
  for (const s of sweat) labelOn.set(s.date, s.kind === 'strength' ? templateTitle(s.template).toLowerCase() : (s.title ?? s.workoutType ?? 'conditie').toLowerCase());
  for (const t of tennis) labelOn.set(t, 'tennis');
  for (const d of chosen) {
    labelOn.set(
      d,
      kindOf(d) === 'strength'
        ? templateTitle(bestSplits.get(d) === 'upper' ? 'U' : bestSplits.get(d) === 'lower' ? 'L' : 'A').replace(' A', '').toLowerCase()
        : classSlotOn(av.get(d)!, prefs.classSlots, prefs.trainAtHome)
          ? prefs.className.toLowerCase()
          : 'cardio',
    );
  }
  const prevTraining = (d: ISODate) => {
    for (let k = 1; k <= 6; k++) {
      const x = addDays(d, -k);
      if (labelOn.has(x)) return { date: x, label: labelOn.get(x)!, gap: k };
    }
    return undefined;
  };
  const sinceText = (d: ISODate) => {
    const p = prevTraining(d);
    if (!p) return 'Uitgerust aan de start.';
    return p.gap === 1 ? `Gisteren ${p.label}: andere spieren vandaag.` : `${p.gap} dagen na ${p.label} (${short(p.date)}): je spieren zijn hersteld.`;
  };

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
      if (strengthLog?.template === 'A' || strengthLog?.template === 'B') lastFull = strengthLog.template;
      result.push({
        date: d, type: strengthLog ? 'strength' : 'cardio', sweat: true, status: 'done', title: done.map(sessionTitle).join(' + '),
        template: strengthLog?.template, location: strengthLog?.location, sessions: done, weather,
        split: strengthLog ? splitOfTemplate(strengthLog.template) : undefined, hair: done.some((s) => s.kind !== 'strength'),
      });
      continue;
    }
    if (tennisSet.has(d)) {
      const min = a.tennis!;
      result.push({
        date: d, type: 'tennis', sweat: true, status: 'planned', minutes: Math.min(60, min) as Minutes, note: 'Telt als conditiesessie.',
        title: `Tennis · ${min >= 60 ? `${Math.round(min / 60)}u` : `${min} min`}`, weather, hair: true,
        why: 'Telt als je conditie (haarwasdag). De dag ervoor en erna geen conditie.',
      });
      continue;
    }
    if (assign[idx(d)] !== 'rest') {
      const r = resolveDay(a, prefs.trainAtHome);
      const lighter = d === today && input.readinessToday === 'orange';
      const cls = classSlotFor(a, prefs.classSlots, prefs.trainAtHome);
      const k = kindOf(d);
      const slot = (k === 'cardio' ? cls?.slot : undefined) ?? r.slot;
      const rec = recoveryAt({ date: d, slot }, timeline, soreOn(d));
      if (k === 'strength') {
        const split = bestSplits.get(d) ?? 'full';
        const t: Template = split === 'upper' ? 'U' : split === 'lower' ? 'L' : lastFull === 'A' ? 'B' : 'A';
        if (split === 'full') lastFull = t;
        timeline.push({
          date: d, slot, label: `${templateTitle(t).toLowerCase()} ${short(d)}`,
          load: split === 'upper' ? { duwen: 6, trekken: 6, core: 2 } : split === 'lower' ? { benen: 7, core: 3 } : PLANNED_STRENGTH,
        });
        const focus = strengthFocus(rec, input.weakGroup, split === 'upper' ? ['duwen', 'trekken'] : split === 'lower' ? ['benen'] : undefined);
        const yLegs = legsCardio(addDays(d, -1));
        const tLegs = legsCardio(addDays(d, 1));
        const prevSplit = result.at(-1)?.type === 'strength' ? result.at(-1)?.split : undefined;
        const nextS = assign[idx(d) + 1] === 'S';
        const splitWhy =
          split === 'upper' && yLegs
            ? `Bovenlichaam: gisteren ${labelOn.get(addDays(d, -1))}, je benen rusten.`
            : split === 'upper' && tLegs
              ? `Bovenlichaam: morgen ${labelOn.get(addDays(d, 1))}, dan zijn je benen fris.`
              : split !== 'full' && prevSplit
                ? `${templateTitle(t)}: gisteren ${prevSplit === 'upper' ? 'bovenlichaam' : 'benen'}, vandaag de andere spieren.`
                : split !== 'full' && nextS
                  ? `${templateTitle(t)}: morgen ${split === 'upper' ? 'benen' : 'bovenlichaam'}.`
                  : '';
        const kindWhy = a.want === 'strength' ? 'Jouw keuze: kracht.' : '';
        result.push({
          date: d, type: 'strength', sweat: true, status: 'planned', template: t, location: r.location, minutes: a.minutes, slot: r.slot,
          title: `${templateTitle(t)} · ${LOC[r.location]} · ${a.minutes} min${deload.deload ? ' · deload' : ''}`, lighter, deload: deload.deload,
          focus, split, classSlot: !!cls, want: a.want, weather,
          why: [kindWhy, splitWhy, focus.why ?? (splitWhy ? '' : sinceText(d))].filter(Boolean).join(' '),
        });
      } else {
        const location: Location = cls ? 'gym' : r.location;
        timeline.push({ date: d, slot, label: `${cls ? prefs.className.toLowerCase() : 'cardio'} ${short(d)}`, load: cardioLoad(cls ? 'cycling' : 'fiets', a.minutes) });
        const legs = rec.benen;
        const legWhy =
          legs.state === 'moe'
            ? `Benen nog moe${legs.cause ? ` (${legs.cause})` : ''}: draai rustig mee.`
            : legs.state === 'herstelt'
              ? 'Benen herstellen nog: neem de zware stukken rustig.'
              : 'Geen benentraining de dag ervoor of erna.';
        const kindWhy = lighter
          ? 'Dagvorm oranje: rustig tempo, geen intervallen.'
          : a.want === 'cardio'
            ? `Jouw keuze: ${cls ? prefs.className.toLowerCase() : 'conditie'}.`
            : cls
              ? `Lesmoment ${prefs.className.toLowerCase()}${cls.time ? ` om ${hourText(cls.time)}` : ''}.`
              : 'Conditie: geen les die dag, dus fiets of roeier.';
        result.push({
          date: d, type: 'cardio', sweat: true, status: 'planned', location, minutes: a.minutes, slot, groupClass: !!cls && !lighter,
          title: cardioTitle(location, a.minutes, lighter, cls ? prefs.className : undefined, cls?.time), lighter, classSlot: !!cls, want: a.want,
          weather, hair: true, time: cls?.time,
          why: `${kindWhy} ${legWhy}`,
        });
      }
      continue;
    }
    const moved = (postponed.has(d) || (d === today && input.readinessToday === 'red')) && original.has(d);
    const walk = wx ? walkAdvice(wx) : undefined;
    const picked = moved ? { light: LIGHT.mobiliteit } : chooseLight(prevStrength, dayIndex(d), walk);
    const light = picked.light;
    const yesterday = labelOn.get(addDays(d, -1));
    const tomorrow = labelOn.get(addDays(d, 1));
    result.push({
      date: d, type: 'light', sweat: false, status: moved ? 'moved' : 'free', title: `${light.title} (${light.minutes} min, zweetvrij)`, light,
      note: moved ? 'Verplaatst: vandaag herstel.' : undefined, weather, walk,
      why: moved
        ? undefined
        : yesterday
          ? `Rustdag na ${yesterday} gisteren: je spieren bouwen nu op.`
          : tomorrow
            ? `Morgen ${tomorrow}: vandaag rustig.`
            : 'Rustdag: ook die horen bij je opbouw.',
    });
  }

  // Mix in het venster.
  const inWindow = result.filter((r) => r.status === 'planned' || (r.status === 'done' && r.date === today && start === today));
  const nStrength = inWindow.filter((r) => r.type === 'strength').length;
  const nCardio = inWindow.length - nStrength;

  // Boodschappen: kort en eerlijk.
  const messages: string[] = [];
  const unticked = input.explicit ? days.filter((d) => d > today && !input.explicit!(d)).length : 0;
  if (unticked >= 3) messages.push(`${unticked} van de komende dagen heb je nog niet aangevinkt. Ik ging uit van je vaste patroon. Tik op Week om aan te passen.`);
  if (ct.note) messages.push(ct.note);
  // Enkel zeggen als het plan het ook echt doet (t.o.v. de voorbije 7 dagen).
  if (mixNote && (mixNote.includes('meer kracht') ? nStrength > prevS && nCardio < prevC : nCardio > prevC && nStrength < prevS)) messages.push(mixNote);
  if (deload.deload) messages.push(deload.message);
  const missed = [...original].filter((d) => d < today && d >= addDays(today, -3) && !doneOn.has(d));
  if (missed.length) messages.push(`Je miste ${missed.length === 1 ? 'een training' : `${missed.length} trainingen`}. Geen inhaalrace: we stapelen niet, het plan schuift op.`);
  if (input.readinessToday === 'red' && original.has(today)) {
    const next = result.find((r) => r.status === 'planned' && r.date > today);
    messages.push(next ? `Rood vandaag: je training schuift naar ${dayName(next.date)}.` : 'Rood vandaag. Er is geen plek meer zonder de regels te breken: herstel gaat voor.');
  }
  for (const t of tennis) {
    if ((fixed.get(addDays(t, -1)) ?? []).some((x) => x.kind === 'cardio' && !tennisSet.has(x.date))) {
      messages.push(`Tennis op ${dayName(t)} komt meteen na een conditiedag: twee haarwasdagen na elkaar. Speel rustig of sla een van beide over.`);
    }
  }
  const total = chosen.length + tennis.length + doneTodayCount;
  if (total < T) {
    const why = `In de komende 7 dagen passen ${total} van de ${T} trainingen binnen je beschikbaarheid en de regels (conditie nooit 2 dagen na elkaar, geen benen naast ${prefs.className.toLowerCase()}).`;
    messages.push(total < NORMAL_MIN ? `${why} Kan je ergens een extra avond vrijmaken?` : why);
  }
  // Groepsles: eerlijk zeggen waarom ze er niet staat, en hoe je ze toch krijgt.
  const strengthOnClass = result.filter((r) => r.status === 'planned' && r.type === 'strength' && r.classSlot && !r.want);
  if (prefs.className && !result.some((r) => r.groupClass) && strengthOnClass.length > 0) {
    const day = (strengthOnClass.find((r) => r.date !== today) ?? strengthOnClass[0]!).date;
    messages.push(
      `${prefs.className} staat er deze 7 dagen niet in${tennis.length ? ': tennis is al je conditie' : ''}. Liever ${prefs.className.toLowerCase()} op ${dayName(day)}? Tik op die dag hierboven.`,
    );
  }
  if (result.some((r) => r.want === 'cardio') && nStrength < 2 && T >= 3) {
    messages.push(`Door je keuze voor conditie staat er deze 7 dagen ${nStrength}× kracht. Prima af en toe; kracht is wel je motor.`);
  }
  for (const d of days) {
    const w = wish(d);
    const got = result.find((r) => r.date === d);
    if (!w || !candidate(d) || (w === 'strength' ? got?.type === 'strength' : got?.type === 'cardio')) continue;
    messages.push(
      `Je koos ${w === 'strength' ? 'kracht' : 'conditie'} op ${dayName(d)}, maar dat past daar niet binnen de regels (conditie nooit 2 dagen na elkaar, geen benen naast ${prefs.className.toLowerCase()}, max per 7 dagen). Ik hield die dag vrij.`,
    );
  }
  if (adj?.focus) messages.push(`Coach: ${adj.focus}`);

  const plannedRules: RuleSession[] = chosen.map((d) =>
    kindOf(d) === 'strength'
      ? { date: d, planned: true, kind: 'strength', split: bestSplits.get(d) ?? 'full' }
      : { date: d, planned: true, kind: 'cardio', legs: true },
  );
  const violations = validateRolling({
    sessions: [...[...fixed.values()].flat(), ...plannedRules],
    available: (d) => resolveDay(av.get(d) ?? defaultDay(d, prefs.minutes), prefs.trainAtHome).available,
  });

  return {
    start, days: result, target: T, cap: ct.cap, strength: nStrength, cardio: nCardio,
    done: doneTodayCount, planned: chosen.length + tennis.length, deload, messages, violations,
  };
}

export { GROUP_LABEL };
