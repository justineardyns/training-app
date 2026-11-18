import { explain, GitHub, GitHubError, type FetchLike, type TreeChange } from './github.ts';
import type { Store } from './store.ts';

// Offline-first sync: je iPhone is de bron voor je eigen bestanden. Bij netwerk halen we eerst
// binnen wat anderen schreven (Opdracht, /coach), en pushen we daarna jouw wijzigingen in één commit.

export const SYNC_PREFIXES = ['data/', 'reports/'];
const MAX_ATTEMPTS = 3;

export function isSynced(path: string): boolean {
  return SYNC_PREFIXES.some((p) => path.startsWith(p)) && /\.(json|md|txt)$/.test(path) && !path.endsWith('README.md');
}

export function serialize(path: string, content: unknown): string {
  if (path.endsWith('.json')) return `${JSON.stringify(content, null, 2)}\n`;
  return typeof content === 'string' ? content : String(content ?? '');
}

export function parse(path: string, text: string): unknown {
  if (!path.endsWith('.json')) return text;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function describe(paths: string[]): string {
  const parts = new Set<string>();
  for (const p of paths) {
    if (p.startsWith('data/log/')) parts.add(`training ${p.slice(9, -5)}`);
    else if (p.startsWith('data/availability/')) parts.add(`beschikbaarheid ${p.slice(18, -5)}`);
    else if (p === 'data/profile.json') parts.add('profiel');
    else if (p === 'data/injuries.json') parts.add('blessures');
    else if (p.startsWith('data/health/')) parts.add('Health');
    else if (p.startsWith('data/push/')) parts.add('meldingen');
    else parts.add(p);
  }
  return `Coach-app: ${[...parts].join(', ')}`;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  commit?: string;
}

/** Remote → lokaal. Lokale wijzigingen die nog niet gepusht zijn blijven staan. */
export async function pull(store: Store, gh: GitHub, head: string): Promise<{ tree: string; pulled: number }> {
  const tree = await gh.commitTree(head);
  const entries = (await gh.tree(tree)).filter((e) => e.type === 'blob' && isSynced(e.path));
  const remote = new Set(entries.map((e) => e.path));
  let pulled = 0;
  for (const e of entries) {
    const local = store.files.get(e.path);
    if (local && local.sha === e.sha) continue;
    if (local?.dirty) continue;
    await store.putRemote(e.path, parse(e.path, await gh.blob(e.sha)), e.sha);
    pulled++;
  }
  for (const f of [...store.files.values()]) {
    if (!f.dirty && f.sha && !remote.has(f.path)) {
      await store.forget(f.path);
      pulled++;
    }
  }
  if (pulled) store.emit();
  return { tree, pulled };
}

export async function syncOnce(store: Store, gh: GitHub): Promise<SyncResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const head = await gh.head();
    const { tree, pulled } = await pull(store, gh, head);
    const dirty = store.dirtyFiles().map((f) => ({ ...f }));
    const changes: TreeChange[] = [];
    for (const f of dirty) {
      if (f.deleted) {
        if (f.sha) changes.push({ path: f.path, sha: null });
        else await store.forget(f.path); // nooit gepusht: gewoon vergeten
        continue;
      }
      changes.push({ path: f.path, sha: await gh.createBlob(serialize(f.path, f.content)) });
    }
    if (changes.length === 0) {
      await store.setLocal({ remoteHead: head, lastSync: new Date().toISOString(), lastSyncError: undefined, ...(gh.tokenExpires ? { tokenExpires: gh.tokenExpires } : {}) });
      return { pulled, pushed: 0 };
    }
    const newTree = await gh.createTree(tree, changes);
    const commit = await gh.createCommit(describe(changes.map((c) => c.path)), newTree, head);
    try {
      await gh.updateRef(commit);
    } catch (err) {
      // Iemand anders (Opdracht, /coach) pushte intussen: opnieuw binnenhalen en nog eens.
      if (err instanceof GitHubError && (err.status === 422 || err.status === 409)) continue;
      throw err;
    }
    for (const c of changes) {
      const before = dirty.find((d) => d.path === c.path)!;
      const now = store.files.get(c.path);
      if (!now) continue;
      if (c.sha === null) {
        if (now.deleted) await store.forget(c.path);
        continue;
      }
      // Enkel "schoon" als er tijdens de sync niets meer wijzigde.
      await store.markPushed(c.path, c.sha, before.updatedAt);
    }
    await store.setLocal({ remoteHead: commit, lastSync: new Date().toISOString(), lastSyncError: undefined, ...(gh.tokenExpires ? { tokenExpires: gh.tokenExpires } : {}) });
    return { pulled, pushed: changes.length, commit };
  }
  throw new Error('Synchroniseren lukte niet na 3 pogingen. Ik probeer het straks opnieuw.');
}

/** Zelfde formaat als de header van GitHub. */
export function expiryHeader(d: Date): string {
  return `${d.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

/** Eigenaar raden uit de Pages-URL (<gebruiker>.github.io). */
export function guessOwner(hostname = typeof location !== 'undefined' ? location.hostname : ''): string {
  return hostname.endsWith('.github.io') ? hostname.split('.')[0]! : '';
}

export class SyncManager {
  syncing = false;
  private timer?: ReturnType<typeof setTimeout>;
  private current?: Promise<void>;
  private again = false;

  constructor(
    private store: Store,
    private fetchImpl?: FetchLike,
  ) {}

  configured(): boolean {
    const l = this.store.local;
    return !!(l.token && l.owner && l.repo);
  }

  client(): GitHub {
    const l = this.store.local;
    return new GitHub({ token: l.token!, owner: l.owner!, repo: l.repo!, branch: l.branch, fetch: this.fetchImpl });
  }

  /** Token + repo nakijken en alles binnenhalen. */
  async connect(token: string, owner: string, repo: string, expiresInDays?: number): Promise<{ restored: boolean }> {
    const gh = new GitHub({ token: token.trim(), owner: owner.trim(), repo: repo.trim(), fetch: this.fetchImpl });
    const info = await gh.repoInfo();
    if (!info.private) throw new Error('Deze repo is publiek: dan zou iedereen je gezondheidsdata kunnen zien. Maak hem privé (Settings → General → Danger Zone) of kies een andere.');
    if (info.permissions && info.permissions.push === false) throw new Error('Je token mag niet schrijven. Geef het "Contents: Read and write".');
    // Browsers krijgen de vervaldatum-header niet altijd te zien (CORS): dan geldt jouw keuze.
    const chosen = expiresInDays ? expiryHeader(new Date(Date.now() + expiresInDays * 86_400_000)) : undefined;
    await this.store.setLocal({ token: token.trim(), owner: owner.trim(), repo: repo.trim(), branch: info.default_branch, tokenExpires: gh.tokenExpires ?? chosen });
    const hadProfile = !!this.store.profile();
    await this.run();
    if (this.store.local.lastSyncError) throw new Error(this.store.local.lastSyncError);
    return { restored: !hadProfile && !!this.store.profile() };
  }

  async disconnect(): Promise<void> {
    await this.store.setLocal({ token: undefined, remoteHead: undefined, lastSync: undefined, lastSyncError: undefined, tokenExpires: undefined });
  }

  schedule(delay = 3000): void {
    if (!this.configured()) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), delay);
  }

  async run(): Promise<void> {
    if (!this.configured()) return;
    if (this.current) {
      this.again = true;
      return this.current;
    }
    this.syncing = true;
    this.store.emit();
    this.current = (async () => {
      try {
        do {
          this.again = false;
          await syncOnce(this.store, this.client());
        } while (this.again);
        this.afterSync?.();
      } catch (err) {
        await this.store.setLocal({ lastSyncError: explain(err) });
      } finally {
        this.syncing = false;
        this.current = undefined;
        this.store.emit();
      }
    })();
    return this.current;
  }

  /** Haak voor verwerking na een sync (bv. Health-inbox in fase 4). */
  afterSync?: () => void;

  start(): void {
    this.store.onDirty = () => this.schedule();
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => this.schedule(500));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.schedule(500);
    });
    setInterval(() => document.visibilityState === 'visible' && this.schedule(0), 5 * 60_000);
    this.schedule(500);
  }
}
