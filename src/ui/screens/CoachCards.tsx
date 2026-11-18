import { useState } from 'preact/hooks';
import type { Insights } from '../../coach/insights.ts';
import type { PlannedDay } from '../../coach/planner.ts';
import { GROUP_LABEL, GROUPS, STATE_LABEL, type Group, type GroupRecovery } from '../../coach/recovery.ts';
import { PLACES } from '../../coach/weather.ts';
import { currentPlace, placeOf, refreshWeather, setWeatherPlace } from '../../data/weather.ts';
import { useStore } from '../hooks.ts';
import { go } from '../router.ts';

const TONE = { fris: 'green', herstelt: 'orange', moe: 'red' } as const;

/** Je spieren vandaag: fris, herstelt of moe, per groep. */
export function RecoveryCard(props: { recovery: Record<Group, GroupRecovery> }) {
  const r = props.recovery;
  const allFresh = GROUPS.every((g) => r[g].state === 'fris');
  return (
    <div class="card">
      <h3>Je spieren</h3>
      <ul class="recovery" aria-label="Herstel per spiergroep">
        {GROUPS.map((g) => (
          <li key={g} class={`rec ${TONE[r[g].state]}`}>
            <span class="rec-dot" aria-hidden="true" />
            <span class="rec-name">{GROUP_LABEL[g]}</span>
            <span class="rec-state">
              {STATE_LABEL[r[g].state]}
              {r[g].cause && <span class="muted small"> · {r[g].cause}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p class="muted small">
        {allFresh
          ? 'Alles hersteld. Ik plan nooit dezelfde spieren zwaar voor ze hersteld zijn.'
          : 'Wat nog moe is, komt later in je training of krijgt een set minder.'}
      </p>
    </div>
  );
}

/** Eén sterk punt en één werkpunt, met wat de coach ermee doet. */
export function InsightsCard(props: { insights: Insights; full?: boolean }) {
  const { strong, work, enoughData } = props.insights;
  const n = props.full ? 4 : 1;
  if (!enoughData && strong.length === 0 && work.length === 0) {
    return (
      <div class="card coach">
        <h3>Sterk en werkpunten</h3>
        <p class="muted">Na 2–3 trainingen zie je hier wat goed gaat en wat beter kan. Ik pas je schema daarop aan.</p>
      </div>
    );
  }
  return (
    <div class="card coach insights">
      <h3>Sterk en werkpunten</h3>
      {strong.slice(0, n).map((i) => (
        <p key={i.id} class="insight strong">
          <span aria-hidden="true">💪</span> <span>{i.text}</span>
        </p>
      ))}
      {work.slice(0, n).map((i) => (
        <p key={i.id} class="insight work">
          <span aria-hidden="true">🎯</span>{' '}
          <span>
            {i.text}
            {i.action && <span class="muted"> {i.action}</span>}
          </span>
        </p>
      ))}
      {strong.length === 0 && work.length === 0 && <p class="muted">Alles op schema. Gewoon zo doorgaan.</p>}
      {!props.full && strong.length + work.length > 2 && (
        <button class="link" onClick={() => go('rapport')}>
          Alles bekijken
        </button>
      )}
    </div>
  );
}

export function WeatherBadge(props: { day: PlannedDay }) {
  const w = props.day.weather;
  if (!w) return null;
  return (
    <span class="wx" title={`${w.text}, ${Math.round(w.tMin)}–${Math.round(w.tMax)}°, ${w.precipProb}% kans op regen`}>
      {w.icon} {Math.round(w.tMax)}°
    </span>
  );
}

/** Optioneel na de dagvorm: spierpijn? Eén tik. */
export function SoreChips() {
  const s = useStore();
  const check = s.checkFor(s.today());
  if (!check) return null;
  const sore = check.sore;
  const upper = sore?.includes('duwen') || sore?.includes('trekken');
  const legs = sore?.includes('benen');
  const set = (groups: Group[]) => s.recordSore(groups);
  return (
    <div class="sore">
      <p class="muted small">Spierpijn? (optioneel)</p>
      <div class="chips" role="group" aria-label="Spierpijn">
        <button class={`chip ${sore && sore.length === 0 ? 'on' : ''}`} aria-pressed={!!sore && sore.length === 0} onClick={() => set([])}>
          Nee
        </button>
        <button
          class={`chip ${legs ? 'on orange' : ''}`}
          aria-pressed={!!legs}
          onClick={() => set(legs ? (sore ?? []).filter((g) => g !== 'benen') : [...(sore ?? []), 'benen'])}
        >
          Benen
        </button>
        <button
          class={`chip ${upper ? 'on orange' : ''}`}
          aria-pressed={!!upper}
          onClick={() =>
            set(upper ? (sore ?? []).filter((g) => g !== 'duwen' && g !== 'trekken') : [...(sore ?? []).filter((g) => g === 'benen'), 'duwen', 'trekken'])
          }
        >
          Bovenlijf
        </button>
      </div>
    </div>
  );
}

/** Waar moet ik het weer voor halen? Eén tik: je locatie of een stad. Blijft op je iPhone. */
export function WeatherSettings() {
  const s = useStore();
  const place = placeOf(s);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (p: { name: string; lat: number; lon: number }) => {
    setBusy(true);
    setErr('');
    await setWeatherPlace(s, p);
    setBusy(false);
  };
  const w = s.weather;
  return (
    <>
      <h1>Weer</h1>
      <p class="muted">
        Voor je wandeldagen: droog → wandelen, regen → binnen. Gratis via Open-Meteo. Enkel je afgeronde locatie (±10 km) gaat daarheen,
        nooit je trainingsdata. Het weerbericht blijft op je iPhone.
      </p>
      <div class="card">
        <p>
          Nu: <strong>{place.name}</strong>
          {w && <span class="muted small"> · bijgewerkt {new Date(w.fetchedAt).toLocaleString('nl-BE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
        </p>
        <button
          class="btn primary"
          disabled={busy}
          onClick={async () => {
            try {
              await pick(await currentPlace());
            } catch (e) {
              setBusy(false);
              setErr((e as Error).message);
            }
          }}
        >
          📍 Gebruik mijn locatie
        </button>
        {err && <p class="note warn">{err}</p>}
        <button class="btn ghost small" disabled={busy} onClick={async () => { setBusy(true); await refreshWeather(s, { force: true }); setBusy(false); }}>
          Nu vernieuwen
        </button>
      </div>
      <h3>Of kies een stad</h3>
      <div class="chips wrap">
        {PLACES.map((p) => (
          <button key={p.name} class={`chip ${place.name === p.name ? 'on' : ''}`} disabled={busy} onClick={() => pick(p)}>
            {p.name}
          </button>
        ))}
      </div>
    </>
  );
}
