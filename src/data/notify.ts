import { templateTitle } from '../coach/session.ts';
import { addDays, DAY_SHORT, dayIndex, dayName } from '../coach/dates.ts';
import { hourText } from '../coach/planner.ts';
import { ZONE_LABEL } from '../coach/injury.ts';
import type { Store } from './store.ts';

// Tekst van de pushmeldingen. Kort: wat je vandaag doet, of wat je nog moet ingeven.

export interface PushMessage {
  title: string;
  body: string;
  /** Pad binnen de app (hash-route). */
  url: string;
  tag: string;
}

/** Hoeveel van de 7 dagen na vandaag heb je nog niet aangevinkt? */
function unticked(store: Store): number {
  const today = store.today();
  return Array.from({ length: 7 }, (_, i) => addDays(today, i + 1)).filter((d) => !store.explicitDay(d)).length;
}

const MOMENT = { day: 'overdag', evening: "'s avonds" } as const;

export function morningMessage(store: Store): PushMessage | null {
  const today = store.today();
  const plan = store.plan();
  const day = plan.days[0];
  const ask = unticked(store) >= 5 ? ' Vink ook je komende dagen aan.' : '';
  if (!day || day.status === 'done') return null;
  const injury = store.injuries().find((i) => !i.resolvedOn);
  const ill = store.illness();
  const injuryAsk =
    ill.status === 'rest'
      ? ' Beterschap! Voel je je beter? Tik het aan in de app.'
      : injury
        ? ` Hoe is je ${ZONE_LABEL[injury.zone].toLowerCase()}?`
        : '';

  if (day.type === 'tennis') {
    return { title: `Vandaag: ${day.title.toLowerCase()} 🎾`, body: `Telt als conditiesessie. Tik na het spelen op Gedaan.${injuryAsk}${ask}`, url: '#/vandaag', tag: 'vandaag' };
  }
  if (day.sweat && day.status === 'planned') {
    const where = day.location === 'home' ? 'thuis' : 'Jims';
    const when = day.slot ? ` ${MOMENT[day.slot]}` : '';
    if (day.type === 'strength') {
      const session = store.sessionFor(day);
      const names = session && 'exercises' in session ? session.exercises.slice(0, 3).map((e) => e.exercise.name) : [];
      return {
        title: `Vandaag: ${templateTitle(day.template)} · ${where}${when}`,
        body: `${day.minutes} min${day.deload ? ' · deloadweek' : ''}${names.length ? ` · ${names.join(', ')}…` : ''}. Tik voor je dagvorm-check.${injuryAsk}${ask}`,
        url: '#/vandaag',
        tag: 'vandaag',
      };
    }
    return {
      title: day.groupClass ? `Vandaag: ${store.prefs().className.toLowerCase()}${when} 🚴` : `Vandaag: conditie · ${where}${when}`,
      body: `${day.groupClass ? 'Groepsles in Jims. Reserveer je fiets als dat nodig is.' : `${day.minutes} min · ${day.location === 'home' ? 'kettlebell-circuit' : 'fiets of roeier'}.`} Tik voor je dagvorm-check.${injuryAsk}${ask}`,
      url: '#/vandaag',
      tag: 'vandaag',
    };
  }

  const next = plan.days.find((d) => d.date > today && d.status === 'planned');
  const light = day.light;
  if (ill.status === 'rest') {
    return { title: 'Ziek: vandaag rust 🤒', body: `Veel drinken en slapen, geen training.${injuryAsk}`, url: '#/vandaag', tag: 'vandaag' };
  }
  if (light?.id === 'klusjes') {
    return { title: 'Vandaag vrij voor klusjes 🧹', body: `Geen training.${next ? ` Volgende: ${dayName(next.date)}.` : ''}${injuryAsk}${ask}`, url: '#/vandaag', tag: 'vandaag' };
  }
  return {
    title: 'Zweetvrije dag',
    body: `${light ? `Optioneel: ${light.title.toLowerCase()} (${light.minutes} min).` : 'Rust.'}${next ? ` Volgende training: ${dayName(next.date)}.` : ''}${injuryAsk}${ask}`,
    url: '#/vandaag',
    tag: 'vandaag',
  };
}

/** Zondagavond: herinnering als je de komende dagen nog niet aanvinkte. */
export function sundayMessage(store: Store): PushMessage | null {
  const toBook = store.upcomingClasses().filter((d) => !d.booked);
  const cls = store.prefs().className.toLowerCase();
  const when = toBook
    .slice(0, 3)
    .map((d) => `${DAY_SHORT[dayIndex(d.date)]} ${Number(d.date.slice(8))}/${Number(d.date.slice(5, 7))}${d.time ? ` ${hourText(d.time)}` : ''}`)
    .join(', ');
  if (unticked(store) >= 3) {
    return {
      title: 'Vink je komende dagen aan',
      body: `Welke avonden (en weekenddagen) passen de komende week? Tik en vink aan: 20 seconden.${toBook.length ? ` Daarna: reserveer je ${cls}.` : ''}`,
      url: '#/agenda',
      tag: 'plan',
    };
  }
  if (toBook.length === 0) return null;
  return {
    title: `Reserveer je ${cls} 🎟️`,
    body: `Lessen zitten snel vol: ${when}. Reserveer in de Jims-app en tik in de Agenda aan wat lukte.`,
    url: '#/agenda',
    tag: 'plan',
  };
}

export function testMessage(): PushMessage {
  return { title: 'Coach: testmelding', body: 'Het werkt! Zo krijg je elke ochtend je plan van de dag.', url: '#/vandaag', tag: 'test' };
}
