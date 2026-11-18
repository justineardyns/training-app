import { EXERCISES, RELATED } from './catalog.ts';
import { addDays, DAY_NAMES, dayIndex } from './dates.ts';
import type { CoachAdjustments, ISODate } from './types.ts';

// De harde regels. Elk plan (ook een bijsturing door /coach) moet hier door.

/** Absoluut maximum trainingen per 7 dagen (rollend): kracht + conditie samen. */
export const MAX_PER_WEEK = 6;
/** Conditie (indoor cycling, tennis, cardio) = haarwasdag: max 4 per 7 dagen, nooit 2 dagen na elkaar. */
export const MAX_CARDIO = 4;
/** Kracht: max 4 per 7 dagen. */
export const MAX_STRENGTH = 4;
/** Onder dit aantal zegt de coach eerlijk dat het te weinig is. */
export const NORMAL_MIN = 2;
export const DEFAULT_TARGET = 6;

/** Welke spieren een krachttraining traint. */
export type Split = 'full' | 'upper' | 'lower';

export type RuleId =
  | 'max_per_7_days'
  | 'max_cardio'
  | 'max_strength'
  | 'consecutive_cardio'
  | 'legs_next_to_cycling'
  | 'same_muscles'
  | 'unavailable'
  | 'double_day';

export interface Violation {
  rule: RuleId;
  dates: ISODate[];
  message: string;
}

export interface RuleSession {
  date: ISODate;
  planned: boolean;
  kind: 'strength' | 'cardio';
  /** Kracht: welke spieren (standaard full body). */
  split?: Split;
  /** Conditie die zwaar is voor je benen (indoor cycling, fiets, roeier). Tennis: nee. */
  legs?: boolean;
}

export interface RollingCheck {
  /** Alle trainingen (gedaan, vaste zoals tennis, en gepland), één item per sessie. */
  sessions: RuleSession[];
  /** Kan je op die dag? (enkel voor geplande sessies gecontroleerd) */
  available?: (date: ISODate) => boolean;
}

const trainsLegs = (s: RuleSession) => s.kind === 'strength' && (s.split ?? 'full') !== 'upper';
const fmt = (d: ISODate) => `${DAY_NAMES[dayIndex(d)]} ${d}`;

/**
 * Harde regels over een rollend venster:
 * - één training per dag
 * - in elke 7 opeenvolgende dagen max 6 trainingen, waarvan max 4 conditie en max 4 kracht
 * - conditie (haarwasdag) nooit twee dagen na elkaar
 * - geen benentraining de dag voor of na indoor cycling (of andere conditie die zwaar is voor de benen)
 * - kracht twee dagen na elkaar enkel met andere spieren (bovenlichaam ↔ benen, nooit full body)
 * Gedane sessies zijn een feit; we melden enkel overtredingen waarin een geplande sessie zit.
 */
export function validateRolling(c: RollingCheck): Violation[] {
  const out: Violation[] = [];
  const planned = c.sessions.filter((x) => x.planned);
  const byDay = new Map<ISODate, RuleSession[]>();
  for (const x of c.sessions) byDay.set(x.date, [...(byDay.get(x.date) ?? []), x]);
  const plannedDates = new Set(planned.map((p) => p.date));
  const touches = (...ds: ISODate[]) => ds.some((d) => plannedDates.has(d));

  for (const d of plannedDates) {
    if ((byDay.get(d) ?? []).length > 1) out.push({ rule: 'double_day', dates: [d], message: `Twee trainingen op ${fmt(d)}: één per dag.` });
  }

  const dates = [...byDay.keys()].sort();
  for (const a of dates) {
    const b = addDays(a, 1);
    if (!byDay.has(b) || !touches(a, b)) continue;
    const A = byDay.get(a)!;
    const B = byDay.get(b)!;
    if (A.some((x) => x.kind === 'cardio') && B.some((x) => x.kind === 'cardio')) {
      out.push({ rule: 'consecutive_cardio', dates: [a, b], message: `Conditie op ${a} én ${b}: nooit twee haarwasdagen na elkaar.` });
    }
    if ((A.some((x) => x.kind === 'cardio' && x.legs) && B.some(trainsLegs)) || (B.some((x) => x.kind === 'cardio' && x.legs) && A.some(trainsLegs))) {
      out.push({ rule: 'legs_next_to_cycling', dates: [a, b], message: `Benentraining naast indoor cycling (${a}, ${b}): je benen krijgen geen herstel.` });
    }
    const sa = A.find((x) => x.kind === 'strength');
    const sb = B.find((x) => x.kind === 'strength');
    if (sa && sb && ((sa.split ?? 'full') === 'full' || (sb.split ?? 'full') === 'full' || sa.split === sb.split)) {
      out.push({ rule: 'same_muscles', dates: [a, b], message: `Kracht op ${a} én ${b} met dezelfde spieren: wissel bovenlichaam en benen af.` });
    }
  }

  const seen = new Set<ISODate>();
  for (const p of plannedDates) {
    for (let k = 0; k < 7; k++) {
      const from = addDays(p, -k);
      if (seen.has(from)) continue;
      seen.add(from);
      const to = addDays(from, 6);
      const inWin = c.sessions.filter((x) => x.date >= from && x.date <= to);
      const cardio = inWin.filter((x) => x.kind === 'cardio').length;
      const strength = inWin.length - cardio;
      if (inWin.length > MAX_PER_WEEK)
        out.push({ rule: 'max_per_7_days', dates: [from, to], message: `${inWin.length} trainingen tussen ${from} en ${to}: maximum is ${MAX_PER_WEEK} per 7 dagen.` });
      if (cardio > MAX_CARDIO)
        out.push({ rule: 'max_cardio', dates: [from, to], message: `${cardio}× conditie tussen ${from} en ${to}: maximum is ${MAX_CARDIO}.` });
      if (strength > MAX_STRENGTH)
        out.push({ rule: 'max_strength', dates: [from, to], message: `${strength}× kracht tussen ${from} en ${to}: maximum is ${MAX_STRENGTH}.` });
    }
  }

  if (c.available) {
    for (const p of plannedDates) {
      if (!c.available(p)) out.push({ rule: 'unavailable', dates: [p], message: `Gepland op ${fmt(p)}, maar dan kan je niet.` });
    }
  }
  return out;
}

export function clampTarget(n: number | undefined, fallback = DEFAULT_TARGET): number {
  const v = Number.isFinite(n) ? Math.round(n!) : fallback;
  return Math.min(MAX_PER_WEEK, Math.max(1, v));
}

/** Maakt bijsturing van /coach veilig: onbekende of regelbrekende velden vallen weg. */
export function sanitizeAdjustments(raw: unknown): { adjustments: CoachAdjustments; errors: string[] } {
  const errors: string[] = [];
  const a: CoachAdjustments = { version: 1 };
  if (!raw || typeof raw !== 'object') return { adjustments: a, errors: raw === undefined ? [] : ['Geen geldig object'] };
  const r = raw as Record<string, unknown>;
  const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

  if (isDate(r.updatedAt)) a.updatedAt = r.updatedAt;
  if (isDate(r.validFrom)) a.validFrom = r.validFrom;
  if (r.targetSessions !== undefined) {
    const t = Number(r.targetSessions);
    if (!Number.isFinite(t) || t < 1) errors.push('targetSessions ongeldig');
    else {
      a.targetSessions = clampTarget(t);
      if (t > MAX_PER_WEEK) errors.push(`targetSessions ${t} > ${MAX_PER_WEEK}: begrensd`);
    }
  }
  if (r.strengthSessions !== undefined) {
    const n = Number(r.strengthSessions);
    if (Number.isInteger(n) && n >= 1 && n <= MAX_STRENGTH) a.strengthSessions = n;
    else errors.push(`strengthSessions moet tussen 1 en ${MAX_STRENGTH} liggen`);
  }
  if (typeof r.forceDeload === 'boolean') a.forceDeload = r.forceDeload;
  if (typeof r.focus === 'string') a.focus = r.focus.slice(0, 280);
  if (typeof r.message === 'string') a.message = r.message.slice(0, 600);

  if (Array.isArray(r.swaps)) {
    a.swaps = [];
    for (const s of r.swaps) {
      const from = EXERCISES.get(s?.from);
      const to = EXERCISES.get(s?.to);
      if (!from || !to) {
        errors.push(`Wissel ${s?.from} → ${s?.to}: onbekende oefening`);
        continue;
      }
      if (from.pattern !== to.pattern && RELATED[from.pattern] !== to.pattern) {
        errors.push(`Wissel ${from.id} → ${to.id}: andere spiergroep`);
        continue;
      }
      a.swaps.push({ from: from.id, to: to.id, reason: typeof s.reason === 'string' ? s.reason.slice(0, 200) : undefined });
    }
  }

  if (r.repRangeOverrides && typeof r.repRangeOverrides === 'object') {
    a.repRangeOverrides = {};
    for (const [id, v] of Object.entries(r.repRangeOverrides as Record<string, unknown>)) {
      const ok =
        EXERCISES.has(id) && Array.isArray(v) && v.length === 2 &&
        Number.isInteger(v[0]) && Number.isInteger(v[1]) && v[0] >= 3 && v[1] <= 30 && v[0] < v[1];
      if (ok) a.repRangeOverrides[id] = [v[0] as number, v[1] as number];
      else errors.push(`Reps-bereik voor ${id} ongeldig`);
    }
  }
  return { adjustments: a, errors };
}
