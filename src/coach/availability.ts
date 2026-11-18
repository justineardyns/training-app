import { dayIndex } from './dates.ts';
import type { ClassSlot, DayAvailability, ISODate, Location, Minutes, Prefs, Slot } from './types.ts';

// Wanneer kan je trainen? Per dag vink je aan: weekdagen 's avonds, in het weekend overdag
// (Jims is dan open tot 17u). Thuistrainingen staan standaard uit; enkel met trainAtHome kan een
// weekendavond (thuis) of "thuis" op een andere dag.

export const SLOT_LABEL: Record<Slot, string> = { day: 'Overdag', evening: 'Avond' };

export const isWeekend = (date: ISODate) => dayIndex(date) >= 5;

/** Welke momenten kan je aanvinken? Weekdag: avond. Weekend: overdag (en avond enkel als je thuis traint). */
export function slotOptions(date: ISODate, allowHome = false): Slot[] {
  if (!isWeekend(date)) return ['evening'];
  return allowHome ? ['day', 'evening'] : ['day'];
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

/** Waar en wanneer een training op deze dag: in Jims als die open is (thuis enkel met allowHome). */
export function resolveDay(av: DayAvailability, allowHome = false): ResolvedDay {
  const slots = av.slots.filter((s) => slotOptions(av.date, allowHome).includes(s));
  if (slots.length === 0 || (av.tennis ?? 0) > 0) return { available: false, location: 'gym' };
  const gymSlot = slots.find((s) => gymOpen(av.date, s));
  if (allowHome && (av.home || !gymSlot)) return { available: true, location: 'home', slot: slots.includes('evening') ? 'evening' : slots[0] };
  if (!gymSlot) return { available: false, location: 'gym' };
  return { available: true, location: 'gym', slot: gymSlot };
}

/** Kan je die dag je groepsles (bv. indoor cycling) volgen? Geeft het moment terug. */
export function classSlotOn(av: DayAvailability, classSlots: ClassSlot[], allowHome = false): Slot | undefined {
  if ((allowHome && av.home) || (av.tennis ?? 0) > 0) return undefined;
  const d = dayIndex(av.date);
  return classSlots.find((c) => c.day === d && av.slots.includes(c.slot) && gymOpen(av.date, c.slot))?.slot;
}

export const DEFAULT_CLASS_SLOTS: ClassSlot[] = [
  { day: 0, slot: 'evening' },
  { day: 2, slot: 'evening' },
  { day: 3, slot: 'evening' },
  { day: 5, slot: 'day', time: '10:00' },
  { day: 6, slot: 'day', time: '10:00' },
];

/** Het lesmoment (met uur) op die dag, als er een is. */
export function classSlotFor(av: DayAvailability, classSlots: ClassSlot[], allowHome = false): ClassSlot | undefined {
  const slot = classSlotOn(av, classSlots, allowHome);
  return slot ? classSlots.find((c) => c.day === dayIndex(av.date) && c.slot === slot) : undefined;
}

export type { Prefs };
