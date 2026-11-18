import { EXERCISES, videoUrl } from '../../coach/catalog.ts';
import { MUSCLE_LABEL } from '../../coach/report.ts';
import { ExerciseDemo } from '../Demo.tsx';

/** Uitleg van één oefening: foto's, hoe je het toestel herkent, techniek en video. */
export function ExerciseInfo(props: { id: string }) {
  const ex = EXERCISES.get(props.id);
  if (!ex) {
    return (
      <>
        <h1>Oefening niet gevonden</h1>
        <button class="btn" onClick={() => history.back()}>
          Terug
        </button>
      </>
    );
  }
  return (
    <>
      <button class="btn small ghost" onClick={() => history.back()} aria-label="Terug">
        ← Terug
      </button>
      <h1>{ex.name}</h1>
      <ExerciseDemo id={ex.id} size="large" />
      <p class="muted small">
        Traint vooral: {ex.muscles.map((m) => MUSCLE_LABEL[m].toLowerCase()).join(', ')}
        {ex.unilateral ? ' · per kant' : ''}
      </p>
      {ex.setup && (
        <div class="card">
          <h3>Het toestel</h3>
          <p>{ex.setup}</p>
        </div>
      )}
      <div class="card">
        <h3>Zo doe je het</h3>
        <ul class="steps">
          {ex.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <a class="btn small" href={videoUrl(ex)} target="_blank" rel="noopener">
          ▶ Uitlegvideo's op YouTube
        </a>
      </div>
    </>
  );
}
