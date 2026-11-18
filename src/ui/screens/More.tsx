import { useState } from 'preact/hooks';
import type { Profile } from '../../data/schema.ts';
import { defaultProfile } from '../../data/store.ts';
import { Chips } from '../components.tsx';
import { useStore } from '../hooks.ts';
import { go } from '../router.ts';
import { GymEditor, HomeEquipmentEditor } from './Equipment.tsx';
import { SyncSettings } from './Connect.tsx';
import { PrefsEditor } from './Prefs.tsx';
import { InjuryCard } from './Injury.tsx';
import { NotificationSettings } from './Notifications.tsx';

export function More(props: { sub?: string }) {
  const s = useStore();
  const profile = s.profile() ?? defaultProfile();
  const [draft, setDraft] = useState<Profile>(profile);
  const saveProfile = async (p: Profile) => {
    setDraft(p);
    await s.saveProfile(p);
  };

  if (props.sub === 'thuis') {
    return (
      <>
        <h1>Thuismateriaal</h1>
        <HomeEquipmentEditor value={draft.equipment} onChange={(equipment) => setDraft({ ...draft, equipment })} />
        <div class="sticky-actions">
          <button class="btn primary" onClick={async () => { await saveProfile(draft); go('meer'); }}>
            Bewaar
          </button>
        </div>
      </>
    );
  }
  if (props.sub === 'jims') {
    return (
      <>
        <h1>Jims</h1>
        <GymEditor value={draft.gym} onChange={(gym) => setDraft({ ...draft, gym })} />
        <div class="sticky-actions">
          <button class="btn primary" onClick={async () => { await saveProfile(draft); go('meer'); }}>
            Bewaar
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Meer</h1>
      <div class="stack">
        {s.prefs().trainAtHome && (
          <button class="btn" onClick={() => go('meer/thuis')}>
            Thuismateriaal
          </button>
        )}
        <button class="btn" onClick={() => go('meer/jims')}>
          Gewichtsstappen in Jims
        </button>
      </div>

      <h2>Klachten</h2>
      <InjuryCard />
      <button class="btn" onClick={() => go('blessure')}>
        Ik heb last van…
      </button>

      <h2>Meldingen</h2>
      <NotificationSettings />


      <h2>Privé-repo</h2>
      <SyncSettings />

      <h2>Voorkeuren</h2>
      <PrefsEditor value={s.prefs()} onChange={(prefs) => saveProfile({ ...profile, prefs })} full />
      <div class="card">
        <h3>Deload</h3>
        <Chips
          options={[
            { value: 5, label: 'elke 5e week' },
            { value: 6, label: 'elke 6e week' },
            { value: 8, label: 'elke 8e week' },
          ]}
          value={s.prefs().deloadEvery}
          onChange={(v) => saveProfile({ ...profile, prefs: { ...s.prefs(), deloadEvery: v } })}
        />
      </div>

      <p class="muted small center">Coach · versie {__APP_VERSION__}</p>
    </>
  );
}

declare const __APP_VERSION__: string;
