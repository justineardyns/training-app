import { alternativesFor, EXERCISES, getExercise } from './catalog.ts';
import { acceptableFor, injuryDecision, relevantInjuries } from './injury.ts';
import { DEFAULT_GYM, isAvailable, loadOptions, snapLoad } from './loads.ts';
import { easierVariant, deloadPrescription, exposures, lighterPrescription, nextPrescription, workingLoad } from './progression.ts';
import { MUSCLE_GROUP, type Group, type StrengthFocus } from './recovery.ts';
import { CHECK_NOTE } from './check.ts';
import { addDays } from './dates.ts';
import { intervals as timerIntervals, type TimerBlock } from './timer.ts';
import type {
  CoachAdjustments,
  Exercise,
  GymConfig,
  HomeEquipment,
  ISODate,
  Injury,
  Location,
  Minutes,
  Pattern,
  Prescription,
  ReadinessLevel,
  SessionLog,
  Template,
} from './types.ts';

// Bouwt een concrete training voor een geplande dag: oefeningen, sets, reps, gewicht en rust.

export type Role = 'main' | 'accessory' | 'core';

interface Slot {
  pattern: Pattern;
  role: Role;
  gym: string[];
  home: string[];
  /** Voor absolute beginners in Jims: toestellen en eenvoudige varianten eerst. */
  beginnerGym?: string[];
}

/** Full body A/B, bovenlichaam (U), benen & romp (L). Volgorde = prioriteit (bij weinig tijd vallen de laatste weg). */
export const TEMPLATES: Record<Template, Slot[]> = {
  A: [
    { role: 'main', pattern: 'squat', gym: ['leg-press', 'goblet-squat'], home: ['goblet-squat', 'kb-goblet-squat'] },
    { role: 'main', pattern: 'push_h', gym: ['db-bench', 'chest-press'], beginnerGym: ['chest-press', 'db-bench'], home: ['incline-push-up', 'db-floor-press'] },
    { role: 'main', pattern: 'pull_v', gym: ['lat-pulldown', 'close-grip-pulldown'], home: ['bent-over-row-homebar', 'bent-over-row-db'] },
    { role: 'main', pattern: 'hinge', gym: ['rdl-db', 'rdl-barbell'], home: ['rdl-homebar', 'rdl-db'] },
    { role: 'accessory', pattern: 'push_v', gym: ['db-shoulder-press', 'machine-shoulder-press'], beginnerGym: ['machine-shoulder-press', 'db-shoulder-press'], home: ['standing-db-press', 'half-kneeling-kb-press'] },
    { role: 'core', pattern: 'core', gym: ['dead-bug'], home: ['dead-bug'] },
    { role: 'accessory', pattern: 'arms', gym: ['db-curl'], home: ['db-curl'] },
  ],
  B: [
    { role: 'main', pattern: 'hinge', gym: ['hip-thrust', 'glute-bridge'], beginnerGym: ['glute-bridge', 'hip-thrust'], home: ['glute-bridge', 'kb-deadlift'] },
    { role: 'main', pattern: 'pull_h', gym: ['seated-cable-row', 'machine-row'], home: ['one-arm-db-row', 'bent-over-row-db'] },
    { role: 'main', pattern: 'lunge', gym: ['reverse-lunge', 'step-up'], home: ['reverse-lunge', 'step-up'] },
    { role: 'main', pattern: 'push_h', gym: ['incline-db-press', 'chest-press'], beginnerGym: ['chest-press', 'incline-db-press'], home: ['db-floor-press', 'incline-push-up'] },
    { role: 'accessory', pattern: 'legs_iso', gym: ['leg-curl'], home: ['single-leg-rdl'] },
    { role: 'core', pattern: 'core', gym: ['pallof-press', 'side-plank'], home: ['side-plank', 'plank'] },
    { role: 'accessory', pattern: 'arms', gym: ['triceps-pushdown'], home: ['overhead-triceps'] },
  ],
  // Bovenlichaam: op een dag naast indoor cycling (benen rusten) of naast een benentraining.
  U: [
    { role: 'main', pattern: 'push_h', gym: ['db-bench', 'chest-press'], beginnerGym: ['chest-press', 'db-bench'], home: ['incline-push-up', 'db-floor-press'] },
    { role: 'main', pattern: 'pull_v', gym: ['lat-pulldown', 'close-grip-pulldown'], home: ['bent-over-row-homebar', 'bent-over-row-db'] },
    { role: 'main', pattern: 'pull_h', gym: ['seated-cable-row', 'machine-row'], home: ['one-arm-db-row', 'bent-over-row-db'] },
    { role: 'accessory', pattern: 'push_v', gym: ['db-shoulder-press', 'machine-shoulder-press'], beginnerGym: ['machine-shoulder-press', 'db-shoulder-press'], home: ['standing-db-press', 'half-kneeling-kb-press'] },
    { role: 'core', pattern: 'core', gym: ['pallof-press', 'dead-bug'], home: ['dead-bug', 'plank'] },
    { role: 'accessory', pattern: 'arms', gym: ['db-curl', 'hammer-curl'], home: ['db-curl', 'hammer-curl'] },
    { role: 'accessory', pattern: 'arms', gym: ['triceps-pushdown'], home: ['overhead-triceps'] },
  ],
  // Benen & romp: nooit naast indoor cycling.
  L: [
    { role: 'main', pattern: 'squat', gym: ['leg-press', 'goblet-squat'], home: ['goblet-squat', 'kb-goblet-squat'] },
    { role: 'main', pattern: 'hinge', gym: ['rdl-db', 'rdl-barbell'], home: ['rdl-homebar', 'rdl-db'] },
    { role: 'main', pattern: 'lunge', gym: ['reverse-lunge', 'step-up'], home: ['reverse-lunge', 'step-up'] },
    { role: 'accessory', pattern: 'legs_iso', gym: ['leg-curl'], home: ['single-leg-rdl'] },
    { role: 'accessory', pattern: 'hinge', gym: ['hip-thrust', 'glute-bridge'], beginnerGym: ['glute-bridge', 'hip-thrust'], home: ['glute-bridge', 'kb-deadlift'] },
    { role: 'core', pattern: 'core', gym: ['dead-bug', 'side-plank'], home: ['side-plank', 'dead-bug'] },
    { role: 'accessory', pattern: 'legs_iso', gym: ['leg-extension'], home: ['step-up'] },
  ],
};

/** Naam van een krachttraining. */
export function templateTitle(t: Template | undefined): string {
  if (t === 'U') return 'Bovenlichaam';
  if (t === 'L') return 'Benen & romp';
  return `Full body ${t ?? ''}`.trim();
}

/** Als niets van hetzelfde patroon de blessure spaart: deze patronen trainen grotendeels dezelfde zone. */
const INJURY_FALLBACK: Partial<Record<Pattern, Pattern[]>> = {
  squat: ['lunge', 'hinge', 'legs_iso'],
  lunge: ['squat', 'hinge', 'legs_iso'],
  legs_iso: ['hinge'],
  hinge: ['legs_iso'],
  push_h: ['push_v'],
  push_v: ['push_h'],
  pull_h: ['pull_v'],
  pull_v: ['pull_h'],
};

export interface SessionContext {
  date: ISODate;
  template: Template;
  location: Location;
  minutes: Minutes;
  history: SessionLog[];
  equipment: HomeEquipment;
  gym?: GymConfig;
  readiness?: ReadinessLevel;
  deload?: boolean;
  injuries?: Injury[];
  adjustments?: CoachAdjustments;
  /** Absolute beginner: lichtere start, kennismaking, toestellen eerst. */
  beginner?: boolean;
  /** Herstel en werkpunt: welke groepen eerst, welke 1 set minder. */
  focus?: StrengthFocus;
  /** Rustiger (bv. net na ziekte): 1 set minder, niet zwaarder, zonder extra uitleg. */
  gentle?: boolean;
  /** Tennis-extra: schouders en romp voor je slagen (af en toe). */
  tennisExtra?: boolean;
  /** Krachtcheck: laatste set op de hoofdoefeningen zoveel mogelijk goede reps. */
  check?: boolean;
}

export interface PlannedExercise {
  exercise: Exercise;
  prescription: Prescription;
  role: Role;
  /** Superset-label (bij 30 min): A1/A2 delen dezelfde rust. */
  superset?: string;
  /** Geldige gewichten voor het draaiwiel. */
  options: number[];
  replacedFrom?: string;
  injuryNote?: string;
  /** Uitleg als herstel deze oefening lichter maakt. */
  recoveryNote?: string;
  /** Hoort bij de tennis-extra. */
  tennis?: boolean;
}

export interface StrengthSession {
  kind: 'strength';
  date: ISODate;
  title: string;
  template: Template;
  location: Location;
  minutes: Minutes;
  deload: boolean;
  warmup: string[];
  exercises: PlannedExercise[];
  finisher?: { title: string; steps: string[]; blocks?: TimerBlock[] };
  estimatedMinutes: number;
  notes: string[];
}

const VOLUME: Record<Minutes, { slots: number; sets: Record<Role, number>; rest: Record<Role, number>; superset: boolean }> = {
  30: { slots: 5, sets: { main: 3, accessory: 2, core: 2 }, rest: { main: 60, accessory: 45, core: 30 }, superset: true },
  45: { slots: 6, sets: { main: 3, accessory: 2, core: 2 }, rest: { main: 90, accessory: 60, core: 45 }, superset: false },
  60: { slots: 7, sets: { main: 3, accessory: 3, core: 3 }, rest: { main: 90, accessory: 60, core: 45 }, superset: false },
};

/** Ladder (lichter ↔ zwaarder) van een oefening, lichtste eerst. */
export function ladderOf(id: string): string[] {
  const down: string[] = [];
  for (let e = easierVariant(id); e && !down.includes(e); e = easierVariant(e)) down.unshift(e);
  const up: string[] = [];
  for (let h = EXERCISES.get(id)?.harder; h && !up.includes(h) && h !== id; h = EXERCISES.get(h)?.harder) up.push(h);
  return [...down, id, ...up];
}

/** Welke variant gebruik je nu? De meest recente uit de ladder op deze locatie. */
function currentVariant(defaultId: string, ctx: SessionContext): string {
  const chain = ladderOf(defaultId).filter((id) => isAvailable(getExercise(id), ctx.location, ctx.equipment, ctx.gym));
  let best = defaultId;
  let bestDate = '';
  for (const id of chain) {
    const last = exposures(ctx.history, id).filter((e) => !e.location || e.location === ctx.location).at(-1);
    if (last && last.date > bestDate) [best, bestDate] = [id, last.date];
  }
  return best;
}

function pickForSlot(slot: Slot, ctx: SessionContext, used: Set<string>): Exercise | undefined {
  const gym = ctx.gym ?? DEFAULT_GYM;
  const list = ctx.location === 'gym' && ctx.beginner && slot.beginnerGym ? slot.beginnerGym : slot[ctx.location];
  for (const id of list) {
    let pick = id;
    const swap = ctx.adjustments?.swaps?.find((s) => s.from === id);
    if (swap && isAvailable(getExercise(swap.to), ctx.location, ctx.equipment, gym)) pick = swap.to;
    pick = currentVariant(pick, ctx);
    const ex = getExercise(pick);
    if (!used.has(ex.id) && isAvailable(ex, ctx.location, ctx.equipment, gym)) return ex;
  }
  return alternativesFor(slot[ctx.location][0] ?? slot.gym[0]!, ctx.location).find(
    (e) => !used.has(e.id) && isAvailable(e, ctx.location, ctx.equipment, gym),
  );
}

/** Schatting van de duur in seconden. */
export function estimateSeconds(list: PlannedExercise[], supersets: boolean): number {
  const work = (p: PlannedExercise) => {
    const per = p.exercise.timed ? p.prescription.targetReps : p.prescription.targetReps * (p.prescription.tempo ? 5 : 3);
    return (per + (p.prescription.pauseSec ?? 0) * (p.exercise.timed ? 0 : p.prescription.targetReps)) * (p.exercise.unilateral ? 2 : 1);
  };
  let total = 5 * 60; // opwarming
  const seen = new Set<string>();
  for (const p of list) {
    total += 60; // wissel/klaarzetten
    if (supersets && p.superset) {
      const group = p.superset.slice(0, 1);
      if (seen.has(group)) {
        total += p.prescription.sets * work(p);
        continue;
      }
      seen.add(group);
    }
    total += p.prescription.sets * (work(p) + p.prescription.restSec);
  }
  return total;
}

export function buildPrescription(ex: Exercise, role: Role, ctx: SessionContext, sets?: number): { exercise: Exercise; prescription: Prescription; options: number[] } {
  const gym = ctx.gym ?? DEFAULT_GYM;
  const vol = VOLUME[ctx.minutes];
  const run = (e: Exercise) => {
    const options = loadOptions(e, ctx.location, ctx.equipment, gym);
    const history = exposures(ctx.history.filter((s) => s.date < ctx.date), e.id);
    const real = history.filter((h) => !h.deload).length;
    const baseSets = sets ?? vol.sets[role];
    const result = nextPrescription({
      exercise: e,
      options,
      history,
      // Kennismaking: de eerste 2 keer maximaal 2 sets.
      sets: ctx.beginner && real < 2 ? Math.min(2, baseSets) : baseSets,
      restSec: vol.rest[role],
      repRange: ctx.adjustments?.repRangeOverrides?.[e.id],
      beginner: ctx.beginner,
    });
    return { e, options, history, result };
  };
  let r = run(ex);
  if (r.result.switchTo && isAvailable(getExercise(r.result.switchTo), ctx.location, ctx.equipment, gym)) {
    const note = r.result.note;
    r = run(getExercise(r.result.switchTo));
    r.result = { ...r.result, note: `${note} ${r.result.note}` };
  }
  let p: Prescription = { ...r.result };
  delete (p as { switchTo?: string }).switchTo;
  if (ctx.deload) p = deloadPrescription(p, r.options);
  else if (ctx.readiness === 'orange' || ctx.readiness === 'red' || ctx.gentle) {
    const last = r.history.at(-1);
    p = lighterPrescription(p, last ? snapLoad(workingLoad(last.log), r.options, 'down') : undefined);
    if (ctx.readiness !== 'orange' && ctx.readiness !== 'red') p = { ...p, note: '1 set minder en niet zwaarder dan vorige keer.' };
  }
  return { exercise: r.e, prescription: p, options: r.options };
}

export function buildStrengthSession(ctx: SessionContext): StrengthSession {
  const vol = VOLUME[ctx.minutes];
  const injuries = relevantInjuries(ctx.injuries ?? [], ctx.history, (id) => EXERCISES.get(id));
  const notes: string[] = [];
  const used = new Set<string>();
  const planned: PlannedExercise[] = [];

  for (const slot of TEMPLATES[ctx.template].slice(0, vol.slots)) {
    let ex = pickForSlot(slot, ctx, used);
    if (!ex) continue;
    let replacedFrom: string | undefined;
    let decision = injuryDecision(ex, injuries, ctx.history, (id) => EXERCISES.get(id));
    if (decision.action === 'replace') {
      const usedNow = new Set([...used, ...planned.map((p) => p.exercise.id)]);
      const pools = [ex.pattern, ...(INJURY_FALLBACK[ex.pattern] ?? [])];
      const alt = pools
        .flatMap((pattern) => alternativesFor(ex!.id, ctx.location, { pattern }))
        .find(
          (a) =>
            !usedNow.has(a.id) &&
            isAvailable(a, ctx.location, ctx.equipment, ctx.gym) &&
            acceptableFor(a, injuries) &&
            injuryDecision(a, injuries, ctx.history, (id) => EXERCISES.get(id)).action !== 'replace',
        );
      if (!alt) {
        notes.push(`${ex.name} valt weg om je blessure te sparen.`);
        continue;
      }
      replacedFrom = ex.id;
      ex = alt;
      decision = injuryDecision(ex, injuries, ctx.history, (id) => EXERCISES.get(id));
    }
    const built = buildPrescription(ex, slot.role, ctx);
    let prescription = built.prescription;
    if (decision.factor < 1 && prescription.load > 0) {
      prescription = { ...prescription, load: snapLoad(prescription.load * decision.factor, built.options, 'down'), change: 'injury' };
    }
    used.add(built.exercise.id);
    planned.push({
      exercise: built.exercise,
      prescription,
      role: slot.role,
      options: built.options,
      replacedFrom,
      injuryNote: replacedFrom ? `Vervangt ${getExercise(replacedFrom).name} om je blessure te sparen.` : decision.note,
    });
  }

  // Tennis-extra (af en toe): gezonde schouders en een sterke rotatie voor je slagen. Vóór de armen,
  // zodat bij weinig tijd eerst de armen wegvallen.
  if (ctx.tennisExtra && ctx.location === 'gym') {
    const ids = ctx.template === 'L' ? ['cable-woodchop'] : ctx.template === 'U' ? ['face-pull', 'cable-external-rotation'] : ['face-pull', 'cable-woodchop'];
    const at = planned.findIndex((p) => p.exercise.pattern === 'arms');
    const extras: PlannedExercise[] = [];
    for (const id of ids) {
      const ex = getExercise(id);
      if (planned.some((p) => p.exercise.id === id) || !isAvailable(ex, ctx.location, ctx.equipment, ctx.gym) || !acceptableFor(ex, injuries)) continue;
      const built = buildPrescription(ex, 'accessory', ctx, 2);
      extras.push({
        exercise: built.exercise,
        prescription: { ...built.prescription, note: `🎾 Tennis-extra: ${id === 'cable-woodchop' ? 'rotatie voor krachtige slagen' : 'gezonde, sterke schouders'}. ${built.prescription.note}` },
        role: 'accessory',
        options: built.options,
        tennis: true,
      });
    }
    planned.splice(at >= 0 ? at : planned.length, 0, ...extras);
  }

  // Krachtcheck: op je hoofdoefeningen (met gewicht en al minstens 2× gedaan), één keer per check-week.
  if (ctx.check && !ctx.deload) {
    const weekAgo = addDays(ctx.date, -6);
    for (const p of planned) {
      if (p.role !== 'main' || p.exercise.load === 'bodyweight' || p.prescription.load <= 0) continue;
      const hist = exposures(ctx.history.filter((h) => h.date < ctx.date), p.exercise.id);
      if (hist.filter((h) => !h.deload).length < 2) continue;
      if (hist.some((h) => h.date >= weekAgo && h.log.prescription.test)) continue;
      p.prescription = { ...p.prescription, test: true, note: CHECK_NOTE };
    }
  }

  // Herstel: moe → 1 set minder en niet zwaarder; wie fris is (of je werkpunt) komt eerst.
  if (ctx.focus) applyFocus(planned, ctx.focus, ctx.history.filter((h) => h.date < ctx.date));

  // Supersets bij 30 min: A1/A2 en B1/B2, kern apart.
  if (vol.superset) {
    let n = 0;
    for (const p of planned.filter((x) => x.role !== 'core')) {
      const group = String.fromCharCode(65 + Math.floor(n / 2));
      p.superset = `${group}${(n % 2) + 1}`;
      n++;
    }
  }

  // Inkorten tot het binnen je tijd past: eerst armen, dan sets van hulpoefeningen.
  const budget = ctx.minutes * 60 + 120;
  const finisherSec = 6 * 60;
  const wantsFinisher = ctx.minutes === 60 && !ctx.deload && (ctx.readiness ?? 'green') === 'green';
  let guard = 0;
  while (estimateSeconds(planned, vol.superset) + (wantsFinisher ? finisherSec : 0) > budget && guard++ < 20) {
    const arms = planned.findIndex((p) => p.exercise.pattern === 'arms');
    if (arms >= 0) {
      planned.splice(arms, 1);
      continue;
    }
    const acc = [...planned].reverse().find((p) => p.role !== 'main' && p.prescription.sets > 1);
    if (acc) {
      acc.prescription = { ...acc.prescription, sets: acc.prescription.sets - 1 };
      continue;
    }
    const main = [...planned].reverse().find((p) => p.prescription.sets > 2);
    if (main) main.prescription = { ...main.prescription, sets: main.prescription.sets - 1 };
    else break;
  }

  const hasKb = isAvailable(getExercise('kb-swing'), ctx.location, ctx.equipment, ctx.gym);
  const finisher = wantsFinisher
    ? ctx.location === 'gym'
      ? { title: 'Afsluiter (6 min)', steps: ['Fiets of roeier: 6× (20 s stevig / 40 s rustig)'], blocks: timerIntervals(6, 20, 40) }
      : {
          title: 'Afsluiter (6 min)',
          steps: [hasKb ? 'Elke minuut 12 kettlebell swings, 6 minuten lang' : 'Elke minuut 10 squats + 6 push-ups, 6 minuten lang'],
          blocks: Array.from({ length: 6 }, (_, i) => ({ label: `${hasKb ? '12 kettlebell swings' : '10 squats + 6 push-ups'} (minuut ${i + 1}/6)`, seconds: 60, hard: true })),
        }
    : undefined;

  if (ctx.focus?.why) notes.unshift(ctx.focus.why);
  if (ctx.deload) notes.unshift('Deloadweek: minder sets en iets lichter. Je wordt er sterker van.');
  if (ctx.readiness === 'orange') notes.unshift('Dagvorm oranje: 1 set minder en geen zwaarder gewicht.');
  if (ctx.adjustments?.focus) notes.push(`Coach: ${ctx.adjustments.focus}`);

  const warmup =
    ctx.location === 'gym'
      ? ['5 min fiets of roeier, rustig opbouwen', 'Per hoofdoefening 1–2 lichte opwarmsets (±50% en 75%)']
      : ['2 min ter plaatse lopen of jumping jacks', '10 squats, 10 armcirkels, 10 heupcirkels', '1 lichte opwarmset per oefening'];

  return {
    kind: 'strength',
    date: ctx.date,
    title: templateTitle(ctx.template),
    template: ctx.template,
    location: ctx.location,
    minutes: ctx.minutes,
    deload: !!ctx.deload,
    warmup,
    exercises: planned,
    finisher,
    estimatedMinutes: Math.ceil((estimateSeconds(planned, vol.superset) + (finisher ? finisherSec : 0)) / 60),
    notes,
  };
}

export function groupOf(ex: Exercise): Group {
  return MUSCLE_GROUP[ex.muscles[0]!];
}

/** Herstel toepassen op een lijst oefeningen (in place). */
export function applyFocus(planned: PlannedExercise[], focus: StrengthFocus, history: SessionLog[]): void {
  for (const p of planned) {
    const g = groupOf(p.exercise);
    if (p.role === 'core' || !focus.reduce.includes(g)) continue;
    const last = exposures(history, p.exercise.id).at(-1);
    const prevLoad = last ? snapLoad(workingLoad(last.log), p.options, 'down') : undefined;
    const noUp = p.prescription.change === 'load_up' && prevLoad !== undefined;
    p.prescription = {
      ...p.prescription,
      sets: Math.max(1, p.prescription.sets - 1),
      load: noUp ? prevLoad : p.prescription.load,
      targetReps: noUp ? p.prescription.repRange[0] + 1 : p.prescription.targetReps,
    };
    p.recoveryNote = 'Herstel: 1 set minder en niet zwaarder dan vorige keer.';
  }
  const rank = (p: PlannedExercise) => {
    const g = groupOf(p.exercise);
    if (focus.reduce.includes(g)) return 3;
    if (focus.later.includes(g)) return 2;
    if (focus.first === g) return 0;
    return 1;
  };
  const mainIdx = planned.map((p, i) => (p.role === 'main' ? i : -1)).filter((i) => i >= 0);
  const mains = mainIdx.map((i) => planned[i]!).map((p, k) => ({ p, k })).sort((a, b) => rank(a.p) - rank(b.p) || a.k - b.k);
  mainIdx.forEach((i, k) => {
    planned[i] = mains[k]!.p;
  });
}

export interface WarmupStep {
  title: string;
  seconds: number;
  /** Korte uitleg (hoe). */
  how?: string;
}

/** Begeleide opwarming van ±5 minuten, afgestemd op de training van vandaag. */
export function warmupFor(template: Template): WarmupStep[] {
  if (template === 'U') {
    return [
      { title: 'Roeier, rustig', seconds: 120, how: 'Rustig tempo, je kan nog praten.' },
      { title: 'Armcirkels', seconds: 30, how: 'Grote cirkels, 15 s vooruit en 15 s achteruit.' },
      { title: 'Schouders openen', seconds: 30, how: 'Armen gestrekt opzij, schouderbladen naar elkaar.' },
      { title: 'Push-ups tegen een bank', seconds: 40, how: 'Rustig, volledig bereik.' },
      { title: 'Borstwervel draaien', seconds: 40, how: 'Op handen en knieën, hand achter je hoofd, open naar het plafond. Wissel halverwege.' },
    ];
  }
  if (template === 'L') {
    return [
      { title: 'Fiets, rustig', seconds: 120, how: 'Rustig tempo, je kan nog praten.' },
      { title: 'Squats zonder gewicht', seconds: 40, how: 'Rustig zakken, borst omhoog.' },
      { title: 'Heupcirkels', seconds: 30, how: 'Handen op je heupen, grote cirkels beide kanten.' },
      { title: 'Glute bridges', seconds: 40, how: 'Op je rug, heupen omhoog, 1 tel vasthouden boven.' },
      { title: 'Achterwaartse lunges', seconds: 40, how: 'Afwisselend links en rechts, zonder gewicht.' },
    ];
  }
  return [
    { title: 'Fiets of roeier, rustig', seconds: 120, how: 'Rustig tempo, je kan nog praten.' },
    { title: 'Squats zonder gewicht', seconds: 30, how: 'Rustig zakken, borst omhoog.' },
    { title: 'Armcirkels', seconds: 30, how: 'Grote cirkels, 15 s vooruit en 15 s achteruit.' },
    { title: 'Glute bridges', seconds: 30, how: 'Op je rug, heupen omhoog, 1 tel vasthouden boven.' },
    { title: 'Push-ups tegen een bank', seconds: 30, how: 'Rustig, volledig bereik.' },
  ];
}

export interface CardioSession {
  kind: 'cardio';
  date: ISODate;
  title: string;
  location: Location;
  minutes: Minutes;
  options: CardioOption[];
  notes: string[];
}

export interface CardioOption {
  title: string;
  steps: string[];
  /** Voor de timer: blokken die na elkaar aflopen (niet bij een groepsles). */
  blocks?: TimerBlock[];
}

export function buildCardioSession(
  ctx: Pick<SessionContext, 'date' | 'location' | 'minutes' | 'readiness' | 'equipment' | 'gym' | 'gentle'> & { groupClass?: string; time?: string },
): CardioSession {
  const { minutes: min, location } = ctx;
  const orange = ctx.readiness === 'orange' || ctx.readiness === 'red';
  const lighter = orange || !!ctx.gentle;
  const notes: string[] = [];
  const options: CardioSession['options'] = [];
  const intervals = Math.max(4, Math.min(10, Math.floor((min - 10) / 2)));

  if (location === 'gym') {
    if (lighter) {
      options.push({
        title: 'Rustige cardio (zone 2)',
        steps: [`${min - 5} min fiets, roeier of crosstrainer in een tempo waarbij je nog kan praten`, '5 min uitbollen'],
        blocks: [
          { label: 'Rustig tempo: je kan nog praten', seconds: (min - 5) * 60 },
          { label: 'Uitbollen', seconds: 300 },
        ],
      });
      if (orange) notes.push('Dagvorm oranje: rustig tempo.');
    } else {
      if (ctx.groupClass) {
        // Groepsles: altijd 1 uur, de lesgever geeft het tempo aan. Geen timer, geen alternatief.
        options.push({
          title: `${ctx.groupClass} (groepsles)`,
          steps: [
            `${ctx.time ? `Les om ${ctx.time.replace(':00', 'u').replace(':', 'u')}, ` : ''}1 uur: wees er 10 min vroeger`,
            'Eerste keer? Laat je fiets afstellen (zadel op heuphoogte)',
            'Draai op je eigen tempo',
          ],
        });
        return { kind: 'cardio', date: ctx.date, title: ctx.groupClass, location, minutes: 60, options, notes };
      }
      const zone2 = Math.max(0, min - 10 - intervals * 2);
      options.push({
        title: 'Intervallen op fiets of roeier',
        steps: ['5 min opwarmen', `${intervals}× (30 s stevig / 90 s rustig)`, `${zone2} min rustig (zone 2)`, '5 min uitbollen'].filter((s) => !s.startsWith('0 min')),
        blocks: [
          { label: 'Opwarmen: rustig op gang komen', seconds: 300 },
          ...timerIntervals(intervals, 30, 90),
          ...(zone2 ? [{ label: 'Rustig tempo (zone 2)', seconds: zone2 * 60 }] : []),
          { label: 'Uitbollen', seconds: 300 },
        ],
      });
    }
  } else {
    const hasKb = isAvailable(getExercise('kb-swing'), 'home', ctx.equipment, ctx.gym);
    const rounds = Math.max(2, Math.floor((min - 8) / 4));
    const stations = [hasKb ? '12 kettlebell swings' : '12 snelle step-ups per been', '10 goblet squats', '8 push-ups (of met handen verhoogd)', '10 eenarmig roeien per kant'];
    options.push({
      title: lighter ? 'Rustig circuit thuis' : 'Kettlebell-circuit (EMOM)',
      steps: [
        '4 min opwarmen: ter plaatse lopen, squats, armcirkels',
        `${rounds} rondes, elke minuut een nieuwe oefening${lighter ? ' (halve reps, rustig tempo)' : ''}:`,
        ...stations.map((x, i) => `  ${i + 1}. ${x}`),
        '4 min uitbollen en stretchen',
      ],
      blocks: [
        { label: 'Opwarmen: ter plaatse lopen, squats, armcirkels', seconds: 240 },
        ...Array.from({ length: rounds }, (_, r) => stations.map((x) => ({ label: `${x} (ronde ${r + 1}/${rounds})`, seconds: 60, hard: !lighter }))).flat(),
        { label: 'Uitbollen en stretchen', seconds: 240 },
      ],
    });
    if (orange) notes.push('Dagvorm oranje: halve reps en extra rust waar nodig.');
  }
  return {
    kind: 'cardio',
    date: ctx.date,
    title: lighter ? 'Rustige cardio' : ctx.groupClass ? ctx.groupClass : 'Conditie',
    location,
    minutes: min,
    options,
    notes,
  };
}
