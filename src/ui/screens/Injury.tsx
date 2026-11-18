import { useState } from 'preact/hooks';
import { diffDays } from '../../coach/dates.ts';
import { currentSeverity, isResolved, referral, relevantInjuries, SEVERITY_LABEL, ZONE_LABEL } from '../../coach/injury.ts';
import { EXERCISES } from '../../coach/catalog.ts';
import type { Severity, Zone } from '../../coach/types.ts';
import { reportIllness, reportInjury, updateIllness, updateInjury } from '../../data/injuries.ts';
import { currentKind, ILLNESS_LABEL, type IllnessKind } from '../../coach/illness.ts';
import { Chips } from '../components.tsx';
import { useStore } from '../hooks.ts';
import { go } from '../router.ts';

const ZONES = Object.keys(ZONE_LABEL) as Zone[];
const SEVERITY_HELP: Record<Severity, string> = {
  1: 'Je voelt het, maar het hindert niet',
  2: 'Het hindert bij bepaalde bewegingen',
  3: 'Het doet echt pijn',
};

export function InjuryReport() {
  const s = useStore();
  const [zone, setZone] = useState<Zone>();
  const [severity, setSeverity] = useState<Severity>();
  const [sharp, setSharp] = useState<'nee' | 'ja'>('nee');
  const [done, setDone] = useState<string>();
  const [sick, setSick] = useState(false);
  const [sickDone, setSickDone] = useState(false);

  if (sickDone) {
    const st = s.illness();
    return (
      <>
        <h1>Beterschap</h1>
        <div class="card coach">
          <p>{st.message}</p>
          <p>Elke dag vraag ik even hoe het gaat. Ben je genezen, dan bouwen we rustig terug op: je eerste 2 trainingen zijn lichter.</p>
        </div>
        {st.refer && <p class="note warn">{st.referMessage}</p>}
        <p class="muted small">Ga meteen naar je huisarts bij hoge koorts, pijn op de borst of als je moeilijk ademt.</p>
        <button class="btn primary" onClick={() => go('vandaag')}>
          Naar vandaag
        </button>
      </>
    );
  }

  if (done) {
    const inj = s.injuries().find((i) => i.id === done)!;
    const ref = referral(inj, s.today());
    return (
      <>
        <h1>Begrepen</h1>
        <div class="card coach">
          <p>
            Ik pas je trainingen aan voor je {ZONE_LABEL[inj.zone].toLowerCase()}:{' '}
            {currentSeverity(inj) === 3
              ? 'alles wat die zone belast, valt weg of wordt vervangen.'
              : currentSeverity(inj) === 2
                ? 'zware oefeningen worden vervangen, de rest gaat lichter.'
                : 'de zwaarste oefeningen worden vervangen, de rest iets lichter.'}
          </p>
          <p>Bij elke training vraag ik even hoe het gaat. Zodra het weg is, bouwen we rustig terug op: 60% → 80% → 100%.</p>
        </div>
        {ref.refer && <p class="note warn">{ref.message}</p>}
        <button class="btn primary" onClick={() => go('vandaag')}>
          Naar vandaag
        </button>
      </>
    );
  }

  return (
    <>
      <h1>Ik heb last van…</h1>
      <button class={`btn alt sick ${sick ? 'selected' : ''}`} aria-pressed={sick} onClick={() => setSick(!sick)}>
        <span>🤒 Ik ben ziek</span>
        <span class="muted small">Verkouden, griep, koorts of maag-darm</span>
      </button>
      {sick && (
        <div class="stack">
          <h2>Wat heb je?</h2>
          {(Object.keys(ILLNESS_LABEL) as IllnessKind[]).map((k) => (
            <button
              key={k}
              class="btn alt"
              onClick={async () => {
                await reportIllness(s, k);
                setSickDone(true);
              }}
            >
              <span>{ILLNESS_LABEL[k]}</span>
              <span class="muted small">{k === 'verkouden' ? 'Enkel boven de nek: lichter trainen mag' : 'Rust tot je beter bent'}</span>
            </button>
          ))}
        </div>
      )}
      <h2>Of een pijntje?</h2>
      <div class="zone-grid">
        {ZONES.map((z) => (
          <button key={z} class={`chip ${zone === z ? 'on' : ''}`} aria-pressed={zone === z} onClick={() => setZone(z)}>
            {ZONE_LABEL[z]}
          </button>
        ))}
      </div>
      {zone && (
        <>
          <h2>Hoe erg?</h2>
          <div class="stack">
            {([1, 2, 3] as Severity[]).map((sv) => (
              <button key={sv} class={`btn alt ${severity === sv ? 'selected' : ''}`} aria-pressed={severity === sv} onClick={() => setSeverity(sv)}>
                <span>{SEVERITY_LABEL[sv]}</span>
                <span class="muted small">{SEVERITY_HELP[sv]}</span>
              </button>
            ))}
          </div>
          <h3>Scherpe of stekende pijn?</h3>
          <Chips
            options={[
              { value: 'nee', label: 'Nee' },
              { value: 'ja', label: 'Ja', tone: 'red' },
            ]}
            value={sharp}
            onChange={setSharp}
          />
          <button
            class="btn primary huge"
            disabled={!severity}
            onClick={async () => {
              const inj = await reportInjury(s, zone, severity!, sharp === 'ja');
              setDone(inj.id);
            }}
          >
            Bewaar
          </button>
        </>
      )}
    </>
  );
}

/** Ziek: elke dag één tik (Vandaag en Meer). */
export function IllnessCard() {
  const s = useStore();
  const today = s.today();
  const st = s.illness();
  if (st.status === 'none' || !st.illness) return null;
  const ill = st.illness;
  const answered = ill.updates.find((u) => u.date === today);
  return (
    <div class={`card illness ${st.status === 'rest' ? 'rest' : ''}`}>
      <p>
        <strong>🤒 {ILLNESS_LABEL[currentKind(ill)]}</strong>{' '}
        <span class="muted small">{st.status === 'return' ? 'genezen, we bouwen rustig op' : `sinds ${diffDays(today, ill.startedOn) || 'vandaag'}${diffDays(today, ill.startedOn) ? ' d' : ''}`}</span>
      </p>
      <p class="small">{st.message}</p>
      {st.status !== 'return' && (
        <>
          {!answered && <p class="small">Hoe voel je je vandaag?</p>}
          <Chips
            options={[
              { value: 'beter', label: 'Beter' },
              { value: 'zelfde', label: 'Zelfde' },
              { value: 'erger', label: 'Erger', tone: 'red' },
              { value: 'weg', label: 'Genezen' },
            ]}
            value={answered?.trend}
            onChange={(t) => void updateIllness(s, ill.id, t)}
            wrap
          />
          {currentKind(ill) === 'verkouden' && (
            <button class="btn small ghost" onClick={() => void updateIllness(s, ill.id, 'erger', 'koorts')}>
              Toch koorts of griep gekregen
            </button>
          )}
        </>
      )}
      {st.refer && <p class="note warn">{st.referMessage}</p>}
    </div>
  );
}

/** Klachten opvolgen met één tik (Vandaag en Meer). */
export function InjuryCard() {
  const s = useStore();
  const today = s.today();
  const list = relevantInjuries(s.injuries(), s.sessions(), (id) => EXERCISES.get(id));
  if (list.length === 0) return <IllnessCard />;
  return (
    <>
    <IllnessCard />
    <div class="card injuries">
      {list.map((inj) => {
        const ref = referral(inj, today);
        const answered = inj.updates.some((u) => u.date === today);
        return (
          <div key={inj.id} class="injury">
            <p>
              <strong>{ZONE_LABEL[inj.zone]}</strong>{' '}
              <span class="muted small">
                {isResolved(inj)
                  ? 'hersteld, we bouwen op'
                  : `${SEVERITY_LABEL[currentSeverity(inj)].toLowerCase()} · sinds ${diffDays(today, inj.startedOn)} d`}
              </span>
            </p>
            {!isResolved(inj) && (
              <>
                {!answered && <p class="small">Hoe is het vandaag?</p>}
                <Chips
                  options={[
                    { value: 'beter', label: 'Beter' },
                    { value: 'zelfde', label: 'Zelfde' },
                    { value: 'erger', label: 'Erger', tone: 'red' },
                    { value: 'weg', label: 'Weg' },
                  ]}
                  value={answered ? inj.updates.at(-1)!.trend : undefined}
                  onChange={(t) => void updateInjury(s, inj.id, t)}
                />
              </>
            )}
            {ref.refer && <p class="note warn">{ref.message}</p>}
          </div>
        );
      })}
    </div>
    </>
  );
}
