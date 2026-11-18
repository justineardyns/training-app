import { useState } from 'preact/hooks';
import { sync } from '../../data/app.ts';
import { explain } from '../../data/github.ts';
import { daysLeft } from '../../data/token.ts';
import { guessOwner } from '../../data/sync.ts';
import { useStore } from '../hooks.ts';
import { Chips } from '../components.tsx';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

/** Koppelen met je privé-repo: token plakken, de rest staat al ingevuld. */
export function ConnectRepo(props: { onDone: (restored: boolean) => void; onSkip?: () => void }) {
  const s = useStore();
  const [token, setToken] = useState('');
  const [owner, setOwner] = useState(s.local.owner ?? guessOwner());
  const [repo, setRepo] = useState(s.local.repo ?? 'training');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [expiry, setExpiry] = useState<number>(0);

  const paste = async () => {
    try {
      setToken((await navigator.clipboard.readText()).trim());
    } catch {
      setError('Plakken lukte niet automatisch. Tik lang in het veld en kies "Plak".');
    }
  };

  const connect = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const { restored } = await sync.connect(token, owner, repo, expiry || undefined);
      props.onDone(restored);
    } catch (err) {
      setError(err instanceof Error && !('status' in err) ? err.message : explain(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="stack">
      <div class="card">
        <p>Je trainings- en gezondheidsdata komen in je <strong>eigen privé-repo</strong>. Daarvoor heeft de app één keer een sleutel (token) nodig.</p>
        <ol class="steps">
          <li>
            Open{' '}
            <a href={TOKEN_URL} target="_blank" rel="noopener">
              GitHub → nieuw token
            </a>
          </li>
          <li>Naam: <em>Coach</em> · Expiration: <em>No expiration</em> (aanrader)</li>
          <li>Repository access: <em>Only select repositories</em> → <em>{repo || 'training'}</em></li>
          <li>Permissions → Repository → <em>Contents: Read and write</em></li>
          <li><em>Generate token</em> → kopieer</li>
        </ol>
      </div>
      <label class="field">
        <span>Token</span>
        <div class="row">
          <input
            type="password"
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            placeholder="github_pat_…"
            value={token}
            onInput={(e) => setToken((e.target as HTMLInputElement).value)}
          />
          <button class="btn small" onClick={paste}>
            Plakken
          </button>
        </div>
      </label>
      <div class="row">
        <label class="field">
          <span>Gebruiker</span>
          <input value={owner} autocapitalize="off" spellcheck={false} onInput={(e) => setOwner((e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Privé-repo</span>
          <input value={repo} autocapitalize="off" spellcheck={false} onInput={(e) => setRepo((e.target as HTMLInputElement).value)} />
        </label>
      </div>
      <div>
        <span class="muted small">Vervaldatum die je koos (voor een tijdige herinnering)</span>
        <Chips
          options={[
            { value: 0, label: 'Geen' },
            { value: 30, label: '30 d' },
            { value: 90, label: '90 d' },
            { value: 365, label: '1 jaar' },
          ]}
          value={expiry}
          onChange={setExpiry}
        />
      </div>
      {error && <p class="note warn">{error}</p>}
      <button class="btn primary" disabled={busy || !token || !owner || !repo} onClick={connect}>
        {busy ? 'Bezig…' : 'Koppel'}
      </button>
      {props.onSkip && (
        <button class="btn ghost" onClick={props.onSkip}>
          Later koppelen
        </button>
      )}
      <p class="muted small">Het token blijft enkel op je iPhone. Het komt nooit in een repo.</p>
    </div>
  );
}

function ago(iso: string | undefined): string {
  if (!iso) return 'nog nooit';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'net';
  if (min < 60) return `${min} min geleden`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} u geleden` : `${Math.round(h / 24)} d geleden`;
}

/** Waarschuwing bovenaan als er iets mis is met de koppeling. */
export function SyncWarning() {
  const s = useStore();
  if (!sync.configured()) return null;
  const left = daysLeft(s.local.tokenExpires);
  const pending = s.dirtyFiles().length;
  if (left !== undefined && left <= 14) {
    return <p class="note warn">Je GitHub-token vervalt {left <= 0 ? 'vandaag' : `over ${left} dagen`}. Maak een nieuw via Meer → Privé-repo.</p>;
  }
  if (s.local.lastSyncError && /token|Contents|niet gevonden/.test(s.local.lastSyncError)) {
    return <p class="note warn">{s.local.lastSyncError}</p>;
  }
  if (pending > 0 && s.local.lastSyncError) {
    return (
      <p class="muted small">
        ● {pending} {pending === 1 ? 'wijziging wacht' : 'wijzigingen wachten'} op netwerk. Alles staat veilig op je iPhone.
      </p>
    );
  }
  return null;
}

export function SyncSettings() {
  const s = useStore();
  const [replace, setReplace] = useState(false);
  if (!sync.configured() || replace) {
    return <ConnectRepo onDone={() => setReplace(false)} onSkip={replace ? () => setReplace(false) : undefined} />;
  }
  const left = daysLeft(s.local.tokenExpires);
  const pending = s.dirtyFiles().length;
  return (
    <div class="card">
      <p>
        Gekoppeld met <strong>{s.local.owner}/{s.local.repo}</strong>
      </p>
      <p class="muted small">
        Laatst gesynct: {ago(s.local.lastSync)} · {pending ? `${pending} in wachtrij` : 'alles gesynct'}
        {left !== undefined ? ` · token vervalt over ${left} d` : ''}
      </p>
      {s.local.lastSyncError && <p class="note warn">{s.local.lastSyncError}</p>}
      <div class="row">
        <button class="btn small" disabled={sync.syncing} onClick={() => void sync.run()}>
          {sync.syncing ? 'Bezig…' : 'Nu synchroniseren'}
        </button>
        <button class="btn small" onClick={() => setReplace(true)}>
          Token vervangen
        </button>
      </div>
    </div>
  );
}
