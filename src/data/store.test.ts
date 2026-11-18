import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultDay } from '../coach/availability.ts';
import { addDays } from '../coach/dates.ts';
import type { DayAvailability } from '../coach/types.ts';
import { idb } from './db.ts';
import { paths, type AvailabilityMonth } from './schema.ts';
import { defaultProfile, Store } from './store.ts';

const MON = '2026-11-23';
const D = (i: number) => addDays(MON, i);
const week = (from: string, patch: (d: string, i: number) => Partial<DayAvailability> = () => ({})) =>
  Array.from({ length: 7 }, (_, i) => ({ ...defaultDay(addDays(from, i), 45), ...patch(addDays(from, i), i) }));

async function fresh(now = `${MON}T08:00:00`) {
  await idb.clear('files').catch(() => undefined);
  await idb.clear('local').catch(() => undefined);
  const s = new Store();
  s.now = () => new Date(now);
  s.timeZone = 'Europe/Brussels';
  await s.init();
  await s.saveProfile({ ...defaultProfile(), setupDone: true });
  return s;
}

describe('store: rollend plannen', () => {
  beforeEach(() => idb.reset());

  it('bewaart aangevinkte dagen per maand met een momentopname van het plan', async () => {
    const s = await fresh();
    await s.saveAvailability(week(MON));
    const nov = s.read<AvailabilityMonth>(paths.availability('2026-11'))!;
    expect(Object.keys(nov.days)).toHaveLength(7);
    expect(nov.planned).toEqual([D(0), D(2), D(4), D(6)]);
    expect(s.plannedCount(MON)).toBe(4);
  });

  it('over de maandgrens: twee maandbestanden', async () => {
    const s = await fresh('2026-11-27T08:00:00');
    await s.saveAvailability(week('2026-11-27'));
    expect(s.read<AvailabilityMonth>(paths.availability('2026-12'))!.days['2026-12-01']).toBeDefined();
  });

  it('niet aangevinkt → je vaste patroon van vorige weken (zonder tennis)', async () => {
    const s = await fresh();
    await s.saveAvailability(week(MON, (d, i) => (i === 1 ? { slots: [] } : i === 3 ? { tennis: 60 } : {})));
    const next = s.dayAvailability(D(8));
    expect(next.source).toBe('pattern');
    expect(next.day.slots).toEqual([]);
    expect(s.dayAvailability(D(10)).day.tennis).toBeUndefined();
    expect(s.dayAvailability(D(70)).source).toBe('default');
  });

  it('vandaag: krachtsessie met concrete oefeningen, beginner start licht', async () => {
    const s = await fresh();
    const day = s.todayPlan();
    expect(day.type).toBe('strength');
    const session = s.sessionFor(day);
    expect(session?.kind).toBe('strength');
    const legPress = session && 'exercises' in session ? session.exercises.find((e) => e.exercise.id === 'leg-press') : undefined;
    expect(legPress?.prescription.load).toBeLessThanOrEqual(35);
    expect(legPress?.prescription.sets).toBe(2);
  });

  it('dagvorm rood → sessie van vandaag verplaatst', async () => {
    const s = await fresh();
    await s.saveAvailability(week(MON));
    await s.write(paths.health('2026-11'), { month: '2026-11', days: [{ date: MON, sleepHours: 4 }], workouts: [] });
    expect((await s.recordCheck('low')).level).toBe('red');
    expect(s.todayPlan()).toMatchObject({ status: 'moved', sweat: false });
  });

  it('flexibel: vandaag toch thuis en 30 min', async () => {
    const s = await fresh();
    await s.saveAvailability(week(MON));
    await s.updateDay(MON, { home: true, minutes: 30 });
    expect(s.todayPlan()).toMatchObject({ type: 'strength', location: 'home', minutes: 30 });
    const session = s.sessionFor(s.todayPlan());
    expect(session && 'exercises' in session && session.exercises.every((e) => e.exercise.locations.includes('home'))).toBe(true);
  });

  it('tennis die niet doorgaat → het plan past zich aan', async () => {
    const s = await fresh();
    await s.saveAvailability(week(MON, (_d, i) => (i === 3 ? { tennis: 120 } : {})));
    expect(s.plan().days[3]!.type).toBe('tennis');
    await s.updateDay(D(3), { tennis: undefined });
    expect(s.plan().days[3]!.type).not.toBe('tennis');
  });

  it('een gelogde training telt en het plan schuift mee', async () => {
    const s = await fresh(`${MON}T20:00:00`);
    await s.logSession({ id: 'x', date: MON, kind: 'strength', template: 'A', location: 'gym', source: 'app', exercises: [] });
    const plan = s.plan();
    expect(plan.done).toBe(1);
    expect(plan.days[0]!.status).toBe('done');
    expect(plan.days[1]!.sweat).toBe(false);
    expect(plan.days.find((d) => d.status === 'planned' && d.type === 'strength')!.template).toBe('B');
  });

  it('overleeft een herstart (IndexedDB)', async () => {
    const s = await fresh();
    await s.postpone(MON);
    await s.setLocal({ owner: 'x', repo: 'training' });
    const again = new Store();
    await again.init();
    expect(again.log('2026-W48').postponed).toEqual([MON]);
    expect(again.local.repo).toBe('training');
  });
});
