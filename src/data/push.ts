import { paths } from './schema.ts';
import type { Store } from './store.ts';

// Web Push zonder server en zonder secrets: de app maakt zelf een VAPID-sleutelpaar en bewaart
// het samen met het abonnement in je privé-repo. Een GitHub Action in die repo stuurt de meldingen.
// De inhoud is end-to-end versleuteld: Apple kan ze niet lezen.

export interface PushFile {
  version: 1;
  subscription: PushSubscriptionJSON;
  vapid: { publicKey: string; privateKey: string };
  subject: string;
  timeZone: string;
  updatedAt: string;
}

export const b64url = {
  encode(bytes: Uint8Array): string {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(s: string): Uint8Array {
    const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
  },
};

export async function makeVapidKeys(): Promise<PushFile['vapid']> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { publicKey: b64url.encode(pub), privateKey: jwk.d! };
}

export type PushSupport = 'ok' | 'install-first' | 'unsupported';

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (isIos && !standalone) return 'install-first';
  if (!('PushManager' in window) || !('Notification' in window)) return isIos ? 'install-first' : 'unsupported';
  return 'ok';
}

export function pushFile(store: Store): PushFile | undefined {
  return store.read<PushFile>(paths.push);
}

/** Meldingen aanzetten (moet vanuit een tik gebeuren). */
export async function enablePush(store: Store, appUrl: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Je gaf geen toestemming voor meldingen. Zet ze aan via Instellingen → Meldingen → Coach.');
  const reg = await navigator.serviceWorker.ready;
  const existing = pushFile(store);
  const vapid = existing?.vapid ?? (await makeVapidKeys());
  let sub = await reg.pushManager.getSubscription();
  if (sub && existing?.vapid.publicKey !== vapid.publicKey) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64url.decode(vapid.publicKey) as BufferSource });
  await store.write(paths.push, {
    version: 1,
    subscription: sub.toJSON(),
    vapid,
    subject: appUrl,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Brussels',
    updatedAt: store.now().toISOString(),
  } satisfies PushFile);
}

/** Bij het openen: als iOS het abonnement vernieuwde, het nieuwe bewaren. */
export async function refreshPush(store: Store): Promise<void> {
  const file = pushFile(store);
  if (!file || pushSupport() !== 'ok' || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const fresh = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64url.decode(file.vapid.publicKey) as BufferSource });
    await store.write(paths.push, { ...file, subscription: fresh.toJSON(), updatedAt: store.now().toISOString() });
  } else if (sub.endpoint !== file.subscription.endpoint) {
    await store.write(paths.push, { ...file, subscription: sub.toJSON(), updatedAt: store.now().toISOString() });
  }
}

/** Testmelding: de Action reageert op dit bestand en stuurt binnen ±1 minuut een melding. */
export async function requestTestPush(store: Store): Promise<void> {
  await store.write('data/push/test.json', { requestedAt: store.now().toISOString() });
}
