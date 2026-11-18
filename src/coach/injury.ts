import { stressOn } from './catalog.ts';
import { diffDays } from './dates.ts';
import type { Exercise, ISODate, Injury, SessionLog, Severity, Zone } from './types.ts';

// "Ik heb last van…": vervangen of verlichten van oefeningen voor die zone,
// daarna geleidelijk opbouwen (60% → 80% → 100%), en doorverwijzen als het nodig is.

export const ZONE_LABEL: Record<Zone, string> = {
  nek: 'Nek',
  schouder: 'Schouder',
  elleboog: 'Elleboog',
  pols: 'Pols',
  bovenrug: 'Bovenrug',
  onderrug: 'Onderrug',
  heup: 'Heup',
  knie: 'Knie',
  enkel: 'Enkel',
};

export const SEVERITY_LABEL: Record<Severity, string> = { 1: 'Licht', 2: 'Matig', 3: 'Hevig' };

/** Na herstel: zoveel sessies met die zone om terug op 100% te komen. */
export const RAMP = [0.6, 0.8] as const;
const PERSISTENT_DAYS = 14;

export function isResolved(inj: Injury): boolean {
  return !!inj.resolvedOn;
}

/** Huidige ernst: laatste update, en een tikje zwaarder als het erger wordt. */
export function currentSeverity(inj: Injury): Severity {
  const last = inj.updates.at(-1);
  let s: number = last?.severity ?? inj.severity;
  if (last?.trend === 'erger') s += 1;
  return Math.min(3, Math.max(1, s)) as Severity;
}

export interface Referral {
  refer: boolean;
  reasons: string[];
  message: string;
}

export function referral(inj: Injury, today: ISODate): Referral {
  const reasons: string[] = [];
  if (inj.sharp) reasons.push('scherpe pijn');
  if (!isResolved(inj) && currentSeverity(inj) === 3) reasons.push('hevige pijn');
  if (inj.updates.some((u) => u.trend === 'erger')) reasons.push('het wordt erger');
  if (!isResolved(inj) && diffDays(today, inj.startedOn) > PERSISTENT_DAYS) reasons.push(`al meer dan ${PERSISTENT_DAYS} dagen`);
  const refer = reasons.length > 0;
  return {
    refer,
    reasons,
    message: refer
      ? `Laat dit nakijken door een arts of kinesist (${reasons.join(', ')}). Tot dan sparen we je ${ZONE_LABEL[inj.zone].toLowerCase()}.`
      : '',
  };
}

export type InjuryAction = 'ok' | 'lighter' | 'replace';

export interface InjuryDecision {
  action: InjuryAction;
  /** Factor op het gewicht (1 = gewoon). */
  factor: number;
  note?: string;
  zones: Zone[];
}

/** Aantal krachtsessies na `since` waarin een oefening de zone belastte. */
export function sessionsLoadingZone(history: SessionLog[], zone: Zone, since: ISODate, getEx: (id: string) => Exercise | undefined): number {
  return history.filter(
    (s) =>
      s.kind === 'strength' &&
      s.date > since &&
      s.exercises.some((e) => e.sets.some((x) => x.done) && (stressOn(getEx(e.exerciseId) ?? ({ stress: {} } as Exercise), zone) > 0)),
  ).length;
}

/**
 * Wat doen we met deze oefening gezien je klachten?
 * - hevig: alles wat de zone belast → vervangen
 * - matig: matig/sterk belastend → vervangen, licht belastend → 70%
 * - licht: sterk belastend → vervangen, matig → 80%
 * - hersteld: opbouw 60% → 80% → 100% over de volgende sessies
 */
export function injuryDecision(
  ex: Exercise,
  injuries: Injury[],
  history: SessionLog[],
  getEx: (id: string) => Exercise | undefined,
): InjuryDecision {
  let action: InjuryAction = 'ok';
  let factor = 1;
  const notes: string[] = [];
  const zones: Zone[] = [];

  for (const inj of injuries) {
    const t = stressOn(ex, inj.zone);
    if (t === 0) continue;
    const label = ZONE_LABEL[inj.zone].toLowerCase();

    if (isResolved(inj)) {
      const n = sessionsLoadingZone(history, inj.zone, inj.resolvedOn!, getEx);
      const f = RAMP[n];
      if (f !== undefined && f < factor) {
        factor = f;
        zones.push(inj.zone);
        notes.push(`Opbouw na je ${label}: ${Math.round(f * 100)}% van je gewicht.`);
        if (action === 'ok') action = 'lighter';
      }
      continue;
    }

    const s = currentSeverity(inj);
    const replace = (s === 3 && t >= 1) || (s === 2 && t >= 2) || (s === 1 && t >= 3);
    zones.push(inj.zone);
    if (replace) {
      action = 'replace';
      notes.push(`Vervangen om je ${label} te sparen.`);
      continue;
    }
    const f = s === 2 ? 0.7 : t >= 2 ? 0.8 : 1;
    if (f < factor) factor = f;
    if (action === 'ok') action = f < 1 ? 'lighter' : 'ok';
    notes.push(
      f < 1
        ? `Lichter (${Math.round(f * 100)}%) voor je ${label}. Stop als de pijn boven 3/10 gaat.`
        : `Let op je ${label}: stop als de pijn boven 3/10 gaat.`,
    );
  }

  return { action, factor, note: notes.join(' ') || undefined, zones };
}

/** Is de oefening veilig genoeg om als vervanger te dienen? */
export function acceptableFor(ex: Exercise, injuries: Injury[]): boolean {
  return injuries
    .filter((i) => !isResolved(i))
    .every((inj) => {
      const t = stressOn(ex, inj.zone);
      const s = currentSeverity(inj);
      return s === 3 ? t === 0 : s === 2 ? t <= 1 : t <= 2;
    });
}

/** Klachten die nog meetellen (actief, of hersteld maar nog in opbouw). */
export function relevantInjuries(injuries: Injury[], history: SessionLog[], getEx: (id: string) => Exercise | undefined): Injury[] {
  return injuries.filter((i) => !isResolved(i) || sessionsLoadingZone(history, i.zone, i.resolvedOn!, getEx) < RAMP.length);
}
