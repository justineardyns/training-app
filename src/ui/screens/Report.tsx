import { useState } from 'preact/hooks';
import { addDays, DAY_SHORT, dayIndex, isoWeek, weekStart } from '../../coach/dates.ts';
import { buildReport, MUSCLE_LABEL, type RecoveryMetric } from '../../coach/report.ts';
import type { Muscle } from '../../coach/types.ts';
import { paths } from '../../data/schema.ts';
import { BarList, DataTable, fmt, LineChart, Sparkline, StatTile } from '../charts.tsx';
import { useStore } from '../hooks.ts';
import { Markdown } from '../markdown.tsx';

const TREND_TEXT = { beter: '↗ beter', slechter: '↘ slechter', stabiel: '→ stabiel' } as const;

function RecoveryTile(props: { label: string; unit: string; m: RecoveryMetric; values: (number | undefined)[] }) {
  const { m } = props;
  return (
    <StatTile
      label={props.label}
      value={m.week === null ? '–' : `${fmt(m.week)}${props.unit}`}
      sub={
        m.baseline !== null ? (
          <>
            normaal {fmt(m.baseline)}
            {props.unit}
            {m.trend && <span class={`trend ${m.trend}`}> {TREND_TEXT[m.trend]}</span>}
          </>
        ) : (
          'basislijn in opbouw'
        )
      }
    >
      <Sparkline values={props.values} baseline={m.baseline} label={`${props.label}, laatste 28 dagen`} />
    </StatTile>
  );
}

export function Report() {
  const s = useStore();
  const today = s.today();
  const [back, setBack] = useState(0);
  const [tables, setTables] = useState(false);
  const monday = addDays(weekStart(today), -7 * back);
  const week = isoWeek(monday);
  const report = buildReport({
    monday,
    history: s.sessions(),
    health: s.healthDays(),
    planned: s.plannedCount(monday),
    nextWeek: s.plan(addDays(monday, 7)),
    today,
  });
  const coachMd = s.read<string>(paths.report(week));
  const volume = (Object.entries(report.volume) as [Muscle, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([m, v]) => ({ label: MUSCLE_LABEL[m], value: v }));
  const health = s.healthDays();
  const last28 = Array.from({ length: 28 }, (_, i) => addDays(addDays(monday, 6), -27 + i));
  const series = (fn: (d: (typeof health)[number]) => number | undefined) => last28.map((d) => {
    const h = health.find((x) => x.date === d);
    return h ? fn(h) : undefined;
  });
  const steps = health.filter((h) => h.date >= monday && h.date <= addDays(monday, 6) && h.steps !== undefined);
  const avgSteps = steps.length ? Math.round(steps.reduce((a, h) => a + h.steps!, 0) / steps.length) : undefined;

  return (
    <>
      <div class="row-between">
        <button class="btn small ghost" onClick={() => setBack(back + 1)} aria-label="Vorige week">
          ‹
        </button>
        <h1 class="center">{back === 0 ? 'Deze week' : back === 1 ? 'Vorige week' : `Week ${week.slice(6)}`}</h1>
        <button class="btn small ghost" disabled={back === 0} onClick={() => setBack(back - 1)} aria-label="Volgende week">
          ›
        </button>
      </div>

      <div class="card coach">
        <p>{report.message}</p>
      </div>

      <div class="tiles">
        <StatTile label="Sessies" value={`${report.done}/${report.planned}`} sub={`${report.strength}× kracht · ${report.cardio}× conditie`} />
        <StatTile label="Streak" value={`${report.streak}`} sub={report.streak === 1 ? 'week met ≥ 2 sessies' : 'weken met ≥ 2 sessies'} />
        <StatTile label="Cardio" value={`${report.cardioMinutes}`} sub="minuten" />
      </div>

      <h2>Kracht</h2>
      {report.prs.length > 0 ? (
        <ul class="prs">
          {report.prs.map((p) => (
            <li key={p.exerciseId}>
              🏆 <strong>{p.name}</strong>{' '}
              <span class="muted small">
                {p.kind === 'kg' ? `${fmt(p.load)} kg × ${p.reps} · 1RM ${fmt(Math.round(p.value))} kg (was ${fmt(Math.round(p.previous))})` : `${p.reps} reps (was ${p.previous})`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p class="muted">Geen nieuwe records deze week.</p>
      )}
      {report.trend.length > 0 && <p class="muted small">Geschatte 1RM per week (kg). Tik op een punt voor de waarde.</p>}
      <div class="multiples">
        {report.trend.map((t) => (
          <div class="card chart" key={t.exerciseId}>
            <h3>{t.name}</h3>
            <LineChart title={`${t.name}, geschatte 1RM`} unit=" kg" points={t.points.map((p) => ({ label: `W${p.week.slice(6)}`, value: Math.round(p.e1rm * 10) / 10 }))} />
          </div>
        ))}
      </div>

      <h2>Volume per spiergroep</h2>
      {volume.length ? (
        <div class="card">
          <p class="muted small">Harde sets deze week (hoofdspier telt 1, meewerkende spieren ½).</p>
          <BarList rows={volume} />
        </div>
      ) : (
        <p class="muted">Nog geen krachtsessies deze week.</p>
      )}

      <h2>Herstel</h2>
      <div class="tiles">
        <RecoveryTile label="HRV" unit=" ms" m={report.recovery.hrv} values={series((h) => h.hrvMs)} />
        <RecoveryTile label="Rusthartslag" unit="" m={report.recovery.rhr} values={series((h) => h.restingHr)} />
        <RecoveryTile label="Slaap" unit=" u" m={report.recovery.sleep} values={series((h) => h.sleepHours)} />
      </div>
      {avgSteps !== undefined && <p class="muted small">Gemiddeld {avgSteps.toLocaleString('nl-BE')} stappen per dag.</p>}

      {back === 0 && report.nextWeek && (
        <>
          <h2>Volgende week</h2>
          <ul class="plain">
            {report.nextWeek
              .filter((d) => d.sweat)
              .map((d) => (
                <li key={d.date}>
                  <strong>{DAY_SHORT[dayIndex(d.date)]}</strong> {d.title}
                </li>
              ))}
          </ul>
        </>
      )}

      {coachMd && (
        <>
          <h2>Je coachsessie</h2>
          <div class="card">
            <Markdown text={coachMd} />
          </div>
        </>
      )}

      <button class="btn ghost small" onClick={() => setTables(!tables)}>
        {tables ? 'Verberg tabellen' : 'Toon als tabel'}
      </button>
      {tables && (
        <div class="stack">
          <DataTable head={['Oefening', ...new Set(report.trend.flatMap((t) => t.points.map((p) => p.week.slice(5))))]} rows={report.trend.map((t) => [t.name, ...t.points.map((p) => Math.round(p.e1rm * 10) / 10)])} />
          <DataTable head={['Spiergroep', 'Sets']} rows={volume.map((v) => [v.label, v.value])} />
          <DataTable
            head={['Dag', 'Slaap (u)', 'HRV', 'Rust']}
            rows={last28.slice(-7).map((d) => {
              const h = health.find((x) => x.date === d);
              return [`${DAY_SHORT[dayIndex(d)]} ${d.slice(8)}/${d.slice(5, 7)}`, h?.sleepHours ?? '–', h?.hrvMs ?? '–', h?.restingHr ?? '–'];
            })}
          />
        </div>
      )}
    </>
  );
}
