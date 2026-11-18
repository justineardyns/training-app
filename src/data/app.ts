// De app-brede instanties: één store en één sync.
import { store } from './store.ts';
import { SyncManager } from './sync.ts';
import { refreshPush } from './push.ts';

export { store };
export const sync = new SyncManager(store);

// Apple Health staat voorlopig uit: geen Health-inbox verwerken na een sync.

/** Bij het openen van de app: pushabonnement nakijken (iOS vernieuwt het soms). */
export function refreshPushSubscription(): void {
  void refreshPush(store).catch(() => undefined);
}
