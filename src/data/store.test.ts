import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultDay } from '../coach/availability.ts';
import { addDays } from '../coach/dates.ts';
import type { DayAvailability } from '../coach/types.ts';
import { idb } from './db.ts';
import { paths, type AvailabilityMonth } from './schema.ts';
import { defaultProfile, Store } from './store.ts';
import { refreshWeather, setWeatherPlace } from './weather.ts';

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
    await s.saveAvailability(week(MON, (_, i) => (i === 0 ? { want: 'strength' } : {})));
    const day = s.todayPlan();
    expect(day.type).toBe('strength');
    const session = s.sessionFor(day);
    expect(session?.kind).toBe('strength');
    const legPress = session && 'exercises' in session ? session.exercises.find((e) => e.exercise.id === 'leg-press') : undefined;
    expect(legPress?.prescription.load).toBeLessThanOrEqual(35);
    expect(legPress?.prescription.sets).toBe(2);
  });

  it('dagvorm (jouw tik): moe = oranje, ziek of op = rood → sessie verplaatst', async () => {
    const s = await fresh();
    await s.saveAvailability(week(MON));
    expect((await s.recordCheck('low')).level).toBe('orange');
    expect((await s.recordCheck('sick')).level).toBe('red');
    expect(s.todayPlan()).toMatchObject({ status: 'moved', sweat: false });
  });

  it('flexibel: vandaag minder tijd (30 min), altijd in Jims', async () => {
    const s = await fresh();
    await s.saveAvailability(week(MON, (_, i) => (i === 0 ? { want: 'strength' } : {})));
    await s.updateDay(MON, { minutes: 30 });
    expect(s.todayPlan()).toMatchObject({ type: 'strength', location: 'gym', minutes: 30 });
    const session = s.sessionFor(s.todayPlan());
    expect(session && 'exercises' in session && session.exercises.every((e) => e.exercise.locations.includes('gym'))).toBe(true);
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

  it('wisselen per dag: liever kracht op een lesmoment, en terug', async () => {
    const s = await fresh();
    await s.saveAvailability(week(MON));
    expect(s.plan().days[0]).toMatchObject({ type: 'cardio', groupClass: true });
    await s.updateDay(D(0), { want: 'strength' });
    expect(s.plan().days[0]).toMatchObject({ type: 'strength', want: 'strength' });
    expect(s.explicitDay(D(0))?.want).toBe('strength');
    await s.updateDay(D(0), { want: undefined });
    expect(s.plan().days[0]!.type).toBe('cardio');
  });

  it('spierpijn na de dagvorm: herstelkaart en training passen zich aan', async () => {
    const s = await fresh();
    await s.saveAvailability(week(MON, (_, i) => (i === 0 ? { want: 'strength' } : {})));
    await s.recordCheck('ok');
    await s.recordSore(['benen']);
    expect(s.recovery().benen.state).toBe('moe');
    const session = s.sessionFor(s.todayPlan());
    expect(session?.kind).toBe('strength');
    if (session?.kind === 'strength') {
      expect(session.notes[0]).toMatch(/Benen nog moe \(spierpijn\)/);
      expect(session.exercises.find((e) => e.exercise.id === 'leg-press')?.recoveryNote).toBeTruthy();
    }
    // Opnieuw de dagvorm tikken houdt je spierpijn bij.
    await s.recordCheck('high');
    expect(s.checkFor(MON)?.sore).toEqual(['benen']);
  });

  it('weer: lokaal bewaard (nooit in de repo), vers gebruikt in het plan, oud genegeerd', async () => {
    const s = await fresh();
    await s.saveAvailability(week(MON));
    const hourly = { time: [] as string[], temperature_2m: [] as number[], precipitation_probability: [] as number[], precipitation: [] as number[], weather_code: [] as number[], wind_speed_10m: [] as number[] };
    const days = Array.from({ length: 8 }, (_, i) => D(i));
    for (const d of days) for (let h = 0; h < 24; h++) {
      hourly.time.push(`${d}T${String(h).padStart(2, '0')}:00`);
      hourly.temperature_2m.push(11); hourly.precipitation_probability.push(5); hourly.precipitation.push(0); hourly.weather_code.push(1); hourly.wind_speed_10m.push(8);
    }
    const body = { daily: { time: days, weather_code: days.map(() => 1), temperature_2m_max: days.map(() => 12), temperature_2m_min: days.map(() => 4), precipitation_probability_max: days.map(() => 5), precipitation_sum: days.map(() => 0), wind_speed_10m_max: days.map(() => 10) }, hourly };
    const urls: string[] = [];
    const fetchFn = (async (url: string) => { urls.push(url); return new Response(JSON.stringify(body), { status: 200 }); }) as unknown as typeof fetch;
    expect(await refreshWeather(s, { fetchFn })).toBe(true);
    expect(urls[0]).toContain('latitude=50.9'); // Brussel, afgerond
    expect(await refreshWeather(s, { fetchFn })).toBe(false); // nog vers
    expect(s.plan().days[1]).toMatchObject({ light: { id: 'wandeling' }, walk: { verdict: 'goed' }, weather: { tMax: 12 } });
    expect(s.dirtyFiles().some((f) => JSON.stringify(f.content).includes('fetchedAt'))).toBe(false);
    // Plaats kiezen → meteen vernieuwen, coördinaten afgerond.
    await setWeatherPlace(s, { name: 'Mijn locatie', lat: 51.0543, lon: 3.7174 }, fetchFn);
    expect(s.local.weatherPlace).toEqual({ name: 'Mijn locatie', lat: 51.1, lon: 3.7 });
    expect(urls.at(-1)).toContain('latitude=51.1');
    // Een bericht van 2 dagen oud gebruiken we niet meer.
    s.now = () => new Date(`${D(2)}T09:00:00`);
    s.emit();
    expect(s.weatherFor(D(2))).toBeUndefined();
    // Netwerkfout: stil, geen crash.
    expect(await refreshWeather(s, { force: true, fetchFn: (async () => { throw new Error('offline'); }) as unknown as typeof fetch })).toBe(false);
  });
});
