import { useState } from 'preact/hooks';
import { dayName, isoWeek, weekStart } from '../../coach/dates.ts';
import { formatLoad } from '../../coach/loads.ts';
import { ADVICE, LEVEL_LABEL } from '../../coach/readiness.ts';
import type { CardioSession, StrengthSession } from '../../coach/session.ts';
import type { Energy, Location, Minutes } from '../../coach/types.ts';
import { newId } from '../../data/store.ts';
import { startWorkout } from '../../data/workout.ts';
import { Chips, Messages, Pill, Sheet } from '../components.tsx';
import { useStore } from '../hooks.ts';
import { go } from '../router.ts';
import { dayLabel, needsNextWeek } from './Week.tsx';

const ENERGY: { value: Energy; label: string }[] = [
  { value: 'low', label: '😴 Laag' },
  { value: 'ok', label: '🙂 Oké' },
  { value: 'high', label: '💪 Top' },
];

function repsText(p: { targetReps: number; repRange: [number, number] }, timed?: boolean) {
  return timed ? `${p.targetReps} s` : `${p.targetReps}`;
}

export function StrengthPreview(props: { session: StrengthSession }) {
  return (
    <ul class="preview">
      {props.session.exercises.map((p) => (
        <li key={p.exercise.id}>
          <span>
            {p.superset && <span class="pill">{p.superset}</span>} {p.exercise.name}
          </span>
          <span class="muted">
            {p.prescription.sets}×{repsText(p.prescription, p.exercise.timed)}
            {p.exercise.unilateral ? '/kant' : ''} · {formatLoad(p.exercise, p.prescription.load)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ReadinessCard() {
  const s = useStore();
  const today = s.today();
  const check = s.checkFor(today);
  const health = s.healthDays().find((h) => h.date === today);
  const [redo, setRedo] = useState(false);

  if (!check || redo) {
    return (
      <div class="card">
        <h3>Hoe is je energie vandaag?</h3>
        <div class="row">
          {ENERGY.map((e) => (
            <button
              key={e.value}
              class="btn"
              onClick={async () => {
                await s.recordCheck(e.value);
                setRedo(false);
              }}
            >
              {e.label}
            </button>
          ))}
        </div>
        <p class="muted small">
          {health
            ? `Watch: ${health.sleepHours !== undefined ? `${health.sleepHours.toFixed(1).replace('.', ',')} u slaap` : ''}${health.hrvMs !== undefined ? ` · HRV ${Math.round(health.hrvMs)}` : ''}${health.restingHr !== undefined ? ` · rust ${Math.round(health.restingHr)}` : ''}`
            : 'Nog geen Watch-data van vannacht: je energie telt dan alleen.'}
        </p>
      </div>
    );
  }
  const tone = check.level;
  return (
    <div class={`card readiness ${tone}`}>
      <div class="row-between">
        <h3>
          Dagvorm <Pill tone={tone}>{LEVEL_LABEL[tone]}</Pill>
        </h3>
        <button class="link" onClick={() => setRedo(true)}>
          opnieuw
        </button>
      </div>
      <p>{ADVICE[tone]}</p>
      {check.reasons.length > 0 && <p class="muted small">{check.reasons.join(' · ')}</p>}
    </div>
  );
}

function QuickLogSheet(props: { open: boolean; onClose: () => void; date: string }) {
  const s = useStore();
  const [kind, setKind] = useState<'class' | 'cardio'>('class');
  const [minutes, setMinutes] = useState<Minutes>(45);
  const [location, setLocation] = useState<Location>('gym');
  return (
    <Sheet open={props.open} onClose={props.onClose} title="Iets anders gedaan?">
      <div class="stack">
        <Chips options={[{ value: 'class', label: 'Groepsles' }, { value: 'cardio', label: 'Cardio' }]} value={kind} onChange={setKind} />
        <Chips options={[{ value: 'gym', label: 'Jims' }, { value: 'home', label: 'Thuis/buiten' }]} value={location} onChange={setLocation} />
        <Chips<Minutes> options={[{ value: 30, label: '30 min' }, { value: 45, label: '45 min' }, { value: 60, label: '60 min' }]} value={minutes} onChange={setMinutes} />
        <button
          class="btn primary"
          onClick={async () => {
            await s.quickLog(props.date, kind, location, minutes, kind === 'class' ? 'Groepsles' : 'Cardio');
            props.onClose();
          }}
        >
          Bewaar
        </button>
        <p class="muted small">Start je een workout op je Watch, dan komt dit later automatisch binnen.</p>
      </div>
    </Sheet>
  );
}

export function Today() {
  const s = useStore();
  const today = s.today();
  const day = s.todayPlan();
  const plan = s.plan(weekStart(today));
  const session = s.sessionFor(day) as StrengthSession | CardioSession | undefined;
  const [quick, setQuick] = useState(false);
  const missingNext = needsNextWeek(today, (p) => !!s.read(p));
  const nextSweat = plan.days.find((d) => d.date > today && d.status === 'planned');
  const w = s.workout;

  const start = async () => {
    if (!session) return;
    if (session.kind === 'strength') {
      await s.setWorkout(startWorkout(session, { id: newId(), now: s.now(), readiness: s.checkFor(today)?.level }));
      go('training');
    } else go('cardio');
  };

  return (
    <>
      <p class="muted eyebrow">{dayName(today)} {dayLabel(today).split(' ')[1]}</p>
      <h1>Vandaag</h1>

      {w && (
        <button class="card cta" onClick={() => go('training')}>
          <strong>Training bezig: Full body {w.template}</strong>
          <span class="muted small">Tik om verder te gaan</span>
        </button>
      )}

      {missingNext && (
        <button class="card cta" onClick={() => go(`beschikbaarheid/${missingNext}`)}>
          <strong>Plan volgende week</strong>
          <span class="muted small">Tik welke dagen je kan. 20 seconden.</span>
        </button>
      )}

      {day.sweat && day.status === 'planned' && <ReadinessCard />}

      {day.status === 'done' && (
        <div class="card done">
          <h2>✓ {day.title}</h2>
          <p>Gedaan. Goed bezig! Nu herstellen: eten, drinken, slapen.</p>
        </div>
      )}

      {day.sweat && day.status === 'planned' && session && !w && (
        <div class="card today-card">
          <h2>{day.title}</h2>
          <div class="stack">
            <Chips<Location>
              label="Waar"
              options={[{ value: 'gym', label: 'Jims' }, { value: 'home', label: 'Thuis' }]}
              value={day.location}
              onChange={(v) => s.updateDay(today, { location: v })}
            />
            <Chips<Minutes>
              label="Tijd"
              options={[{ value: 30, label: '30' }, { value: 45, label: '45' }, { value: 60, label: '60 min' }]}
              value={day.minutes}
              onChange={(v) => s.updateDay(today, { minutes: v })}
            />
          </div>
          {session.kind === 'strength' ? (
            <>
              <StrengthPreview session={session} />
              {session.notes.map((n) => (
                <p key={n} class="muted small">
                  {n}
                </p>
              ))}
            </>
          ) : (
            <p class="muted">{session.options.map((o) => o.title).join(' of ')}</p>
          )}
          <button class="btn primary huge" onClick={start}>
            Start
          </button>
          <button class="btn ghost small" onClick={() => s.postpone(today)}>
            Vandaag lukt niet
          </button>
        </div>
      )}

      {!day.sweat && day.light && (
        <div class="card light-card">
          <h2>{day.status === 'moved' ? 'Herstel vandaag' : 'Zweetvrije dag'}</h2>
          {day.note && <p>{day.note}</p>}
          <h3>
            {day.light.title} · {day.light.minutes} min <span class="muted small">(optioneel)</span>
          </h3>
          <p class="muted small">{day.light.why}</p>
          <ul class="steps">
            {day.light.steps.map((st) => (
              <li key={st}>{st}</li>
            ))}
          </ul>
          {s.log(isoWeek(today)).light.some((l) => l.date === today) ? (
            <p>✓ Gedaan</p>
          ) : (
            <button class="btn" onClick={() => s.logLight(today, day.light!.id)}>
              Gedaan ✓
            </button>
          )}
          {s.log(isoWeek(today)).postponed.includes(today) && (
            <button class="btn ghost small" onClick={() => s.undoPostpone(today)}>
              Toch trainen
            </button>
          )}
        </div>
      )}

      <Messages messages={plan.messages} />

      {nextSweat && (
        <p class="muted">
          Volgende: {dayName(nextSweat.date)} · {nextSweat.title}
        </p>
      )}

      <button class="btn ghost small" onClick={() => setQuick(true)}>
        Groepsles of cardio gedaan?
      </button>
      <QuickLogSheet open={quick} onClose={() => setQuick(false)} date={today} />
    </>
  );
}
