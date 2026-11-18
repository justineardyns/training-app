import { useEffect } from 'preact/hooks';
import { useRoute } from './router.ts';
import { useStore } from './hooks.ts';
import { Setup } from './screens/Setup.tsx';
import { Today } from './screens/Today.tsx';
import { Availability, Week } from './screens/Week.tsx';
import { Agenda } from './screens/Agenda.tsx';
import { Workout } from './screens/Workout.tsx';
import { Cardio } from './screens/Cardio.tsx';
import { More } from './screens/More.tsx';
import { Report } from './screens/Report.tsx';
import { InjuryReport } from './screens/Injury.tsx';
import { ExerciseInfo } from './screens/ExerciseInfo.tsx';

const TABS = [
  { route: 'vandaag', label: 'Vandaag', ico: '◉' },
  { route: 'week', label: 'Week', ico: '▦' },
  { route: 'rapport', label: 'Rapport', ico: '▲' },
  { route: 'meer', label: 'Meer', ico: '≡' },
] as const;

export function App() {
  const s = useStore();
  const { route, params } = useRoute();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route, params.join('/')]);

  if (!s.ready) return <div class="app splash" aria-busy="true" />;
  if (!s.profile()?.setupDone) return <Setup />;

  const focus = route === 'training' || route === 'cardio';
  let page;
  switch (route) {
    case 'week':
      page = <Week />;
      break;
    case 'beschikbaarheid':
      page = <Availability />;
      break;
    case 'agenda':
      page = <Agenda />;
      break;
    case 'training':
      page = <Workout />;
      break;
    case 'cardio':
      page = <Cardio />;
      break;
    case 'oefening':
      page = <ExerciseInfo key={params[0]} id={params[0] ?? ''} />;
      break;
    case 'blessure':
      page = <InjuryReport />;
      break;
    case 'rapport':
      page = <Report />;
      break;
    case 'meer':
      page = <More key={params[0] ?? 'root'} sub={params[0]} />;
      break;
    default:
      page = <Today />;
  }

  return (
    <div class={`app ${focus ? 'focus' : ''}`}>
      <main class="page">{page}</main>
      {!focus && (
        <nav class="tabbar">
          {TABS.map((t) => (
            <a key={t.route} href={`#/${t.route}`} class={route === t.route || (t.route === 'week' && (route === 'beschikbaarheid' || route === 'agenda')) ? 'on' : ''}>
              <span class="ico" aria-hidden="true">
                {t.ico}
              </span>
              {t.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
