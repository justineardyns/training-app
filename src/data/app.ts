// De app-brede instanties: één store en één sync.
import { store } from './store.ts';
import { SyncManager } from './sync.ts';
import { processHealthInbox } from './healthInbox.ts';
import { refreshPush } from './push.ts';

export { store };
export const sync = new SyncManager(store);

/** Na elke sync: Health-inbox verwerken; als er iets veranderde, meteen terug pushen. */
export async function processInbox(): Promise<void> {
  const n = await processHealthInbox(store).catch((err) => {
    console.warn('Health-inbox verwerken mislukt', err);
    return 0;
  });
  if (n > 0) sync.schedule(500);
}
sync.afterSync = () => void processInbox();

/** Bij het openen van de app: pushabonnement nakijken (iOS vernieuwt het soms). */
export function refreshPushSubscription(): void {
  void refreshPush(store).catch(() => undefined);
}
