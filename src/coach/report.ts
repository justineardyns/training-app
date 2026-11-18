import { EXERCISES } from './catalog.ts';
import { templateTitle } from './session.ts';
import { addDays, DAY_SHORT, dayIndex, isoWeek, weekDays } from './dates.ts';
import { kg } from './loads.ts';
import type { WeekPlan } from './planner.ts';
import { SWEAT_KINDS } from './planner.ts';
import { e1rm } from './progression.ts';
import type { ISODate, Muscle, ReadinessLevel, SessionLog } from './types.ts';
import type { Insights } from './insights.ts';

// Weekrapport: cijfers + korte, eerlijke coachboodschap.

export interface PR {
  exerciseId: string;
  name: string;
  kind: 'kg' | 'reps';
  value: number;
  previous: number;
  load: number;
  reps: number;
}

/** Je dagvorm-tikken van de week (puur jouw input). */
export interface ReadinessSummary {
  green: number;
  orange: number;
  red: number;
}

export interface WeeklyReport {
  week: string;
  monday: ISODate;
  planned: number;
  done: number;
  strength: number;
  cardio: number;
  sessions: { date: ISODate; title: string; kind: SessionLog['kind']; durationMin?: number }[];
  prs: PR[];
  trend: { exerciseId: string; name: string; points: { week: string; e1rm: number }[] }[];
  volume: Partial<Record<Muscle, number>>;
  cardioMinutes: number;
  readiness: ReadinessSummary;
  streak: number;
  nextWeek?: { date: ISODate; title: string; sweat: boolean }[];
  /** De week loopt nog (rapport vóór zondagavond). */
  inProgress: boolean;
  /** Sterke punten en werkpunten (met wat de coach ermee doet). */
  strong: string[];
  work: string[];
  message: string;
}

export interface ReportInput {
  monday: ISODate;
  history: SessionLog[];
  /** Je dagvorm-tikken (datum + groen/oranje/rood). */
  checks?: { date: ISODate; level: ReadinessLevel }[];
  /** Aantal geplande sessies (momentopname bij de start van de week). */
  planned: number;
  nextWeek?: WeekPlan;
  /** Vandaag: als die in deze week valt (vóór zondag), is het een tussenstand. */
  today?: ISODate;
  insights?: Insights;
}

const inRange = (d: ISODate, from: ISODate, to: ISODate) => d >= from && d <= to;

function bestPerExercise(sessions: SessionLog[]): Map<string, { e1rm: number; reps: number; load: number }> {
  const best = new Map<string, { e1rm: number; reps: number; load: number }>();
  for (const s of sessions.filter((x) => x.kind === 'strength')) {
    for (const e of s.exercises) {
      for (const set of e.sets.filter((x) => x.done && x.reps > 0)) {
        const v = e1rm(set.load, set.reps);
        const cur = best.get(e.exerciseId);
        if (!cur || v > cur.e1rm) best.set(e.exerciseId, { e1rm: v, reps: set.reps, load: set.load });
      }
    }
  }
  return best;
}

export function sweatCount(history: SessionLog[], monday: ISODate): number {
  const sunday = addDays(monday, 6);
  return history.filter((s) => SWEAT_KINDS.has(s.kind) && inRange(s.date, monday, sunday)).length;
}

export function streakWeeks(history: SessionLog[], monday: ISODate): number {
  let n = 0;
  for (let m = monday; sweatCount(history, m) >= 2; m = addDays(m, -7)) n++;
  return n;
}

export function buildReport(input: ReportInput): WeeklyReport {
  const { monday, history } = input;
  const sunday = addDays(monday, 6);
  const week = history.filter((s) => inRange(s.date, monday, sunday)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const before = history.filter((s) => s.date < monday);
  const sweat = week.filter((s) => SWEAT_KINDS.has(s.kind));

  // PR's: beter dan alles daarvoor.
  const prevBest = bestPerExercise(before);
  const prs: PR[] = [];
  for (const [id, b] of bestPerExercise(week)) {
    const prev = prevBest.get(id);
    if (!prev || b.e1rm <= prev.e1rm + 1e-9) continue;
    prs.push({
      exerciseId: id,
      name: EXERCISES.get(id)?.name ?? id,
      kind: b.load > 0 ? 'kg' : 'reps',
      value: b.e1rm,
      previous: prev.e1rm,
      load: b.load,
      reps: b.reps,
    });
  }
  prs.sort((a, b) => b.value / b.previous - a.value / a.previous);

  // Trend van de geschatte 1RM voor je meest gedane oefeningen met gewicht (8 weken).
  const from = addDays(monday, -49);
  const recent = history.filter((s) => s.kind === 'strength' && inRange(s.date, from, sunday));
  const counts = new Map<string, number>();
  for (const s of recent) for (const e of s.exercises) if (e.sets.some((x) => x.done && x.load > 0)) counts.set(e.exerciseId, (counts.get(e.exerciseId) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id);
  const trend = top.map((id) => {
    const perWeek = new Map<string, number>();
    for (const s of recent) {
      const v = Math.max(0, ...s.exercises.filter((e) => e.exerciseId === id).flatMap((e) => e.sets.filter((x) => x.done).map((x) => e1rm(x.load, x.reps))));
      if (v > 0) perWeek.set(isoWeek(s.date), Math.max(perWeek.get(isoWeek(s.date)) ?? 0, v));
    }
    return {
      exerciseId: id,
      name: EXERCISES.get(id)?.name ?? id,
      points: [...perWeek.entries()].sort().map(([w, v]) => ({ week: w, e1rm: v })),
    };
  });

  // Volume: harde sets per spiergroep (hoofdspier 1, andere 0,5).
  const volume: Partial<Record<Muscle, number>> = {};
  for (const s of week.filter((x) => x.kind === 'strength')) {
    for (const e of s.exercises) {
      const ex = EXERCISES.get(e.exerciseId);
      if (!ex) continue;
      const sets = e.sets.filter((x) => x.done && x.reps > 0).length;
      ex.muscles.forEach((m, i) => {
        volume[m] = (volume[m] ?? 0) + sets * (i === 0 ? 1 : 0.5);
      });
    }
  }

  const cardioMinutes = Math.round(
    week.filter((s) => s.kind === 'cardio' || s.kind === 'class').reduce((a, s) => a + (s.durationMin ?? 0), 0),
  );

  const weekChecks = (input.checks ?? []).filter((c) => inRange(c.date, monday, sunday));

  const report: WeeklyReport = {
    week: isoWeek(monday),
    monday,
    planned: input.planned,
    done: sweat.length,
    strength: sweat.filter((s) => s.kind === 'strength').length,
    cardio: sweat.filter((s) => s.kind !== 'strength').length,
    sessions: sweat.map((s) => ({ date: s.date, title: s.title ?? (s.kind === 'strength' ? templateTitle(s.template) : s.workoutType ?? 'Cardio'), kind: s.kind, durationMin: s.durationMin })),
    prs,
    trend,
    volume,
    cardioMinutes,
    readiness: {
      green: weekChecks.filter((c) => c.level === 'green').length,
      orange: weekChecks.filter((c) => c.level === 'orange').length,
      red: weekChecks.filter((c) => c.level === 'red').length,
    },
    streak: streakWeeks(history, monday),
    nextWeek: input.nextWeek?.days.map((d) => ({ date: d.date, title: d.title, sweat: d.sweat })),
    inProgress: !!input.today && input.today >= monday && input.today < sunday,
    strong: (input.insights?.strong ?? []).map((i) => i.text),
    work: (input.insights?.work ?? []).map((i) => (i.action ? `${i.text} ${i.action}` : i.text)),
    message: '',
  };
  report.message = coachMessage(report, input.nextWeek);
  return report;
}

/** Kort, direct, eerlijk en positief. */
export function coachMessage(r: WeeklyReport, next?: WeekPlan): string {
  const parts: string[] = [];
  if (r.inProgress) {
    const left = Math.max(0, r.planned - r.done);
    parts.push(
      left === 0
        ? `Weekdoel al gehaald: ${r.done}/${r.planned}. Sterk.`
        : `Tussenstand: ${r.done}/${r.planned}. Nog ${left} ${left === 1 ? 'sessie' : 'sessies'} te gaan deze week.`,
    );
  } else if (r.planned === 0 && r.done === 0) {
    parts.push('Geen sessies deze week. Duid zondag in de Agenda aan wanneer je kan, dan plan ik voor je. Volgende week starten we gewoon opnieuw.');
  } else if (r.done >= r.planned) {
    parts.push(`Sterk: ${r.done}/${r.planned} sessies gedaan. Zo bouw je het op.`);
  } else if (r.done === r.planned - 1) {
    parts.push(`${r.done}/${r.planned}: net niet. Eerlijk is eerlijk, op termijn maakt die ene sessie het verschil. Zet volgende week je lastigste dag eerst.`);
  } else {
    parts.push(`${r.done}/${r.planned}: te weinig om vooruit te gaan. Geen drama, wel een duidelijke opdracht: volgende week minstens 2.`);
  }
  if (r.prs.length) {
    const p = r.prs[0]!;
    parts.push(
      p.kind === 'kg'
        ? `Nieuw record op ${p.name.toLowerCase()}: ${kg(p.load)} × ${p.reps} (geschatte 1RM ${kg(Math.round(p.value))}).`
        : `Nieuw record op ${p.name.toLowerCase()}: ${p.reps} reps.`,
    );
  }
  if (r.readiness.orange + r.readiness.red >= 2) {
    parts.push('Je voelde je deze week vaak moe: neem je rustdagen echt als rust, ook dat is training.');
  }
  if (r.streak >= 3) parts.push(`${r.streak} weken op rij consequent. Dat is waar resultaat vandaan komt.`);
  if (next?.deload.deload) parts.push('Volgende week is een lichtere deloadweek.');
  return parts.join(' ');
}

const MUSCLE_LABEL: Record<Muscle, string> = {
  borst: 'Borst', rug: 'Rug', schouders: 'Schouders', biceps: 'Biceps', triceps: 'Triceps',
  quadriceps: 'Quadriceps', hamstrings: 'Hamstrings', bilspieren: 'Bilspieren', kuiten: 'Kuiten', core: 'Core',
};
export { MUSCLE_LABEL };

/** Markdownversie (basis voor /coach en het archief in de privé-repo). */
export function reportMarkdown(r: WeeklyReport): string {
  const nf = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 1 });
  const lines: string[] = [];
  lines.push(`# Weekrapport ${r.week}`, '', `> ${r.message}`, '');
  lines.push('## Sessies', '', `**${r.done}/${r.planned}** gedaan (${r.strength}× kracht, ${r.cardio}× conditie/les) · streak: ${r.streak} ${r.streak === 1 ? 'week' : 'weken'}`, '');
  for (const s of r.sessions) lines.push(`- ${DAY_SHORT[dayIndex(s.date)]} ${s.date.slice(8)}/${s.date.slice(5, 7)}: ${s.title}${s.durationMin ? ` (${Math.round(s.durationMin)} min)` : ''}`);
  lines.push('', '## Kracht', '');
  if (r.prs.length) for (const p of r.prs) lines.push(`- 🏆 ${p.name}: ${p.kind === 'kg' ? `${kg(p.load)} × ${p.reps} → geschatte 1RM ${kg(Math.round(p.value))} (was ${kg(Math.round(p.previous))})` : `${p.reps} reps (was ${p.previous})`}`);
  else lines.push('- Geen nieuwe records deze week.');
  if (r.trend.length) lines.push('', 'Geschatte 1RM per week (kg):', '');
  for (const t of r.trend) lines.push(`- ${t.name}: ${t.points.map((p) => nf.format(Math.round(p.e1rm))).join(' → ')}`);
  if (r.strong.length || r.work.length) {
    lines.push('', '## Sterk en werkpunten', '');
    for (const t of r.strong) lines.push(`- 💪 ${t}`);
    for (const t of r.work) lines.push(`- 🎯 ${t}`);
  }
  lines.push('', '## Volume (harde sets)', '');
  const vol = Object.entries(r.volume).sort((a, b) => b[1] - a[1]);
  lines.push(vol.length ? vol.map(([m, v]) => `${MUSCLE_LABEL[m as Muscle]} ${nf.format(v)}`).join(' · ') : 'Geen krachtsessies.');
  lines.push('', '## Conditie en dagvorm', '', `- Cardiominuten: ${r.cardioMinutes}`);
  const checks = r.readiness.green + r.readiness.orange + r.readiness.red;
  lines.push(checks ? `- Dagvorm: ${r.readiness.green}× groen · ${r.readiness.orange}× oranje · ${r.readiness.red}× rood` : '- Dagvorm: niet ingevuld');
  if (r.nextWeek) {
    lines.push('', '## Volgende week', '');
    for (const d of r.nextWeek.filter((x) => x.sweat)) lines.push(`- ${DAY_SHORT[dayIndex(d.date)]}: ${d.title}`);
  }
  return `${lines.join('\n')}\n`;
}

export { weekDays };
