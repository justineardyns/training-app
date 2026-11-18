import { guessOwner } from '../../data/sync.ts';
import { useStore } from '../hooks.ts';

export const SHORTCUT_NAME = 'Training Sync';

/** Start de Opdracht vanuit de app (je iPhone is dan ontgrendeld, dus Health is leesbaar). */
export function runShortcut() {
  location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=nu`;
}

export function HealthButton() {
  return (
    <button class="btn small" onClick={runShortcut}>
      Haal Watch-data op
    </button>
  );
}

function when(iso?: string) {
  if (!iso) return 'nog nooit';
  return new Date(iso).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function HealthSettings() {
  const s = useStore();
  const owner = s.local.owner || guessOwner() || 'jouw-naam';
  const guide = `https://github.com/${owner}/training-app/blob/main/docs/opdracht-health.md`;
  const last = s.healthDays().at(-1);
  return (
    <div class="card">
      <p>
        Laatste Watch-data: <strong>{when(s.local.lastHealth)}</strong>
        {last ? <span class="muted small"> (t.e.m. {last.date})</span> : null}
      </p>
      {s.local.lastImport && <p class="small">Laatste import: {s.local.lastImport}</p>}
      <p class="muted small">
        Via de Opdracht "{SHORTCUT_NAME}". Je groepslessen en cardio van je Watch tellen automatisch mee.
      </p>
      <div class="row">
        <button class="btn small" onClick={runShortcut}>
          Nu ophalen
        </button>
        <a class="btn small" href={guide} target="_blank" rel="noopener">
          Handleiding
        </a>
      </div>
    </div>
  );
}
