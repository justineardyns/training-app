import { useState } from 'preact/hooks';
import { sync } from '../../data/app.ts';
import { enablePush, pushFile, pushSupport, requestTestPush } from '../../data/push.ts';
import { defaultProfile } from '../../data/store.ts';
import { Chips } from '../components.tsx';
import { useStore } from '../hooks.ts';

export function NotificationSettings() {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const support = pushSupport();
  const file = pushFile(s);
  const profile = s.profile() ?? defaultProfile();
  const appUrl = new URL('.', location.href).toString().split('#')[0]!;

  if (support === 'install-first') {
    return (
      <div class="card">
        <p>Meldingen werken op je iPhone enkel als de app op je beginscherm staat.</p>
        <p class="muted small">Safari → Deel-knop → Zet op beginscherm → open de app van daar → kom hier terug.</p>
      </div>
    );
  }
  if (support === 'unsupported') return <p class="muted">Dit toestel ondersteunt geen webmeldingen.</p>;

  return (
    <div class="card">
      {file ? (
        <p>
          Meldingen staan <strong>aan</strong>: 's ochtends wat je vandaag doet, en zondagavond een herinnering als je volgende week nog niet plande.
        </p>
      ) : (
        <p>Krijg 's ochtends wat je vandaag doet (ook op je Watch), en zondagavond een herinnering om je week te plannen.</p>
      )}
      <h3>Ochtendmelding om</h3>
      <Chips
        options={[6, 7, 8, 9].map((h) => ({ value: h, label: `${h}u` }))}
        value={profile.notifyHour}
        onChange={(h) => s.saveProfile({ ...profile, notifyHour: h })}
      />
      {msg && <p class="note">{msg}</p>}
      <div class="row">
        <button
          class={`btn ${file ? 'small' : 'primary'}`}
          disabled={busy || !sync.configured()}
          onClick={async () => {
            setBusy(true);
            setMsg(undefined);
            try {
              await enablePush(s, appUrl);
              setMsg('Meldingen staan aan.');
            } catch (err) {
              setMsg(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {file ? 'Opnieuw inschrijven' : 'Meldingen aanzetten'}
        </button>
        {file && (
          <button
            class="btn small"
            onClick={async () => {
              await requestTestPush(s);
              await sync.run();
              setMsg('Testmelding aangevraagd: binnen ±1 minuut krijg je ze (GitHub Actions moet even opstarten).');
            }}
          >
            Testmelding
          </button>
        )}
      </div>
      {!sync.configured() && <p class="muted small">Koppel eerst je privé-repo: de meldingen worden van daaruit verstuurd.</p>}
    </div>
  );
}
