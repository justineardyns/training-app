// Gedeelde types voor de coachlogica. Alles is puur (geen I/O), zodat app,
// meldingen-workflow en /coach exact dezelfde beslissingen nemen.

/** 'YYYY-MM-DD' (lokale kalenderdag, Europe/Brussels). */
export type ISODate = string;

export type Location = 'gym' | 'home';
export type Minutes = 30 | 45 | 60;
/** Full body A/B, bovenlichaam (U) of benen & romp (L). */
export type Template = 'A' | 'B' | 'U' | 'L';

/** Gevoel na een oefening: te licht / goed / zwaar. */
export type Feel = 'light' | 'good' | 'hard';
/** Hoe je je voelt (één tik): ziek of op / moe / oké / top. */
export type Energy = 'sick' | 'low' | 'ok' | 'high';
export type ReadinessLevel = 'green' | 'orange' | 'red';

export type Zone =
  | 'nek'
  | 'schouder'
  | 'elleboog'
  | 'pols'
  | 'bovenrug'
  | 'onderrug'
  | 'heup'
  | 'knie'
  | 'enkel';

/** 1 = licht, 2 = matig, 3 = hevig. */
export type Severity = 1 | 2 | 3;

export type Pattern =
  | 'squat'
  | 'lunge'
  | 'hinge'
  | 'push_h'
  | 'push_v'
  | 'pull_h'
  | 'pull_v'
  | 'core'
  | 'arms'
  | 'legs_iso'
  | 'conditioning';

export type Muscle =
  | 'borst'
  | 'rug'
  | 'schouders'
  | 'biceps'
  | 'triceps'
  | 'quadriceps'
  | 'hamstrings'
  | 'bilspieren'
  | 'kuiten'
  | 'core';

/**
 * Hoe het gewicht geladen wordt.
 * - db_pair: twee dumbbells, gewicht = per hand
 * - db_single: één dumbbell
 * - home_bar: thuisstang (2 dumbbells gekoppeld), totaal gewicht
 * - kb: kettlebell
 * - barbell: stang in de gym (totaal gewicht)
 * - machine / cable: toestel of kabel (gewicht op de stapel)
 * - bodyweight: enkel lichaamsgewicht
 */
export type LoadKind = 'db_pair' | 'db_single' | 'home_bar' | 'kb' | 'barbell' | 'machine' | 'cable' | 'bodyweight';

export interface Exercise {
  id: string;
  name: string;
  pattern: Pattern;
  /** Eerste = hoofdspier. */
  muscles: Muscle[];
  locations: Location[];
  load: LoadKind;
  /** Per kant uitgevoerd (reps gelden per kant). */
  unilateral?: boolean;
  /** Reps-bereik voor dubbele progressie (of seconden als timed). */
  repRange: [number, number];
  timed?: boolean;
  /** Belasting per zone: 1 = licht, 2 = matig, 3 = sterk. */
  stress: Partial<Record<Zone, 1 | 2 | 3>>;
  tips: string[];
  /** Zoekterm voor de uitlegvideo. */
  video: string;
  /** Zo herken je het toestel en stel je het in (voor beginners). */
  setup?: string;
  /** Voorzichtig startgewicht (kg) als er nog geen historiek is. */
  start: number;
  /** Zwaardere variant voor thuis als het gewicht op is (progressieladder). */
  harder?: string;
  /** Maximaal gewicht (kg) voor toestellen met een grotere range. */
  maxLoad?: number;
  /** Extra voor tennis (schouders, rotatie): nooit als vervanger voor een gewone oefening. */
  prehab?: boolean;
}

export interface Plate {
  kg: number;
  /** Totaal aantal schijven van dit gewicht in huis. */
  count: number;
}

export interface HomeEquipment {
  /** Gewicht van één lege dumbbellhandgreep, incl. sluitingen. */
  dumbbellHandleKg: number;
  plates: Plate[];
  /** Verbindingsstuk om van 2 dumbbells een stang te maken (0 = geen). */
  connectorKg: number;
  kettlebellsKg: number[];
}

export interface GymConfig {
  /** Beschikbare dumbbells in de gym (kg per stuk). */
  dumbbells: number[];
  kettlebells: number[];
  barbellKg: number;
  /** Kleinste stap op de stang (2 × kleinste schijf). */
  barbellStep: number;
  machineStep: number;
  cableStep: number;
}

/** Moment van de dag: overdag (enkel in het weekend) of 's avonds. */
export type Slot = 'day' | 'evening';

/** Vast lesmoment (bv. indoor cycling op maandagavond). day: 0 = maandag … 6 = zondag. */
export interface ClassSlot {
  day: number;
  slot: Slot;
  /** Uur van de les, bv. '10:00' (optioneel). */
  time?: string;
}

export type Experience = 'beginner' | 'returning';

export interface Prefs {
  /** Maximum trainingen per 7 dagen (rollend, kracht + conditie). Absoluut max 6. De coach bouwt op en kiest de mix. */
  targetPerWeek: number;
  /** Oud veld (vroeger vaste verdeling). De coach kiest nu zelf de mix; enkel nog als terugval. */
  strengthPerWeek: number;
  /** Elke hoeveelste trainingsweek een deload (standaard 6). */
  deloadEvery: number;
  /** Absolute beginner: lichtere start, eerst kennismaken, toestellen eerst. */
  experience: Experience;
  /** Groepslessen die je graag doet en wanneer ze doorgaan. */
  className: string;
  classSlots: ClassSlot[];
  /** Dagen waarop je soms tennist (0 = maandag). */
  tennisDays: number[];
  /** Standaardduur van een training. */
  minutes: Minutes;
  /** Ook thuis trainen? Standaard uit: alles in Jims. */
  trainAtHome: boolean;
  /** Versie van de regels waarmee deze voorkeuren bewaard zijn (2 = kracht en conditie apart). */
  rulesVersion?: number;
  /** Je weekdoel: zoveel keer per week minstens zoveel minuten in Jims. */
  weekGoal?: { sessions: number; minutes: number };
}

export type ProgressionChange =
  | 'new'
  | 'same'
  | 'reps_up'
  | 'load_up'
  | 'load_down'
  | 'tempo'
  | 'pause'
  | 'rest_down'
  | 'variant_up'
  | 'deload'
  | 'lighter'
  | 'injury';

export interface Prescription {
  exerciseId: string;
  sets: number;
  repRange: [number, number];
  /** Streefreps per set (seconden bij timed). */
  targetReps: number;
  /** Gewicht in kg (per hand bij db_pair; 0 bij lichaamsgewicht). */
  load: number;
  restSec: number;
  /** Tempo, bv. '3-1-1' (3 s zakken). Leeg = normaal. */
  tempo?: string;
  /** Pauze onderaan in seconden. */
  pauseSec?: number;
  /** Stap op de thuisladder: 0 = gewoon, 1 = extra reps, 2 = tempo, 3 = pauze, 4 = kortere rust. */
  stage: number;
  change: ProgressionChange;
  /** Korte uitleg voor jou (waarom dit doel). */
  note: string;
  /** Krachtcheck: laatste set zoveel mogelijk goede reps. */
  test?: boolean;
}

export interface SetLog {
  load: number;
  reps: number;
  done: boolean;
}

export interface ExerciseLog {
  exerciseId: string;
  prescription: Prescription;
  sets: SetLog[];
  feel?: Feel;
  /** Als je wisselde via "Toestel bezet". */
  swappedFrom?: string;
}

export type ActivityKind = 'strength' | 'cardio' | 'class' | 'light';

export interface SessionLog {
  id: string;
  date: ISODate;
  kind: ActivityKind;
  template?: Template;
  location?: Location;
  startedAt?: string;
  endedAt?: string;
  deload?: boolean;
  readiness?: ReadinessLevel;
  exercises: ExerciseLog[];
  source: 'app' | 'watch';
  title?: string;
  durationMin?: number;
  avgHr?: number;
  maxHr?: number;
  /** Ruwe Watch-workouttype (bv. "Indoor Cycling"). */
  workoutType?: string;
  /** Gekoppelde Watch-workout (voorkomt dubbel tellen). */
  workoutId?: string;
}

export interface DayAvailability {
  date: ISODate;
  /** Aangevinkte momenten; leeg = kan niet. */
  slots: Slot[];
  /** Thuis i.p.v. Jims, ook als Jims open is. */
  home?: boolean;
  minutes: Minutes;
  /** Tennis die dag (minuten, bv. 60 of 120). Telt als zweetsessie. */
  tennis?: number;
  /** Jouw keuze als de coach die dag een training plant: liever kracht of liever conditie (groepsles). */
  want?: 'strength' | 'cardio';
  /** Je reserveerde de groepsles van die dag in de Jims-app: die blijft vast staan. */
  booked?: boolean;
}

export interface HealthDay {
  date: ISODate;
  sleepHours?: number;
  hrvMs?: number;
  restingHr?: number;
  steps?: number;
}

export interface InjuryUpdate {
  date: ISODate;
  trend: 'beter' | 'zelfde' | 'erger' | 'weg';
  severity?: Severity;
}

export interface Injury {
  id: string;
  zone: Zone;
  severity: Severity;
  startedOn: ISODate;
  sharp?: boolean;
  updates: InjuryUpdate[];
  resolvedOn?: ISODate;
}

/** Bijsturing door de wekelijkse coachsessie (/coach). Wordt altijd gevalideerd. */
export interface CoachAdjustments {
  version: 1;
  updatedAt?: ISODate;
  /** Vanaf welke maandag dit geldt. */
  validFrom?: ISODate;
  targetSessions?: number;
  /** Krachttrainingen per 7 dagen (1–4); zonder dit kiest de coach de mix. */
  strengthSessions?: number;
  forceDeload?: boolean;
  swaps?: { from: string; to: string; reason?: string }[];
  repRangeOverrides?: Record<string, [number, number]>;
  focus?: string;
  message?: string;
}
