import { useState } from 'preact/hooks';
import type { Profile } from '../../data/schema.ts';
import { defaultProfile, store } from '../../data/store.ts';
import { go } from '../router.ts';
import { GymEditor, HomeEquipmentEditor } from './Equipment.tsx';
import { ConnectRepo } from './Connect.tsx';
import { PrefsEditor } from './Prefs.tsx';
import { normalizePrefs } from '../../coach/planner.ts';

type Step = 'welkom' | 'repo' | 'thuis' | 'jims' | 'voorkeuren';
const STEPS: Step[] = ['welkom', 'repo', 'thuis', 'jims', 'voorkeuren'];

export function Setup() {
  const [step, setStep] = useState<Step>('welkom');
  const [profile, setProfile] = useState<Profile>(() => store.profile() ?? defaultProfile());
  const idx = STEPS.indexOf(step);
  const next = () => setStep(STEPS[idx + 1] ?? 'voorkeuren');
  const back = () => setStep(STEPS[idx - 1] ?? 'welkom');

  const finish = async () => {
    await store.saveProfile({ ...profile, prefs: normalizePrefs(profile.prefs), setupDone: true });
    go('beschikbaarheid');
  };

  return (
    <div class="app">
      <main class="page setup">
        <div class="progress" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} class={i <= idx ? 'on' : ''} />
          ))}
        </div>

        {step === 'welkom' && (
          <>
            <h1>Hoi! Ik ben je coach.</h1>
            <p>Ik plan je trainingen binnen je regels, vul elke set vooraf in en stuur bij op basis van hoe het gaat. Jij tikt, ik reken.</p>
            <p class="muted">Eerst een paar vragen. Je hoeft bijna niets te typen.</p>
            <button class="btn primary huge" onClick={next}>
              Start
            </button>
          </>
        )}

        {step === 'repo' && (
          <>
            <h1>Je privé-opslag</h1>
            <ConnectRepo
              onDone={(restored) => {
                if (restored) {
                  const p = store.profile();
                  if (p?.setupDone) {
                    go('vandaag');
                    return;
                  }
                  if (p) setProfile(p);
                }
                next();
              }}
              onSkip={next}
            />
          </>
        )}

        {step === 'thuis' && (
          <>
            <h1>Je materiaal thuis</h1>
            <p class="muted">Thuisoefeningen gebruiken enkel deze gewichten.</p>
            <HomeEquipmentEditor value={profile.equipment} onChange={(equipment) => setProfile({ ...profile, equipment })} />
            <div class="row sticky-actions">
              <button class="btn ghost" onClick={back}>
                Terug
              </button>
              <button class="btn primary" onClick={next}>
                Verder
              </button>
            </div>
          </>
        )}

        {step === 'jims' && (
          <>
            <h1>Jims</h1>
            <GymEditor value={profile.gym} onChange={(gym) => setProfile({ ...profile, gym })} />
            <div class="row sticky-actions">
              <button class="btn ghost" onClick={back}>
                Terug
              </button>
              <button class="btn primary" onClick={next}>
                Verder
              </button>
            </div>
          </>
        )}

        {step === 'voorkeuren' && (
          <>
            <h1>Je week</h1>
            <PrefsEditor value={normalizePrefs(profile.prefs)} onChange={(prefs) => setProfile({ ...profile, prefs })} full />
            <div class="row sticky-actions">
              <button class="btn ghost" onClick={back}>
                Terug
              </button>
              <button class="btn primary" onClick={finish}>
                Klaar
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
