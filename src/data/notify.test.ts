import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addDays } from '../coach/dates.ts';
import { defaultDay } from '../coach/availability.ts';
import { idb } from './db.ts';
import { morningMessage, sundayMessage } from './notify.ts';
import { defaultProfile, Store } from './store.ts';

async function at(iso: string) {
  await idb.clear('files').catch(() => undefined);
  idb.reset();
  const s = new Store();
  s.now = () => new Date(iso);
  s.timeZone = 'Europe/Brussels';
  await s.init();
  await s.saveProfile({ ...defaultProfile(), setupDone: true });
  return s;
}
const MON = '2026-11-23';
const days7 = (from: string) => Array.from({ length: 7 }, (_, i) => defaultDay(addDays(from, i), 45));

describe('ochtendmelding', () => {
  beforeEach(() => idb.reset());

  it('niets aangevinkt → toch je plan van vandaag, plus de vraag om aan te vinken', async () => {
    const s = await at('2026-11-23T06:07:00Z');
    expect(morningMessage(s)!.body).toMatch(/Vink ook je komende dagen aan/);
  });

  it('trainingsdag → wat je doet, waar en hoelang', async () => {
    const s = await at('2026-11-23T06:07:00Z');
    await s.saveAvailability(days7(MON).map((d, i) => (i === 0 ? { ...d, want: 'strength' as const } : d)));
    const m = morningMessage(s)!;
    expect(m.title).toBe("Vandaag: Full body A · Jims 's avonds");
    expect(m.body).toMatch(/^45 min · Leg press, Chest press \(toestel\), Lat pulldown…/);
  });

  it('rustdag → zweetvrije suggestie en de volgende training', async () => {
    // Maandagochtend ingevuld (ma/wo/vr), maandag getraind, dinsdag 7u de melding.
    const s = await at('2026-11-23T06:00:00Z');
    await s.saveAvailability(days7(MON));
    await s.logSession({ id: 'ma', date: MON, kind: 'strength', template: 'A', location: 'gym', source: 'app', exercises: [] });
    s.now = () => new Date('2026-11-24T06:07:00Z');
    s.emit();
    const m = morningMessage(s)!;
    expect(m.title).toBe('Zweetvrije dag');
    expect(m.body, m.body).toContain('Volgende training: woensdag');
  });

  it('vraagt naar een actieve blessure', async () => {
    const s = await at('2026-11-23T06:07:00Z');
    await s.saveAvailability(days7(MON));
    await s.write('data/injuries.json', { injuries: [{ id: 'k', zone: 'knie', severity: 1, startedOn: MON, updates: [] }] });
    expect(morningMessage(s)!.body).toMatch(/Hoe is je knie\?/);
  });
});

describe('zondagherinnering', () => {
  beforeEach(() => idb.reset());

  it('niet aangevinkt → aanvinken; daarna: reserveer je lessen (tot ze allemaal gereserveerd zijn)', async () => {
    const s = await at('2026-11-29T18:07:00Z');
    expect(sundayMessage(s)).toMatchObject({ title: 'Vink je komende dagen aan', url: '#/agenda' });
    await s.saveAvailability(days7('2026-11-29').concat([defaultDay('2026-12-06', 45)]));
    const book = sundayMessage(s)!;
    expect(book).toMatchObject({ title: 'Reserveer je indoor cycling 🎟️', url: '#/agenda' });
    expect(book.body).toMatch(/Lessen zitten snel vol: /);
    for (const d of s.upcomingClasses()) await s.updateDay(d.date, { booked: true });
    expect(sundayMessage(s)).toBeNull();
  });

  it('cycling-dag en tennisdag hebben een eigen melding', async () => {
    const s = await at('2026-11-25T06:07:00Z');
    await s.saveAvailability(days7('2026-11-25'));
    expect(morningMessage(s)!.title).toMatch(/indoor cycling 's avonds/);
    const t = await at('2026-11-26T06:07:00Z');
    await t.saveAvailability(days7('2026-11-26').map((d, i) => (i === 0 ? { ...d, tennis: 60 } : d)));
    expect(morningMessage(t)!.title).toMatch(/tennis/);
  });
});
