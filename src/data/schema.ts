import type {
  CoachAdjustments,
  DayAvailability,
  Energy,
  GymConfig,
  HealthDay,
  HomeEquipment,
  Injury,
  ISODate,
  Prefs,
  ReadinessLevel,
  SessionLog,
} from '../coach/types.ts';
import type { LightId } from '../coach/light.ts';
import type { Group } from '../coach/recovery.ts';
import type { Illness } from '../coach/illness.ts';
import type { WatchWorkout } from '../coach/health.ts';

export type { WatchWorkout };

// Bestanden in je privé-repo. Elke schrijver (app, Opdracht, /coach) heeft eigen bestanden.

export interface Profile {
  version: 1;
  setupDone: boolean;
  equipment: HomeEquipment;
  gym: GymConfig;
  prefs: Prefs;
  /** Uur voor de ochtendmelding (lokale tijd). */
  notifyHour: number;
  createdAt: string;
}

/** Aangevinkte beschikbaarheid per dag, één bestand per maand. */
export interface AvailabilityMonth {
  month: string;
  days: Record<ISODate, DayAvailability>;
  /** Momentopname: dagen die gepland stonden (voor "gepland vs gedaan"). */
  planned: ISODate[];
  savedAt: string;
}

export interface ReadinessCheck {
  date: ISODate;
  energy: Energy;
  level: ReadinessLevel;
  score: number;
  reasons: string[];
  at: string;
  /** Spierpijn die je aangaf (optioneel, één tik): echt. */
  sore?: Group[];
  /** Een beetje stijf. */
  soreLight?: Group[];
}

export interface LogFile {
  week: string;
  sessions: SessionLog[];
  checks: ReadinessCheck[];
  /** Dagen die je zelf verplaatste ("vandaag niet"). */
  postponed: ISODate[];
  /** Gedane zweetvrije activiteiten. */
  light: { date: ISODate; id: LightId }[];
}

export interface InjuriesFile {
  injuries: Injury[];
  /** Ziek zijn (verkouden, griep, koorts, maag-darm). */
  illnesses?: Illness[];
}

export interface HealthMonthFile {
  month: string;
  days: HealthDay[];
  workouts: WatchWorkout[];
}

export type AdjustmentsFile = CoachAdjustments;

export const paths = {
  profile: 'data/profile.json',
  /** Per maand: '2026-11' (een volledige datum mag ook). */
  availability: (month: string) => `data/availability/${month.slice(0, 7)}.json`,
  log: (week: string) => `data/log/${week}.json`,
  injuries: 'data/injuries.json',
  adjustments: 'data/coach/adjustments.json',
  health: (month: string) => `data/health/${month}.json`,
  healthInbox: 'data/health/inbox/',
  report: (week: string) => `reports/${week}.md`,
  push: 'data/push/subscription.json',
} as const;

export function emptyLog(week: string): LogFile {
  return { week, sessions: [], checks: [], postponed: [], light: [] };
}
