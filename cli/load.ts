import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { Store } from '../src/data/store.ts';
import { isSynced, parse } from '../src/data/sync.ts';

/** Leest je privé-repo (data/ en reports/) in een Store, zonder IndexedDB. */
export function loadRepo(dir: string, opts: { now?: Date; timeZone?: string } = {}): Store {
  const store = new Store();
  const walk = (d: string): string[] => {
    try {
      return readdirSync(d).flatMap((name) => {
        const full = join(d, name);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });
    } catch {
      return [];
    }
  };
  for (const full of [...walk(join(dir, 'data')), ...walk(join(dir, 'reports'))]) {
    const path = relative(dir, full).split(sep).join('/');
    if (!isSynced(path)) continue;
    const content = parse(path, readFileSync(full, 'utf8'));
    if (content === undefined) continue;
    store.files.set(path, { path, content, dirty: false, updatedAt: 0 });
  }
  store.ready = true;
  store.timeZone = opts.timeZone ?? 'Europe/Brussels';
  if (opts.now) {
    const fixed = opts.now;
    store.now = () => fixed;
  }
  return store;
}
