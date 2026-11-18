import { useEffect, useState } from 'preact/hooks';
import { getExercise } from '../coach/catalog.ts';
import { imagesFor } from '../coach/images.ts';

const base = import.meta.env.BASE_URL;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Voorbeeld van een oefening: wisselt rustig tussen start- en eindpositie (zo zie je de beweging
 * en het toestel). Tik om te pauzeren. Met "Verminder beweging" aan: beide foto's naast elkaar.
 */
export function ExerciseDemo(props: { id: string; size?: 'small' | 'large' }) {
  const imgs = imagesFor(props.id);
  const [frame, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);
  const still = prefersReducedMotion();
  useEffect(() => {
    if (!imgs || paused || still) return;
    const t = setInterval(() => setFrame((f) => 1 - f), 1400);
    return () => clearInterval(t);
  }, [props.id, paused, still]);
  if (!imgs) return null;
  const name = getExercise(props.id).name;

  if (still) {
    return (
      <div class={`demo still ${props.size ?? 'small'}`}>
        <figure>
          <img src={base + imgs[0]} alt={`${name}: startpositie`} loading="lazy" />
          <figcaption>Start</figcaption>
        </figure>
        <figure>
          <img src={base + imgs[1]} alt={`${name}: eindpositie`} loading="lazy" />
          <figcaption>Einde</figcaption>
        </figure>
      </div>
    );
  }
  return (
    <button
      type="button"
      class={`demo ${props.size ?? 'small'}`}
      onClick={() => setPaused(!paused)}
      aria-label={`${name}: voorbeeld. Tik om ${paused ? 'verder te spelen' : 'te pauzeren'}.`}
    >
      <img src={base + imgs[0]} class={frame === 0 ? 'on' : ''} alt={`${name}: startpositie`} loading="lazy" />
      <img src={base + imgs[1]} class={frame === 1 ? 'on' : ''} alt={`${name}: eindpositie`} loading="lazy" />
      <span class="demo-label">
        {frame === 0 ? 'Start' : 'Einde'}
        {paused ? ' · ❚❚' : ''}
      </span>
    </button>
  );
}

export function Thumb(props: { id: string }) {
  const imgs = imagesFor(props.id);
  if (!imgs) return <span class="thumb empty" aria-hidden="true" />;
  return <img class="thumb" src={base + imgs[1]} alt="" loading="lazy" />;
}
