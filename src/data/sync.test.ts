import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { idb } from './db.ts';
import { FakeGitHub } from './fakeGithub.ts';
import { base64ToUtf8, utf8ToBase64, type FetchLike } from './github.ts';
import { paths } from './schema.ts';
import { defaultProfile, Store } from './store.ts';
import { guessOwner, isSynced, SyncManager } from './sync.ts';

async function setup(remote?: FakeGitHub) {
  await idb.clear('files').catch(() => undefined);
  await idb.clear('local').catch(() => undefined);
  const store = new Store();
  store.now = () => new Date('2026-11-23T08:00:00');
  await store.init();
  const gh = remote ?? new FakeGitHub();
  const sync = new SyncManager(store, gh.fetch);
  return { store, gh, sync };
}

describe('sync met je privé-repo', () => {
  beforeEach(() => idb.reset());

  it('koppelen: weigert een publieke repo', async () => {
    const { gh, sync } = await setup();
    gh.isPrivate = false;
    await expect(sync.connect('good', 'jij', 'training')).rejects.toThrow(/publiek/);
  });

  it('koppelen: slecht token geeft een duidelijke fout', async () => {
    const { sync } = await setup();
    await expect(sync.connect('fout', 'jij', 'training')).rejects.toThrow();
  });

  it('pusht lokale wijzigingen in één commit en onthoudt de vervaldatum van het token', async () => {
    const { store, gh, sync } = await setup();
    await sync.connect('good', 'jij', 'training');
    await store.saveProfile({ ...defaultProfile(), setupDone: true });
    await store.postpone('2026-11-23');
    await sync.run();
    const files = gh.files();
    expect(JSON.parse(files['data/profile.json']!).setupDone).toBe(true);
    expect(JSON.parse(files['data/log/2026-W48.json']!).postponed).toEqual(['2026-11-23']);
    expect(gh.messages()[0]).toMatch(/^Coach-app: .*profiel/);
    expect(store.dirtyFiles()).toHaveLength(0);
    expect(store.local.tokenExpires).toBe('2027-11-01 10:00:00 UTC');
  });

  it('nieuwe installatie: herstelt alles uit de repo', async () => {
    const remote = new FakeGitHub({
      'data/profile.json': JSON.stringify({ ...defaultProfile(), setupDone: true }),
      'data/log/2026-W47.json': JSON.stringify({ week: '2026-W47', sessions: [], checks: [], postponed: ['2026-11-17'], light: [] }),
      'reports/2026-W47.md': '# Weekrapport\n',
      'data/README.md': 'genegeerd',
    });
    const { store, sync } = await setup(remote);
    const { restored } = await sync.connect('good', 'jij', 'training');
    expect(restored).toBe(true);
    expect(store.profile()?.setupDone).toBe(true);
    expect(store.log('2026-W47').postponed).toEqual(['2026-11-17']);
    expect(store.read(paths.report('2026-W47'))).toBe('# Weekrapport\n');
    expect(store.read('data/README.md')).toBeUndefined();
  });

  it('haalt binnen wat de Opdracht of /coach intussen pushten', async () => {
    const { store, gh, sync } = await setup();
    await sync.connect('good', 'jij', 'training');
    gh.externalCommit({ 'data/coach/adjustments.json': JSON.stringify({ version: 1, focus: 'Slaap!' }) });
    await sync.run();
    expect(store.adjustments()?.focus).toBe('Slaap!');
  });

  it('conflict: iemand pusht net vóór jou → opnieuw binnenhalen en alsnog pushen, niets kwijt', async () => {
    const { store, gh, sync } = await setup();
    await sync.connect('good', 'jij', 'training');
    await store.postpone('2026-11-23');
    gh.raceOnce = () => gh.externalCommit({ 'data/health/inbox/2026-11-23T07-00.txt': 'slaap 7.5' });
    await sync.run();
    const files = gh.files();
    expect(files['data/health/inbox/2026-11-23T07-00.txt']).toBe('slaap 7.5');
    expect(files['data/log/2026-W48.json']).toBeDefined();
    expect(store.read('data/health/inbox/2026-11-23T07-00.txt')).toBe('slaap 7.5');
    expect(store.local.lastSyncError).toBeUndefined();
  });

  it('verwijderen: een verwerkt inbox-bestand verdwijnt ook uit de repo', async () => {
    const remote = new FakeGitHub({ 'data/health/inbox/a.txt': 'x' });
    const { store, gh, sync } = await setup(remote);
    await sync.connect('good', 'jij', 'training');
    await store.remove('data/health/inbox/a.txt');
    await sync.run();
    expect(gh.files()['data/health/inbox/a.txt']).toBeUndefined();
    expect(store.files.has('data/health/inbox/a.txt')).toBe(false);
  });

  it('offline: wijzigingen blijven veilig lokaal en gaan later mee', async () => {
    const { store, gh, sync } = await setup();
    await sync.connect('good', 'jij', 'training');
    const real = gh.fetch;
    (sync as unknown as { fetchImpl: FetchLike }).fetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    await store.postpone('2026-11-24');
    await sync.run();
    expect(store.local.lastSyncError).toMatch(/Geen verbinding/);
    expect(store.dirtyFiles()).toHaveLength(1);
    (sync as unknown as { fetchImpl: FetchLike }).fetchImpl = real;
    await sync.run();
    expect(store.dirtyFiles()).toHaveLength(0);
    expect(store.local.lastSyncError).toBeUndefined();
  });

  it('verlopen token → duidelijke boodschap', async () => {
    const { store, gh, sync } = await setup();
    await sync.connect('good', 'jij', 'training');
    gh.token = 'nieuw';
    await store.postpone('2026-11-24');
    await sync.run();
    expect(store.local.lastSyncError).toMatch(/token is ongeldig of verlopen/);
  });

  it('wijziging tijdens het pushen blijft gemarkeerd om opnieuw te pushen', async () => {
    const { store, gh, sync } = await setup();
    await sync.connect('good', 'jij', 'training');
    await store.postpone('2026-11-24');
    gh.raceOnce = () => void store.postpone('2026-11-25');
    await sync.run();
    // De tweede wijziging is ofwel mee, ofwel nog dirty, maar nooit verloren.
    const pushed = JSON.parse(gh.files()['data/log/2026-W48.json'] ?? '{"postponed":[]}').postponed as string[];
    const local = store.log('2026-W48').postponed;
    expect(local).toEqual(['2026-11-24', '2026-11-25']);
    if (!pushed.includes('2026-11-25')) expect(store.dirtyFiles().length).toBe(1);
    await sync.run();
    expect(JSON.parse(gh.files()['data/log/2026-W48.json']!).postponed).toEqual(['2026-11-24', '2026-11-25']);
  });
});

describe('hulpjes', () => {
  it('base64 met UTF-8 (é, ü, emoji)', () => {
    const t = 'Coach: één set méér 💪';
    expect(base64ToUtf8(utf8ToBase64(t))).toBe(t);
  });
  it('raadt je gebruikersnaam uit de Pages-URL', () => {
    expect(guessOwner('jouwnaam.github.io')).toBe('jouwnaam');
    expect(guessOwner('localhost')).toBe('');
  });
  it('synct enkel data en rapporten', () => {
    expect(isSynced('data/log/2026-W48.json')).toBe(true);
    expect(isSynced('reports/2026-W48.md')).toBe(true);
    expect(isSynced('src/main.ts')).toBe(false);
    expect(isSynced('data/README.md')).toBe(false);
  });
});
