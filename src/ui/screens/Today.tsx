import { useState } from 'preact/hooks';
import { dayName, isoWeek } from '../../coach/dates.ts';
import { formatLoad } from '../../coach/loads.ts';
import { ADVICE, LEVEL_LABEL } from '../../coach/readiness.ts';
import { templateTitle, type CardioSession, type StrengthSession } from '../../coach/session.ts';
import type { Energy, Location, Minutes } from '../../coach/types.ts';
import type { WalkAdvice } from '../../coach/weather.ts';
import { activeAdjustments, CLASS_MINUTES, hourText } from '../../coach/planner.ts';
import { Chips, Pill, Sheet } from '../components.tsx';
import { Thumb } from '../Demo.tsx';
import { useStore } from '../hooks.ts';
import { go } from '../router.ts';
import { dayLabel } from './Week.tsx';
import { ClassActions, startStrength, TrainAnyway, WishNote } from './Training.tsx';
import { SyncWarning } from './Connect.tsx';
import { InjuryCard } from './Injury.tsx';
import { reportIllness } from '../../data/injuries.ts';
import { InsightsCard, MilestoneCard, RecoveryCard, SoreChips, WeatherBadge, WeekGoalBar } from './CoachCards.tsx';

const ENERGY: { value: Energy; label: string }[] = [
  { value: 'high', label: '💪 Top' },
  { value: 'ok', label: '🙂 Oké' },
  { value: 'low', label: '😴 Moe' },
  { value: 'sick', label: '🤒 Ziek of op' },
];

function repsText(p: { targetReps: number; repRange: [number, number] }, timed?: boolean) {
  return timed ? `${p.targetReps} s` : `${p.targetReps}`;
}

export function StrengthPreview(props: { session: StrengthSession }) {
  return (
    <ul class="preview">
      {props.session.exercises.map((p) => (
        <li key={p.exercise.id}>
          <a class="preview-name" href={`#/oefening/${p.exercise.id}`}>
            <Thumb id={p.exercise.id} />
            <span>
              {p.superset && <span class="pill">{p.superset}</span>} {p.exercise.name}
            </span>
          </a>
          <span class="muted">
            {p.prescription.sets}×{repsText(p.prescription, p.exercise.timed)}
            {p.exercise.unilateral ? '/kant' : ''} · {formatLoad(p.exercise, p.prescription.load)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Droogste dag van de week, maar je traint: een wandeling als extraatje. */
function WalkExtra(props: { walk: WalkAdvice }) {
  return (
    <p class="walk goed">
      🚶 + wandeling 30 min{props.walk.bestHour !== undefined ? ` rond ${props.walk.bestHour}u` : ''} (optioneel)
    </p>
  );
}

function ReadinessCard() {
  const s = useStore();
  const today = s.today();
  const check = s.checkFor(today);
  const [redo, setRedo] = useState(false);

  if (!check || redo) {
    return (
      <div class="card">
        <h3>Hoe voel je je vandaag?</h3>
        <div class="energy-grid">
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
      {tone !== 'red' && <SoreChips />}
      {check.energy === 'sick' && s.illness().status !== 'rest' && (
        <button class="btn small" onClick={() => void reportIllness(s)}>
          🤒 Ik ben ziek: rust tot ik beter ben
        </button>
      )}
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
        {kind === 'class' ? (
          <p class="muted small">1 uur</p>
        ) : (
          <Chips<Minutes> options={[{ value: 30, label: '30 min' }, { value: 45, label: '45 min' }, { value: 60, label: '60 min' }]} value={minutes} onChange={setMinutes} />
        )}
        <button
          class="btn primary"
          onClick={async () => {
            await s.quickLog(props.date, kind, location, kind === 'class' ? CLASS_MINUTES : minutes, kind === 'class' ? s.prefs().className : 'Cardio');
            props.onClose();
          }}
        >
          Bewaar
        </button>
      </div>
    </Sheet>
  );
}

export function Today() {
  const s = useStore();
  const today = s.today();
  const day = s.todayPlan();
  const plan = s.plan();
  // Eén zin van je wekelijkse coachsessie (adjustments.focus).
  const focus = activeAdjustments(s.adjustments(), today)?.focus;
  const session = s.sessionFor(day) as StrengthSession | CardioSession | undefined;
  const [quick, setQuick] = useState(false);
  const nextSweat = plan.days.find((d) => d.date > today && d.status === 'planned');
  const w = s.workout;

  const start = async () => {
    if (!session) return;
    if (session.kind === 'strength') await startStrength(s, session);
    else go('training');
  };

  return (
    <>
      <p class="muted eyebrow row-between">
        <span>
          {dayName(today)} {dayLabel(today).split(' ')[1]}
        </span>
        <WeatherBadge day={day} />
      </p>
      <h1>Vandaag</h1>
      {focus && <p class="card coach focus">{focus}</p>}
      <WeekGoalBar />
      <MilestoneCard />
      <SyncWarning />

      {w && (
        <button class="card cta" onClick={() => go('training')}>
          <strong>Training bezig: {templateTitle(w.template)}</strong>
          <span class="muted small">Tik om verder te gaan</span>
        </button>
      )}


      {day.sweat && day.status === 'planned' && <ReadinessCard />}

      <InjuryCard />

      {day.status === 'done' && (
        <div class="card done">
          <h2>✓ {day.title}</h2>
          <p>Goed bezig!</p>
        </div>
      )}

      {day.sweat && day.status === 'planned' && session && !w && (
        <div class="card today-card">
          <h2>
            {day.groupClass ? '🚴 ' : ''}
            {day.title}
          </h2>
          {day.walkExtra && <WalkExtra walk={day.walkExtra} />}
          <div class="stack">
            {!day.groupClass && s.prefs().trainAtHome && (
              <Chips<Location>
                label="Waar"
                options={[{ value: 'gym', label: 'Jims' }, { value: 'home', label: 'Thuis' }]}
                value={day.location}
                onChange={(v) => s.updateDay(today, { home: v === 'home' })}
              />
            )}
            {!day.groupClass && (
              <Chips<Minutes>
                label="Tijd"
                options={[{ value: 30, label: '30' }, { value: 45, label: '45' }, { value: 60, label: '60 min' }]}
                value={day.minutes}
                onChange={(v) => s.updateDay(today, { minutes: v })}
              />
            )}
          </div>
          {session.kind === 'strength' ? (
            <>
              <StrengthPreview session={session} />
              {session.notes.filter((n) => !n.startsWith('Coach:')).map((n) => (
                <p key={n} class="muted small">
                  {n}
                </p>
              ))}
            </>
          ) : day.groupClass ? (
            <p class="muted">1 uur{day.time ? ` · ${hourText(day.time)}` : ''}</p>
          ) : (
            <p class="muted">{session.options.map((o) => o.title).join(' of ')}</p>
          )}
          {day.groupClass ? (
            <ClassActions />
          ) : (
            <>
              <button class="btn primary huge" onClick={start}>
                Start
              </button>
              <button class="btn ghost small" onClick={() => s.postpone(today)}>
                Vandaag lukt niet
              </button>
            </>
          )}
          <WishNote />
        </div>
      )}

      {day.type === 'tennis' && day.status === 'planned' && (
        <div class="card today-card">
          <h2>🎾 {day.title}</h2>
          {day.walkExtra && <WalkExtra walk={day.walkExtra} />}
          <button class="btn primary huge" onClick={() => s.quickLog(today, 'cardio', 'gym', (day.minutes ?? 60) as Minutes, 'Tennis')}>
            Tennis gedaan ✓
          </button>
          <button class="btn ghost small" onClick={() => s.updateDay(today, { tennis: undefined })}>
            Gaat niet door
          </button>
        </div>
      )}

      {!day.sweat && day.light && (
        <div class="card light-card">
          <h2>
            {day.light.id === 'rust' ? 'Rustdag' : day.light.id === 'klusjes' ? 'Vrij voor klusjes 🧹' : day.status === 'moved' ? 'Herstel vandaag' : 'Zweetvrije dag'}
          </h2>
          {day.note && <p>{day.note}</p>}
          <h3>
            {day.light.title}
            {day.light.minutes ? (
              <>
                {' '}· {day.light.minutes} min <span class="muted small">(optioneel)</span>
              </>
            ) : null}
          </h3>
          {day.walk && (
            <p class={`walk ${day.walk.verdict}`}>
              {day.weather?.icon ?? ''} Wandelweer: <strong>{day.walk.verdict}</strong>
              {day.walk.bestHour !== undefined && day.walk.verdict !== 'slecht' ? ` · vertrek rond ${day.walk.bestHour}u` : ''}
            </p>
          )}
          <ul class="steps">
            {day.light.steps.map((st) => (
              <li key={st}>{st}</li>
            ))}
          </ul>
          {day.light.id === 'rust' ? null : day.light.id === 'klusjes' ? (
            s.choresDoneOn(today) ? (
              <p>✓ Klusjes gedaan</p>
            ) : (
              <button class="btn" onClick={() => s.logLight(today, 'klusjes')}>
                ✓ Klusjes gedaan
              </button>
            )
          ) : s.log(isoWeek(today)).light.some((l) => l.date === today && l.id !== 'klusjes') ? (
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
          <WishNote />
          <TrainAnyway />
        </div>
      )}

      {s.illness().status !== 'rest' && <RecoveryCard recovery={s.recovery()} />}

      <InsightsCard insights={s.insights()} />


      {nextSweat && (
        <p class="muted">
          Volgende: {dayName(nextSweat.date)} · {nextSweat.title}
        </p>
      )}

      <div class="row">
        <button class="btn ghost small" onClick={() => setQuick(true)}>
          Groepsles of cardio gedaan?
        </button>
        <button class="btn ghost small" onClick={() => go('blessure')}>
          Ik heb last van…
        </button>
      </div>
      <QuickLogSheet open={quick} onClose={() => setQuick(false)} date={today} />
    </>
  );
}
