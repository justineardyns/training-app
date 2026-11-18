import { useEffect, useState } from 'preact/hooks';
import { store } from '../data/store.ts';

/** Herrendert bij elke wijziging in de store. */
export function useStore() {
  const [, setV] = useState(store.version);
  useEffect(() => {
    const unsubscribe = store.subscribe(() => setV(store.version));
    setV(store.version); // wijzigingen tussen render en inschrijven niet missen
    return unsubscribe;
  }, []);
  return store;
}

/** Tikt elke `ms` milliseconden (voor timers). */
export function useNow(ms = 250, active = true): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return now;
}

/** Scherm aan houden tijdens een training (iOS 16.4+, als het kan). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let cancelled = false;
    const acquire = () =>
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => undefined);
    void acquire();
    const onVis = () => document.visibilityState === 'visible' && void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
