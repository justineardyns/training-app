import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { idb } from './db.ts';
import { processHealthInbox } from './healthInbox.ts';
import { reportIllness, reportInjury, updateIllness, updateInjury } from './injuries.ts';
import { paths, type HealthMonthFile } from './schema.ts';
import { defaultProfile, Store } from './store.ts';

const INBOX = `#SLAAP_WAARDE
Kern
#SLAAP_START
2026-11-22T23:30:00+01:00
#SLAAP_EINDE
2026-11-23T03:30:00+01:00
#HRV_WAARDE
30
#HRV_START
2026-11-23T03:00:00+01:00
#RUST_WAARDE
66
#RUST_START
2026-11-23T00:00:00+01:00
#WORKOUT_TYPE
Indoor fietsen
#WORKOUT_START
2026-11-21T10:00:00+01:00
#WORKOUT_EINDE
2026-11-21T10:50:00+01:00
`;

async function fresh() {
  await idb.clear('files').catch(() => undefined);
  await idb.clear('local').catch(() => undefined);
  const s = new Store();
  s.now = () => new Date('2026-11-23T08:00:00+01:00');
  await s.init();
  await s.saveProfile({ ...defaultProfile(), setupDone: true });
  return s;
}

describe('Health-inbox verwerken (voorlopig uitgeschakeld in de app)', () => {
  beforeEach(() => idb.reset());

  it('maakt maandbestanden, logt de groepsles, ruimt de inbox op', async () => {
    const s = await fresh();
    await s.putRemote('data/health/inbox/2026-11-23T07-12-00.txt', INBOX, 'sha1');
    expect(await processHealthInbox(s, 'Europe/Brussels')).toBe(1);
    const month = s.read<HealthMonthFile>(paths.health('2026-11'))!;
    expect(month.days.find((d) => d.date === '2026-11-23')).toMatchObject({ sleepHours: 4, hrvMs: 30, restingHr: 66 });
    expect(month.workouts).toHaveLength(1);
    // Zaterdag 21/11 = week 47
    expect(s.log('2026-W47').sessions).toMatchObject([{ kind: 'class', source: 'watch', durationMin: 50 }]);
    expect(s.list('data/health/inbox/')).toHaveLength(0);
    expect(s.dirtyFiles().some((f) => f.path.startsWith('data/health/inbox/') && f.deleted)).toBe(true);
    // Nog eens verwerken: niets dubbel
    await s.putRemote('data/health/inbox/2026-11-23T09-00-00.txt', INBOX, 'sha2');
    await processHealthInbox(s, 'Europe/Brussels');
    expect(s.log('2026-W47').sessions).toHaveLength(1);
  });
});

describe('blessures melden', () => {
  beforeEach(() => idb.reset());

  it('melden, opvolgen en herstellen', async () => {
    const s = await fresh();
    const inj = await reportInjury(s, 'knie', 2, false);
    expect(s.injuries()).toHaveLength(1);
    await updateInjury(s, inj.id, 'beter');
    expect(s.injuries()[0]!.updates.at(-1)).toMatchObject({ trend: 'beter', severity: 1 });
    await updateInjury(s, inj.id, 'weg');
    expect(s.injuries()[0]!.resolvedOn).toBe('2026-11-23');
  });

  it('opnieuw melden voor dezelfde zone werkt de bestaande bij', async () => {
    const s = await fresh();
    await reportInjury(s, 'schouder', 1, false);
    await reportInjury(s, 'schouder', 3, true);
    expect(s.injuries()).toHaveLength(1);
    expect(s.injuries()[0]).toMatchObject({ sharp: true });
    expect(s.injuries()[0]!.updates.at(-1)).toMatchObject({ trend: 'erger', severity: 3 });
  });

  it('een knieblessure verandert de training van vandaag', async () => {
    const s = await fresh();
    await s.updateDay(s.today(), { want: 'strength' });
    const before = s.sessionFor(s.todayPlan());
    await reportInjury(s, 'knie', 2, false);
    const after = s.sessionFor(s.todayPlan());
    expect(before && 'exercises' in before && before.exercises[0]!.exercise.id).toBe('leg-press');
    expect(after && 'exercises' in after && after.exercises.some((e) => e.exercise.id === 'leg-press')).toBe(false);
  });
});

describe('ziek melden', () => {
  beforeEach(() => idb.reset());

  it('ziek → rust; een blessure melden wist je ziekte niet; genezen → rustig terug', async () => {
    const s = await fresh();
    const ill = await reportIllness(s);
    expect(s.illness().status).toBe('rest');
    expect(s.plan().days.every((d) => !d.sweat)).toBe(true);
    await reportInjury(s, 'knie', 1, false);
    expect(s.illnesses()).toHaveLength(1);
    await updateInjury(s, s.injuries()[0]!.id, 'beter');
    expect(s.illnesses()).toHaveLength(1);
    await updateIllness(s, ill.id, 'weg');
    expect(s.illness().status).toBe('return');
    const first = s.plan().days.find((d) => d.status === 'planned' && d.sweat)!;
    expect(first.lighter).toBe(true);
    const session = s.sessionFor(first);
    if (session?.kind === 'strength') {
      expect(session.exercises[0]!.prescription.note).toBe('1 set minder en niet zwaarder dan vorige keer.');
      expect(session.notes.join(' ')).not.toMatch(/Dagvorm oranje/);
    }
  });
});
