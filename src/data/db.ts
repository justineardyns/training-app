// Minimale IndexedDB-wrapper. Alles blijft lokaal op je toestel tot de sync het naar je privé-repo stuurt.

const DB_NAME = 'coach';
const VERSION = 1;
export type StoreName = 'files' | 'local';

let dbPromise: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'path' });
      if (!db.objectStoreNames.contains('local')) db.createObjectStore('local');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req ? req.result : (undefined as T));
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const idb = {
  get: <T>(store: StoreName, key: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(key)),
  getAll: <T>(store: StoreName) => tx<T[]>(store, 'readonly', (s) => s.getAll()),
  put: (store: StoreName, value: unknown, key?: string) => tx(store, 'readwrite', (s) => s.put(value, key)),
  delete: (store: StoreName, key: string) => tx(store, 'readwrite', (s) => s.delete(key)),
  clear: (store: StoreName) => tx(store, 'readwrite', (s) => s.clear()),
  /** Enkel voor tests. */
  reset() {
    dbPromise = undefined;
  },
};
