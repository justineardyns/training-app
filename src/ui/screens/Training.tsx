import { useState } from 'preact/hooks';
import { dayName } from '../../coach/dates.ts';
import { CLASS_MINUTES, hourText } from '../../coach/planner.ts';
import type { CardioSession, StrengthSession } from '../../coach/session.ts';
import { clock } from '../../coach/timer.ts';
import type { Minutes } from '../../coach/types.ts';
import { newId, type FreeCardioKind, type FreeCardioRun, type Store } from '../../data/store.ts';
import { startWorkout } from '../../data/workout.ts';
import { Chips } from '../components.tsx';
import { useNow, useStore } from '../hooks.ts';
import { IntervalTimer } from '../IntervalTimer.tsx';
import { go } from '../router.ts';
import { cancelBeep, scheduleBeep } from '../sound.ts';
import { StrengthPreview } from './Today.tsx';
import { Workout } from './Workout.tsx';

// Tab "Training": alles voor je training van vandaag op één plek. Kracht als lijst met ▶ Start / ■ Stop
// per oefening; indoor cycling zonder timer (altijd 1 uur); losse cardio (bv. buiten lopen) met een stopwatch.

/** Krachttraining van vandaag starten (ook vanop Vandaag). */
export async function startStrength(s: Store, session: StrengthSession) {
  await s.setWorkout(startWorkout(session, { id: newId(), now: s.now(), readiness: s.checkFor(s.today())?.level }));
  go('training');
}

const FREE: Record<FreeCardioKind, { label: string; title: string; where: 'home' | 'gym' }> = {
  lopen: { label: '🏃 Lopen', title: 'Lopen', where: 'home' },
  fietsen: { label: '🚴 Fietsen', title: 'Fietsen', where: 'home' },
  roeien: { label: '🚣 Roeien', title: 'Roeien', where: 'gym' },
};

const runMs = (r: FreeCardioRun) => r.ms + (r.since !== undefined ? Math.max(0, Date.now() - r.since) : 0);

/** Losse cardio met een stopwatch: Start, Pauze, Stop en bewaar. Telt als conditie. */
export function FreeCardio(props: { title: string; targetMin: number }) {
  const s = useStore();
  const run = s.local.freeCardio;
  const [kind, setKind] = useState<FreeCardioKind>('lopen');
  const running = !!run && run.since !== undefined;
  useNow(500, running);
  const target = props.targetMin * 60;
  const set = (r: FreeCardioRun | undefined) => s.setLocal({ freeCardio: r });
  const beepAt = (elapsedSec: number) => (elapsedSec < target ? scheduleBeep(target - elapsedSec) : cancelBeep());

  if (!run) {
    const wx = s.todayPlan().weather;
    return (
      <div class="card free-cardio">
        <h3>{props.title}</h3>
        <p class="muted small">
          Start de stopwatch en tik op Stop als je klaar bent: dan telt het als conditie.
          {wx ? ` Weer: ${wx.icon} ${Math.round(wx.tMax)}°, ${wx.precipProb}% kans op regen.` : ''}
        </p>
        <Chips<FreeCardioKind> label="Wat doe je?" options={Object.entries(FREE).map(([value, f]) => ({ value: value as FreeCardioKind, label: f.label }))} value={kind} onChange={setKind} />
        <button
          class="btn primary"
          onClick={() => {
            void set({ date: s.today(), kind, ms: 0, since: Date.now() });
            beepAt(0);
          }}
        >
          ▶ Start {FREE[kind].title.toLowerCase()}
        </button>
      </div>
    );
  }

  const sec = runMs(run) / 1000;
  const f = FREE[run.kind];
  return (
    <div class={`card itimer easy ${running ? '' : 'paused'}`} role="timer" aria-live="off">
      <p class="muted small row-between">
        <span>{f.label}</span>
        <span>doel {props.targetMin} min</span>
      </p>
      <p class="itimer-time">{clock(sec)}</p>
      <div class="itimer-bar" aria-hidden="true">
        <div class="itimer-fill" style={{ width: `${Math.min(100, (sec / target) * 100)}%` }} />
      </div>
      <p class="muted small">{sec >= target ? 'Doel gehaald! Stop wanneer je wil.' : running ? 'Scherm mag uit: de tijd loopt gewoon door.' : 'Gepauzeerd.'}</p>
      <div class="row">
        <button
          class="btn"
          onClick={() => {
            if (running) {
              cancelBeep();
              void set({ ...run, ms: runMs(run), since: undefined });
            } else {
              void set({ ...run, since: Date.now() });
              beepAt(sec);
            }
          }}
        >
          {running ? '⏸ Pauze' : '▶ Verder'}
        </button>
        <button
          class="btn primary"
          onClick={async () => {
            cancelBeep();
            await s.quickLog(run.date, 'cardio', f.where, Math.max(1, Math.round(sec / 60)), f.title);
            await set(undefined);
          }}
        >
          ■ Stop en bewaar
        </button>
      </div>
      <button
        class="btn ghost small"
        onClick={() => {
          cancelBeep();
          void set(undefined);
        }}
      >
        Weggooien
      </button>
    </div>
  );
}

/** Conditie zonder les (fiets of roeier in Jims): met een timer per blok. */
function CardioOptions(props: { session: CardioSession; minutes: Minutes; onMinutes: (m: Minutes) => void }) {
  const s = useStore();
  const today = s.today();
  const { session } = props;
  return (
    <>
      {session.options.map((o, idx) => (
        <div class="card" key={o.title}>
          <h2>
            {idx > 0 && <span class="muted small">of </span>}
            {o.title}
          </h2>
          {o.blocks ? (
            <IntervalTimer id={`${today}-${o.title}`} blocks={o.blocks} steps={o.steps} doneText="Tik hieronder op Gedaan ✓: dan telt het mee." />
          ) : (
            <ul class="steps">
              {o.steps.map((st) => (
                <li key={st}>{st}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <div class="card">
        <Chips<Minutes>
          label="Hoelang?"
          options={[
            { value: 30, label: '30 min' },
            { value: 45, label: '45 min' },
            { value: 60, label: '60 min' },
          ]}
          value={props.minutes}
          onChange={props.onMinutes}
        />
        <button class="btn primary huge" onClick={() => s.quickLog(today, 'cardio', session.location, props.minutes, session.options[0]!.title)}>
          Gedaan ✓
        </button>
      </div>
    </>
  );
}

export function Training() {
  const s = useStore();
  const today = s.today();
  const day = s.todayPlan();
  const [minutes, setMinutes] = useState<Minutes>(day.minutes ?? 45);
  if (s.workout) return <Workout />;

  const planned = day.sweat && day.status === 'planned';
  const session = planned ? (s.sessionFor(day.type === 'cardio' && !day.groupClass ? { ...day, minutes } : day) as StrengthSession | CardioSession | undefined) : undefined;
  const sick = s.illness().status === 'rest';
  const free = s.local.freeCardio;
  const className = s.prefs().className;
  const next = s.plan().days.find((d) => d.date > today && d.sweat && d.status === 'planned');

  let main;
  if (sick) {
    main = (
      <div class="card">
        <h2>Rust 🤒</h2>
        <p>Ziek is ziek: geen training tot je beter bent. Tik op Vandaag op "Genezen" als het weer gaat.</p>
      </div>
    );
  } else if (day.status === 'done') {
    main = (
      <div class="card done">
        <h2>✓ {day.title}</h2>
        <p>Vandaag al gedaan. Goed bezig! Nu herstellen: eten, drinken, slapen.</p>
      </div>
    );
  } else if (session?.kind === 'strength') {
    main = (
      <div class="card today-card">
        <h2>{day.title}</h2>
        {day.why && <p class="why">{day.why}</p>}
        <StrengthPreview session={session} />
        <button class="btn primary huge" onClick={() => startStrength(s, session)}>
          ▶ Start training
        </button>
        <p class="muted small">Daarna tik je bij elke oefening op ▶ Start en ■ Stop, in de volgorde die jij wil.</p>
      </div>
    );
  } else if (session?.kind === 'cardio' && day.groupClass) {
    main = (
      <div class="card today-card">
        <h2>
          🚴 {className}
          {day.time ? ` · ${hourText(day.time)}` : ''} · 1 uur
        </h2>
        {day.why && <p class="why">{day.why}</p>}
        <ul class="steps">
          {session.options[0]!.steps.map((st) => (
            <li key={st}>{st}</li>
          ))}
        </ul>
        <button class="btn primary huge" onClick={() => s.quickLog(today, 'class', 'gym', CLASS_MINUTES, className)}>
          ✓ Les gedaan
        </button>
        <p class="muted small">Geen timer nodig: de lesgever geeft het tempo aan.</p>
      </div>
    );
  } else if (session?.kind === 'cardio') {
    main = (
      <>
        <h2>{session.title}</h2>
        {day.why && <p class="why">{day.why}</p>}
        <CardioOptions session={session} minutes={minutes} onMinutes={setMinutes} />
      </>
    );
  } else if (day.type === 'tennis' && day.status === 'planned') {
    main = (
      <div class="card today-card">
        <h2>🎾 {day.title}</h2>
        <p class="why">Geen timer nodig. Tik na het spelen op "Tennis gedaan".</p>
        <button class="btn primary huge" onClick={() => s.quickLog(today, 'cardio', 'gym', day.minutes ?? 60, 'Tennis')}>
          Tennis gedaan ✓
        </button>
      </div>
    );
  } else {
    main = (
      <div class="card">
        <h2>Geen training vandaag</h2>
        <p>{day.light ? `${day.light.title}: rust is ook trainen.` : 'Rustdag: rust is ook trainen.'}</p>
        {next && (
          <p class="muted">
            Volgende: {dayName(next.date)} · {next.title}
          </p>
        )}
      </div>
    );
  }

  // Losse cardio (bv. buiten lopen) in plaats van de geplande conditie, of als de stopwatch al loopt.
  const offerFree = !sick && planned && day.type === 'cardio';
  return (
    <>
      <h1>Training</h1>
      {main}
      {(free || offerFree) && <FreeCardio title={day.groupClass ? 'Liever buiten lopen of fietsen?' : 'Of liever buiten?'} targetMin={day.groupClass ? CLASS_MINUTES : minutes} />}
    </>
  );
}
