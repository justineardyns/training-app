import { EXERCISES } from './catalog.ts';
import { addDays, DAY_NAMES, dayIndex, weekStart } from './dates.ts';
import { SWEAT_KINDS } from './planner.ts';
import { bestE1rm, exposures, isStagnating } from './progression.ts';
import { GROUP_LABEL, MUSCLE_GROUP, type Group } from './recovery.ts';
import { streakWeeks } from './report.ts';
import type { ISODate, ReadinessLevel, SessionLog } from './types.ts';

// Wat gaat goed, wat minder vlot? Pure analyse van je logs, je plan en je dagvorm.
// De planner en de trainingen gebruiken het ook: dagen die vaak wegvallen, je zwakste groep eerst.

export interface Insight {
  id: string;
  text: string;
  /** Wat de coach ermee doet. */
  action?: string;
}

export interface Insights {
  strong: Insight[];
  work: Insight[];
  /** Groep die het traagst vooruitgaat: komt eerst in je training. */
  weakGroup?: Group;
  strongGroup?: Group;
  /** Weekdagen (0 = maandag) waarop je training vaak wegvalt: de planner kiest liever andere dagen. */
  avoidWeekdays: number[];
  /** Genoeg gegevens om iets zinnigs te zeggen? */
  enoughData: boolean;
}

export interface InsightInput {
  today: ISODate;
  history: SessionLog[];
  /** Momentopname van geplande dagen. */
  planned: ISODate[];
  checks?: { date: ISODate; level: ReadinessLevel }[];
  strengthTarget: number;
  cardioTarget: number;
}

const pct = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;
const times = (n: number) => `${n}×`;

export function buildInsights(input: InsightInput): Insights {
  const { today, history } = input;
  const strong: Insight[] = [];
  const work: Insight[] = [];
  const past = history.filter((s) => s.date < today || s.date === today);
  const sweat = past.filter((s) => SWEAT_KINDS.has(s.kind));
  const sweatDates = new Set(sweat.map((s) => s.date));
  const strength = past.filter((s) => s.kind === 'strength');

  // ── Consequent? (laatste 4 weken: gepland vs gedaan) ───────────────
  const planned28 = input.planned.filter((d) => d < today && d >= addDays(today, -28));
  const hit28 = planned28.filter((d) => sweatDates.has(d)).length;
  if (planned28.length >= 3) {
    const rate = hit28 / planned28.length;
    if (rate >= 0.85) strong.push({ id: 'consistent', text: `Consequent: ${hit28} van ${planned28.length} geplande sessies gedaan in 4 weken.` });
    else if (rate <= 0.6)
      work.push({
        id: 'consistent',
        text: `${hit28} van ${planned28.length} geplande sessies gedaan in 4 weken.`,
        action: 'Vink enkel momenten aan die je echt haalt. Liever 3 vaste dan 4 wankele.',
      });
  }

  // ── Weekdagen die vaak wegvallen (8 weken) ──────────────────────────
  const avoidWeekdays: number[] = [];
  const planned56 = input.planned.filter((d) => d < today && d >= addDays(today, -56));
  for (let w = 0; w < 7; w++) {
    const onDay = planned56.filter((d) => dayIndex(d) === w);
    const missed = onDay.filter((d) => !sweatDates.has(d)).length;
    if (missed >= 2 && missed / onDay.length >= 0.5) {
      avoidWeekdays.push(w);
      work.push({
        id: `missed-${w}`,
        text: `Op ${DAY_NAMES[w]} valt je training vaak weg (${missed} van ${onDay.length}).`,
        action: `Ik plan je liever op andere dagen dan ${DAY_NAMES[w]}.`,
      });
    }
  }

  // ── Kracht per oefening (6 weken) ───────────────────────────────────
  const from42 = addDays(today, -42);
  const progress: { id: string; name: string; group: Group; change: number; weeks: number }[] = [];
  const stalled: string[] = [];
  const ids = new Set(strength.flatMap((s) => s.exercises.map((e) => e.exerciseId)));
  for (const id of ids) {
    const ex = EXERCISES.get(id);
    if (!ex) continue;
    const all = exposures(past, id).filter((e) => !e.deload);
    const recent = all.filter((e) => e.date >= from42);
    if (recent.length >= 3) {
      const first = bestE1rm(recent[0]!.log);
      const last = Math.max(...recent.slice(-2).map((e) => bestE1rm(e.log)));
      if (first > 0) {
        const weeks = Math.max(1, Math.round((Date.parse(recent.at(-1)!.date) - Date.parse(recent[0]!.date)) / (7 * 86_400_000)));
        progress.push({ id, name: ex.name, group: MUSCLE_GROUP[ex.muscles[0]!], change: (last - first) / first, weeks });
      }
    }
    if (isStagnating(all)) stalled.push(ex.name);
  }
  progress.sort((a, b) => b.change - a.change);
  for (const p of progress.filter((x) => x.change >= 0.05).slice(0, 2)) {
    strong.push({ id: `up-${p.id}`, text: `${p.name}: ${pct(p.change)} in ${p.weeks} ${p.weeks === 1 ? 'week' : 'weken'}.` });
  }
  for (const name of stalled.slice(0, 2)) {
    work.push({
      id: `stall-${name}`,
      text: `${name} staat stil: 3 keer geen vooruitgang.`,
      action: 'Komt er een tweede bij, dan volgt een lichtere week. Dat breekt de stilstand meestal.',
    });
  }

  // ── Per spiergroep: wat gaat het snelst, wat het traagst? ───────────
  const byGroup = new Map<Group, number[]>();
  for (const p of progress) byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p.change]);
  const avg = [...byGroup].filter(([g]) => g !== 'core').map(([g, v]) => [g, v.reduce((a, b) => a + b, 0) / v.length] as [Group, number]);
  let weakGroup: Group | undefined;
  let strongGroup: Group | undefined;
  if (avg.length >= 2) {
    avg.sort((a, b) => b[1] - a[1]);
    const [bestG, bestV] = avg[0]!;
    const [worstG, worstV] = avg.at(-1)!;
    if (bestV - worstV >= 0.05) {
      strongGroup = bestG;
      weakGroup = worstG;
      strong.push({ id: `group-${bestG}`, text: `${GROUP_LABEL[bestG]} gaat het snelst vooruit (${pct(bestV)}).` });
      work.push({
        id: `group-${worstG}`,
        text: `${GROUP_LABEL[worstG]} gaat het traagst vooruit (${pct(worstV)}).`,
        action: `Die oefeningen komen voortaan eerst in je training, als je spieren fris zijn.`,
      });
    }
  }

  // ── Duwen vs trekken (4 weken) ──────────────────────────────────────
  const vol: Partial<Record<Group, number>> = {};
  for (const s of strength.filter((x) => x.date >= addDays(today, -28))) {
    for (const e of s.exercises) {
      const ex = EXERCISES.get(e.exerciseId);
      if (!ex) continue;
      const g = MUSCLE_GROUP[ex.muscles[0]!];
      vol[g] = (vol[g] ?? 0) + e.sets.filter((x) => x.done && x.reps > 0).length;
    }
  }
  if ((vol.duwen ?? 0) >= 6 && (vol.trekken ?? 0) >= 1 && vol.duwen! / vol.trekken! > 1.5 && !weakGroup) {
    weakGroup = 'trekken';
    work.push({ id: 'balance', text: `Veel meer duwen (${vol.duwen} sets) dan trekken (${vol.trekken}).`, action: 'Rugoefeningen komen eerst: goed voor je houding en je schouders.' });
  }

  // ── Gewicht: meer of minder dan mijn voorstel? (4 weken) ────────────
  let more = 0;
  let less = 0;
  let total = 0;
  for (const s of strength.filter((x) => x.date >= addDays(today, -28))) {
    for (const e of s.exercises) {
      const set = e.sets.find((x) => x.done);
      if (!set || e.prescription.load <= 0) continue;
      total++;
      if (set.load > e.prescription.load + 1e-9) more++;
      else if (set.load < e.prescription.load - 1e-9) less++;
    }
  }
  if (total >= 4 && more / total >= 0.3) {
    strong.push({ id: 'more', text: `Je nam ${times(more)} meer dan mijn voorstel: je bent sterker dan je denkt.`, action: 'Ik volg jouw gewicht en bouw vanaf daar op.' });
  }
  if (total >= 4 && less / total >= 0.3) {
    work.push({ id: 'less', text: `Je nam ${times(less)} minder dan mijn voorstel.`, action: 'Prima: techniek eerst. Ik bouw daar trager op.' });
  }

  // ── Kracht en conditie in balans? (2 weken) ─────────────────────────
  const last14 = sweat.filter((s) => s.date > addDays(today, -14));
  const s14 = last14.filter((s) => s.kind === 'strength').length;
  const c14 = last14.length - s14;
  const hasHistory = sweat.some((s) => s.date <= addDays(today, -10));
  if (hasHistory) {
    if (input.cardioTarget > 0) {
      if (c14 >= Math.ceil(input.cardioTarget * 2 * 0.75)) strong.push({ id: 'cardio', text: `Conditie op schema: ${times(c14)} les, tennis of cardio in 2 weken.` });
      else if (c14 === 0 && s14 > 0)
        work.push({ id: 'cardio', text: 'Geen conditie in 2 weken.', action: 'Eén les indoor cycling telt al. Ik zet ze op je lesmomenten.' });
    }
    if (input.strengthTarget > 0) {
      if (s14 >= Math.ceil(input.strengthTarget * 2 * 0.75)) strong.push({ id: 'strength', text: `Krachttraining op schema: ${times(s14)} in 2 weken.` });
      else if (s14 === 0 && c14 > 0)
        work.push({ id: 'strength', text: 'Geen krachttraining in 2 weken.', action: 'Kracht is de motor van je recompositie: die gaat voor.' });
    }
  }

  // ── Dagvorm (laatste 7 tikken, 2 weken) ─────────────────────────────
  const checks = (input.checks ?? []).filter((c) => c.date <= today && c.date > addDays(today, -14)).slice(-7);
  const tired = checks.filter((c) => c.level !== 'green').length;
  if (checks.length >= 3 && tired >= 3) {
    work.push({ id: 'tired', text: `Vaak moe: ${tired} van je laatste ${checks.length} dagvormtikken.`, action: 'Slaap en rustdagen zijn nu je beste training. Bij rood verplaats ik.' });
  } else if (checks.length >= 4 && tired === 0) {
    strong.push({ id: 'fresh', text: `Je voelt je goed: ${times(checks.length)} groen op rij.` });
  }

  // ── Streak ──────────────────────────────────────────────────────────
  const lastMonday = addDays(weekStart(today), -7);
  const streak = streakWeeks(history, lastMonday);
  if (streak >= 2) strong.push({ id: 'streak', text: `${streak} weken op rij minstens 2 sessies.` });

  return {
    strong: strong.slice(0, 4),
    work: work.slice(0, 4),
    weakGroup,
    strongGroup,
    avoidWeekdays,
    enoughData: strength.length >= 2 || planned28.length >= 3,
  };
}
