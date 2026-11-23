import { useState } from 'preact/hooks';
import type { Insights } from '../../coach/insights.ts';
import type { PlannedDay } from '../../coach/planner.ts';
import { GROUP_LABEL, GROUPS, STATE_LABEL, type Group, type GroupRecovery } from '../../coach/recovery.ts';
import { PLACES } from '../../coach/weather.ts';
import { currentPlace, placeOf, refreshWeather, setWeatherPlace } from '../../data/weather.ts';
import { Chips } from '../components.tsx';
import { nextMilestone } from '../../coach/milestones.ts';
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
    </div>
  );
}

/** Eén sterk punt en één werkpunt, met wat de coach ermee doet. */
export function InsightsCard(props: { insights: Insights; full?: boolean }) {
  const { strong, work, enoughData } = props.insights;
  const n = props.full ? 4 : 1;
  if (!enoughData && strong.length === 0 && work.length === 0) return null;
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
          <span>{i.text}</span>
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

/** Optioneel na de dagvorm: spierpijn, in gradaties (een beetje / echt). Eén tik per rij. */
type SoreLevel = 0 | 1 | 2;
const AREAS: { label: string; groups: Group[] }[] = [
  { label: 'Benen', groups: ['benen'] },
  { label: 'Bovenlijf', groups: ['duwen', 'trekken'] },
];

export function SoreChips() {
  const s = useStore();
  const check = s.checkFor(s.today());
  if (!check) return null;
  const sore = check.sore ?? [];
  const light = check.soreLight ?? [];
  const level = (gs: Group[]): SoreLevel => (gs.some((g) => sore.includes(g)) ? 2 : gs.some((g) => light.includes(g)) ? 1 : 0);
  const set = (gs: Group[], v: SoreLevel) => {
    const without = (list: Group[]) => list.filter((g) => !gs.includes(g));
    void s.recordSore(v === 2 ? [...without(sore), ...gs] : without(sore), v === 1 ? [...without(light), ...gs] : without(light));
  };
  return (
    <div class="sore">
      <p class="muted small">Spierpijn?</p>
      {AREAS.map((a) => (
        <Chips<SoreLevel>
          key={a.label}
          label={`Spierpijn ${a.label.toLowerCase()}`}
          options={[
            { value: 0, label: `${a.label}: nee` },
            { value: 1, label: 'Een beetje', tone: 'orange' },
            { value: 2, label: 'Echt', tone: 'red' },
          ]}
          value={level(a.groups)}
          onChange={(v) => set(a.groups, v)}
        />
      ))}
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

/** Nieuwe mijlpaal: korte felicitatie (één keer). */
export function MilestoneCard() {
  const s = useStore();
  const fresh = s.newMilestones();
  if (fresh.length === 0) return null;
  const m = fresh[0]!;
  return (
    <div class="card milestone" role="status">
      <p class="milestone-icon" aria-hidden="true">
        {m.icon}
      </p>
      <h3>{m.title}</h3>
      <p>{m.text}</p>
      {fresh.length > 1 && <p class="muted small">En nog {fresh.length - 1}: {fresh.slice(1).map((x) => x.title.toLowerCase()).join(', ')}.</p>}
      <button class="btn primary" onClick={() => s.markMilestonesSeen(fresh.map((x) => x.id))}>
        Top!
      </button>
    </div>
  );
}

/** Alle mijlpalen tot nu toe + de volgende (Rapport). */
export function MilestonesList() {
  const s = useStore();
  const all = s.milestones();
  const next = nextMilestone(s.sessions());
  return (
    <div class="card">
      <h3>Mijlpalen</h3>
      <ul class="plain milestones">
        {all.slice(0, 8).map((m) => (
          <li key={m.id}>
            <span aria-hidden="true">{m.icon}</span> <strong>{m.title}</strong>{' '}
            <span class="muted small">{Number(m.date.slice(8))}/{Number(m.date.slice(5, 7))}</span>
          </li>
        ))}
      </ul>
      {next && (
        <p class="muted small">
          Volgende: {next.title} ({next.left}).
        </p>
      )}
    </div>
  );
}

/** Krachtcheck: je laatste meting en hoeveel sterker je werd (Rapport). */
export function StrengthCheckCard() {
  const s = useStore();
  const checks = s.checksStrength();
  const nf = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 1 });
  if (checks.length === 0) return null;
  const c = checks[0]!;
  return (
    <div class="card">
      <h3>
        Krachtcheck{' '}
        <span class="muted small">
          {Number(c.date.slice(8))}/{Number(c.date.slice(5, 7))}
        </span>
      </h3>
      {c.change !== undefined && (
        <p>
          <strong>{c.change >= 0 ? '+' : ''}{Math.round(c.change * 100)}%</strong> sterker dan je vorige check.
        </p>
      )}
      <ul class="plain">
        {c.items.map((i) => (
          <li key={i.exerciseId}>
            <strong>{i.name}</strong>: {nf.format(i.load)} kg × {i.reps}{' '}
            <span class="muted small">
              (geschatte max {nf.format(Math.round(i.e1rm))} kg{i.change !== undefined ? `, ${i.change >= 0 ? '+' : ''}${Math.round(i.change * 100)}%` : ', eerste meting'})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
