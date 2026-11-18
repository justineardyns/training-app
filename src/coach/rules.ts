import { EXERCISES, RELATED } from './catalog.ts';
import { DAY_NAMES, dayIndex, diffDays, weekDays } from './dates.ts';
import type { CoachAdjustments, DayAvailability, ISODate } from './types.ts';

// De harde regels. Elk plan (ook een bijsturing door /coach) moet hier door.

/** Absoluut maximum zweetsessies per week, inclusief groepslessen. */
export const MAX_PER_WEEK = 4;
/** Normaal 2–3 per week. */
export const NORMAL_MIN = 2;
export const NORMAL_MAX = 3;

export type RuleId = 'max_per_week' | 'consecutive' | 'unavailable' | 'double_day';

export interface Violation {
  rule: RuleId;
  dates: ISODate[];
  message: string;
}

export interface WeekCheck {
  monday: ISODate;
  /** Alle zweetsessies van de week (gedaan + gepland), één item per sessie. */
  sessions: { date: ISODate; planned: boolean }[];
  /** Zweetdagen buiten deze week (vorige zondag, volgende maandag). */
  neighbors?: ISODate[];
  availability?: DayAvailability[];
}

export function validateWeek(w: WeekCheck): Violation[] {
  const out: Violation[] = [];
  const days = new Set(weekDays(w.monday));
  const inWeek = w.sessions.filter((s) => days.has(s.date));

  if (inWeek.length > MAX_PER_WEEK) {
    out.push({
      rule: 'max_per_week',
      dates: inWeek.map((s) => s.date),
      message: `${inWeek.length} zweetsessies in één week: maximum is ${MAX_PER_WEEK}.`,
    });
  }

  const planned = inWeek.filter((s) => s.planned);
  const perDay = new Map<ISODate, number>();
  for (const s of planned) perDay.set(s.date, (perDay.get(s.date) ?? 0) + 1);
  for (const [date, n] of perDay) {
    if (n > 1) out.push({ rule: 'double_day', dates: [date], message: `Twee sessies gepland op ${DAY_NAMES[dayIndex(date)]}.` });
  }

  const all = [...new Set([...inWeek.map((s) => s.date), ...(w.neighbors ?? [])])].sort();
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1]!;
    const b = all[i]!;
    if (diffDays(b, a) === 1 && (days.has(a) || days.has(b))) {
      // Alleen melden als minstens één van beide gepland is (gedane sessies zijn een feit).
      const involvesPlan = planned.some((p) => p.date === a || p.date === b);
      if (involvesPlan) {
        out.push({
          rule: 'consecutive',
          dates: [a, b],
          message: `Zweettraining op ${DAY_NAMES[dayIndex(a)]} én ${DAY_NAMES[dayIndex(b)]}: nooit twee dagen na elkaar.`,
        });
      }
    }
  }

  if (w.availability) {
    const avail = new Map(w.availability.map((d) => [d.date, d.available]));
    for (const p of planned) {
      if (avail.get(p.date) === false) {
        out.push({ rule: 'unavailable', dates: [p.date], message: `Gepland op ${DAY_NAMES[dayIndex(p.date)]}, maar dan kan je niet.` });
      }
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
  if (r.thirdSession === 'cardio' || r.thirdSession === 'strength') a.thirdSession = r.thirdSession;
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
