import { useState } from 'preact/hooks';
import { alternativesFor, getExercise, videoUrl } from '../../coach/catalog.ts';
import { acceptableFor } from '../../coach/injury.ts';
import { formatLoad, isAvailable, kg, platesPerSide } from '../../coach/loads.ts';
import { activeAdjustments } from '../../coach/planner.ts';
import { buildPrescription, type SessionContext } from '../../coach/session.ts';
import type { Feel } from '../../coach/types.ts';
import { weekStart } from '../../coach/dates.ts';
import { defaultProfile, store } from '../../data/store.ts';
import {
  addSet,
  adjustReps,
  completeSet,
  currentGroup,
  extendRest,
  groupDone,
  isFinished,
  nextGroup,
  prevGroup,
  setFeel,
  setLoad,
  skipRest,
  summary,
  swapItem,
  toSessionLog,
  undoSet,
  type WorkoutItem,
  type WorkoutState,
} from '../../data/workout.ts';
import { Sheet, Stepper, WeightWheel } from '../components.tsx';
import { ExerciseDemo, Thumb } from '../Demo.tsx';
import { useNow, useStore, useWakeLock } from '../hooks.ts';
import { go } from '../router.ts';
import { cancelBeep, scheduleBeep } from '../sound.ts';

const FEELS: { value: Feel; label: string }[] = [
  { value: 'light', label: 'Te licht' },
  { value: 'good', label: 'Goed' },
  { value: 'hard', label: 'Zwaar' },
];

function ctxFor(w: WorkoutState): SessionContext {
  const p = store.profile() ?? defaultProfile();
  return {
    date: w.date,
    template: w.template,
    location: w.location,
    minutes: w.minutes,
    history: store.sessions(),
    equipment: p.equipment,
    gym: p.gym,
    readiness: w.readiness,
    deload: w.deload,
    injuries: store.injuries(),
    adjustments: activeAdjustments(store.adjustments(), weekStart(w.date)),
  };
}

const act = (fn: (w: WorkoutState) => WorkoutState) => void store.updateWorkout(fn);

function RestBar(props: { w: WorkoutState }) {
  const now = useNow(250, !!props.w.rest);
  const rest = props.w.rest;
  if (!rest) return null;
  const left = Math.max(0, Math.ceil((rest.until - now) / 1000));
  const total = Math.max(1, (rest.until - rest.startedAt) / 1000);
  const pct = Math.min(100, ((total - left) / total) * 100);
  const over = left === 0;
  return (
    <div class={`restbar ${over ? 'over' : ''}`} role="timer" aria-live="polite">
      <div class="restbar-fill" style={{ width: `${pct}%` }} />
      <div class="restbar-row">
        <span class="restbar-time">{over ? 'Volgende set!' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</span>
        <button
          class="btn small"
          onClick={() => {
            act((w) => {
              const next = extendRest(w, 30);
              if (next.rest) scheduleBeep(Math.max(0, (next.rest.until - Date.now()) / 1000));
              return next;
            });
          }}
        >
          +30 s
        </button>
        <button
          class="btn small"
          onClick={() => {
            cancelBeep();
            act(skipRest);
          }}
        >
          {over ? 'OK' : 'Overslaan'}
        </button>
      </div>
    </div>
  );
}

function ItemCard(props: { w: WorkoutState; i: number }) {
  const { w, i } = props;
  const it: WorkoutItem = w.items[i]!;
  const ex = getExercise(it.exerciseId);
  const p = it.prescription;
  const [tips, setTips] = useState(false);
  const [showDemo, setShowDemo] = useState(true);
  const [wheelFor, setWheelFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const profile = store.profile() ?? defaultProfile();
  const allDone = it.sets.every((s) => s.done);

  const tick = (k: number) =>
    act((cur) => {
      const set = cur.items[i]?.sets[k];
      if (!set) return cur;
      if (set.done) return undoSet(cur, i, k);
      const next = completeSet(cur, i, k, Date.now());
      if (next.rest && next.rest !== cur.rest) scheduleBeep(cur.items[i]!.prescription.restSec);
      else cancelBeep();
      return next;
    });

  const alternatives = busy
    ? alternativesFor(ex.id, w.location)
        .filter((a) => isAvailable(a, w.location, profile.equipment, profile.gym) && acceptableFor(a, store.injuries()))
        .slice(0, 6)
        .map((a) => ({ ...buildPrescription(a, it.role, ctxFor(w), Math.max(1, it.sets.filter((s) => !s.done).length)), role: it.role }))
    : [];

  return (
    <section class="card item">
      <div class="row-between">
        <h2 class="item-name">
          {it.superset && <span class="pill">{it.superset}</span>} {ex.name}
        </h2>
      </div>
      {showDemo && <ExerciseDemo id={ex.id} />}
      <p class="muted small">
        {p.sets} × {ex.timed ? `${p.targetReps} s` : `${p.targetReps} reps`}
        {ex.unilateral ? ' per kant' : ''} · bereik {p.repRange[0]}–{p.repRange[1]} · rust {p.restSec} s
        {p.tempo ? ` · tempo ${p.tempo} (3 s zakken)` : ''}
        {p.pauseSec ? ` · ${p.pauseSec} s pauze onderaan` : ''}
      </p>
      <p class="note">{p.note}</p>
      {it.injuryNote && <p class="note warn">{it.injuryNote}</p>}

      <div class="sets">
        {it.sets.map((s, k) => (
          <div key={k} class={`set ${s.done ? 'done' : ''}`}>
            <span class="set-n">{k + 1}</span>
            {ex.load === 'bodyweight' ? (
              <span class="set-load muted">lichaamsgewicht</span>
            ) : (
              <button class="set-load" onClick={() => setWheelFor(k)} disabled={s.done} aria-label={`Gewicht set ${k + 1}`}>
                {formatLoad(ex, s.load)}
              </button>
            )}
            {s.done ? (
              <span class="set-reps">{s.reps}</span>
            ) : (
              <Stepper value={s.reps} onChange={(d) => act((cur) => adjustReps(cur, i, k, d))} label={`Reps set ${k + 1}`} />
            )}
            <button class={`check ${s.done ? 'on' : ''}`} onClick={() => tick(k)} aria-label={s.done ? `Set ${k + 1} ongedaan maken` : `Set ${k + 1} gedaan`}>
              ✓
            </button>
          </div>
        ))}
      </div>

      {allDone && !it.feel && (
        <div class="feel">
          <h3>Hoe voelde het?</h3>
          <div class="row">
            {FEELS.map((f) => (
              <button
                key={f.value}
                class={`btn ${f.value === 'good' ? 'primary' : ''}`}
                onClick={() => {
                  cancelBeep();
                  act((cur) => {
                    let next = setFeel(cur, i, f.value);
                    const ready = groupDone(next) && currentGroup(next).every((g) => next.items[g]!.feel);
                    if (ready) next = nextGroup(next);
                    return next;
                  });
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {it.feel && <p class="muted small">Gevoel: {FEELS.find((f) => f.value === it.feel)?.label}</p>}

      <div class="row tools">
        <button class="btn small" onClick={() => setTips(!tips)} aria-expanded={tips}>
          ⓘ Uitleg
        </button>
        <button class="btn small" onClick={() => setBusy(true)}>
          {w.location === 'gym' ? 'Toestel bezet' : 'Andere oefening'}
        </button>
        <button class="btn small" onClick={() => act((cur) => addSet(cur, i))}>
          + set
        </button>
      </div>
      {tips && (
        <div class="tips">
          {ex.setup && (
            <p>
              <strong>Toestel:</strong> {ex.setup}
            </p>
          )}
          <ul>
            {ex.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <div class="row">
            <a href={videoUrl(ex)} target="_blank" rel="noopener">
              ▶ Uitlegvideo
            </a>
            <button class="link" onClick={() => setShowDemo(!showDemo)}>
              {showDemo ? "Verberg foto's" : "Toon foto's"}
            </button>
          </div>
        </div>
      )}

      <WeightWheel
        open={wheelFor !== null}
        options={it.options}
        value={wheelFor !== null ? it.sets[wheelFor]!.load : p.load}
        format={(v) => formatLoad(ex, v)}
        detail={(v) => {
          if (w.location !== 'home') return undefined;
          const plates = platesPerSide(ex, v, profile.equipment);
          return plates && plates.length ? `per kant: ${plates.map((x) => kg(x)).join(' + ')}` : undefined;
        }}
        onPick={(v) => act((cur) => setLoad(cur, i, wheelFor ?? 0, v))}
        onClose={() => setWheelFor(null)}
      />

      <Sheet open={busy} onClose={() => setBusy(false)} title="Kies een alternatief">
        <p class="muted small">Zelfde spiergroep. Gedane sets blijven bewaard.</p>
        <div class="stack">
          {alternatives.map((a) => (
            <button
              key={a.exercise.id}
              class="btn alt"
              onClick={() => {
                act((cur) => swapItem(cur, i, { ...a, role: it.role }));
                setBusy(false);
              }}
            >
              <Thumb id={a.exercise.id} />
              <span class="alt-text">
                <span>{a.exercise.name}</span>
                <span class="muted small">
                  {a.prescription.sets}×{a.prescription.targetReps} · {formatLoad(a.exercise, a.prescription.load)}
                </span>
              </span>
            </button>
          ))}
          {alternatives.length === 0 && <p>Geen alternatief beschikbaar hier.</p>}
        </div>
      </Sheet>
    </section>
  );
}

function Finish(props: { w: WorkoutState }) {
  const w = props.w;
  const sum = summary(w);
  const minutes = Math.round((Date.now() - new Date(w.startedAt).getTime()) / 60000);
  const finisher = w.finisher;
  return (
    <>
      <h1>Klaar! 💪</h1>
      <div class="card">
        <p>
          <strong>{sum.exercises}</strong> oefeningen · <strong>{sum.sets}</strong> sets · <strong>{minutes}</strong> min
        </p>
        {sum.volume > 0 && <p class="muted">Totaal verzet: {sum.volume.toLocaleString('nl-BE')} kg</p>}
      </div>
      {finisher && (
        <div class="card">
          <h3>{finisher.title}</h3>
          <ul class="steps">
            {finisher.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      <button
        class="btn primary huge"
        onClick={async () => {
          cancelBeep();
          await store.logSession(toSessionLog(w, new Date()));
          await store.setWorkout(undefined);
          go('vandaag');
        }}
      >
        Bewaar training
      </button>
      <button class="btn ghost" onClick={() => act((cur) => prevGroup({ ...cur, index: cur.items.length }))}>
        Terug naar de laatste oefening
      </button>
    </>
  );
}

export function Workout() {
  const s = useStore();
  const w = s.workout;
  const [stop, setStop] = useState(false);
  useWakeLock(!!w);
  if (!w) {
    return (
      <>
        <h1>Geen training bezig</h1>
        <button class="btn primary" onClick={() => go('vandaag')}>
          Naar vandaag
        </button>
      </>
    );
  }
  if (isFinished(w)) return <Finish w={w} />;
  const group = currentGroup(w);
  const total = w.items.length;

  return (
    <div class="workout">
      <div class="row-between workout-top">
        <button class="btn small ghost" disabled={w.index === 0} onClick={() => act(prevGroup)} aria-label="Vorige oefening">
          ←
        </button>
        <span class="muted">
          {group.length > 1 ? 'Superset' : 'Oefening'} {group[0]! + 1}/{total}
        </span>
        <button class="btn small ghost" onClick={() => setStop(true)}>
          Stop
        </button>
      </div>
      {group.map((i) => (
        <ItemCard key={`${i}-${w.items[i]!.exerciseId}`} w={w} i={i} />
      ))}
      {groupDone(w) && group.every((g) => w.items[g]!.feel) && (
        <button class="btn primary huge" onClick={() => act(nextGroup)}>
          Volgende
        </button>
      )}
      {!groupDone(w) && (
        <button class="btn ghost small" onClick={() => act(nextGroup)}>
          Oefening overslaan
        </button>
      )}
      <RestBar w={w} />
      <Sheet open={stop} onClose={() => setStop(false)} title="Training stoppen?">
        <div class="stack">
          <button
            class="btn primary"
            onClick={() => {
              setStop(false);
              act((cur) => ({ ...cur, index: cur.items.length, rest: undefined }));
            }}
          >
            Afronden en bewaren
          </button>
          <button
            class="btn danger"
            onClick={async () => {
              cancelBeep();
              setStop(false);
              await store.setWorkout(undefined);
              go('vandaag');
            }}
          >
            Weggooien (niet bewaren)
          </button>
        </div>
      </Sheet>
    </div>
  );
}
