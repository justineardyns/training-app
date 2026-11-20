import { useState } from 'preact/hooks';
import type { CardioSession } from '../../coach/session.ts';
import type { Minutes } from '../../coach/types.ts';
import { Chips } from '../components.tsx';
import { useStore } from '../hooks.ts';
import { IntervalTimer } from '../IntervalTimer.tsx';
import { go } from '../router.ts';

export function Cardio() {
  const s = useStore();
  const today = s.today();
  const day = s.todayPlan();
  const [minutes, setMinutes] = useState<Minutes>(day.minutes ?? 45);
  // De timer volgt de gekozen duur (een lopende timer houdt zijn blokken).
  const session = s.sessionFor({ ...day, minutes }) as CardioSession | undefined;

  if (!session || session.kind !== 'cardio') {
    return (
      <>
        <h1>Geen conditiesessie vandaag</h1>
        <button class="btn primary" onClick={() => go('vandaag')}>
          Naar vandaag
        </button>
      </>
    );
  }

  const done = async (kind: 'class' | 'cardio', title: string) => {
    await s.quickLog(today, kind, session.location, minutes, title);
    go('vandaag');
  };

  return (
    <>
      <h1>{session.title}</h1>
      {session.notes.map((n) => (
        <p key={n} class="muted small">
          {n}
        </p>
      ))}
      {session.options.map((o, idx) => (
        <div class="card" key={o.title}>
          <h2>
            {idx > 0 && <span class="muted small">of </span>}
            {o.title}
          </h2>
          {o.blocks ? (
            <IntervalTimer id={`${today}-${o.title}`} blocks={o.blocks} steps={o.steps} doneText="Tik hieronder op Gedaan ✓: dan telt ze mee." />
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
        <h3>Hoelang?</h3>
        <Chips<Minutes>
          options={[
            { value: 30, label: '30 min' },
            { value: 45, label: '45 min' },
            { value: 60, label: '60 min' },
          ]}
          value={minutes}
          onChange={setMinutes}
        />
      </div>
      {session.options.some((o) => o.title.includes('groepsles')) && (
        <button class="btn primary huge" onClick={() => done('class', 'Groepsles')}>
          Groepsles gedaan ✓
        </button>
      )}
      <button class={`btn ${session.options.some((o) => o.title.includes('groepsles')) ? '' : 'primary huge'}`} onClick={() => done('cardio', session.options[session.options.length - 1]!.title)}>
        Gedaan ✓
      </button>
    </>
  );
}
