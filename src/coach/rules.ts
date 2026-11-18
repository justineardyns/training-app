import { EXERCISES, RELATED } from './catalog.ts';
import { addDays, DAY_NAMES, dayIndex, diffDays } from './dates.ts';
import type { CoachAdjustments, ISODate } from './types.ts';

// De harde regels. Elk plan (ook een bijsturing door /coach) moet hier door.

/** Absoluut maximum zweetsessies per 7 dagen (rollend), inclusief groepslessen en tennis. */
export const MAX_PER_WEEK = 4;
/** Normaal 2–3 per week. */
export const NORMAL_MIN = 2;
export const NORMAL_MAX = 3;

export type RuleId = 'max_per_7_days' | 'consecutive' | 'unavailable' | 'double_day';

export interface Violation {
  rule: RuleId;
  dates: ISODate[];
  message: string;
}

export interface RollingCheck {
  /** Alle zweetsessies (gedaan, vaste zoals tennis, en gepland), één item per sessie. */
  sessions: { date: ISODate; planned: boolean }[];
  /** Kan je op die dag? (enkel voor geplande sessies gecontroleerd) */
  available?: (date: ISODate) => boolean;
}

/**
 * Harde regels over een rollend venster:
 * - in elke 7 opeenvolgende dagen maximaal 4 zweetsessies (groepslessen en tennis inbegrepen)
 * - nooit twee dagen na elkaar
 * Gedane sessies zijn een feit; we melden enkel overtredingen waarin een geplande sessie zit.
 */
export function validateRolling(c: RollingCheck): Violation[] {
  const out: Violation[] = [];
  const planned = c.sessions.filter((x) => x.planned);
  const perDay = new Map<ISODate, number>();
  for (const p of planned) perDay.set(p.date, (perDay.get(p.date) ?? 0) + 1);
  for (const [date, n] of perDay) {
    if (n > 1) out.push({ rule: 'double_day', dates: [date], message: `Twee sessies gepland op ${DAY_NAMES[dayIndex(date)]} ${date}.` });
  }

  const dates = [...new Set(c.sessions.map((x) => x.date))].sort();
  const plannedDates = new Set(planned.map((p) => p.date));
  for (let i = 1; i < dates.length; i++) {
    const a = dates[i - 1]!;
    const b = dates[i]!;
    if (diffDays(b, a) === 1 && (plannedDates.has(a) || plannedDates.has(b))) {
      out.push({ rule: 'consecutive', dates: [a, b], message: `Zweettraining op ${a} én ${b}: nooit twee dagen na elkaar.` });
    }
  }

  const seen = new Set<ISODate>();
  for (const p of plannedDates) {
    for (let k = 0; k < 7; k++) {
      const from = addDays(p, -k);
      if (seen.has(from)) continue;
      const to = addDays(from, 6);
      const n = c.sessions.filter((x) => x.date >= from && x.date <= to).length;
      if (n > MAX_PER_WEEK) {
        seen.add(from);
        out.push({ rule: 'max_per_7_days', dates: [from, to], message: `${n} zweetsessies tussen ${from} en ${to}: maximum is ${MAX_PER_WEEK} per 7 dagen.` });
      }
    }
  }

  if (c.available) {
    for (const p of plannedDates) {
      if (!c.available(p)) out.push({ rule: 'unavailable', dates: [p], message: `Gepland op ${DAY_NAMES[dayIndex(p)]} ${p}, maar dan kan je niet.` });
    }
  }
  return out;
}

export function clampTarget(n: number | undefined, fallback = NORMAL_MAX): number {
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
    if (Number.isInteger(n) && n >= 1 && n <= 3) a.strengthSessions = n;
    else errors.push('strengthSessions moet 1, 2 of 3 zijn');
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
