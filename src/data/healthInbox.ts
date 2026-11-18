import { mergeDays, parseInbox, summarize, integrateWorkouts, type WatchWorkout } from '../coach/health.ts';
import { isoWeek } from '../coach/dates.ts';
import type { HealthDay, Injury, Severity, Zone } from '../coach/types.ts';
import { paths, type HealthMonthFile, type InjuriesFile } from './schema.ts';
import { newId, type Store } from './store.ts';

// Verwerkt wat de Opdracht "Training Sync" in data/health/inbox/ zette.

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Brussels';
}

export async function processHealthInbox(store: Store, timeZone = localTimeZone()): Promise<number> {
  const inbox = store
    .list(paths.healthInbox)
    .filter((f) => f.path.endsWith('.txt'))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  if (inbox.length === 0) return 0;

  let days: HealthDay[] = [];
  const workouts = new Map<string, WatchWorkout>();
  let lastImport = '';
  for (const f of inbox) {
    const raw = parseInbox(String(f.content ?? ''));
    const s = summarize(raw, timeZone);
    days = mergeDays(days, s.days);
    for (const w of s.workouts) workouts.set(w.id, w);
    lastImport = importSummary(raw, s.days.at(-1), s.workouts);
  }

  // Per maand bewaren.
  const months = new Set([...days.map((d) => d.date.slice(0, 7)), ...[...workouts.values()].map((w) => w.start.slice(0, 7))]);
  for (const month of months) {
    const path = paths.health(month);
    const cur = store.read<HealthMonthFile>(path) ?? { month, days: [], workouts: [] };
    const ws = new Map(cur.workouts.map((w) => [w.id, w]));
    for (const w of workouts.values()) if (w.start.slice(0, 7) === month) ws.set(w.id, w);
    await store.write(path, {
      month,
      days: mergeDays(cur.days, days.filter((d) => d.date.startsWith(month))),
      workouts: [...ws.values()].sort((a, b) => (a.start < b.start ? -1 : 1)),
    });
  }

  // Watch-workouts als sessies in je log (per week).
  const byWeek = new Map<string, WatchWorkout[]>();
  for (const w of workouts.values()) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(w.start));
    byWeek.set(isoWeek(date), [...(byWeek.get(isoWeek(date)) ?? []), w]);
  }
  for (const [week, ws] of byWeek) {
    const log = store.log(week);
    const sessions = integrateWorkouts(log.sessions, ws, timeZone);
    if (JSON.stringify(sessions) !== JSON.stringify(log.sessions)) await store.write(paths.log(week), { ...log, sessions });
  }

  // Dagvorm van vandaag opnieuw berekenen met de nieuwe Watch-data.
  const today = store.today();
  const check = store.checkFor(today);
  if (check && days.some((d) => d.date === today)) await store.recordCheck(check.energy);

  for (const f of inbox) await store.remove(f.path);
  await store.setLocal({ lastHealth: store.now().toISOString(), lastImport });
  return inbox.length;
}

function importSummary(raw: ReturnType<typeof parseInbox>, day: HealthDay | undefined, workouts: WatchWorkout[]): string {
  const nf = (n: number) => n.toLocaleString('nl-BE', { maximumFractionDigits: 1 });
  const parts = [
    `slaap ${day?.sleepHours !== undefined ? `${nf(day.sleepHours)} u` : '–'}`,
    `HRV ${day?.hrvMs !== undefined ? nf(day.hrvMs) : '–'}`,
    `rust ${day?.restingHr ?? '–'}`,
    `stappen ${day?.steps !== undefined ? nf(day.steps) : '–'}`,
    `${raw.hr.length} hartslagmetingen`,
    `workouts: ${workouts.length ? workouts.map((w) => w.type).join(', ') : 'geen'}`,
  ];
  if (raw.skipped) parts.push(`${raw.skipped} onleesbare regels`);
  return parts.join(' · ');
}

// ── Blessures ───────────────────────────────────────────────────────────

export async function reportInjury(store: Store, zone: Zone, severity: Severity, sharp: boolean): Promise<Injury> {
  const today = store.today();
  const file = store.read<InjuriesFile>(paths.injuries) ?? { injuries: [] };
  const active = file.injuries.find((i) => i.zone === zone && !i.resolvedOn);
  let injury: Injury;
  if (active) {
    injury = { ...active, sharp: active.sharp || sharp, updates: [...active.updates, { date: today, trend: severity > active.severity ? 'erger' : 'zelfde', severity }] };
  } else {
    injury = { id: newId(), zone, severity, startedOn: today, sharp, updates: [] };
  }
  await store.write(paths.injuries, { injuries: [...file.injuries.filter((i) => i.id !== injury.id), injury] });
  return injury;
}

export async function updateInjury(store: Store, id: string, trend: 'beter' | 'zelfde' | 'erger' | 'weg'): Promise<void> {
  const today = store.today();
  const file = store.read<InjuriesFile>(paths.injuries) ?? { injuries: [] };
  await store.write(paths.injuries, {
    injuries: file.injuries.map((i) => {
      if (i.id !== id) return i;
      const last = i.updates.at(-1)?.severity ?? i.severity;
      const severity = (trend === 'beter' ? Math.max(1, last - 1) : trend === 'erger' ? Math.min(3, last + 1) : last) as Severity;
      return {
        ...i,
        updates: [...i.updates.filter((u) => u.date !== today), { date: today, trend, severity }],
        resolvedOn: trend === 'weg' ? today : i.resolvedOn,
      };
    }),
  });
}
