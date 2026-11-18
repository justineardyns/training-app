import { dayIndex } from './dates.ts';
import type { ClassSlot, DayAvailability, ISODate, Location, Minutes, Prefs, Slot } from './types.ts';

// Wanneer kan je trainen? Per dag vink je momenten aan: weekdagen 's avonds, in het weekend
// overdag en/of 's avonds. Jims is in het weekend maar open tot 17u: een weekendavond is dus thuis.

export const SLOT_LABEL: Record<Slot, string> = { day: 'Overdag', evening: 'Avond' };

export const isWeekend = (date: ISODate) => dayIndex(date) >= 5;

/** Welke momenten kan je aanvinken? Overdag enkel in het weekend. */
export function slotOptions(date: ISODate): Slot[] {
  return isWeekend(date) ? ['day', 'evening'] : ['evening'];
}

/** Is Jims open? Weekdagen 's avonds wel, weekend overdag wel (tot 17u), weekendavond niet. */
export function gymOpen(date: ISODate, slot: Slot): boolean {
  return isWeekend(date) ? slot === 'day' : slot === 'evening';
}

export function defaultDay(date: ISODate, minutes: Minutes): DayAvailability {
  return { date, slots: [isWeekend(date) ? 'day' : 'evening'], minutes };
}

export interface ResolvedDay {
  available: boolean;
  location: Location;
  slot?: Slot;
}

/** Waar en wanneer een training op deze dag: Jims als het kan, anders thuis. */
export function resolveDay(av: DayAvailability): ResolvedDay {
  const slots = av.slots.filter((s) => slotOptions(av.date).includes(s));
  if (slots.length === 0 || (av.tennis ?? 0) > 0) return { available: false, location: 'gym' };
  const gymSlot = slots.find((s) => gymOpen(av.date, s));
  if (av.home || !gymSlot) return { available: true, location: 'home', slot: slots.includes('evening') ? 'evening' : slots[0] };
  return { available: true, location: 'gym', slot: gymSlot };
}

/** Kan je die dag je groepsles (bv. indoor cycling) volgen? Geeft het moment terug. */
export function classSlotOn(av: DayAvailability, classSlots: ClassSlot[]): Slot | undefined {
  if (av.home || (av.tennis ?? 0) > 0) return undefined;
  const d = dayIndex(av.date);
  return classSlots.find((c) => c.day === d && av.slots.includes(c.slot) && gymOpen(av.date, c.slot))?.slot;
}

export const DEFAULT_CLASS_SLOTS: ClassSlot[] = [
  { day: 0, slot: 'evening' },
  { day: 2, slot: 'evening' },
  { day: 5, slot: 'day' },
  { day: 6, slot: 'day' },
];

export function momentText(date: ISODate, slot: Slot | undefined): string {
  if (!slot) return '';
  if (slot === 'day') return isWeekend(date) ? 'overdag' : 'overdag';
  return "'s avonds";
}

export type { Prefs };
