import { useEffect, useRef, useState } from 'preact/hooks';
import { alternativesFor, getExercise, videoUrl } from '../../coach/catalog.ts';
import { acceptableFor } from '../../coach/injury.ts';
import { formatLoad, isAvailable } from '../../coach/loads.ts';
import { activeAdjustments } from '../../coach/planner.ts';
import { buildPrescription, templateTitle, warmupFor, type SessionContext } from '../../coach/session.ts';
import type { Feel } from '../../coach/types.ts';
import { weekStart } from '../../coach/dates.ts';
import { defaultProfile, store } from '../../data/store.ts';
import {
  addSet,
  adjustReps,
  allGroups,
  completeSet,
  extendRest,
  finishItem,
  finishWorkout,
  isFinished,
  itemMs,
  itemStatus,
  skipRest,
  startItem,
  stopItem,
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
import { Elapsed, HoldTimer, IntervalTimer } from '../IntervalTimer.tsx';
import { clock } from '../../coach/timer.ts';
import { go } from '../router.ts';
import { cancelBeep, scheduleBeep } from '../sound.ts';

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
  const overSec = Math.max(0, (now - rest.until) / 1000);
  return (
    <div class={`restbar ${over ? 'over' : ''}`} role="timer" aria-live="polite">
      <div class="restbar-fill" style={{ width: `${pct}%` }} />
      <div class="restbar-row">
        <span class="restbar-time">{over ? `Volgende set! +${clock(overSec)}` : clock(left)}</span>
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

/** Begeleide opwarming: een timer die zelf doorloopt, met een piepje bij elke wissel. */
function Warmup(props: { w: WorkoutState }) {
  const steps = warmupFor(props.w.template);
  const [step, setStep] = useState(-1);
  const [startedAt, setStartedAt] = useState(0);
  const now = useNow(250, step >= 0);
  const total = steps.reduce((n, x) => n + x.seconds, 0);
  const cur = steps[step];
  const left = cur ? Math.max(0, Math.ceil((startedAt + cur.seconds * 1000 - now) / 1000)) : 0;
  const finish = () => {
    cancelBeep();
    act((w) => ({ ...w, warmupDone: true }));
  };
  const go = (k: number) => {
    if (k >= steps.length) return finish();
    setStep(k);
    setStartedAt(Date.now());
    scheduleBeep(steps[k]!.seconds);
  };
  useEffect(() => {
    if (cur && left === 0) {
      try {
        navigator.vibrate?.(200);
      } catch {
        /* geen trilling */
      }
      go(step + 1);
    }
  }, [left, step]);

  if (step < 0) {
    return (
      <section class="card warmup">
        <h2>Opwarming · {Math.round(total / 60)} min</h2>
        <ol class="steps">
          {steps.map((x) => (
            <li key={x.title}>
              {x.title} <span class="muted small">({x.seconds >= 60 ? `${x.seconds / 60} min` : `${x.seconds} s`})</span>
            </li>
          ))}
        </ol>
        <p class="muted small">Daarna 1–2 lichte opwarmsets van je eerste oefening.</p>
        <button class="btn primary huge" onClick={() => go(0)}>
          Start opwarming
        </button>
        <button class="btn ghost small" onClick={finish}>
          Overslaan
        </button>
      </section>
    );
  }
  return (
    <section class="card warmup" role="timer" aria-live="polite">
      <p class="muted small">
        Opwarming {step + 1}/{steps.length}
      </p>
      <h2>{cur!.title}</h2>
      {cur!.how && <p>{cur!.how}</p>}
      <p class="warmup-time">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </p>
      {steps[step + 1] && <p class="muted small">Hierna: {steps[step + 1]!.title.toLowerCase()}</p>}
      <div class="row">
        <button class="btn" onClick={() => go(step + 1)}>
          Volgende
        </button>
        <button class="btn ghost" onClick={finish}>
          Klaar
        </button>
      </div>
    </section>
  );
}

function ItemCard(props: { w: WorkoutState; i: number }) {
  const { w, i } = props;
  const it: WorkoutItem = w.items[i]!;
  const ex = getExercise(it.exerciseId);
  const p = it.prescription;
  const [tips, setTips] = useState(false);
  const [showDemo, setShowDemo] = useState(true);
  const [other, setOther] = useState<'more' | 'less' | null>(null);
  const [wheel, setWheel] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Set waarvan de afteltimer loopt (oefeningen op tijd). */
  const [hold, setHold] = useState<number | null>(null);
  const profile = store.profile() ?? defaultProfile();
  const allDone = it.sets.every((s) => s.done);
  /** Vraag "hoe ging het?": na de laatste set, of na ■ Stop als je al sets deed. */
  const askFeel = !it.feel && (allDone || (!!it.stopped && it.sets.some((s) => s.done)));
  const current = it.sets[0]?.load ?? p.load;
  /** Gewichten net boven of onder het voorstel (enkel wat in Jims bestaat). */
  const nearby = (dir: 'more' | 'less') => {
    const opts = it.options;
    return dir === 'more' ? opts.filter((o) => o > current + 1e-9).slice(0, 4) : opts.filter((o) => o < current - 1e-9).slice(-4).reverse();
  };

  const tick = (k: number) => {
    setHold(null);
    act((cur) => {
      const set = cur.items[i]?.sets[k];
      if (!set) return cur;
      if (set.done) return undoSet(cur, i, k);
      const next = completeSet(cur, i, k, Date.now());
      if (next.rest && next.rest !== cur.rest) scheduleBeep(cur.items[i]!.prescription.restSec);
      else cancelBeep();
      return next;
    });
  };
  const startHold = (k: number) => {
    if (w.rest) act(skipRest);
    setHold(k);
  };

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
        {p.test && <span class="pill green">💪 Krachtcheck</span>}
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

      {ex.load === 'bodyweight' ? (
        <p class="load-banner">Lichaamsgewicht</p>
      ) : (
        <p class="load-banner">
          <span class="muted small">{p.change === 'new' ? 'Startvoorstel' : 'Gewicht'}</span> {formatLoad(ex, it.sets[0]?.load ?? p.load)}
        </p>
      )}

      <div class="sets">
        {it.sets.map((s, k) => (
          <div key={k} class={`set noload ${s.done ? 'done' : ''}`}>
            <span class="set-n">{k + 1}</span>
            {s.done ? (
              <span class="set-reps">
                {s.reps}
                {ex.timed ? ' s' : ''}
              </span>
            ) : hold === k ? (
              <HoldTimer seconds={s.reps} perSide={!!ex.unilateral} onDone={() => tick(k)} onCancel={() => setHold(null)} />
            ) : ex.timed ? (
              <div class="set-mid">
                <Stepper value={s.reps} onChange={(d) => act((cur) => adjustReps(cur, i, k, d))} label={`Seconden set ${k + 1}`} />
                <button class="btn small play" onClick={() => startHold(k)} aria-label={`Timer set ${k + 1} starten`}>
                  ▶
                </button>
              </div>
            ) : (
              <Stepper value={s.reps} onChange={(d) => act((cur) => adjustReps(cur, i, k, d))} label={`Reps set ${k + 1}`} />
            )}
            <button class={`check ${s.done ? 'on' : ''}`} onClick={() => tick(k)} aria-label={s.done ? `Set ${k + 1} ongedaan maken` : `Set ${k + 1} gedaan`}>
              ✓
            </button>
          </div>
        ))}
      </div>

      {askFeel && ex.load === 'bodyweight' && (
        <div class="feel">
          <h3>Hoe ging het?</h3>
          <div class="row">
            {([['good', '✓ Gelukt'], ['light', 'Te makkelijk'], ['hard', 'Te zwaar']] as [Feel, string][]).map(([f, label]) => (
              <button key={f} class={`btn ${f === 'good' ? 'primary' : ''}`} onClick={() => { cancelBeep(); act((cur) => finishItem(cur, i, f)); }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {askFeel && ex.load !== 'bodyweight' && (
        <div class="feel">
          <h3>Hoe ging het met {formatLoad(ex, it.sets[0]?.load ?? p.load)}?</h3>
          {other === null ? (
            <div class="stack">
              <button class="btn primary" onClick={() => { cancelBeep(); act((cur) => finishItem(cur, i, 'good')); }}>
                ✓ Gelukt
              </button>
              <div class="row">
                <button class="btn" onClick={() => setOther('more')}>⬆ Ik nam meer</button>
                <button class="btn" onClick={() => setOther('less')}>⬇ Ik nam minder</button>
              </div>
            </div>
          ) : (
            <div>
              <p class="muted small">Hoeveel nam je?</p>
              <div class="chips wrap">
                {nearby(other).map((v) => (
                  <button key={v} class="chip" onClick={() => { cancelBeep(); setOther(null); act((cur) => finishItem(cur, i, 'good', v)); }}>
                    {formatLoad(ex, v)}
                  </button>
                ))}
                <button class="chip" onClick={() => setWheel(true)}>Ander…</button>
              </div>
              <button class="btn ghost small" onClick={() => setOther(null)}>Terug</button>
            </div>
          )}
        </div>
      )}
      {it.feel && <p class="muted small">✓ Bewaard{it.sets[0] && ex.load !== 'bodyweight' ? `: ${formatLoad(ex, it.sets[0].load)}` : ''}</p>}

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
        open={wheel}
        options={it.options}
        value={it.sets[0]?.load ?? p.load}
        format={(v) => formatLoad(ex, v)}
        onPick={(v) => {
          cancelBeep();
          setOther(null);
          act((cur) => finishItem(cur, i, 'good', v));
        }}
        onClose={() => setWheel(false)}
      />

      <Sheet open={busy} onClose={() => setBusy(false)} title="Kies een alternatief">
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
  return (
    <>
      <h1>Klaar! 💪</h1>
      <div class="card">
        <p>
          <strong>{sum.exercises}</strong> oefeningen · <strong>{sum.sets}</strong> sets · <strong>{minutes}</strong> min
        </p>
        {sum.volume > 0 && <p class="muted">Totaal verzet: {sum.volume.toLocaleString('nl-BE')} kg</p>}
      </div>
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
      <button class="btn ghost" onClick={() => act((cur) => ({ ...cur, index: 0, open: false }))}>
        Terug naar de oefeningen
      </button>
    </>
  );
}

const minutesText = (ms: number) => (ms >= 60_000 ? `${Math.round(ms / 60_000)} min` : clock(ms / 1000));

/** Eén oefening als compacte regel in de lijst. */
function Row(props: { w: WorkoutState; i: number }) {
  const it = props.w.items[props.i]!;
  const ex = getExercise(it.exerciseId);
  const p = it.prescription;
  const status = itemStatus(it);
  const done = it.sets.filter((x) => x.done);
  const load = ex.load === 'bodyweight' ? '' : ` · ${formatLoad(ex, it.sets[0]?.load ?? p.load)}`;
  const unit = (n: number) => (ex.timed ? `${n} s` : `${n}`);
  const line =
    status === 'klaar'
      ? `${done.length}×${unit(done[0]?.reps ?? p.targetReps)}${load}${itemMs(it, Date.now()) >= 1000 ? ` · ${minutesText(itemMs(it, Date.now()))}` : ''}`
      : status === 'bezig'
        ? `${done.length}/${it.sets.length} sets${load}`
        : `${it.sets.length}×${unit(p.targetReps)}${ex.unilateral ? '/kant' : ''}${load}`;
  return (
    <div class="wrow">
      <Thumb id={ex.id} />
      <span class="wrow-text">
        <span class="wrow-name">
          {it.superset && <span class="pill">{it.superset}</span>} {ex.name}
        </span>
        <span class="muted small">{line}</span>
      </span>
    </div>
  );
}

/** Een oefening (of superset-paar) in de lijst: dicht met ▶ Start, of open met de sets en ■ Stop. */
function Group(props: { w: WorkoutState; g: number[]; next: boolean; quiet: boolean }) {
  const { w, g, next } = props;
  const open = !!w.open && g.includes(w.index);
  const ref = useRef<HTMLLIElement>(null);
  useNow(1000, open);
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'start' });
  }, [open]);
  const items = g.map((i) => w.items[i]!);
  const status = items.every((it) => itemStatus(it) === 'klaar') ? 'klaar' : items.some((it) => itemStatus(it) !== 'todo') ? 'bezig' : 'todo';
  const names = items.map((it) => getExercise(it.exerciseId).name).join(' + ');
  const start = () => act((cur) => startItem(cur, g[0]!, Date.now()));

  if (open) {
    return (
      <li ref={ref} class="wgroup open">
        <div class="wactive">
          <span class="elapsed" role="timer" aria-label={`Tijd op ${names}`}>
            ⏱ {clock(itemMs(items[0]!, Date.now()) / 1000)}
          </span>
          <span class="muted small" />
          <button
            class="btn small"
            onClick={() => {
              cancelBeep();
              act((cur) => stopItem(cur, g[0]!, Date.now()));
            }}
          >
            ■ Stop
          </button>
        </div>
        {g.map((i) => (
          <ItemCard key={`${i}-${w.items[i]!.exerciseId}`} w={w} i={i} />
        ))}
      </li>
    );
  }
  return (
    <li ref={ref} class={`wgroup ${status} ${next ? 'next' : ''}`}>
      <div class="wrows">
        {g.map((i) => (
          <Row key={i} w={w} i={i} />
        ))}
      </div>
      {status === 'klaar' ? (
        <button class="btn small ghost wcheck" onClick={start} aria-label={`${names}: klaar. Tik om te openen`}>
          ✓
        </button>
      ) : (
        <button class={`btn wstart ${next && !props.quiet ? 'primary' : ''}`} onClick={start} aria-label={`${names} starten`}>
          ▶ {status === 'bezig' ? 'Verder' : 'Start'}
        </button>
      )}
    </li>
  );
}

/** Je hele training als lijst: per oefening ▶ Start en ■ Stop, in de volgorde die jij wil. */
export function Workout() {
  const s = useStore();
  const w = s.workout;
  const [stop, setStop] = useState(false);
  useWakeLock(!!w);
  if (!w) return null;
  if (isFinished(w)) return <Finish w={w} />;
  const groups = allGroups(w);
  const isDone = (g: number[]) => g.every((i) => itemStatus(w.items[i]!) === 'klaar');
  const doneN = groups.filter(isDone).length;
  const started = w.items.some((it) => it.sets.some((x) => x.done) || it.clock);
  const warmup = !w.warmupDone && !started;
  const next = w.open ? undefined : groups.find((g) => !isDone(g));
  const finisher = w.finisher;

  return (
    <div class={`workout ${w.rest ? 'resting' : ''}`}>
      <div class="row-between workout-head">
        <div>
          <h1>{templateTitle(w.template)}</h1>
          <p class="muted">
            {doneN}/{groups.length} klaar · <Elapsed since={w.startedAt} />
          </p>
        </div>
        <button class="btn small ghost" onClick={() => setStop(true)}>
          Stop
        </button>
      </div>
      <div class="wprogress" aria-hidden="true">
        <div style={{ width: `${(doneN / Math.max(1, groups.length)) * 100}%` }} />
      </div>

      {warmup && <Warmup w={w} />}

      <ol class="wlist">
        {groups.map((g) => (
          <Group key={`${g[0]}-${w.items[g[0]!]!.exerciseId}`} w={w} g={g} next={g === next} quiet={warmup} />
        ))}
      </ol>

      {finisher && (
        <section class="card">
          <h3>{finisher.title}</h3>
          {finisher.blocks ? (
            <IntervalTimer id={`${w.id}-afsluiter`} blocks={finisher.blocks} steps={finisher.steps} />
          ) : (
            <ul class="steps">
              {finisher.steps.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <button
        class={`btn ${doneN === groups.length ? 'primary huge' : 'ghost'}`}
        onClick={() => {
          cancelBeep();
          act((cur) => finishWorkout(cur, Date.now()));
        }}
      >
        🏁 Training afronden{doneN < groups.length && started ? ` (${groups.length - doneN} niet gedaan)` : ''}
      </button>

      <RestBar w={w} />
      <Sheet open={stop} onClose={() => setStop(false)} title="Training stoppen?">
        <div class="stack">
          <button
            class="btn primary"
            onClick={() => {
              setStop(false);
              act((cur) => finishWorkout(cur, Date.now()));
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
