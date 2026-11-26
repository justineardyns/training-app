import { addDays, isoWeek, todayIn } from '../coach/dates.ts';
import { defaultDay, resolveDay } from '../coach/availability.ts';
import { DEFAULT_GYM, DEFAULT_HOME, formatLoad } from '../coach/loads.ts';
import {
  activeAdjustments,
  coachTarget,
  DEFAULT_PREFS,
  normalizePrefs,
  planTwoWeeks,
  planWeek,
  type PlanInput,
  type PlannedDay,
  type TwoWeekPlan,
  type WeekPlan,
} from '../coach/planner.ts';
import { assessReadiness } from '../coach/readiness.ts';
import { sanitizeAdjustments } from '../coach/rules.ts';
import { buildCardioSession, buildStrengthSession, type CardioSession, type StrengthSession } from '../coach/session.ts';
import type { LightId } from '../coach/light.ts';
import { buildInsights, type Insights } from '../coach/insights.ts';
import { eventFromSession, recoveryAt, type Group, type GroupRecovery } from '../coach/recovery.ts';
import { SWEAT_KINDS } from '../coach/planner.ts';
import { isWeekend } from '../coach/availability.ts';
import type { DayWeather } from '../coach/weather.ts';
import { illnessState, type Illness, type IllnessState } from '../coach/illness.ts';
import { milestones, type Milestone } from '../coach/milestones.ts';
import { strengthChecks, type StrengthCheck } from '../coach/check.ts';
import { DEFAULT_WEEK_GOAL, goalProgress, goalReachedOn, suggestGoals, type Goal, type WeekGoal } from '../coach/goals.ts';
import { getExercise } from '../coach/catalog.ts';
import type {
  CoachAdjustments,
  DayAvailability,
  Energy,
  HealthDay,
  Injury,
  ISODate,
  Location,
  Minutes,
  Prefs,
  SessionLog,
} from '../coach/types.ts';
import { idb } from './db.ts';
import {
  emptyLog,
  paths,
  type AvailabilityMonth,
  type HealthMonthFile,
  type InjuriesFile,
  type LogFile,
  type Profile,
  type ReadinessCheck,
} from './schema.ts';
import type { WorkoutState } from './workout.ts';

export interface FileRecord {
  path: string;
  /** JSON-inhoud, of tekst voor .md/.txt. */
  content: unknown;
  /** Blob-sha op GitHub (na sync). */
  sha?: string;
  dirty: boolean;
  deleted?: boolean;
  updatedAt: number;
}

export type FreeCardioKind = 'lopen' | 'fietsen' | 'roeien';
export interface FreeCardioRun {
  date: ISODate;
  kind: FreeCardioKind;
  /** Opgetelde ms tot de laatste pauze. */
  ms: number;
  /** Loopt sinds (ontbreekt = gepauzeerd). */
  since?: number;
}

export interface LocalSettings {
  token?: string;
  owner?: string;
  repo?: string;
  branch?: string;
  lastSync?: string;
  lastSyncError?: string;
  tokenExpires?: string;
  /** Commit-sha van de laatste pull. */
  remoteHead?: string;
  /** Laatste keer dat er Watch-data binnenkwam. */
  lastHealth?: string;
  /** Korte samenvatting van de laatste import (om de Opdracht te controleren). */
  lastImport?: string;
  /** Plaats voor het weerbericht. Blijft op je iPhone (nooit in de repo). */
  weatherPlace?: WeatherPlace;
  /** Lopende stopwatch voor losse cardio (bv. buiten lopen): blijft staan als de app herstart. */
  freeCardio?: FreeCardioRun;
  /** Mijlpalen die je al zag (felicitatie niet opnieuw tonen). */
  seenMilestones?: string[];
}

export interface WeatherPlace {
  name: string;
  lat: number;
  lon: number;
}

/** Laatste weerbericht, enkel lokaal bewaard. */
export interface WeatherCache {
  fetchedAt: string;
  place: WeatherPlace;
  days: DayWeather[];
}

export const DEFAULT_PLACE: WeatherPlace = { name: 'Brussel', lat: 50.85, lon: 4.35 };

export type AvailabilitySource = 'saved' | 'pattern' | 'default';

export function defaultProfile(now = new Date()): Profile {
  return {
    version: 1,
    setupDone: false,
    equipment: structuredClone(DEFAULT_HOME),
    gym: structuredClone(DEFAULT_GYM),
    prefs: { ...DEFAULT_PREFS },
    notifyHour: 7,
    createdAt: now.toISOString(),
  };
}

export class Store {
  files = new Map<string, FileRecord>();
  local: LocalSettings = {};
  workout?: WorkoutState;
  weather?: WeatherCache;
  version = 0;
  ready = false;
  /** Klok, vervangbaar in tests. */
  now: () => Date = () => new Date();
  /** Tijdzone (standaard die van je toestel; de CLI in GitHub Actions zet Brussel). */
  timeZone?: string;
  /** Wordt aangeroepen na elke lokale wijziging (sync plant zichzelf in). */
  onDirty?: () => void;
  private listeners = new Set<() => void>();

  async init(): Promise<void> {
    const [files, local, workout, weather] = await Promise.all([
      idb.getAll<FileRecord>('files'),
      idb.get<LocalSettings>('local', 'settings'),
      idb.get<WorkoutState>('local', 'workout'),
      idb.get<WeatherCache>('local', 'weather').catch(() => undefined),
    ]);
    this.files = new Map(files.map((f) => [f.path, f]));
    this.local = local ?? {};
    this.workout = workout;
    this.weather = weather;
    this.ready = true;
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    this.version++;
    this.memo.clear();
    for (const fn of this.listeners) fn();
  }

  // ── Bestanden ────────────────────────────────────────────────────────
  private lastStamp = 0;
  /** Strikt stijgend, zodat twee wijzigingen in dezelfde milliseconde toch verschillen. */
  private stamp(): number {
    this.lastStamp = Math.max(Date.now(), this.lastStamp + 1);
    return this.lastStamp;
  }

  read<T>(path: string): T | undefined {
    const f = this.files.get(path);
    return f && !f.deleted ? (f.content as T) : undefined;
  }

  async write(path: string, content: unknown): Promise<void> {
    const rec: FileRecord = { ...(this.files.get(path) ?? { path }), path, content, dirty: true, deleted: false, updatedAt: this.stamp() };
    this.files.set(path, rec);
    await idb.put('files', rec);
    this.emit();
    this.onDirty?.();
  }

  async remove(path: string): Promise<void> {
    const f = this.files.get(path);
    if (!f) return;
    const rec = { ...f, deleted: true, dirty: true, updatedAt: this.stamp() };
    this.files.set(path, rec);
    await idb.put('files', rec);
    this.emit();
    this.onDirty?.();
  }

  /** Bestand van de server opslaan (niet dirty). */
  async putRemote(path: string, content: unknown, sha: string): Promise<void> {
    const rec: FileRecord = { path, content, sha, dirty: false, updatedAt: Date.now() };
    this.files.set(path, rec);
    await idb.put('files', rec);
  }

  /** Na een push: nieuwe sha, en schoon als er intussen niets meer wijzigde. */
  async markPushed(path: string, sha: string, updatedAt: number): Promise<void> {
    const f = this.files.get(path);
    if (!f) return;
    const rec: FileRecord = { ...f, sha, dirty: f.updatedAt !== updatedAt };
    this.files.set(path, rec);
    await idb.put('files', rec);
  }

  async forget(path: string): Promise<void> {
    this.files.delete(path);
    await idb.delete('files', path);
  }

  list(prefix: string): FileRecord[] {
    return [...this.files.values()].filter((f) => f.path.startsWith(prefix) && !f.deleted);
  }

  dirtyFiles(): FileRecord[] {
    return [...this.files.values()].filter((f) => f.dirty);
  }

  async setLocal(patch: Partial<LocalSettings>): Promise<void> {
    this.local = { ...this.local, ...patch };
    await idb.put('local', this.local, 'settings');
    this.emit();
  }

  async setWorkout(w: WorkoutState | undefined): Promise<void> {
    this.workout = w;
    this.emit();
    this.workoutWrite = this.workoutWrite.then(() => (w ? idb.put('local', w, 'workout') : idb.delete('local', 'workout'))).catch(() => undefined);
    await this.workoutWrite;
  }

  async setWeather(w: WeatherCache): Promise<void> {
    this.weather = w;
    this.emit();
    await idb.put('local', w, 'weather').catch(() => undefined);
  }

  /** Weer voor een dag, als het bericht vers genoeg is (≤ 36 uur oud). */
  weatherFor(date: ISODate): DayWeather | undefined {
    const w = this.weather;
    if (!w || this.now().getTime() - Date.parse(w.fetchedAt) > 36 * 3600_000) return undefined;
    return w.days.find((d) => d.date === date);
  }

  /** Atomaire update op de laatste stand (snel tikken mag nooit een tik verliezen). */
  updateWorkout(fn: (w: WorkoutState) => WorkoutState): Promise<void> {
    if (!this.workout) return Promise.resolve();
    return this.setWorkout(fn(this.workout));
  }

  private workoutWrite: Promise<unknown> = Promise.resolve();

  // ── Afgeleide gegevens (gecachet per versie) ─────────────────────────
  private memo = new Map<string, unknown>();
  private cached<T>(key: string, fn: () => T): T {
    if (!this.memo.has(key)) this.memo.set(key, fn());
    return this.memo.get(key) as T;
  }

  today(): ISODate {
    return todayIn(this.timeZone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Brussels'), this.now());
  }

  profile(): Profile | undefined {
    return this.read<Profile>(paths.profile);
  }

  logs(): LogFile[] {
    return this.cached('logs', () => this.list('data/log/').map((f) => f.content as LogFile));
  }

  log(week: string): LogFile {
    return this.read<LogFile>(paths.log(week)) ?? emptyLog(week);
  }

  sessions(): SessionLog[] {
    return this.cached('sessions', () => this.logs().flatMap((l) => l.sessions).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)));
  }

  checks(): ReadinessCheck[] {
    return this.cached('checks', () => this.logs().flatMap((l) => l.checks).sort((a, b) => (a.date < b.date ? -1 : 1)));
  }

  healthDays(): HealthDay[] {
    return this.cached('health', () =>
      this.list('data/health/')
        .filter((f) => f.path.endsWith('.json'))
        .flatMap((f) => (f.content as HealthMonthFile).days ?? [])
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    );
  }

  injuries(): Injury[] {
    return this.read<InjuriesFile>(paths.injuries)?.injuries ?? [];
  }

  illnesses(): Illness[] {
    return this.read<InjuriesFile>(paths.injuries)?.illnesses ?? [];
  }

  /** Ziek? Rust, lichter of net genezen. */
  illness(): IllnessState {
    return this.cached('illness', () => illnessState(this.illnesses(), this.today(), this.sessions()));
  }

  adjustments(): CoachAdjustments | undefined {
    const raw = this.read<unknown>(paths.adjustments);
    return raw ? sanitizeAdjustments(raw).adjustments : undefined;
  }

  checkFor(date: ISODate): ReadinessCheck | undefined {
    return this.checks().filter((c) => c.date === date).at(-1);
  }

  /** Wat je voor die dag aanvinkte (of niets). */
  explicitDay(date: ISODate): DayAvailability | undefined {
    return this.read<AvailabilityMonth>(paths.availability(date.slice(0, 7)))?.days?.[date];
  }

  /**
   * Beschikbaarheid voor een dag: aangevinkt, anders je vaste patroon (dezelfde weekdag in de vorige
   * weken, zonder tennis), anders de standaard (weekdagen 's avonds, weekend overdag).
   */
  dayAvailability(date: ISODate): { day: DayAvailability; source: AvailabilitySource } {
    const own = this.explicitDay(date);
    if (own) return { day: own, source: 'saved' };
    const prefs = this.prefs();
    for (let back = 1; back <= 8; back++) {
      const prev = this.explicitDay(addDays(date, -7 * back));
      if (prev) return { day: { date, slots: [...prev.slots], home: prev.home, minutes: prev.minutes }, source: 'pattern' };
    }
    return { day: defaultDay(date, prefs.minutes), source: 'default' };
  }

  /** Dagen die eerder gepland stonden (voor "gepland vs gedaan" en stabiliteit). */
  snapshot(): ISODate[] {
    return this.cached('snapshot', () =>
      this.list('data/availability/')
        .flatMap((f) => (f.content as AvailabilityMonth).planned ?? [])
        .sort(),
    );
  }

  prefs(): Prefs {
    return normalizePrefs((this.profile() ?? defaultProfile()).prefs);
  }

  postponedDays(): ISODate[] {
    return this.cached('postponed', () => this.logs().flatMap((l) => l.postponed ?? []));
  }

  /** Wat gaat goed, wat minder? (ook gebruikt door de planner) */
  insights(): Insights {
    return this.cached('insights', () => {
      const prefs = this.prefs();
      const adj = activeAdjustments(this.adjustments(), this.today());
      const target = coachTarget({ prefs, history: this.sessions(), today: this.today(), adjustments: adj }).target;
      const strength = adj?.strengthSessions ?? Math.ceil(target / 2);
      return buildInsights({
        today: this.today(),
        history: this.sessions(),
        planned: this.snapshot(),
        checks: this.checks().map((c) => ({ date: c.date, level: c.level })),
        strengthTarget: strength,
        cardioTarget: Math.max(0, target - strength),
      });
    });
  }

  /** Krachtchecks, nieuwste eerst. */
  checksStrength(): StrengthCheck[] {
    return this.cached('strengthChecks', () => strengthChecks(this.sessions()));
  }

  /** Mijlpalen, nieuwste eerst (met je krachtchecks erbij). */
  // ── Doelen ───────────────────────────────────────────────────────────
  weekGoal(): WeekGoal {
    return this.prefs().weekGoal ?? DEFAULT_WEEK_GOAL;
  }

  goals(): Goal[] {
    return this.profile()?.goals ?? [];
  }

  /** Lopende doelen (nog niet gehaald) en gehaalde, met datum. */
  goalStatus(): { goal: Goal; reachedOn?: ISODate; progress: number }[] {
    return this.cached('goalStatus', () =>
      this.goals().map((goal) => ({ goal, reachedOn: goalReachedOn(goal, this.sessions()), progress: goalProgress(goal, this.sessions()) })),
    );
  }

  goalSuggestions(): Omit<Goal, 'id'>[] {
    const active = this.goalStatus().filter((g) => !g.reachedOn).map((g) => g.goal);
    return active.length >= 3 ? [] : suggestGoals(this.sessions(), active, this.today()).slice(0, 3 - active.length);
  }

  async addGoal(g: Omit<Goal, 'id'>): Promise<void> {
    const p = this.profile();
    if (!p) return;
    await this.saveProfile({ ...p, goals: [...(p.goals ?? []), { ...g, id: newId() }] });
  }

  async removeGoal(id: string): Promise<void> {
    const p = this.profile();
    if (!p) return;
    await this.saveProfile({ ...p, goals: (p.goals ?? []).filter((g) => g.id !== id) });
  }

  async setWeekGoal(goal: WeekGoal): Promise<void> {
    const p = this.profile();
    if (!p) return;
    await this.saveProfile({ ...p, prefs: { ...p.prefs, weekGoal: goal } });
  }

  milestones(): Milestone[] {
    return this.cached('milestones', () => {
      const reached: Milestone[] = this.goalStatus()
        .filter((g) => g.reachedOn)
        .map(({ goal, reachedOn }) => ({
          id: `doel-${goal.id}`,
          icon: '🎯',
          title: `Doel gehaald: ${getExercise(goal.exerciseId).name}${goal.load ? ` ${formatLoad(getExercise(goal.exerciseId), goal.load)}` : ''} × ${goal.reps}`,
          text: 'Zelf gekozen, zelf gehaald. Kies je volgende doel in Rapport.',
          date: reachedOn!,
        }));
      const extra: Milestone[] = [...reached, ...this.checksStrength()
        .filter((c) => c.change !== undefined && c.change > 0)
        .map((c) => ({
          id: `krachtcheck-${c.week}`,
          icon: '💪',
          title: `Krachtcheck: +${Math.round(c.change! * 100)}%`,
          text: 'Sterker dan bij je vorige krachtcheck. Dit is waarom je traint.',
          date: c.date,
        }))];
      return milestones(this.sessions(), extra);
    });
  }

  /** Nieuwe mijlpalen (laatste 14 dagen) die je nog niet zag. */
  newMilestones(): Milestone[] {
    const seen = new Set(this.local.seenMilestones ?? []);
    const from = addDays(this.today(), -14);
    return this.milestones().filter((m) => !seen.has(m.id) && m.date >= from);
  }

  async markMilestonesSeen(ids: string[]): Promise<void> {
    await this.setLocal({ seenMilestones: [...new Set([...(this.local.seenMilestones ?? []), ...ids])] });
  }

  /** Nog nieuw voor je spieren: de eerste 6 krachttrainingen. */
  novice(): boolean {
    return this.sessions().filter((s) => s.kind === 'strength').length < 6;
  }

  /** Herstel per spiergroep nu (voor Vandaag). */
  recovery(date: ISODate = this.today()): Record<Group, GroupRecovery> {
    return this.cached(`recovery:${date}`, () => {
      const novice = this.novice();
      const events = this.sessions()
        .filter((s) => SWEAT_KINDS.has(s.kind) && s.date >= addDays(date, -4) && s.date < date)
        .map((s) => eventFromSession(s, novice));
      const c = this.checkFor(date);
      return recoveryAt({ date, slot: isWeekend(date) ? 'day' : 'evening' }, events, c?.sore ?? [], c?.soreLight ?? []);
    });
  }

  /** Rollend plan: de komende 7 dagen vanaf `start` (standaard vandaag). */
  plan(start?: ISODate): WeekPlan {
    const today = this.today();
    const from = start && start > today ? start : today;
    return this.cached(`plan:${from}`, () => planWeek(this.planInput(from)));
  }

  /** 14 dagen vooruit: de komende 7 dagen + dag 8–14 (voorlopig). */
  planAhead(): TwoWeekPlan {
    return this.cached('ahead', () => planTwoWeeks(this.planInput(this.today())));
  }

  /** Groepslessen in de komende 14 dagen (om op tijd te reserveren). */
  upcomingClasses(): PlannedDay[] {
    const { first, second } = this.planAhead();
    return [...first.days, ...second.days].filter((d) => d.groupClass && d.status === 'planned');
  }

  private planInput(from: ISODate): PlanInput {
    const today = this.today();
    return {
      today,
      start: from,
      availability: (d) => this.dayAvailability(d).day,
      explicit: (d) => !!this.explicitDay(d),
      history: this.sessions(),
      prefs: this.prefs(),
      adjustments: this.adjustments(),
      readinessToday: this.checkFor(today)?.level,
      readinessLog: this.checks().map((c) => ({ date: c.date, level: c.level })),
      postponed: this.postponedDays(),
      originalPlan: this.snapshot(),
      weather: (d) => this.weatherFor(d),
      avoidWeekdays: this.insights().avoidWeekdays,
      weakGroup: this.insights().weakGroup,
      soreToday: this.checkFor(today)?.sore,
      soreLightToday: this.checkFor(today)?.soreLight,
      novice: this.novice(),
      illness: this.illness(),
      choresDone: this.logs().flatMap((l) => (l.light ?? []).filter((x) => x.id === 'klusjes').map((x) => x.date)),
    };
  }

  /** Gepland aantal sessies in een kalenderweek (voor het weekrapport). */
  plannedCount(monday: ISODate): number {
    if (!this.profile()?.setupDone) return 0;
    const sunday = addDays(monday, 6);
    const snap = this.snapshot().filter((d) => d >= monday && d <= sunday).length;
    return snap || this.prefs().targetPerWeek;
  }

  todayPlan(): PlannedDay {
    return this.plan().days[0]!;
  }

  sessionFor(day: PlannedDay): StrengthSession | CardioSession | undefined {
    const profile = this.profile() ?? defaultProfile();
    if (!day.sweat || day.status !== 'planned' || day.type === 'tennis' || !day.location || !day.minutes) return undefined;
    const readiness = this.checkFor(day.date)?.level;
    if (day.type === 'strength' && day.template) {
      return buildStrengthSession({
        date: day.date,
        template: day.template,
        location: day.location,
        minutes: day.minutes,
        history: this.sessions(),
        equipment: profile.equipment,
        gym: profile.gym,
        readiness: day.date === this.today() ? readiness : undefined,
        gentle: !!day.gentle,
        comeback: !!day.comeback,
        tennisExtra: !!day.tennisExtra,
        check: !!day.check,
        deload: day.deload,
        injuries: this.injuries(),
        adjustments: activeAdjustments(this.adjustments(), day.date),
        beginner: this.prefs().experience === 'beginner',
        focus: day.focus,
      });
    }
    if (day.type !== 'cardio') return undefined;
    return buildCardioSession({
      date: day.date,
      location: day.location,
      minutes: day.minutes,
      readiness: day.date === this.today() ? readiness : undefined,
        gentle: !!day.gentle,
      equipment: profile.equipment,
      gym: profile.gym,
      groupClass: day.groupClass ? this.prefs().className : undefined,
      ...(day.time ? { time: day.time } : {}),
    });
  }

  // ── Acties ───────────────────────────────────────────────────────────
  async saveProfile(p: Profile): Promise<void> {
    await this.write(paths.profile, p);
  }

  /**
   * Beschikbaarheid bewaren (aangevinkte dagen) en de momentopname van het plan bijwerken:
   * geplande dagen vanaf vandaag worden vervangen, het verleden blijft (voor "gemist").
   */
  async saveAvailability(days: DayAvailability[]): Promise<void> {
    const today = this.today();
    const ahead = () => [...this.planAhead().first.days, ...this.planAhead().second.days];
    const shownBefore = ahead().filter((d) => d.sweat).map((d) => d.date);
    const months = new Map<string, AvailabilityMonth>();
    const monthFile = (m: string) => {
      if (!months.has(m)) {
        const cur = this.read<AvailabilityMonth>(paths.availability(m));
        months.set(m, cur ? structuredClone(cur) : { month: m, days: {}, planned: [], savedAt: '' });
      }
      return months.get(m)!;
    };
    for (const d of days) monthFile(d.date.slice(0, 7)).days[d.date] = d;
    // Wat al op het scherm stond telt als "gepland" (kleine wijzigingen gooien het plan niet om).
    for (const d of shownBefore) {
      const f = monthFile(d.slice(0, 7));
      if (!f.planned.includes(d)) f.planned.push(d);
    }
    for (const [m, f] of months) this.files.set(paths.availability(m), { ...(this.files.get(paths.availability(m)) ?? { path: paths.availability(m), dirty: true, updatedAt: 0 }), content: f });
    this.memo.clear();
    const all = ahead();
    const planned = new Set(all.filter((d) => d.sweat && (d.status === 'planned' || d.status === 'done')).map((d) => d.date));
    const range = new Set(all.map((d) => d.date));
    for (const d of all) monthFile(d.date.slice(0, 7));
    for (const [m, f] of months) {
      f.planned = [...new Set([...f.planned.filter((d) => d < today || !range.has(d)), ...[...planned].filter((d) => d.startsWith(m))])].sort();
      f.savedAt = this.now().toISOString();
      await this.write(paths.availability(m), f);
    }
  }

  /** Flexibel: vandaag toch thuis, minder tijd, of tennis die niet doorgaat. */
  async updateDay(date: ISODate, patch: Partial<Omit<DayAvailability, 'date'>>): Promise<void> {
    await this.saveAvailability([{ ...this.dayAvailability(date).day, ...patch, date }]);
  }

  private async updateLog(date: ISODate, fn: (l: LogFile) => LogFile): Promise<void> {
    const week = isoWeek(date);
    await this.write(paths.log(week), fn(structuredClone(this.log(week))));
  }

  async recordCheck(energy: Energy): Promise<ReadinessCheck> {
    const date = this.today();
    // Puur op jouw tik (Apple Health staat voorlopig uit).
    const r = assessReadiness({ history: [], energy });
    const prev = this.checkFor(date);
    const check: ReadinessCheck = { date, energy, level: r.level, score: r.score, reasons: r.reasons, at: this.now().toISOString() };
    if (prev?.sore) check.sore = prev.sore;
    if (prev?.soreLight) check.soreLight = prev.soreLight;
    await this.updateLog(date, (l) => ({ ...l, checks: [...l.checks.filter((c) => c.date !== date), check] }));
    return check;
  }

  /** Spierpijn vandaag (optioneel), in gradaties: `groups` = echt, `light` = een beetje. Leeg = geen. */
  async recordSore(groups: Group[], light: Group[] = []): Promise<void> {
    const date = this.today();
    const cur = this.checkFor(date);
    if (!cur) return;
    await this.updateLog(date, (l) => ({ ...l, checks: l.checks.map((c) => (c.date === date ? { ...c, sore: groups, soreLight: light } : c)) }));
  }

  /** Klusjes die dag al afgevinkt? */
  choresDoneOn(date: ISODate): boolean {
    return this.logs().some((l) => (l.light ?? []).some((x) => x.date === date && x.id === 'klusjes'));
  }

  /** Kan je op die dag (groen in de Agenda)? */
  canTrainOn(date: ISODate): boolean {
    const { day } = this.dayAvailability(date);
    return resolveDay(day, this.prefs().trainAtHome).available;
  }

  /** Rustdag (die je wel vrij had), maar je voelt je goed: toch kracht. */
  async trainAnyway(date: ISODate): Promise<void> {
    await this.updateDay(date, { want: 'strength' });
  }

  async postpone(date: ISODate): Promise<void> {
    await this.updateLog(date, (l) => ({ ...l, postponed: [...new Set([...l.postponed, date])] }));
  }

  async undoPostpone(date: ISODate): Promise<void> {
    await this.updateLog(date, (l) => ({ ...l, postponed: l.postponed.filter((d) => d !== date) }));
  }

  async logSession(s: SessionLog): Promise<void> {
    await this.updateLog(s.date, (l) => ({ ...l, sessions: [...l.sessions.filter((x) => x.id !== s.id), s] }));
  }

  async deleteSession(s: SessionLog): Promise<void> {
    await this.updateLog(s.date, (l) => ({ ...l, sessions: l.sessions.filter((x) => x.id !== s.id) }));
  }

  async logLight(date: ISODate, id: LightId): Promise<void> {
    await this.updateLog(date, (l) => ({ ...l, light: [...l.light.filter((x) => x.date !== date || x.id !== id), { date, id }] }));
  }

  async quickLog(date: ISODate, kind: 'cardio' | 'class', location: Location, minutes: number, title: string): Promise<void> {
    await this.logSession({
      id: newId(),
      date,
      kind,
      location,
      source: 'app',
      title,
      durationMin: minutes,
      exercises: [],
    });
  }
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const store = new Store();
