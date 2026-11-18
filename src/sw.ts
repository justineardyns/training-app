/// <reference lib="webworker" />
// Service worker: maakt de app offline bruikbaar en toont pushmeldingen.
export {};
declare const self: ServiceWorkerGlobalScope;
declare const __PRECACHE__: string[];
declare const __VERSION__: string;

const CACHE = `coach-${__VERSION__}`;
const scope = new URL(self.registration.scope);
const toUrl = (path: string) => new URL(path, scope).toString();
const INDEX = toUrl('index.html');

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(__PRECACHE__.map((p) => (p === '' ? INDEX : toUrl(p))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('coach-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Enkel eigen bestanden; GitHub API e.d. gaan rechtstreeks naar het netwerk.
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  // Het CLI-bestand en de service worker zelf nooit uit de cache.
  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/coach-cli.mjs')) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (req.mode === 'navigate') {
        return (await cache.match(INDEX, { ignoreVary: true })) ?? fetch(req);
      }
      const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })(),
  );
});

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Coach', {
      body: data.body ?? '',
      tag: data.tag ?? 'coach',
      icon: toUrl('icons/icon-192.png'),
      badge: toUrl('icons/icon-192.png'),
      data: { url: toUrl(data.url ?? '') },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target: string = event.notification.data?.url ?? scope.toString();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = all.find((c) => c.url.startsWith(scope.toString()));
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: 'navigate', url: target });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
