import { diffDays } from './dates.ts';
import type { ISODate, SessionLog } from './types.ts';

// Terug na een pauze (vakantie, drukke weken): na 10+ dagen zonder krachttraining zijn je eerste 2 trainingen
// ±10% lichter. Zo bouw je veilig terug op, net zoals na ziekte.

export const PAUSE_DAYS = 10;
export const COMEBACK_SESSIONS = 2;

/** Hoeveel krachttrainingen nog lichter moeten (0 = geen pauze, of al terug op niveau). */
export function comebackLeft(history: SessionLog[], today: ISODate): number {
  const dates = [...new Set(history.filter((s) => s.kind === 'strength' && s.date <= today).map((s) => s.date))].sort();
  if (dates.length === 0) return 0;
  if (diffDays(today, dates.at(-1)!) >= PAUSE_DAYS) return COMEBACK_SESSIONS;
  for (let i = dates.length - 1; i >= 1; i--) {
    if (diffDays(dates[i]!, dates[i - 1]!) >= PAUSE_DAYS) return Math.max(0, COMEBACK_SESSIONS - (dates.length - i));
  }
  return 0;
}
