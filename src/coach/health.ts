import type { HealthDay, ISODate, SessionLog } from './types.ts';

// Apple Health-export van de Opdracht "Training Sync" inlezen en samenvatten.
// Formaat: secties "#NAAM" gevolgd door één waarde per regel. Lijsten met dezelfde lengte
// (bv. WORKOUT_TYPE / WORKOUT_START / WORKOUT_EINDE) horen per regel samen.

export const SECTIONS = [
  'SLAAP_WAARDE',
  'SLAAP_START',
  'SLAAP_EINDE',
  'HRV_WAARDE',
  'HRV_START',
  'RUST_WAARDE',
  'RUST_START',
  'STAPPEN_WAARDE',
  'STAPPEN_START',
  'STAPPEN_BRON',
  'HARTSLAG_WAARDE',
  'HARTSLAG_START',
  'WORKOUT_TYPE',
  'WORKOUT_START',
  'WORKOUT_EINDE',
] as const;
type Section = (typeof SECTIONS)[number];

export interface Sample {
  value: number;
  start: Date;
}

export interface SleepSample {
  label: string;
  start: Date;
  end: Date;
}

export interface WorkoutSample {
  type: string;
  start: Date;
  end: Date;
}

export interface InboxData {
  sleep: SleepSample[];
  hrv: Sample[];
  rhr: Sample[];
  steps: (Sample & { source: string })[];
  hr: Sample[];
  workouts: WorkoutSample[];
  /** Regels die we niet konden lezen (voor foutopsporing). */
  skipped: number;
}

export interface WatchWorkout {
  id: string;
  type: string;
  start: string;
  end: string;
  durationMin: number;
  avgHr?: number;
  maxHr?: number;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mrt: 2, maa: 2, mar: 2, apr: 3, mei: 4, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, dec: 11,
};

/** Getal uit "45", "45,3", "45.3 ms", "1.234" (duizendtal) … */
export function parseNumber(s: string): number | undefined {
  const m = s.replace(/ /g, ' ').match(/-?\d[\d.,]*/);
  if (!m) return undefined;
  let t = m[0];
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // 1.234 (NL duizendtal)
  else if (/^\d{1,3}(,\d{3})+$/.test(t) && !/,\d{1,2}$/.test(t)) t = t.replace(/,/g, ''); // 1,234 (EN)
  else t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** ISO 8601 (aanbevolen in de Opdracht), of de standaardnotatie van iOS in het Nederlands/Engels. */
export function parseDate(s: string): Date | undefined {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = new Date(t.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  // "23/11/2026 07:05" of "23-11-2026 om 07:05"
  let n = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ ,]+(?:om\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (n) return new Date(Number(n[3]), Number(n[2]) - 1, Number(n[1]), Number(n[4] ?? 0), Number(n[5] ?? 0), Number(n[6] ?? 0));
  // "23 nov. 2026 om 00:12" / "23 november 2026 om 07:05:33"
  let m = t.match(/^(\d{1,2})\s+([a-zé]+)\.?\s+(\d{4})(?:\s+(?:om|at|,)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i);
  if (m) {
    const mon = MONTHS[m[2]!.slice(0, 3).toLowerCase()];
    if (mon === undefined) return undefined;
    return new Date(Number(m[3]), mon, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
  }
  // "Nov 23, 2026 at 12:12 AM"
  m = t.match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})(?:\s+(?:at|,)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if (m) {
    const mon = MONTHS[m[1]!.slice(0, 3).toLowerCase()];
    if (mon === undefined) return undefined;
    let h = Number(m[4] ?? 0);
    if (m[7]?.toUpperCase() === 'PM' && h < 12) h += 12;
    if (m[7]?.toUpperCase() === 'AM' && h === 12) h = 0;
    return new Date(Number(m[3]), mon, Number(m[2]), h, Number(m[5] ?? 0), Number(m[6] ?? 0));
  }
  return undefined;
}

export function parseInbox(text: string): InboxData {
  const lists = new Map<Section, string[]>();
  let cur: Section | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const head = line.match(/^#\s*([A-Z_]+)/);
    if (head) {
      cur = (SECTIONS as readonly string[]).includes(head[1]!) ? (head[1] as Section) : undefined;
      if (cur) lists.set(cur, []);
      continue;
    }
    if (cur) lists.get(cur)!.push(line);
  }
  let skipped = 0;
  const get = (s: Section) => lists.get(s) ?? [];
  const zipNum = (vals: Section, starts: Section): Sample[] => {
    const v = get(vals);
    const st = get(starts);
    const out: Sample[] = [];
    for (let i = 0; i < Math.min(v.length, st.length); i++) {
      const value = parseNumber(v[i]!);
      const start = parseDate(st[i]!);
      if (value === undefined || !start) skipped++;
      else out.push({ value, start });
    }
    return out;
  };

  const sleep: SleepSample[] = [];
  const sv = get('SLAAP_WAARDE');
  const ss = get('SLAAP_START');
  const se = get('SLAAP_EINDE');
  for (let i = 0; i < Math.min(sv.length, ss.length, se.length); i++) {
    const start = parseDate(ss[i]!);
    const end = parseDate(se[i]!);
    if (!start || !end || end <= start) skipped++;
    else sleep.push({ label: sv[i]!, start, end });
  }

  const steps = zipNum('STAPPEN_WAARDE', 'STAPPEN_START').map((s, i) => ({ ...s, source: get('STAPPEN_BRON')[i] ?? '' }));

  const workouts: WorkoutSample[] = [];
  const wt = get('WORKOUT_TYPE');
  const ws = get('WORKOUT_START');
  const we = get('WORKOUT_EINDE');
  for (let i = 0; i < Math.min(wt.length, ws.length, we.length); i++) {
    const start = parseDate(ws[i]!);
    const end = parseDate(we[i]!);
    if (!start || !end || end <= start) skipped++;
    else workouts.push({ type: wt[i]!, start, end });
  }

  return {
    sleep,
    hrv: zipNum('HRV_WAARDE', 'HRV_START'),
    rhr: zipNum('RUST_WAARDE', 'RUST_START'),
    steps,
    hr: zipNum('HARTSLAG_WAARDE', 'HARTSLAG_START'),
    workouts,
    skipped,
  };
}

function localDate(d: Date, timeZone: string): ISODate {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function localHour(d: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(d));
}

/** Slaap die 's ochtends eindigt hoort bij die dag; eindigt ze vóór 18u de dag ervoor, dan bij de volgende. */
function nightOf(d: Date, timeZone: string): ISODate {
  return localDate(new Date(d.getTime() + 6 * 3600_000), timeZone);
}

const NOT_ASLEEP = /in\s*bed|wakker|awake|ophalen/i;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function summarize(data: InboxData, timeZone = 'Europe/Brussels'): { days: HealthDay[]; workouts: WatchWorkout[] } {
  const days = new Map<ISODate, HealthDay>();
  const day = (d: ISODate) => days.get(d) ?? (days.set(d, { date: d }), days.get(d)!);

  // Slaap: unie van "slapend"-intervallen per nacht (Watch én iPhone schrijven soms dubbel).
  const nights = new Map<ISODate, [number, number][]>();
  for (const s of data.sleep.filter((x) => !NOT_ASLEEP.test(x.label))) {
    const k = nightOf(s.end, timeZone);
    nights.set(k, [...(nights.get(k) ?? []), [s.start.getTime(), s.end.getTime()]]);
  }
  for (const [k, iv] of nights) {
    iv.sort((a, b) => a[0] - b[0]);
    let total = 0;
    let [cs, ce] = iv[0]!;
    for (const [s, e] of iv.slice(1)) {
      if (s <= ce) ce = Math.max(ce, e);
      else {
        total += ce - cs;
        [cs, ce] = [s, e];
      }
    }
    total += ce - cs;
    day(k).sleepHours = round1(total / 3600_000);
  }

  // HRV: gemiddelde van de nachtmetingen (20u–10u), anders van de dag.
  const hrvNight = new Map<ISODate, number[]>();
  const hrvDay = new Map<ISODate, number[]>();
  for (const s of data.hrv) {
    const h = localHour(s.start, timeZone);
    if (h >= 20 || h < 10) hrvNight.set(nightOf(s.start, timeZone), [...(hrvNight.get(nightOf(s.start, timeZone)) ?? []), s.value]);
    hrvDay.set(localDate(s.start, timeZone), [...(hrvDay.get(localDate(s.start, timeZone)) ?? []), s.value]);
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  for (const k of new Set([...hrvNight.keys(), ...hrvDay.keys()])) {
    const v = hrvNight.get(k) ?? hrvDay.get(k)!;
    day(k).hrvMs = round1(mean(v));
  }

  // Rusthartslag: één waarde per dag (de laatste).
  for (const s of [...data.rhr].sort((a, b) => a.start.getTime() - b.start.getTime())) day(localDate(s.start, timeZone)).restingHr = Math.round(s.value);

  // Stappen: som per bron, de hoogste bron telt (anders tel je iPhone én Watch dubbel).
  const perSource = new Map<ISODate, Map<string, number>>();
  for (const s of data.steps) {
    const k = localDate(s.start, timeZone);
    const m = perSource.get(k) ?? new Map<string, number>();
    m.set(s.source, (m.get(s.source) ?? 0) + s.value);
    perSource.set(k, m);
  }
  for (const [k, m] of perSource) day(k).steps = Math.round(Math.max(...m.values()));

  const workouts = data.workouts.map((w) => {
    const inWin = data.hr.filter((h) => h.start >= w.start && h.start <= w.end).map((h) => h.value);
    return {
      id: `${w.start.toISOString()}|${w.type}`,
      type: w.type,
      start: w.start.toISOString(),
      end: w.end.toISOString(),
      durationMin: Math.round((w.end.getTime() - w.start.getTime()) / 60000),
      avgHr: inWin.length ? Math.round(mean(inWin)) : undefined,
      maxHr: inWin.length ? Math.round(Math.max(...inWin)) : undefined,
    };
  });

  return { days: [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), workouts };
}

/** Nieuwere waarden vullen aan of overschrijven; bestaande blijven als er niets nieuws is. */
export function mergeDays(existing: HealthDay[], incoming: HealthDay[]): HealthDay[] {
  const m = new Map(existing.map((d) => [d.date, { ...d }]));
  for (const d of incoming) {
    const cur = m.get(d.date) ?? { date: d.date };
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      // Stappen: een export van de laatste 24 u bevat maar een stuk van gisteren → nooit verlagen.
      if (k === 'steps' && cur.steps !== undefined && (v as number) < cur.steps) continue;
      (cur as unknown as Record<string, unknown>)[k] = v;
    }
    m.set(d.date, cur);
  }
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export type WorkoutClass = 'strength' | 'class' | 'cardio' | 'light';

/** Watch-workouttype (NL of EN) → soort sessie. */
export function classifyWorkout(type: string): WorkoutClass {
  const t = type.toLowerCase();
  if (/kracht|strength|gewicht/.test(t)) return 'strength';
  if (/wandel|walk|yoga|pilates|mindful|afkoel|cool ?down|stretch|flexib|tai ?chi|ademhal/.test(t)) return 'light';
  if (/indoor ?(fiets|cycl)|spinning|dans|danc|kickbox|aerob|step|bootcamp|hiit|cross|groep|body ?(pump|combat|attack)|zumba|gemengde cardio|mixed cardio/.test(t)) return 'class';
  return 'cardio';
}

const MIN_MINUTES: Record<Exclude<WorkoutClass, 'light'>, number> = { strength: 10, class: 15, cardio: 15 };

/**
 * Watch-workouts in je log verwerken:
 * - groepsles/cardio → telt automatisch als sessie (of vult een snel gelogde sessie aan)
 * - krachttraining → duur en hartslag aan je app-sessie van die dag, anders een eigen sessie
 * Idempotent: dezelfde workout twee keer verwerken geeft geen dubbele sessie.
 */
export function integrateWorkouts(sessions: SessionLog[], workouts: WatchWorkout[], timeZone = 'Europe/Brussels'): SessionLog[] {
  const out = sessions.map((s) => ({ ...s }));
  for (const w of [...workouts].sort((a, b) => (a.start < b.start ? -1 : 1))) {
    const cls = classifyWorkout(w.type);
    if (cls === 'light' || w.durationMin < MIN_MINUTES[cls]) continue;
    const date = localDate(new Date(w.start), timeZone);
    const watchFields = { durationMin: w.durationMin, avgHr: w.avgHr, maxHr: w.maxHr, workoutType: w.type, workoutId: w.id };
    const linked = out.find((s) => s.workoutId === w.id);
    if (linked) {
      Object.assign(linked, watchFields);
      continue;
    }
    const sameDay = out.filter((s) => s.date === date && !s.workoutId);
    const match =
      cls === 'strength'
        ? sameDay
            .filter((s) => s.kind === 'strength')
            .sort((a, b) => Math.abs(new Date(a.startedAt ?? w.start).getTime() - new Date(w.start).getTime()) - Math.abs(new Date(b.startedAt ?? w.start).getTime() - new Date(w.start).getTime()))[0]
        : sameDay.find((s) => s.kind === 'class' || s.kind === 'cardio');
    if (match) {
      Object.assign(match, watchFields);
      continue;
    }
    out.push({
      id: `watch-${w.id}`,
      date,
      kind: cls,
      source: 'watch',
      title: cls === 'strength' ? 'Krachttraining (Watch)' : w.type,
      startedAt: w.start,
      endedAt: w.end,
      exercises: [],
      ...watchFields,
    });
  }
  return out;
}
