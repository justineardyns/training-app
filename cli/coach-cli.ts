// Coach-CLI: dezelfde coachlogica als de app, voor GitHub Actions (meldingen) en /coach.
// Wordt gebundeld naar dist/coach-cli.mjs en gepubliceerd op GitHub Pages.
//
//   node coach-cli.mjs notify   --data . --mode morning|sunday|test [--force] [--dry-run]
//   node coach-cli.mjs report   --data . [--week 2026-W47]          → markdown-rapport
//   node coach-cli.mjs context  --data . [--week 2026-W47]          → JSON voor /coach
//   node coach-cli.mjs validate --data .                            → controleert data/coach/adjustments.json
import { sendNotification, type PushSubscription as WebPushSubscription } from 'web-push';
import { addDays, dayIndex, isoWeek, mondayOfIsoWeek, weekStart } from '../src/coach/dates.ts';
import { EXERCISES } from '../src/coach/catalog.ts';
import { referral } from '../src/coach/injury.ts';
import { bestE1rm, exposures, isStagnating } from '../src/coach/progression.ts';
import { buildReport, reportMarkdown } from '../src/coach/report.ts';
import { sanitizeAdjustments } from '../src/coach/rules.ts';
import { paths } from '../src/data/schema.ts';
import { morningMessage, sundayMessage, testMessage, type PushMessage } from '../src/data/notify.ts';
import type { PushFile } from '../src/data/push.ts';
import type { Store } from '../src/data/store.ts';
import { loadRepo } from './load.ts';

const VERSION = process.env.COACH_VERSION ?? 'dev';

type Opts = Record<string, string | boolean>;

function args(argv: string[]): Opts {
  const out: Opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[a.slice(2)] = next;
      i++;
    } else out[a.slice(2)] = true;
  }
  return out;
}

function localHour(now: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now));
}

/** Week van het rapport: deze week op zondag, anders de vorige (afgelopen) week. */
export function reportMonday(store: Store, week?: string): string {
  if (week) return mondayOfIsoWeek(week);
  const today = store.today();
  return dayIndex(today) === 6 ? weekStart(today) : addDays(weekStart(today), -7);
}

function report(store: Store, monday: string) {
  return buildReport({
    monday,
    history: store.sessions(),
    checks: store.checks().map((c) => ({ date: c.date, level: c.level })),
    planned: store.plannedCount(monday),
    nextWeek: store.plan(addDays(monday, 7)),
    insights: store.insights(),
  });
}

/** Welke melding nu (of null), los van het versturen: testbaar. */
export function pickMessage(store: Store, o: Opts): { msg: PushMessage | null; reason: string } {
  const mode = String(o.mode ?? 'morning');
  const push = store.read<PushFile>(paths.push);
  store.timeZone = push?.timeZone ?? store.timeZone ?? 'Europe/Brussels';
  const hour = localHour(store.now(), store.timeZone);
  if (mode === 'test') return { msg: testMessage(), reason: 'test' };
  if (mode === 'morning') {
    const want = store.profile()?.notifyHour ?? 7;
    if (!o.force && hour !== want) return { msg: null, reason: `Niet het juiste uur (${hour}u lokaal, melding om ${want}u).` };
    const msg = morningMessage(store);
    return { msg, reason: msg ? 'ochtend' : 'Geen melding nodig vandaag.' };
  }
  if (mode === 'sunday') {
    if (!o.force && (dayIndex(store.today()) !== 6 || hour !== 19)) return { msg: null, reason: `Geen zondag 19u (${store.today()} ${hour}u).` };
    const msg = sundayMessage(store);
    return { msg, reason: msg ? 'zondag' : 'Volgende week is al gepland.' };
  }
  throw new Error(`Onbekende modus: ${mode}`);
}

async function notify(store: Store, o: Opts): Promise<void> {
  const { msg, reason } = pickMessage(store, o);
  if (!msg) {
    console.log(`${reason} Niets verstuurd.`);
    return;
  }
  console.log(`Melding: ${msg.title} — ${msg.body}`);
  if (o['dry-run']) return;
  const push = store.read<PushFile>(paths.push);
  if (!push) {
    console.log('::warning::Nog geen pushabonnement. Zet meldingen aan in de app (Meer → Meldingen).');
    return;
  }
  try {
    const res = await sendNotification(push.subscription as WebPushSubscription, JSON.stringify(msg), {
      vapidDetails: { subject: push.subject, publicKey: push.vapid.publicKey, privateKey: push.vapid.privateKey },
      TTL: 6 * 3600,
      urgency: 'normal',
      topic: msg.tag,
    });
    console.log(`Verstuurd (status ${res.statusCode}).`);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      console.log('::warning::Je pushabonnement is verlopen. Open de app → Meer → Meldingen → Opnieuw inschrijven.');
      return;
    }
    throw err;
  }
}

/** Alles wat /coach nodig heeft om je week te analyseren, in één JSON. */
export function context(store: Store, monday: string) {
  const today = store.today();
  const r = report(store, monday);
  const next = store.plan(addDays(monday, 7));
  const sessions = store.sessions();
  const ids = [...new Set(sessions.filter((s) => s.kind === 'strength').flatMap((s) => s.exercises.map((e) => e.exerciseId)))];
  const adjRaw = store.read<unknown>(paths.adjustments);
  return {
    version: VERSION,
    today,
    week: isoWeek(monday),
    profile: store.profile(),
    report: r,
    previousWeeks: [1, 2, 3].map((n) => {
      const p = report(store, addDays(monday, -7 * n));
      return { week: p.week, planned: p.planned, done: p.done, cardioMinutes: p.cardioMinutes, prs: p.prs.length, readiness: p.readiness };
    }),
    nextWeek: {
      target: next.target,
      cap: next.cap,
      strength: next.strength,
      cardio: next.cardio,
      deload: next.deload,
      days: next.days.map((d) => ({
        date: d.date, type: d.type, title: d.title, slot: d.slot, location: d.location, groupClass: d.groupClass, why: d.why, split: d.split,
        focus: d.focus && (d.focus.reduce.length || d.focus.later.length || d.focus.first) ? d.focus : undefined,
      })),
      messages: next.messages,
      violations: next.violations,
    },
    exercises: ids.map((id) => {
      const ex = exposures(sessions, id);
      const last = ex.at(-1);
      return {
        id,
        name: EXERCISES.get(id)?.name ?? id,
        sessions: ex.length,
        lastDate: last?.date,
        lastLoad: last?.log.sets.find((s) => s.done)?.load,
        lastReps: last?.log.sets.filter((s) => s.done).map((s) => s.reps),
        lastFeel: last?.log.feel,
        stage: last?.log.prescription.stage,
        bestE1rm: Math.max(0, ...ex.map((e) => bestE1rm(e.log))),
        stagnating: isStagnating(ex),
      };
    }),
    readiness: store.checks().filter((c) => c.date >= addDays(monday, -7)),
    /** Wat gaat goed, wat minder (dezelfde analyse als in de app; stuurt ook de planner). */
    insights: store.insights(),
    /** Herstel per spiergroep vandaag. */
    recovery: store.recovery(),
    injuries: store.injuries().map((i) => ({ ...i, referral: referral(i, today) })),
    adjustments: adjRaw ? sanitizeAdjustments(adjRaw) : null,
    /** Hoeveel van de 7 dagen na deze week nog niet aangevinkt zijn (patroon of standaard gebruikt). */
    untickedNextWeek: Array.from({ length: 7 }, (_, i) => addDays(monday, 7 + i)).filter((d) => !store.explicitDay(d)).length,
  };
}

export function validate(store: Store, log: (s: string) => void = console.log): number {
  const raw = store.read<unknown>(paths.adjustments);
  if (!raw) {
    log('Geen data/coach/adjustments.json: niets te valideren.');
    return 0;
  }
  const { adjustments, errors } = sanitizeAdjustments(raw);
  for (const e of errors) log(`✗ ${e}`);
  const from = adjustments.validFrom ?? addDays(weekStart(store.today()), 7);
  const plan = store.plan(from);
  for (const v of plan.violations) log(`✗ Regel: ${v.message}`);
  const ok = errors.length === 0 && plan.violations.length === 0;
  log(ok ? `✓ Bijsturing geldig. Plan vanaf ${plan.start}: ${plan.done + plan.planned}/${plan.target} sessies, geen regelbreuken.` : '✗ Pas de bijsturing aan.');
  return ok ? 0 : 1;
}

export async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  const o = args(rest);
  if (!cmd || cmd === 'version') {
    console.log(`coach-cli ${VERSION}`);
    return;
  }
  const store = loadRepo(String(o.data ?? '.'), { now: o.now ? new Date(String(o.now)) : undefined });
  switch (cmd) {
    case 'notify':
      return notify(store, o);
    case 'report':
      process.stdout.write(reportMarkdown(report(store, reportMonday(store, o.week as string | undefined))));
      return;
    case 'context':
      console.log(JSON.stringify(context(store, reportMonday(store, o.week as string | undefined)), null, 2));
      return;
    case 'validate':
      process.exitCode = validate(store);
      return;
    default:
      console.error(`Onbekend commando: ${cmd}`);
      process.exitCode = 1;
  }
}

if (!process.env.VITEST) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
